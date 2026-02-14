import { Router } from 'express';
import { authService } from '../services/auth.js';
import { ok, err } from '../types.js';

export const authRouter = Router();

authRouter.post('/guest', async (req, res) => {
  try {
    const deviceId = (req.body?.deviceId as string) || undefined;
    const result = await authService.guestLogin(deviceId);
    res.json(ok(result));
  } catch (e) {
    res.status(500).json(err(500, (e as Error).message));
  }
});
