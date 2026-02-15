import type { WebSocket } from 'ws';
import { randomBytes } from 'crypto';
import { getRandomPerson, pickCandidateQuestions, type PersonCharacter, type PersonQuestion } from './personData.js';

export type RoomRole = 'host' | 'guest';

export interface RoomPlayer {
  ws: WebSocket;
  role: RoomRole;
  playerId?: string;
  nickname?: string;
  /** 用户 UUID，用于断线重连 */
  userUUID?: string;
  /** 最后活跃时间戳 */
  lastActiveAt: number;
}

export type RoomState = 'waiting' | 'playing';

/** standard: 4 位不重复，反馈 1A2B；position_only: 数字可重复，只反馈位置正确的个数；guess_person: 猜人名 */
export type RoomRule = 'standard' | 'position_only' | 'guess_person';

export interface Room {
  roomId: string;
  host: RoomPlayer | null;
  guest: RoomPlayer | null;
  state: RoomState;
  rule: RoomRule;
  hostCode: string | null;
  guestCode: string | null;
  turn: RoomRole | null;
  createdAt: number;
  /** 道具使用状态：每方各一次「减时」机会 */
  hostItemUsed: boolean;
  guestItemUsed: boolean;
  /** 游戏历史记录（用于重连恢复） */
  history: {
    role: RoomRole;
    guess: string;
    result: string;
    timestamp: number;
  }[];

  /* ── guess_person 模式专用字段 ── */
  /** 当前角色数据 */
  gpPerson?: PersonCharacter;
  /** 已提问过的问题 ID 集合 */
  gpAskedIds?: Set<number>;
  /** 当前轮候选问题 */
  gpCandidates?: PersonQuestion[];
  /** 公开的问答历史 */
  gpQAHistory?: { question: string; answer: string; askedBy: RoomRole }[];
  /** 错误猜测记录 */
  gpWrongGuesses?: { role: RoomRole; name: string }[];
  /** 是否所有问题已用完 */
  gpAllAsked?: boolean;
  /** 猜错后冷却：记录每方最后一次猜错时间戳 */
  gpLastWrongTime?: { host: number; guest: number };
}

const rooms = new Map<string, Room>();

function shortId(): string {
  return randomBytes(5).toString('base64url');
}

export function createRoom(rule: RoomRule = 'standard'): { roomId: string; room: Room } {
  let roomId = shortId();
  while (rooms.has(roomId)) roomId = shortId();
  const room: Room = {
    roomId,
    host: null,
    guest: null,
    state: 'waiting',
    rule,
    hostCode: null,
    guestCode: null,
    turn: null,
    hostItemUsed: false,
    guestItemUsed: false,
    createdAt: Date.now(),
    history: [],
  };
  rooms.set(roomId, room);
  return { roomId, room };
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function deleteRoom(roomId: string): void {
  rooms.delete(roomId);
}

export function setHost(roomId: string, player: RoomPlayer): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  // 允许重连：如果 UUID 匹配，允许替换 WebSocket
  if (room.host && room.host.userUUID && player.userUUID && room.host.userUUID === player.userUUID) {
    console.log('[store] host reconnecting roomId=%s uuid=%s', roomId, player.userUUID);
    room.host = player;
    return true;
  }
  // 否则只有在没有 host 时才能加入
  if (room.host) return false;
  room.host = player;
  return true;
}

export function setGuest(roomId: string, player: RoomPlayer): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  // 允许重连：如果 UUID 匹配，允许替换 WebSocket
  if (room.guest && room.guest.userUUID && player.userUUID && room.guest.userUUID === player.userUUID) {
    console.log('[store] guest reconnecting roomId=%s uuid=%s', roomId, player.userUUID);
    room.guest = player;
    return true;
  }
  // 否则只有在没有 guest 时才能加入
  if (room.guest) return false;
  room.guest = player;
  return true;
}

export function setCode(room: Room, role: RoomRole, code: string): void {
  if (role === 'host') room.hostCode = code;
  else room.guestCode = code;
}

export function startGame(room: Room): void {
  room.state = 'playing';
  room.turn = 'host';
}

