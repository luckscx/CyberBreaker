import { Router } from 'express';
import { createRoom, getRoom } from '../room/store.js';
import { ok, err } from '../types.js';

export const roomRouter = Router();

roomRouter.post('/create', (req, res) => {
  const ruleInput = req.body?.rule;
  const rule = ruleInput === 'position_only' ? 'position_only' : ruleInput === 'guess_person' ? 'guess_person' : 'standard';
  const { roomId, room } = createRoom(rule);
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const joinUrl = `${baseUrl.replace(/\/$/, '')}/play?room=${roomId}`;
  res.json(ok({ roomId, joinUrl, wsPath: `/ws/room/${roomId}`, rule: room.rule }));
});

roomRouter.get('/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json(err(404, 'room not found'));
  res.json(ok({
    roomId: room.roomId,
    state: room.state,
    rule: room.rule,
    hasHost: !!room.host,
    hasGuest: !!room.guest,
    joinUrl: `${process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`}`.replace(/\/$/, '') + `/play?room=${room.roomId}`,
    wsPath: `/ws/room/${room.roomId}`,
  }));
});
