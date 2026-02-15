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
  type Room,
  type RoomRole,
  type RoomRule,
} from './store.js';

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
      hostItemUsed: room.hostItemUsed,
      guestItemUsed: room.guestItemUsed,
      isReconnect,
      history: room.history,
      turn: room.turn,
      turnStartAt: Date.now(), // 重连时使用当前时间
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
      hostItemUsed: room.hostItemUsed,
      guestItemUsed: room.guestItemUsed,
      isReconnect,
      history: room.history,
      turn: room.turn,
      turnStartAt: Date.now(),
    });
    if (room.host) {
      send(room.host.ws, 'peer_joined', {});
    }
    if (!isReconnect) {
      broadcast(room, 'game_start', { message: 'both connected, set your code' });
    }
  }

  ws.on('message', (raw) => {
    const room = getRoom(roomId);
    if (!room) return;
    let data: { type?: string; code?: string; guess?: string };
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
        const used = role === 'host' ? room.hostItemUsed : room.guestItemUsed;
        if (used) {
          send(ws, 'error', { message: 'item already used' });
          return;
        }
        if (role === 'host') room.hostItemUsed = true;
        else room.guestItemUsed = true;
        console.log('[WS room] use_item roomId=%s role=%s', roomId, role);
        broadcast(room, 'item_used', { role });
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
