import { connectDb } from '../db.js';
import { Player } from '../models/Player.js';

export const leaderboardService = {
  async getList(page: number, limit: number) {
    await connectDb();
    const skip = (page - 1) * limit;
    const list = await Player.find()
      .sort({ mmr: -1 })
      .skip(skip)
      .limit(limit)
      .select('playerId mmr')
      .lean()
      .exec();
    const total = await Player.countDocuments();
    return { list, total, page, limit };
  },
};
