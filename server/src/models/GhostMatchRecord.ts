import mongoose from 'mongoose';

const actionSchema = new mongoose.Schema(
  {
    timestamp: Number,
    guessCode: String,
    result: String,
    usedSkill: String,
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    recordId: { type: String, required: true, unique: true },
    playerId: { type: String, required: true, index: true },
    targetCode: { type: String, required: true },
    totalTimeMs: { type: Number, required: true },
    mmrSnapshot: { type: Number, required: true },
    actionTimeline: [actionSchema],
  },
  { timestamps: true }
);

schema.index({ mmrSnapshot: 1 });

export const GhostMatchRecord = mongoose.model('GhostMatchRecord', schema);
