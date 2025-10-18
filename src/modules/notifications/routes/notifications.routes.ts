import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import { PushService } from '../services/push.service';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'NOTIFICATIONS_ROUTES';

export function buildNotificationsRoutes(): Router {
  const router = Router();

  /**
   * GET /notifications
   * Obtener notificaciones del usuario autenticado
   */
  router.get('/notifications', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user || !user.id) {
        return res.status(401).json({ ok: false, error: 'No autorizado' });
      }

      const limit = Number(req.query.limit) || 20;
      const offset = Number(req.query.offset) || 0;
      const unreadOnly = req.query.unread_only === 'true';

      const notifications = await PushService.getUserNotifications(user.id, limit, offset, unreadOnly);
      const unreadCount = await PushService.getUnreadCount(user.id);

      res.json({
        ok: true,
        notifications,
        unreadCount,
        hasMore: notifications.length === limit
      });
    } catch (error: any) {
      Logger.error(MODULE, 'Error getting notifications', error);
      res.status(500).json({ ok: false, error: 'Error al obtener notificaciones' });
    }
  });

  /**
   * GET /notifications/unread-count
   * Obtener conteo de notificaciones no leídas
   */
  router.get('/notifications/unread-count', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user || !user.id) {
        return res.status(401).json({ ok: false, error: 'No autorizado' });
      }

      const count = await PushService.getUnreadCount(user.id);
      res.json({ ok: true, count });
    } catch (error: any) {
      Logger.error(MODULE, 'Error getting unread count', error);
      res.status(500).json({ ok: false, error: 'Error al obtener conteo' });
    }
  });

  /**
   * PATCH /notifications/:id/read
   * Marcar notificación como leída
   */
  router.patch('/notifications/:id/read', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user || !user.id) {
        return res.status(401).json({ ok: false, error: 'No autorizado' });
      }

      const notificationId = Number(req.params.id);
      if (!notificationId) {
        return res.status(400).json({ ok: false, error: 'ID de notificación requerido' });
      }

      const success = await PushService.markAsRead(notificationId, user.id);
      if (success) {
        res.json({ ok: true, message: 'Notificación marcada como leída' });
      } else {
        res.status(404).json({ ok: false, error: 'Notificación no encontrada' });
      }
    } catch (error: any) {
      Logger.error(MODULE, 'Error marking notification as read', error);
      res.status(500).json({ ok: false, error: 'Error al marcar como leída' });
    }
  });

  /**
   * PATCH /notifications/mark-all-read
   * Marcar todas las notificaciones como leídas
   */
  router.patch('/notifications/mark-all-read', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user || !user.id) {
        return res.status(401).json({ ok: false, error: 'No autorizado' });
      }

      await PushService.markAllAsRead(user.id);
      res.json({ ok: true, message: 'Todas las notificaciones marcadas como leídas' });
    } catch (error: any) {
      Logger.error(MODULE, 'Error marking all as read', error);
      res.status(500).json({ ok: false, error: 'Error al marcar todas como leídas' });
    }
  });

  Logger.info(MODULE, 'Notifications routes configured');
  return router;
}

