import { Request, Response, NextFunction } from 'express';
import { err } from '../types.js';
import { authService } from '../services/auth.js';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers.authorization;
  const token = raw?.startsWith('Bearer ') ? raw.slice(7) : null;
  if (!token) {
    return res.status(401).json(err(401, 'missing token'));
  }
  const playerId = await authService.verifyToken(token);
  if (!playerId) {
    return res.status(401).json(err(401, 'invalid token'));
  }
  (req as unknown as { playerId: string }).playerId = playerId;
  next();
}
