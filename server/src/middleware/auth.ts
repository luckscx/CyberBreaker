import { Request, Response, NextFunction } from 'express';
import { err } from '../types.js';
import { authService } from '../services/auth.js';

function log(msg: string) {
  process.stderr.write(`[auth] ${msg}\n`);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers.authorization;
  log(`Authorization header: ${raw ?? '(empty)'}`);
  const token = raw?.startsWith('Bearer ') ? raw.slice(7) : null;
  if (!token) {
    log('Missing token');
    return res.status(401).json(err(401, 'missing token'));
  }
  const playerId = await authService.verifyToken(token);
  if (!playerId) {
    log('Invalid token');
    return res.status(401).json(err(401, 'invalid token'));
  }
  (req as unknown as { playerId: string }).playerId = playerId;
  log(`Authenticated playerId: ${playerId}`);
  next();
}
