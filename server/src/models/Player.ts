import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    playerId: { type: String, required: true, unique: true },
    deviceId: { type: String, sparse: true },
    mmr: { type: Number, default: 1000 },
    inventory: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

export const Player = mongoose.model('Player', schema);
