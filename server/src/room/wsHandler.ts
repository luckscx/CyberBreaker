import type { WebSocket } from 'ws';
import {
  getRoom,
  setHost,
  setGuest,
  setCode,
  startGame,
  nextTurn,
  computeAB,
  deleteRoom,
  addGuessHistory,
  canReconnect,
  gpInitGame,
  gpRefreshCandidates,
  gpPickQuestion,
  gpCheckName,
  gpAddWrongGuess,
  gpCooldownRemaining,
  GP_WRONG_COOLDOWN_MS,
  type Room,
  type RoomRole,
  type RoomRule,
} from './store.js';
import { isValidItemId, PowerUpType } from '../config/items.js';
import { applyItemEffect } from './itemEffects.js';

const CODE_REG = /^[0-9]{4}$/;
function isValidCode(s: string, rule: RoomRule): boolean {
  if (!CODE_REG.test(s)) return false;
  if (rule === 'standard') return new Set(s).size === 4;
  return true;
}

function payloadToObj(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload as Record<string, unknown>;
  return payload !== undefined && payload !== null ? { data: payload } : {};
}

function send(ws: WebSocket, type: string, payload?: unknown) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type, ...payloadToObj(payload) }));
}

function broadcast(room: Room, type: string, payload?: unknown, exclude?: WebSocket) {
  const msg = JSON.stringify({ type, ...payloadToObj(payload) });
  [room.host, room.guest].forEach((p) => {
    if (p?.ws && p.ws !== exclude && p.ws.readyState === 1) p.ws.send(msg);
  });
}

function closeRoom(roomId: string, room: Room) {
  [room.host, room.guest].forEach((p) => {
    if (p?.ws && p.ws.readyState === 1) p.ws.close();
  });
  deleteRoom(roomId);
}

