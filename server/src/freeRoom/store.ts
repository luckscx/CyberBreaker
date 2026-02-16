import type { WebSocket } from 'ws';
import { FREE_MODE_DEFAULT_INVENTORY } from './items.js';

export type FreeRoomState = 'waiting' | 'playing' | 'finished';

export interface FreePlayer {
  ws: WebSocket;
  playerId: string;
  nickname: string;
  submitCount: number;
  bestScore: number;
  eliminated: boolean;
  history: { guess: string; a: number; b: number }[];
  inventory: { [itemId: string]: number };
  itemEffects: {
    eliminatedDigits?: string[];
    revealedPositions?: Array<{ pos: number; digit: string }>;
    knownDigits?: string[];
  };
}

export interface FreeRoom {
  roomCode: string;
  roomName: string;
  password: string | null;
  guessLimit: number;
  state: FreeRoomState;
  secret: string | null;
  players: FreePlayer[];
  hostId: string;
  createdAt: number;
  winner: string | null;
}

const rooms = new Map<string, FreeRoom>();

const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

function generateRoomCode(): string {
  let code: string;
  do {
    code = String(100000 + Math.floor(Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

/** 4 位随机数，每位 0-9 独立（可重复、0 可首位） */
export function generateSecretFree(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** A/B 计算（与前端 evaluate 一致，支持重复数字） */
export function evaluateFree(secret: string, guess: string): { a: number; b: number } {
  let a = 0, b = 0;
  const sUsed = [false, false, false, false];
  const gUsed = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    if (secret[i] === guess[i]) { a++; sUsed[i] = true; gUsed[i] = true; }
  }
  for (let i = 0; i < 4; i++) {
    if (gUsed[i]) continue;
    for (let j = 0; j < 4; j++) {
      if (!sUsed[j] && guess[i] === secret[j]) { b++; sUsed[j] = true; break; }
    }
  }
  return { a, b };
}

export function createFreeRoom(opts: { roomName?: string; password?: string; guessLimit?: number }): FreeRoom {
  const roomCode = generateRoomCode();
  const room: FreeRoom = {
    roomCode,
    roomName: opts.roomName || `房间 ${roomCode}`,
    password: opts.password || null,
    guessLimit: Math.max(3, Math.min(30, opts.guessLimit ?? 10)),
    state: 'waiting',
    secret: null,
    players: [],
    hostId: '',
    createdAt: Date.now(),
    winner: null,
  };
  rooms.set(roomCode, room);
  return room;
}

export function getFreeRoom(roomCode: string): FreeRoom | undefined {
  return rooms.get(roomCode);
}

export function deleteFreeRoom(roomCode: string): void {
  rooms.delete(roomCode);
}

export function addPlayer(room: FreeRoom, ws: WebSocket, playerId: string, nickname: string): boolean {
  if (room.players.length >= MAX_PLAYERS) return false;
  if (room.players.some((p) => p.playerId === playerId)) return false;
  const player: FreePlayer = {
    ws,
    playerId,
    nickname,
    submitCount: 0,
    bestScore: 0,
    eliminated: false,
    history: [],
    inventory: { ...FREE_MODE_DEFAULT_INVENTORY },
    itemEffects: {},
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = playerId;
  return true;
}

export function removePlayer(room: FreeRoom, playerId: string): void {
  room.players = room.players.filter((p) => p.playerId !== playerId);
  if (room.players.length > 0 && room.hostId === playerId) {
    room.hostId = room.players[0].playerId;
  }
}

export function getPlayerList(room: FreeRoom): { playerId: string; nickname: string; submitCount: number; bestScore: number; isHost: boolean; eliminated: boolean }[] {
  return room.players.map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    submitCount: p.submitCount,
    bestScore: p.bestScore,
    isHost: p.playerId === room.hostId,
    eliminated: p.eliminated,
  }));
}

export function canStart(room: FreeRoom): boolean {
  return room.state === 'waiting' && room.players.length >= MIN_PLAYERS;
}

export function startGame(room: FreeRoom): void {
  room.state = 'playing';
  room.secret = generateSecretFree();
  room.winner = null;
  room.players.forEach((p) => {
    p.submitCount = 0;
    p.bestScore = 0;
    p.eliminated = false;
    p.history = [];
  });
}

/** 检查是否所有活跃玩家都已用完猜数次数 */
export function allPlayersEliminated(room: FreeRoom): boolean {
  return room.players.every((p) => p.eliminated);
}

/** 按文档规则决定赢家：最佳成绩最高 → 同分则提交次数最少 → 平局 */
export function determineWinner(room: FreeRoom): { winnerId: string | null; isTie: boolean } {
  if (room.players.length === 0) return { winnerId: null, isTie: true };
  const sorted = [...room.players].sort((a, b) => {
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    return a.submitCount - b.submitCount;
  });
  if (sorted.length >= 2 && sorted[0].bestScore === sorted[1].bestScore && sorted[0].submitCount === sorted[1].submitCount) {
    return { winnerId: null, isTie: true };
  }
  return { winnerId: sorted[0].playerId, isTie: false };
}

/** 获取排名列表 */
export function getRanking(room: FreeRoom): { playerId: string; nickname: string; submitCount: number; bestScore: number; rank: number }[] {
  const sorted = [...room.players].sort((a, b) => {
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    return a.submitCount - b.submitCount;
  });
  return sorted.map((p, i) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    submitCount: p.submitCount,
    bestScore: p.bestScore,
    rank: i + 1,
  }));
}

/** 添加 Bot 玩家 */
export function addBotPlayer(room: FreeRoom): FreePlayer {
  // Create a fake WebSocket for the bot (won't be used)
  const fakeWs = {
    readyState: 1, // OPEN
    send: () => {},
    close: () => {},
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  } as any;

  const botPlayer: FreePlayer = {
    ws: fakeWs,
    playerId: 'bot_' + Math.random().toString(36).slice(2, 8),
    nickname: '🤖 AI助手',
    submitCount: 0,
    bestScore: 0,
    eliminated: false,
    history: [],
    inventory: { ...FREE_MODE_DEFAULT_INVENTORY },
    itemEffects: {},
  };

  room.players.push(botPlayer);
  return botPlayer;
}

/** 获取 Bot 玩家 */
export function getBotPlayer(room: FreeRoom): FreePlayer | undefined {
  return room.players.find(p => p.playerId.startsWith('bot_'));
}
