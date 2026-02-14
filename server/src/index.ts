import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/index.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/v1', apiRouter);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
connectDb().catch((e) => console.error('DB connect failed (API will fail until DB is up):', e));
