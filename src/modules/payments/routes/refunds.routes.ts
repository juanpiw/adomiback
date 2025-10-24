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
      Logger.info(MODULE, 'Refund request received', { userId: user?.id, appointmentId, reasonLength: (reason || '').length });
      if (!Number.isFinite(appointmentId) || !reason || reason.trim().length < 10) {
        return res.status(400).json({ success: false, error: 'Parámetros inválidos (motivo mínimo 10 caracteres)' });
      }
      const pool = DatabaseConnection.getPool();
      const [[appt]]: any = await pool.query('SELECT id, client_id, provider_id, price, status FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      Logger.info(MODULE, 'Appointment loaded for refund', { appointmentId: appt?.id, client_id: appt?.client_id, provider_id: appt?.provider_id, status: appt?.status });
      if (Number(appt.client_id) !== Number(user.id)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }
      // Buscar pago asociado
      const [[payment]]: any = await pool.query('SELECT id, amount, currency, status FROM payments WHERE appointment_id = ? LIMIT 1', [appointmentId]);
      Logger.info(MODULE, 'Payment lookup for refund', { paymentId: payment?.id, status: payment?.status });

      const [result]: any = await pool.execute(
        `INSERT INTO refund_requests (appointment_id, payment_id, client_id, provider_id, amount, currency, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [appointmentId, payment?.id || null, appt.client_id, appt.provider_id, payment?.amount || null, payment?.currency || 'CLP', reason.trim()]
      );
      Logger.info(MODULE, 'Refund request inserted', { requestId: result.insertId, appointmentId, userId: user?.id });

      // Notificar por email al cliente que iniciamos la revisión
      try {
        const [[userRow]]: any = await pool.query('SELECT email, name FROM users WHERE id = ? LIMIT 1', [appt.client_id]);
        const [[svcRow]]: any = await pool.query('SELECT s.name AS service_name FROM appointments a LEFT JOIN provider_services s ON s.id = a.service_id WHERE a.id = ? LIMIT 1', [appointmentId]);
        const toEmail = userRow?.email;
        if (toEmail) {
          const Email = require('../../../shared/services/email.service') as typeof import('../../../shared/services/email.service');
          await Email.EmailService.sendRefundReceived(toEmail, {
            appName: process.env.APP_NAME || 'Adomi',
            clientName: userRow?.name || null,
            serviceName: svcRow?.service_name || null,
            appointmentId: appointmentId || null,
            originalAmount: Number(payment?.amount || 0),
            currency: payment?.currency || 'CLP',
            reviewDays: Number(process.env.REFUND_REVIEW_DAYS || 3)
          } as any);
        }
      } catch (e) {
        // No bloquear por error de email
      }
      return res.json({ success: true, request_id: result.insertId });
    } catch (e: any) {
      Logger.error(MODULE, 'Error creating refund request', { message: e?.message, code: e?.code, sqlState: e?.sqlState });
      return res.status(500).json({ success: false, error: 'refund_request_error' });
    }
  });

  return router;
}


