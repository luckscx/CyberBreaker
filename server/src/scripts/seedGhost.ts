import 'dotenv/config';
import { connectDb } from '../db.js';
import { seedGhostData } from '../services/seedGhost.js';

connectDb()
  .then(() => seedGhostData())
  .then((r) => {
    console.log('Seed done:', r);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
