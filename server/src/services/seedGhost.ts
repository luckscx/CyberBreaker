import { v4 as uuidv4 } from 'uuid';
import { connectDb } from '../db.js';
import { GhostMatchRecord } from '../models/GhostMatchRecord.js';
import { Player } from '../models/Player.js';

const SEED_PLAYER_PREFIX = 'seed-ghost-';

function evaluate(secret: string, guess: string): string {
  if (guess.length !== 4 || new Set(guess).size !== 4) return '';
  let a = 0, b = 0;
  for (let i = 0; i < 4; i++) {
    if (secret[i] === guess[i]) a++;
    else if (secret.includes(guess[i])) b++;
  }
  return `${a}A${b}B`;
}

function buildTimeline(targetCode: string, guesses: string[]): { timestamp: number; guessCode: string; result: string }[] {
  const out: { timestamp: number; guessCode: string; result: string }[] = [];
  let t = 0;
  for (const g of guesses) {
    out.push({ timestamp: t, guessCode: g, result: evaluate(targetCode, g) });
    t += 5000 + Math.floor(Math.random() * 4000);
  }
  return out;
}

const SEED_PLAYERS = [
  { id: '1', mmr: 920 },
  { id: '2', mmr: 960 },
  { id: '3', mmr: 1000 },
  { id: '4', mmr: 1040 },
  { id: '5', mmr: 1080 },
];

const SEED_GAMES: { targetCode: string; guesses: string[] }[] = [
  { targetCode: '1234', guesses: ['5678', '9012', '1357', '1243', '1234'] },
  { targetCode: '5678', guesses: ['0123', '4567', '5679', '5678'] },
  { targetCode: '9012', guesses: ['3456', '7890', '9120', '9012'] },
  { targetCode: '3456', guesses: ['7890', '1234', '3564', '3456'] },
  { targetCode: '7890', guesses: ['1234', '5678', '0897', '7890'] },
  { targetCode: '2468', guesses: ['1357', '2469', '2486', '2468'] },
  { targetCode: '1357', guesses: ['2468', '1359', '1375', '1357'] },
];

export async function seedGhostData(): Promise<{ players: number; records: number }> {
  await connectDb();
  const seedIds = SEED_PLAYERS.map((p) => SEED_PLAYER_PREFIX + p.id);
  await GhostMatchRecord.deleteMany({ playerId: { $in: seedIds } }).exec();

  for (const p of SEED_PLAYERS) {
    const playerId = SEED_PLAYER_PREFIX + p.id;
    await Player.findOneAndUpdate(
      { playerId },
      { $set: { playerId, mmr: p.mmr } },
      { upsert: true }
    ).exec();
  }

  let records = 0;
  for (const p of SEED_PLAYERS) {
    const playerId = SEED_PLAYER_PREFIX + p.id;
    for (const game of SEED_GAMES) {
      const timeline = buildTimeline(game.targetCode, game.guesses);
      const totalTimeMs = timeline[timeline.length - 1]?.timestamp ?? 0;
      await GhostMatchRecord.create({
        recordId: uuidv4(),
        playerId,
        targetCode: game.targetCode,
        totalTimeMs,
        mmrSnapshot: p.mmr,
        actionTimeline: timeline,
      });
      records++;
    }
  }
  return { players: SEED_PLAYERS.length, records };
}