export function handleRoomWs(ws: WebSocket, path: string, searchParams: URLSearchParams) {
  const match = path.match(/^\/ws\/room\/([^/]+)$/);
  const roomId = match?.[1];
  const role = (searchParams.get('role') ?? 'guest') as RoomRole;
  const userUUID = searchParams.get('uuid') ?? undefined;

  if (!roomId || !['host', 'guest'].includes(role)) {
    console.log('[WS room] invalid path or role roomId=%s role=%s', roomId, role);
    send(ws, 'error', { message: 'invalid path or role' });
    ws.close();
    return;
  }

  const room = getRoom(roomId);
  if (!room) {
    console.log('[WS room] room not found roomId=%s', roomId);
    send(ws, 'error', { message: 'room not found' });
    ws.close();
    return;
  }

  // 检查是否为重连
  const isReconnect = userUUID ? canReconnect(room, userUUID, role) : false;
  if (isReconnect) {
    console.log('[WS room] reconnect detected roomId=%s role=%s uuid=%s', roomId, role, userUUID);
  } else {
    console.log('[WS room] join roomId=%s role=%s uuid=%s', roomId, role, userUUID ?? '(none)');
  }

  const player = {
    ws,
    role,
    playerId: undefined as string | undefined,
    nickname: undefined as string | undefined,
    userUUID,
    lastActiveAt: Date.now(),
  };
  // 构建 guess_person 模式的额外重连数据
  const gpReconnectData = (room.rule === 'guess_person' && isReconnect && room.state === 'playing') ? {
    gpQAHistory: room.gpQAHistory ?? [],
    gpWrongGuesses: room.gpWrongGuesses ?? [],
    gpAskedCount: room.gpAskedIds?.size ?? 0,
    gpTotalQuestions: room.gpPerson?.questions.length ?? 12,
    gpAllAsked: room.gpAllAsked ?? false,
    gpCandidateQuestions: (room.gpCandidates ?? []).map((q) => ({ id: q.id, question: q.question })),
  } : {};

  if (role === 'host') {
    if (!setHost(roomId, player)) {
      console.log('[WS room] join failed roomId=%s role=host (already has host)', roomId);
      send(ws, 'error', { message: 'room already has host' });
      ws.close();
      return;
    }
    send(ws, 'room_joined', {
      roomId,
      role: 'host',
      state: room.state,
      rule: room.rule,
      hostCodeSet: !!room.hostCode,
      guestCodeSet: !!room.guestCode,
      inventory: room.hostInventory,
      isReconnect,
      history: room.history,
      turn: room.turn,
      turnStartAt: Date.now(), // 重连时使用当前时间
      ...gpReconnectData,
    });
    if (room.guest) {
      send(ws, 'peer_joined', {});
      send(room.guest.ws, 'peer_joined', {});
    }
  } else {
    if (!setGuest(roomId, player)) {
      console.log('[WS room] join failed roomId=%s role=guest (room full)', roomId);
      send(ws, 'error', { message: 'room full' });
      ws.close();
      return;
    }
    send(ws, 'room_joined', {
      roomId,
      role: 'guest',
      state: room.state,
      rule: room.rule,
      hostCodeSet: !!room.hostCode,
      guestCodeSet: !!room.guestCode,
      inventory: room.guestInventory,
      isReconnect,
      history: room.history,
      turn: room.turn,
      turnStartAt: Date.now(),
      ...gpReconnectData,
    });
    if (room.host) {
      send(room.host.ws, 'peer_joined', {});
    }
    if (!isReconnect) {
      if (room.rule === 'guess_person') {
        // 猜人名模式：双方连接后，先通知"出题中"，然后异步生成题目
        broadcast(room, 'gp_generating', { message: 'AI 正在出题，请稍候...' });
        gpInitGame(room).then(() => {
          startGame(room);
          const candidates = gpRefreshCandidates(room);
          broadcast(room, 'gp_game_start', {
            turn: room.turn,
            turnStartAt: Date.now(),
            totalQuestions: room.gpPerson?.questions.length ?? 12,
            candidateQuestions: candidates.map((q) => ({ id: q.id, question: q.question })),
          });
        }).catch((err) => {
          console.log('[WS room] gpInitGame failed:', err);
          broadcast(room, 'error', { message: '出题失败，请重试' });
        });
      } else {
        broadcast(room, 'game_start', { message: 'both connected, set your code' });
      }
    }
  }

  ws.on('message', (raw) => {
    const room = getRoom(roomId);
    if (!room) return;
    let data: { type?: string; code?: string; guess?: string; questionId?: number; name?: string; itemId?: string };
    try {
      data = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(raw.toString());
    } catch {
      console.log('[WS room] invalid json roomId=%s role=%s', roomId, role);
      send(ws, 'error', { message: 'invalid json' });
      return;
    }
    if (data.type) console.log('[WS room] message roomId=%s role=%s type=%s', roomId, role, data.type);
    switch (data.type) {
      case 'set_code': {
        const code = data.code;
        if (!code || !isValidCode(code, room.rule)) {
          console.log('[WS room] set_code invalid roomId=%s role=%s code=%s', roomId, role, code ?? '(missing)');
          send(ws, 'error', { message: room.rule === 'standard' ? 'invalid code, need 4 unique digits' : 'invalid code, need 4 digits' });
          return;
        }
        setCode(room, role, code);
        console.log('[WS room] set_code ok roomId=%s role=%s hostSet=%s guestSet=%s', roomId, role, !!room.hostCode, !!room.guestCode);
        broadcast(room, 'code_state', {
          hostCodeSet: !!room.hostCode,
          guestCodeSet: !!room.guestCode,
        });
        send(ws, 'code_set', {});
        const bothSet = room.hostCode && room.guestCode;
        if (bothSet) {
          console.log('[WS room] both codes set, game_start roomId=%s', roomId);
          startGame(room);
          broadcast(room, 'game_start', { turn: room.turn, turnStartAt: Date.now(), rule: room.rule });
        }
        break;
      }
      case 'guess': {
        if (room.state !== 'playing') {
          send(ws, 'error', { message: 'game not started' });
          return;
        }
        const guess = data.guess;
        if (!guess || !isValidCode(guess, room.rule)) {
          send(ws, 'error', { message: 'invalid guess' });
          return;
        }
        const target = role === 'host' ? room.guestCode! : room.hostCode!;
        if (room.turn !== role) {
          send(ws, 'error', { message: 'not your turn' });
          return;
        }
        const { a, b } = computeAB(target, guess);
        nextTurn(room);
        const result = room.rule === 'position_only' ? `${a}A` : `${a}A${b}B`;

        // 记录到历史
        addGuessHistory(room, role, guess, result);

        broadcast(room, 'guess_result', {
          role,
          guess,
          result,
          nextTurn: room.turn,
          turnStartAt: Date.now(),
        });
        if (a === 4) {
          broadcast(room, 'game_over', { winner: role });
          closeRoom(roomId, room);
        }
        break;
      }
      case 'use_item': {
        if (room.state !== 'playing') {
          send(ws, 'error', { message: 'game not started' });
          return;
        }

        const itemId = data.itemId;
        if (!itemId || !isValidItemId(itemId)) {
          send(ws, 'error', { message: 'invalid item id' });
          return;
        }

        // Check inventory
        const inventory = role === 'host' ? room.hostInventory : room.guestInventory;
        const count = inventory[itemId] || 0;
        if (count <= 0) {
          send(ws, 'error', { message: 'item not in inventory' });
          return;
        }

        // Consume item
        inventory[itemId] = count - 1;

        // Apply effect
        const effectData = applyItemEffect(itemId as PowerUpType, room, role);
        console.log('[WS room] use_item roomId=%s role=%s itemId=%s', roomId, role, itemId);

        // Broadcast item usage to both players
        broadcast(room, 'item_used', {
          role,
          itemId,
          effectData,
        });

        // Sync inventory update
        broadcast(room, 'inventory_sync', {
          role,
          inventory,
        });
        break;
      }
      case 'turn_timeout': {
        if (room.state !== 'playing') {
          send(ws, 'error', { message: 'game not started' });
          return;
        }
        if (room.turn !== role) {
          send(ws, 'error', { message: 'not your turn' });
          return;
        }
        nextTurn(room);
        broadcast(room, 'turn_switch', { nextTurn: room.turn, turnStartAt: Date.now() });
        break;
      }
      /* ── guess_person 模式消息 ── */
      case 'gp_pick_question': {
        if (room.rule !== 'guess_person' || room.state !== 'playing') {
          send(ws, 'error', { message: 'not in guess_person game' });
          return;
        }
        if (room.turn !== role) {
          send(ws, 'error', { message: 'not your turn' });
          return;
        }
        const qId = data.questionId;
        if (qId == null) {
          send(ws, 'error', { message: 'missing questionId' });
          return;
        }
        const result = gpPickQuestion(room, qId, role);
        if (!result) {
          send(ws, 'error', { message: 'invalid questionId' });
          return;
        }
        console.log('[WS room] gp_pick_question roomId=%s role=%s qId=%d', roomId, role, qId);
        // 切换回合
        nextTurn(room);
        // 刷新下一轮候选题
        const nextCandidates = gpRefreshCandidates(room);
        broadcast(room, 'gp_question_answered', {
          question: result.question,
          answer: result.answer,
          askedBy: role,
          askedCount: room.gpAskedIds?.size ?? 0,
          totalQuestions: room.gpPerson?.questions.length ?? 12,
          // 下一轮信息
          nextTurn: room.turn,
          turnStartAt: Date.now(),
          candidateQuestions: nextCandidates.map((q) => ({ id: q.id, question: q.question })),
          allAsked: room.gpAllAsked ?? false,
        });
        break;
      }
      case 'gp_guess_name': {
        if (room.rule !== 'guess_person' || room.state !== 'playing') {
          send(ws, 'error', { message: 'not in guess_person game' });
          return;
        }
        const guessName = (data.name ?? '').trim();
        if (!guessName) {
          send(ws, 'error', { message: 'empty name' });
          return;
        }
        // 检查冷却
        const cdRemaining = gpCooldownRemaining(room, role);
        if (cdRemaining > 0) {
          send(ws, 'error', { message: `冷却中，${Math.ceil(cdRemaining / 1000)}秒后可再猜` });
          return;
        }
        const correct = gpCheckName(room, guessName);
        console.log('[WS room] gp_guess_name roomId=%s role=%s name=%s correct=%s', roomId, role, guessName, correct);
        if (correct) {
          broadcast(room, 'game_over', { winner: role, personName: room.gpPerson?.name });
          closeRoom(roomId, room);
        } else {
          gpAddWrongGuess(room, role, guessName);
          broadcast(room, 'gp_wrong_guess', {
            role,
            name: guessName,
            cooldownMs: GP_WRONG_COOLDOWN_MS,
          });
        }
        break;
      }
      case 'gp_turn_timeout': {
        if (room.rule !== 'guess_person' || room.state !== 'playing') {
          send(ws, 'error', { message: 'not in guess_person game' });
          return;
        }
        if (room.turn !== role) {
          send(ws, 'error', { message: 'not your turn' });
          return;
        }
        console.log('[WS room] gp_turn_timeout roomId=%s role=%s', roomId, role);
        // 超时不选题，直接切换回合
        nextTurn(room);
        const timeoutCandidates = gpRefreshCandidates(room);
        broadcast(room, 'gp_turn_switch', {
          nextTurn: room.turn,
          turnStartAt: Date.now(),
          candidateQuestions: timeoutCandidates.map((q) => ({ id: q.id, question: q.question })),
          allAsked: room.gpAllAsked ?? false,
        });
        break;
      }
      default:
        console.log('[WS room] unknown type roomId=%s role=%s type=%s', roomId, role, data.type);
        send(ws, 'error', { message: 'unknown type' });
    }
  });

  ws.on('close', () => {
    console.log('[WS room] close roomId=%s role=%s', roomId, role);
    const room = getRoom(roomId);
    if (room) {
      broadcast(room, 'peer_left', { role }, ws);
      // 不立即删除房间，允许 30 秒内重连
      console.log('[WS room] player disconnected, room kept for reconnection roomId=%s role=%s', roomId, role);
      // 30 秒后清理房间（如果仍然有断线的玩家）
      setTimeout(() => {
        const currentRoom = getRoom(roomId);
        if (currentRoom) {
          const hostConnected = currentRoom.host?.ws?.readyState === 1;
          const guestConnected = currentRoom.guest?.ws?.readyState === 1;
          if (!hostConnected && !guestConnected) {
            console.log('[WS room] timeout cleanup roomId=%s (both disconnected)', roomId);
            closeRoom(roomId, currentRoom);
          }
        }
      }, 30000); // 30 秒超时
    }
  });

  ws.on('error', () => {
    console.log('[WS room] error roomId=%s role=%s', roomId, role);
    const room = getRoom(roomId);
    if (room) closeRoom(roomId, room);
  });
}
