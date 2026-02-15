import { connectDb } from '../db.js';
import { CampaignRecord } from '../models/CampaignRecord.js';

export interface SubmitScoreParams {
  levelId: number;
  playerName: string;
  guessCount: number;
  timeMs: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  guessCount: number;
  timeMs: number;
  timestamp: Date;
}

export const campaignLeaderboardService = {
  /**
   * 提交关卡成绩
   */
  async submitScore(params: SubmitScoreParams) {
    await connectDb();

    // 验证参数
    if (!params.playerName || params.playerName.trim().length === 0) {
      throw new Error('Player name is required');
    }
    if (params.playerName.length > 20) {
      throw new Error('Player name too long (max 20 characters)');
    }
    if (params.guessCount < 1 || params.guessCount > 100) {
      throw new Error('Invalid guess count');
    }
    if (params.timeMs < 0) {
      throw new Error('Invalid time');
    }

    const record = new CampaignRecord({
      levelId: params.levelId,
      playerName: params.playerName.trim(),
      guessCount: params.guessCount,
      timeMs: params.timeMs,
    });

    await record.save();

    return {
      recordId: record._id.toString(),
      submittedAt: record.timestamp,
    };
  },

  /**
   * 获取指定关卡的排行榜
   * 排序规则：猜测次数越少越好 > 时间越短越好
   */
  async getLeaderboard(levelId: number, page: number, limit: number): Promise<{
    list: LeaderboardEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    await connectDb();

    const skip = (page - 1) * limit;

    const records = await CampaignRecord.find({ levelId })
      .sort({ guessCount: 1, timeMs: 1 })
      .skip(skip)
      .limit(limit)
      .select('playerName guessCount timeMs timestamp')
      .lean()
      .exec();

    const total = await CampaignRecord.countDocuments({ levelId });

    // 添加排名
    const list: LeaderboardEntry[] = records.map((record, index) => ({
      rank: skip + index + 1,
      playerName: record.playerName,
      guessCount: record.guessCount,
      timeMs: record.timeMs,
      timestamp: record.timestamp,
    }));

    return { list, total, page, limit };
  },

  /**
   * 获取所有关卡的统计信息
   */
  async getStats() {
    await connectDb();

    const stats = await CampaignRecord.aggregate([
      {
        $group: {
          _id: '$levelId',
          totalPlays: { $sum: 1 },
          avgGuessCount: { $avg: '$guessCount' },
          avgTimeMs: { $avg: '$timeMs' },
          bestGuessCount: { $min: '$guessCount' },
          bestTimeMs: { $min: '$timeMs' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    return stats.map(s => ({
      levelId: s._id,
      totalPlays: s.totalPlays,
      avgGuessCount: Math.round(s.avgGuessCount * 10) / 10,
      avgTimeMs: Math.round(s.avgTimeMs),
      bestGuessCount: s.bestGuessCount,
      bestTimeMs: s.bestTimeMs,
    }));
  },
};
