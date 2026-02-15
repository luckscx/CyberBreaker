import type { WebSocket } from 'ws';
import { randomBytes } from 'crypto';

export type RoomRole = 'host' | 'guest';

export interface RoomPlayer {
  ws: WebSocket;
  role: RoomRole;
  playerId?: string;
  nickname?: string;
}

export type RoomState = 'waiting' | 'playing';

export interface Room {
  roomId: string;
  host: RoomPlayer | null;
  guest: RoomPlayer | null;
  state: RoomState;
  hostCode: string | null;
  guestCode: string | null;
  turn: RoomRole | null;
  createdAt: number;
}

const rooms = new Map<string, Room>();

function shortId(): string {
  return randomBytes(5).toString('base64url');
}

export function createRoom(): { roomId: string; room: Room } {
  let roomId = shortId();
  while (rooms.has(roomId)) roomId = shortId();
  const room: Room = {
    roomId,
    host: null,
    guest: null,
    state: 'waiting',
    hostCode: null,
    guestCode: null,
    turn: null,
    createdAt: Date.now(),
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
  if (!room || room.host) return false;
  room.host = player;
  return true;
}

export function setGuest(roomId: string, player: RoomPlayer): boolean {
  const room = rooms.get(roomId);
  if (!room || room.guest) return false;
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
