import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import { PushService } from '../services/push.service';

export function buildDeviceTokensRoutes(): Router {
  const router = Router();

  router.post('/notifications/device-token', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const { token, platform } = req.body || {};
      if (!token) return res.status(400).json({ success: false, error: 'token requerido' });
      await PushService.registerToken(Number(user.id), String(token), String(platform || 'web'));
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Error registrando token' });
    }
  });

  router.delete('/notifications/device-token', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ success: false, error: 'token requerido' });
      await PushService.removeToken(Number(user.id), String(token));
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Error eliminando token' });
    }
  });

  return router;
}


