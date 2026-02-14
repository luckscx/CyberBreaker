import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { connectDb } from '../db.js';
import { Player } from '../models/Player.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

export const authService = {
  async guestLogin(deviceId?: string): Promise<{ playerId: string; token: string }> {
    await connectDb();
    let player = deviceId ? await Player.findOne({ deviceId }).exec() : null;
    if (!player) {
      const playerId = uuidv4();
      player = await Player.create({ playerId, deviceId, mmr: 1000 });
    }
    const token = jwt.sign({ playerId: player.playerId, sub: 'guest' }, JWT_SECRET, { expiresIn: '30d' });
    return { playerId: player.playerId, token };
  },

  async verifyToken(token: string): Promise<string | null> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { playerId?: string };
      return decoded.playerId ?? null;
    } catch (e) {
      process.stderr.write(`[auth] verifyToken failed: ${(e as Error).message}\n`);
      return null;
    }
  },
};
