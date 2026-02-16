import type { WebSocket } from 'ws';
import {
  getFreeRoom, addPlayer, removePlayer, getPlayerList, canStart,
  startGame, evaluateFree, allPlayersEliminated, determineWinner,
  getRanking, addBotPlayer, getBotPlayer, type FreeRoom, type FreePlayer,
} from './store.js';
import { isValidFreeItemId, FreeItemType } from './items.js';
import { applyFreeItemEffect } from './itemEffects.js';

function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: FreeRoom, msg: Record<string, unknown>): void {
  const data = JSON.stringify(msg);
  for (const p of room.players) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function broadcastPlayerList(room: FreeRoom): void {
  broadcast(room, { type: 'player_list', players: getPlayerList(room), hostId: room.hostId });
}

function broadcastProgress(room: FreeRoom): void {
  broadcast(room, {
    type: 'progress',
    players: room.players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      submitCount: p.submitCount,
      bestScore: p.bestScore,
      eliminated: p.eliminated,
    })),
    ranking: getRanking(room),
  });
}

function finishGame(room: FreeRoom, winnerId: string | null, reason: string): void {
  room.state = 'finished';
  room.winner = winnerId;
  broadcast(room, {
    type: 'game_over',
    reason,
    winnerId,
    secret: room.secret,
    ranking: getRanking(room),
    players: room.players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      submitCount: p.submitCount,
      bestScore: p.bestScore,
      history: p.history,
    })),
  });
}

