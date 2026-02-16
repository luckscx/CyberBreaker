import { Router } from 'express';
import { ok, err } from '../types.js';
import { createFreeRoom, getFreeRoom, getPlayerList } from './store.js';

export const freeRouter = Router();

freeRouter.post('/create', (req, res) => {
  const { roomName, password, guessLimit } = req.body || {};
  const room = createFreeRoom({
    roomName: typeof roomName === 'string' ? roomName.slice(0, 20) : undefined,
    password: typeof password === 'string' && password.length > 0 ? password : undefined,
    guessLimit: typeof guessLimit === 'number' ? guessLimit : undefined,
  });
  console.log('[FreeRoom] created room=%s name=%s limit=%d', room.roomCode, room.roomName, room.guessLimit);
  res.json(ok({
    roomCode: room.roomCode,
    roomName: room.roomName,
    guessLimit: room.guessLimit,
    hasPassword: !!room.password,
  }));
});

freeRouter.get('/:roomCode', (req, res) => {
  const room = getFreeRoom(req.params.roomCode);
  if (!room) {
    res.json(err(404, '房间不存在'));
    return;
  }
  res.json(ok({
    roomCode: room.roomCode,
    roomName: room.roomName,
    state: room.state,
    playerCount: room.players.length,
    maxPlayers: 8,
    hasPassword: !!room.password,
    guessLimit: room.guessLimit,
    players: getPlayerList(room),
  }));
});
