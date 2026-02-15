import { Router } from 'express';
import { leaderboardService } from '../services/leaderboard.js';
import { campaignLeaderboardService } from '../services/campaignLeaderboard.js';
import { ok, err } from '../types.js';

export const leaderboardRouter = Router();

// PVP 排行榜（原有功能）
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

// 提交关卡成绩
leaderboardRouter.post('/campaign', async (req, res) => {
  try {
    const { levelId, playerName, guessCount, timeMs } = req.body;

    if (!levelId || !playerName || !guessCount || timeMs == null) {
      return res.status(400).json(err(400, 'Missing required fields'));
    }

    const result = await campaignLeaderboardService.submitScore({
      levelId: Number(levelId),
      playerName: String(playerName),
      guessCount: Number(guessCount),
      timeMs: Number(timeMs),
    });

    res.json(ok(result));
  } catch (e) {
    const error = e as Error;
    if (error.message.includes('required') || error.message.includes('Invalid')) {
      res.status(400).json(err(400, error.message));
    } else {
      res.status(500).json(err(500, error.message));
    }
  }
});

// 获取指定关卡的排行榜
leaderboardRouter.get('/campaign/:levelId', async (req, res) => {
  try {
    const levelId = Number(req.params.levelId);
    if (isNaN(levelId)) {
      return res.status(400).json(err(400, 'Invalid level ID'));
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const result = await campaignLeaderboardService.getLeaderboard(levelId, page, limit);
    res.json(ok(result));
  } catch (e) {
    res.status(500).json(err(500, (e as Error).message));
  }
});

// 获取所有关卡统计信息
leaderboardRouter.get('/campaign-stats', async (req, res) => {
  try {
    const stats = await campaignLeaderboardService.getStats();
    res.json(ok(stats));
  } catch (e) {
    res.status(500).json(err(500, (e as Error).message));
  }
});
