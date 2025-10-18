import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';
import Stripe from 'stripe';
import { emitToUser } from '../../../shared/realtime/socket';
import { PushService } from '../../notifications/services/push.service';

const MODULE = 'PAYMENTS_APPOINTMENTS';

export function buildAppointmentCheckoutRoutes(): Router {
  const router = Router();

  // POST /payments/appointments/:id/checkout-session
  router.post('/payments/appointments/:id/checkout-session', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });

      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if ((rows as any[]).length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      const appt = (rows as any[])[0];
      if (Number(appt.client_id) !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado' });
      if (String(appt.status) !== 'confirmed') return res.status(400).json({ success: false, error: 'La cita debe estar confirmada para pagar' });

      const amount = Number(appt.price || 0);
      if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Precio inválido para la cita' });

      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) return res.status(500).json({ success: false, error: 'Stripe no configurado' });
      const FRONTEND_URL = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:4200';
      const ZERO_DECIMAL = new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf']);
      const stripe = new Stripe(stripeSecret);
      const currency = 'clp';
      // Permitir monto de prueba fijo (CLP) vía env para probar flujo rápidamente
      const testOverride = Number(process.env.STRIPE_APPOINTMENTS_TEST_AMOUNT_CLP || process.env.STRIPE_TEST_AMOUNT_CLP || 0);
      const checkoutAmount = testOverride > 0 ? testOverride : amount;
      const unitAmount = ZERO_DECIMAL.has(currency) ? Math.round(checkoutAmount) : Math.round(checkoutAmount * 100);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name: 'Pago de cita',
              description: `Cita #${appt.id} con proveedor #${appt.provider_id}`
            }
          },
          quantity: 1
        }],
        success_url: `${FRONTEND_URL}/client/pago/exito?appointmentId=${appointmentId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/client/pago/cancelado?appointmentId=${appointmentId}`,
        metadata: {
          appointmentId: String(appt.id),
          clientId: String(appt.client_id),
          providerId: String(appt.provider_id)
        }
      });

      await pool.execute(
        `INSERT INTO appointment_checkout_sessions (appointment_id, client_id, provider_id, stripe_checkout_session_id, url, status)
         VALUES (?, ?, ?, ?, ?, 'created')`,
        [appt.id, appt.client_id, appt.provider_id, session.id, session.url || '']
      );
      Logger.info(MODULE, 'Checkout session created', { appointmentId, sessionId: session.id });
      return res.json({ success: true, url: session.url });
    } catch (err) {
      Logger.error(MODULE, 'Error creating checkout session', err as any);
      return res.status(500).json({ success: false, error: 'Error al crear checkout' });
    }
  });

  // GET /payments/appointments/:id/status
  router.get('/payments/appointments/:id/status', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });
      const pool = DatabaseConnection.getPool();
      const [apptRows] = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if ((apptRows as any[]).length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      const appt = (apptRows as any[])[0];
      if (Number(appt.client_id) !== Number(user.id) && Number(appt.provider_id) !== Number(user.id)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }
      // Derivar estado desde payments
      const [payRows] = await pool.query('SELECT * FROM payments WHERE appointment_id = ? ORDER BY id DESC LIMIT 1', [appointmentId]);
      const payment = (payRows as any[])[0] || null;
      const status = payment?.status || 'pending';
      return res.json({ success: true, payment: payment ? { status, paid_at: payment.paid_at, amount: payment.amount } : { status: 'pending' } });
    } catch (err) {
      Logger.error(MODULE, 'Error getting payment status', err as any);
      return res.status(500).json({ success: false, error: 'Error al obtener estado de pago' });
    }
  });

  // GET /payments/appointments/:id/confirm?session_id=...
  router.get('/payments/appointments/:id/confirm', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      const sessionId = String(req.query.session_id || '');
      if (!Number.isFinite(appointmentId) || !sessionId) {
        return res.status(400).json({ success: false, error: 'Parámetros inválidos' });
      }
      const pool = DatabaseConnection.getPool();
      const [apptRows] = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if ((apptRows as any[]).length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      const appt = (apptRows as any[])[0];
      if (Number(appt.client_id) !== Number(user.id) && Number(appt.provider_id) !== Number(user.id)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }

      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) return res.status(500).json({ success: false, error: 'Stripe no configurado' });
      const stripe = new Stripe(stripeSecret);

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const isPaid = session.payment_status === 'paid' || session.status === 'complete';
      if (!isPaid) {
        return res.json({ success: true, confirmed: false, payment: { status: session.payment_status || session.status } });
      }

      // Registrar pago si no existe
      const [existing] = await pool.query('SELECT id FROM payments WHERE appointment_id = ? AND stripe_checkout_session_id = ? LIMIT 1', [appointmentId, sessionId]);
      if ((existing as any[]).length === 0) {
        const amount = Number(session.amount_total || 0);
        const currency = String(session.currency || 'clp');
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as any)?.id;
        // Insertar pago con montos de comisión calculados
        const commissionRate = 15.0; // 15% comisión Adomi
        const commissionAmount = Math.round(amount * commissionRate / 100);
        const providerAmount = amount - commissionAmount;
        
        await pool.execute(
          `INSERT INTO payments (appointment_id, client_id, provider_id, amount, commission_amount, provider_amount, currency, payment_method, status, stripe_checkout_session_id, stripe_payment_intent_id, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'card', 'completed', ?, ?, CURRENT_TIMESTAMP)`,
          [appointmentId, appt.client_id, appt.provider_id, amount, commissionAmount, providerAmount, currency, sessionId, paymentIntentId || null]
        );
        Logger.info(MODULE, `Payment recorded: appointment_id=${appointmentId}, amount=${amount}, commission=${commissionAmount}, provider=${providerAmount}, status=completed`);
        // Emitir evento de pago completado a proveedor y cliente
        try { emitToUser(appt.provider_id, 'payment:completed', { appointment_id: appointmentId, amount }); } catch {}
        try { emitToUser(appt.client_id, 'payment:completed', { appointment_id: appointmentId, amount }); } catch {}
        // Push al proveedor notificando pago recibido
        try { await PushService.notifyUser(Number(appt.provider_id), 'Pago recibido', `Cliente pagó $${amount} por cita #${appointmentId}`, { type: 'payment', appointment_id: String(appointmentId) }); } catch {}
      }

      return res.json({ success: true, confirmed: true, payment: { status: 'succeeded' } });
    } catch (err) {
      Logger.error(MODULE, 'Error confirming appointment payment', err as any);
      return res.status(500).json({ success: false, error: 'Error al confirmar pago' });
    }
  });

  return router;
}


