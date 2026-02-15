import type { WebSocket } from 'ws';
import { randomBytes } from 'crypto';

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

/** standard: 4 位不重复，反馈 1A2B；position_only: 数字可重复，只反馈位置正确的个数 */
export type RoomRule = 'standard' | 'position_only';

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
