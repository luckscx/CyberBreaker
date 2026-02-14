import { Router } from 'express';
import { matchService } from '../services/match.js';
import { ok, err } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';

export const matchRouter = Router();

matchRouter.post('/finish', authMiddleware, async (req, res) => {
  try {
    const playerId = (req as unknown as { playerId?: string }).playerId!;
    const { targetCode, totalTimeMs, actionTimeline, isWin } = req.body ?? {};
    if (!targetCode || typeof totalTimeMs !== 'number' || !Array.isArray(actionTimeline)) {
      return res.status(400).json(err(400, 'targetCode, totalTimeMs, actionTimeline required'));
    }
    const record = await matchService.finishMatch(playerId, {
      targetCode,
      totalTimeMs,
      actionTimeline,
      isWin: typeof isWin === 'boolean' ? isWin : undefined,
    });
    res.json(ok(record));
  } catch (e) {
    res.status(500).json(err(500, (e as Error).message));
  }
});

matchRouter.get('/ghost', authMiddleware, async (req, res) => {
  try {
    const playerId = (req as unknown as { playerId?: string }).playerId!;
    const ghost = await matchService.getGhostRecord(playerId);
    if (!ghost) return res.status(404).json(err(404, 'no ghost record. run: pnpm run seed'));
    res.json(ok(ghost));
  } catch (e) {
    res.status(500).json(err(500, (e as Error).message));
  }
});
