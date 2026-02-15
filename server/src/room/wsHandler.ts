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
  type Room,
  type RoomRole,
} from './store.js';

const CODE_REG = /^[0-9]{4}$/;
function isValidCode(s: string): boolean {
  return CODE_REG.test(s) && new Set(s).size === 4;
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
  console.log('[WS room] join roomId=%s role=%s', roomId, role);

  const player = { ws, role, playerId: undefined as string | undefined, nickname: undefined as string | undefined };
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
      hostCodeSet: !!room.hostCode,
      guestCodeSet: !!room.guestCode,
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
      hostCodeSet: !!room.hostCode,
      guestCodeSet: !!room.guestCode,
    });
    if (room.host) {
      send(room.host.ws, 'peer_joined', {});
    }
    broadcast(room, 'game_start', { message: 'both connected, set your code' });
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
        if (!code || !isValidCode(code)) {
          console.log('[WS room] set_code invalid roomId=%s role=%s code=%s', roomId, role, code ?? '(missing)');
          send(ws, 'error', { message: 'invalid code, need 4 unique digits' });
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
          broadcast(room, 'game_start', { turn: room.turn, turnStartAt: Date.now() });
        }
        break;
      }
      case 'guess': {
        if (room.state !== 'playing') {
          send(ws, 'error', { message: 'game not started' });
          return;
        }
        const guess = data.guess;
        if (!guess || !isValidCode(guess)) {
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
        const result = `${a}A${b}B`;
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
      closeRoom(roomId, room);
    }
  });

  ws.on('error', () => {
    console.log('[WS room] error roomId=%s role=%s', roomId, role);
    const room = getRoom(roomId);
    if (room) closeRoom(roomId, room);
  });
}
