import { Router } from 'express';
import { authRouter } from './auth.js';
import { matchRouter } from './match.js';
import { leaderboardRouter } from './leaderboard.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/match', matchRouter);
apiRouter.use('/leaderboard', leaderboardRouter);
