import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    levelId: { type: Number, required: true, index: true },
    playerName: { type: String, required: true, maxlength: 20 },
    guessCount: { type: Number, required: true },
    timeMs: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// 复合索引：按关卡 + 猜测次数 + 时间排序
schema.index({ levelId: 1, guessCount: 1, timeMs: 1 });

export const CampaignRecord = mongoose.model('CampaignRecord', schema);
