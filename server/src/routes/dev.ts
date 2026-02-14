import { Router } from 'express';
import { seedGhostData } from '../services/seedGhost.js';
import { ok, err } from '../types.js';
import { GhostMatchRecord } from '../models/GhostMatchRecord.js';

export const devRouter = Router();

const devAllowed = () =>
  process.env.NODE_ENV === 'development' || process.env.DEV_SEED_ALLOW === '1';

devRouter.post('/seed-ghost', async (req, res) => {
  if (!devAllowed()) {
    return res.status(403).json(err(403, 'dev only'));
  }
  try {
    const result = await seedGhostData();
    res.json(ok(result));
  } catch (e) {
    res.status(500).json(err(500, (e as Error).message));
  }
});

devRouter.get('/ghost-stats', async (req, res) => {
  if (!devAllowed()) {
    return res.status(403).json(err(403, 'dev only'));
  }
  try {
    const count = await GhostMatchRecord.countDocuments().exec();
    const byPlayer = await GhostMatchRecord.aggregate([
      { $group: { _id: '$playerId', count: { $sum: 1 }, mmr: { $first: '$mmrSnapshot' } } },
    ]).exec();
    res.json(ok({ count, byPlayer, db: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cyberbreaker' }));
  } catch (e) {
    res.status(500).json(err(500, (e as Error).message));
  }
});
