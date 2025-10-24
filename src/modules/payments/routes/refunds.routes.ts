import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'REFUNDS';

export function buildRefundRoutes(): Router {
  const router = Router();

  // POST /payments/appointments/:id/refund-request
  router.post('/payments/appointments/:id/refund-request', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      const { reason } = (req.body || {}) as { reason?: string };
      if (!Number.isFinite(appointmentId) || !reason || reason.trim().length < 10) {
        return res.status(400).json({ success: false, error: 'Parámetros inválidos (motivo mínimo 10 caracteres)' });
      }
      const pool = DatabaseConnection.getPool();
      const [[appt]]: any = await pool.query('SELECT id, client_id, provider_id, price, status FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      if (Number(appt.client_id) !== Number(user.id)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }
      // Buscar pago asociado
      const [[payment]]: any = await pool.query('SELECT id, amount, currency, status FROM payments WHERE appointment_id = ? LIMIT 1', [appointmentId]);

      const [result]: any = await pool.execute(
        `INSERT INTO refund_requests (appointment_id, payment_id, client_id, provider_id, amount, currency, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [appointmentId, payment?.id || null, appt.client_id, appt.provider_id, payment?.amount || null, payment?.currency || 'CLP', reason.trim()]
      );

      Logger.info(MODULE, `Refund requested by client ${user.id} for appt ${appointmentId}`);
      return res.json({ success: true, request_id: result.insertId });
    } catch (e: any) {
      Logger.error(MODULE, 'Error creating refund request', e);
      return res.status(500).json({ success: false, error: 'refund_request_error' });
    }
  });

  return router;
}


