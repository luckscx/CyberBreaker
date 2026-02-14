import { v4 as uuidv4 } from 'uuid';
import { connectDb } from '../db.js';
import { GhostMatchRecord } from '../models/GhostMatchRecord.js';
import { Player } from '../models/Player.js';

const MMR_RANGE = 200;

interface ActionItem {
  timestamp: number;
  guessCode: string;
  result: string;
  usedSkill?: string;
}

interface FinishBody {
  targetCode: string;
  totalTimeMs: number;
  actionTimeline: ActionItem[];
  isWin?: boolean;
}

const MMR_K = 32;

export const matchService = {
  async finishMatch(playerId: string, body: FinishBody) {
    await connectDb();
    const player = await Player.findOne({ playerId }).exec();
    const mmrSnapshot = player?.mmr ?? 1000;
    const recordId = uuidv4();
    await GhostMatchRecord.create({
      recordId,
      playerId,
      targetCode: body.targetCode,
      totalTimeMs: body.totalTimeMs,
      mmrSnapshot,
      actionTimeline: body.actionTimeline,
    });
    if (typeof body.isWin === 'boolean' && player) {
      const delta = body.isWin ? MMR_K : -MMR_K;
      await Player.updateOne({ playerId }, { $inc: { mmr: delta } });
    }
    return { recordId };
  },

  async getGhostRecord(playerId: string) {
    await connectDb();
    const player = await Player.findOne({ playerId }).exec();
    const mmr = player?.mmr ?? 1000;
    const min = mmr - MMR_RANGE;
    const max = mmr + MMR_RANGE;
    const records = await GhostMatchRecord.find({
      mmrSnapshot: { $gte: min, $lte: max },
      playerId: { $ne: playerId },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();
    if (records.length === 0) return null;
    const pick = records[Math.floor(Math.random() * records.length)];
    return {
      recordId: pick.recordId,
      playerId: pick.playerId,
      targetCode: pick.targetCode,
      totalTimeMs: pick.totalTimeMs,
      mmrSnapshot: pick.mmrSnapshot,
      actionTimeline: pick.actionTimeline,
    };
  },
};