export function handleFreeRoomWs(ws: WebSocket, roomCode: string, params: URLSearchParams): void {
  const room = getFreeRoom(roomCode);
  if (!room) {
    send(ws, { type: 'error', message: '房间不存在' });
    ws.close();
    return;
  }

  const nickname = params.get('nickname') || `玩家${room.players.length + 1}`;
  const password = params.get('password') || '';
  const playerId = params.get('playerId') || `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (room.password && room.password !== password) {
    send(ws, { type: 'error', message: '密码错误' });
    ws.close();
    return;
  }

  if (room.state === 'playing') {
    send(ws, { type: 'error', message: '游戏已开始，无法加入' });
    ws.close();
    return;
  }

  if (room.state === 'finished') {
    send(ws, { type: 'error', message: '游戏已结束' });
    ws.close();
    return;
  }

  if (!addPlayer(room, ws, playerId, nickname)) {
    send(ws, { type: 'error', message: '房间已满或ID重复' });
    ws.close();
    return;
  }

  console.log('[FreeRoom] player %s joined room %s (%d players)', nickname, roomCode, room.players.length);

  send(ws, {
    type: 'joined',
    playerId,
    roomCode: room.roomCode,
    roomName: room.roomName,
    guessLimit: room.guessLimit,
    hostId: room.hostId,
    inventory: room.players.find(p => p.playerId === playerId)?.inventory || {},
  });
  broadcastPlayerList(room);

  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) return;

    switch (msg.type) {
      case 'start': {
        if (playerId !== room.hostId) {
          send(ws, { type: 'error', message: '只有房主可以开始游戏' });
          return;
        }

        // Allow single player to start, will add bot automatically
        if (room.players.length < 1) {
          send(ws, { type: 'error', message: '房间为空' });
          return;
        }

        // Add bot if only one player
        if (room.players.length === 1) {
          addBotPlayer(room);
          console.log('[FreeRoom] added bot player to room=%s', roomCode);
        }

        startGame(room);
        console.log('[FreeRoom] game started room=%s secret=%s limit=%d players=%d', roomCode, room.secret, room.guessLimit, room.players.length);

        broadcast(room, {
          type: 'game_start',
          guessLimit: room.guessLimit,
          players: getPlayerList(room),
        });

        // Start bot behavior if bot exists
        startBotBehavior(room, roomCode);
        break;
      }

      case 'submit_guess': {
        if (room.state !== 'playing') {
          send(ws, { type: 'error', message: '游戏未在进行中' });
          return;
        }
        const guess = String(msg.guess || '');
        if (!/^\d{4}$/.test(guess)) {
          send(ws, { type: 'error', message: '请输入4位数字' });
          return;
        }
        if (player.eliminated) {
          send(ws, { type: 'error', message: '你已用完所有猜数次数' });
          return;
        }
        if (player.submitCount >= room.guessLimit) {
          player.eliminated = true;
          send(ws, { type: 'error', message: '次数已用完' });
          return;
        }

        const { a, b } = evaluateFree(room.secret!, guess);
        player.submitCount++;
        player.history.push({ guess, a, b });
        const score = a + b;
        if (score > player.bestScore) player.bestScore = score;
        if (player.submitCount >= room.guessLimit) player.eliminated = true;

        send(ws, {
          type: 'guess_result',
          guess,
          a,
          b,
          submitCount: player.submitCount,
          bestScore: player.bestScore,
          remaining: room.guessLimit - player.submitCount,
        });

        broadcastProgress(room);

        if (a === 4) {
          finishGame(room, playerId, 'cracked');
          return;
        }

        if (allPlayersEliminated(room)) {
          const { winnerId } = determineWinner(room);
          finishGame(room, winnerId, 'all_eliminated');
          return;
        }
        break;
      }

      case 'use_item': {
        if (room.state !== 'playing') {
          send(ws, { type: 'error', message: '游戏未在进行中' });
          return;
        }

        const itemId = String(msg.itemId || '');
        if (!isValidFreeItemId(itemId)) {
          send(ws, { type: 'error', message: '无效的道具ID' });
          return;
        }

        const count = player.inventory[itemId] || 0;
        if (count <= 0) {
          send(ws, { type: 'error', message: '道具数量不足' });
          return;
        }

        // Consume item
        player.inventory[itemId] = count - 1;

        // Apply effect
        const effectData = applyFreeItemEffect(itemId as FreeItemType, room, player);

        console.log('[FreeRoom] player %s used item %s in room %s', nickname, itemId, roomCode);

        // Send effect to player
        send(ws, {
          type: 'item_used',
          itemId,
          effectData,
          inventory: player.inventory,
        });

        break;
      }

      case 'restart': {
        if (playerId !== room.hostId) {
          send(ws, { type: 'error', message: '只有房主可以重新开局' });
          return;
        }
        if (room.state !== 'finished') {
          send(ws, { type: 'error', message: '游戏还未结束' });
          return;
        }

        // Remove bot from previous game if exists
        const oldBot = getBotPlayer(room);
        if (oldBot) {
          removePlayer(room, oldBot.playerId);
        }

        // Add new bot if only one human player
        const humanPlayers = room.players.filter(p => !p.playerId.startsWith('bot_'));
        if (humanPlayers.length === 1) {
          addBotPlayer(room);
          console.log('[FreeRoom] added bot player for restart in room=%s', roomCode);
        }

        startGame(room);
        console.log('[FreeRoom] game restarted room=%s secret=%s', roomCode, room.secret);
        broadcast(room, {
          type: 'game_start',
          guessLimit: room.guessLimit,
          players: getPlayerList(room),
        });

        // Start bot behavior
        startBotBehavior(room, roomCode);
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    console.log('[FreeRoom] player %s left room %s', nickname, roomCode);
    removePlayer(room, playerId);
    if (room.players.length === 0) {
      console.log('[FreeRoom] room %s empty, deleting', roomCode);
      import('./store.js').then(({ deleteFreeRoom }) => deleteFreeRoom(roomCode));
    } else {
      broadcastPlayerList(room);
    }
  });
}

/**
 * Start bot behavior - bot will randomly guess every 5 seconds
 */
function startBotBehavior(room: FreeRoom, roomCode: string): void {
  const bot = getBotPlayer(room);
  if (!bot) return;

  const botInterval = setInterval(() => {
    const currentRoom = getFreeRoom(roomCode);
    if (!currentRoom) {
      clearInterval(botInterval);
      return;
    }

    // Stop if game is not playing
    if (currentRoom.state !== 'playing') {
      clearInterval(botInterval);
      return;
    }

    // Stop if bot is eliminated
    const currentBot = getBotPlayer(currentRoom);
    if (!currentBot || currentBot.eliminated) {
      clearInterval(botInterval);
      return;
    }

    // Stop if bot reached guess limit
    if (currentBot.submitCount >= currentRoom.guessLimit) {
      currentBot.eliminated = true;
      clearInterval(botInterval);
      return;
    }

    // Generate random 4-digit guess
    const guess = generateRandomGuess();
    console.log('[FreeRoom] bot guessing: %s in room %s', guess, roomCode);

    // Evaluate guess
    const { a, b } = evaluateFree(currentRoom.secret!, guess);
    currentBot.submitCount++;
    currentBot.history.push({ guess, a, b });
    const score = a + b;
    if (score > currentBot.bestScore) currentBot.bestScore = score;
    if (currentBot.submitCount >= currentRoom.guessLimit) {
      currentBot.eliminated = true;
    }

    // Broadcast progress
    broadcastProgress(currentRoom);

    // Check win condition
    if (a === 4) {
      finishGame(currentRoom, currentBot.playerId, 'cracked');
      clearInterval(botInterval);
      return;
    }

    // Check if all players eliminated
    if (allPlayersEliminated(currentRoom)) {
      const { winnerId } = determineWinner(currentRoom);
      finishGame(currentRoom, winnerId, 'all_eliminated');
      clearInterval(botInterval);
      return;
    }
  }, 5000); // Bot guesses every 5 seconds
}

/**
 * Generate random 4-digit guess (digits can repeat)
 */
function generateRandomGuess(): string {
  let guess = '';
  for (let i = 0; i < 4; i++) {
    guess += Math.floor(Math.random() * 10);
  }
  return guess;
}
