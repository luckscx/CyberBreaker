import { Router } from 'express';
import { leaderboardService } from '../services/leaderboard.js';
import { ok, err } from '../types.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const list = await leaderboardService.getList(page, limit);
    res.json(ok(list));
  } catch (e) {
    res.status(500).json(err(500, (e as Error).message));
  }
});