export function nextTurn(room: Room): void {
  room.turn = room.turn === 'host' ? 'guest' : 'host';
}

export function computeAB(secret: string, guess: string): { a: number; b: number } {
  if (secret.length !== 4 || guess.length !== 4) return { a: 0, b: 0 };
  let a = 0, b = 0;
  const used: boolean[] = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    if (secret[i] === guess[i]) { a++; used[i] = true; }
  }
  for (let i = 0; i < 4; i++) {
    if (secret[i] === guess[i]) continue;
    for (let j = 0; j < 4; j++) {
      if (!used[j] && guess[j] === secret[i]) { b++; used[j] = true; break; }
    }
  }
  return { a, b };
}

/** 添加猜测记录到历史 */
export function addGuessHistory(room: Room, role: RoomRole, guess: string, result: string): void {
  room.history.push({
    role,
    guess,
    result,
    timestamp: Date.now(),
  });
}

/** 检查房间是否允许重连（房间存在且未过期） */
export function canReconnect(room: Room | undefined, userUUID: string, role: RoomRole): boolean {
  if (!room) return false;
  const player = role === 'host' ? room.host : room.guest;
  if (!player || !player.userUUID) return false;
  return player.userUUID === userUUID;
}

/* ────── guess_person 模式辅助函数 ────── */

/** 初始化猜人名游戏：选角色、准备第一轮候选题 */
/** 猜错后冷却秒数 */
export const GP_WRONG_COOLDOWN_MS = 10_000;

export async function gpInitGame(room: Room): Promise<void> {
  const person = await getRandomPerson();
  room.gpPerson = person;
  room.gpAskedIds = new Set();
  room.gpQAHistory = [];
  room.gpWrongGuesses = [];
  room.gpAllAsked = false;
  room.gpLastWrongTime = { host: 0, guest: 0 };
  room.gpCandidates = pickCandidateQuestions(person, room.gpAskedIds);
}

/** 刷新下一轮候选题（如果还有剩余问题） */
export function gpRefreshCandidates(room: Room): PersonQuestion[] {
  if (!room.gpPerson || !room.gpAskedIds) return [];
  const candidates = pickCandidateQuestions(room.gpPerson, room.gpAskedIds);
  room.gpCandidates = candidates;
  if (candidates.length === 0) room.gpAllAsked = true;
  return candidates;
}

/** 选择一个问题并记录答案 */
export function gpPickQuestion(room: Room, questionId: number, role: RoomRole): { question: string; answer: string } | null {
  if (!room.gpPerson || !room.gpCandidates || !room.gpAskedIds || !room.gpQAHistory) return null;
  const q = room.gpCandidates.find((c) => c.id === questionId);
  if (!q) return null;
  room.gpAskedIds.add(q.id);
  const entry = { question: q.question, answer: q.answer, askedBy: role };
  room.gpQAHistory.push(entry);
  return { question: q.question, answer: q.answer };
}

/** 检查猜测的人名是否正确 */
export function gpCheckName(room: Room, name: string): boolean {
  if (!room.gpPerson) return false;
  // 去掉首尾空格后全匹配
  return name.trim() === room.gpPerson.name;
}

/** 记录一次错误猜测，同时更新冷却时间 */
export function gpAddWrongGuess(room: Room, role: RoomRole, name: string): void {
  if (!room.gpWrongGuesses) room.gpWrongGuesses = [];
  room.gpWrongGuesses.push({ role, name });
  if (!room.gpLastWrongTime) room.gpLastWrongTime = { host: 0, guest: 0 };
  room.gpLastWrongTime[role] = Date.now();
}

/** 检查该玩家是否仍在猜错冷却中，返回剩余毫秒 (0 = 可猜) */
export function gpCooldownRemaining(room: Room, role: RoomRole): number {
  if (!room.gpLastWrongTime) return 0;
  const last = room.gpLastWrongTime[role];
  if (!last) return 0;
  const elapsed = Date.now() - last;
  return Math.max(0, GP_WRONG_COOLDOWN_MS - elapsed);
}
