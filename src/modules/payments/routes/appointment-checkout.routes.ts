import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';
import { emitToUser } from '../../../shared/realtime/socket';
import { PushService } from '../../notifications/services/push.service';
import { generateVerificationCode } from '../../../shared/utils/verification-code.util';
import { cashClosureGate } from '../../../shared/middleware/cash-closure-gate';
import { getProviderPlanLimits } from '../../../shared/utils/subscription.util';
import { resolveCommissionRate } from '../../../shared/utils/commission.util';

const MODULE = 'PAYMENTS_APPOINTMENTS';

export function buildAppointmentCheckoutRoutes(): Router {
  const router = Router();

  // POST /payments/appointments/:id/checkout-session
  router.post('/payments/appointments/:id/checkout-session', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      Logger.info(MODULE, `🧭 [CHECKOUT] Inicio create session appt=${appointmentId}, user=${user.id}`);
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });

      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if ((rows as any[]).length === 0) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      const appt = (rows as any[])[0];
      if (Number(appt.client_id) !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado' });
      if (String(appt.status) !== 'confirmed') return res.status(400).json({ success: false, error: 'La cita debe estar confirmada para pagar' });

      const amount = Number(appt.price || 0);
      if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Precio inválido para la cita' });

      const planLimits = await getProviderPlanLimits(appt.provider_id);
      const providerCommissionRate = await resolveCommissionRate(appt.provider_id);

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

      Logger.info(MODULE, `🧭 [CHECKOUT] Creando sesión Stripe... amount=${amount}, currency=${currency}, client_id=${appt.client_id}, provider_id=${appt.provider_id}`);

      // Feature flag Connect + verificación de proveedor
      let useConnect = false;
      let providerAcct: string | null = null;
      try {
        const [[u]]: any = await pool.query('SELECT stripe_account_id, stripe_payouts_enabled FROM users WHERE id = ? LIMIT 1', [appt.provider_id]);
        if (u && u.stripe_account_id && (u.stripe_payouts_enabled === 1 || u.stripe_payouts_enabled === true)) {
          providerAcct = String(u.stripe_account_id);
        }
        const [[cfg]]: any = await pool.query('SELECT setting_value FROM platform_settings WHERE setting_key = "stripe_connect_enabled" LIMIT 1');
        const globalEnabled = (process.env.STRIPE_CONNECT_ENABLED || '').toLowerCase() === 'true' || (cfg ? String(cfg.setting_value).toLowerCase() === 'true' : false);
        useConnect = !!(globalEnabled && providerAcct);
      } catch {}
      // Calcular comisión base (CLP entero)
      const applicationFeeAmount = useConnect ? Math.max(0, Math.round(checkoutAmount * (providerCommissionRate / 100))) : 0;

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
          providerId: String(appt.provider_id),
          marketplace_model: useConnect ? 'connect' : 'mor'
        },
        ...(useConnect && providerAcct ? {
          payment_intent_data: {
            application_fee_amount: applicationFeeAmount,
            transfer_data: { destination: providerAcct }
          } as any
        } : {})
      } as any);

      Logger.info(MODULE, `🧭 [CHECKOUT] Sesión creada OK: id=${session.id}`);
      await pool.execute(
        `INSERT INTO appointment_checkout_sessions (appointment_id, client_id, provider_id, stripe_checkout_session_id, url, status)
         VALUES (?, ?, ?, ?, ?, 'created')`,
        [appt.id, appt.client_id, appt.provider_id, session.id, session.url || '']
      );
      Logger.info(MODULE, '🧭 [CHECKOUT] Registro de sesión persistido', { appointmentId, sessionId: session.id });
      return res.json({ success: true, url: session.url });
    } catch (err) {
      Logger.error(MODULE, '🔴 [CHECKOUT] Error creating checkout session', err as any);
      return res.status(500).json({ success: false, error: 'Error al crear checkout' });
    }
  });

  // Alias: seleccionar efectivo (para compatibilidad)
  router.post('/payments/appointments/:id/cash/select', authenticateToken, cashClosureGate, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const appointmentId = Number(req.params.id);
      if (!Number.isFinite(appointmentId)) return res.status(400).json({ success: false, error: 'id inválido' });

      const pool = DatabaseConnection.getPool();
      const [[appt]]: any = await pool.query('SELECT * FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      if (Number(appt.client_id) !== Number(user.id) && Number(appt.provider_id) !== Number(user.id)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }

      const planLimits = await getProviderPlanLimits(appt.provider_id);
      if (!planLimits.cashEnabled) {
        return res.status(403).json({ success: false, error: 'Tu plan actual no permite pagos en efectivo. Actualiza tu plan para habilitarlos.' });
      }

      const amount = Number(appt.price || 0);
      if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Precio inválido para la cita' });
      // Tope cash
      try {
        const [[cap]]: any = await pool.query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'cash_max_amount' LIMIT 1`);
        const cashCap = cap ? Number(cap.setting_value) || 150000 : 150000;
        if (amount > cashCap) {
          return res.status(400).json({ success: false, error: `El pago en efectivo excede el tope permitido (${cashCap} CLP)` });
        }
      } catch {}

      // Generar/asegurar código de verificación y marcar método cash
      let verificationCode = String(appt.verification_code || '').trim();
      if (!verificationCode) {
        verificationCode = generateVerificationCode();
        try {
          await pool.execute(
            `UPDATE appointments SET verification_code = ?, code_generated_at = NOW(), payment_method = 'cash', updated_at = NOW() WHERE id = ?`,
            [verificationCode, appointmentId]
          );
        } catch {}
      } else {
        try { await pool.execute(`UPDATE appointments SET payment_method = 'cash', updated_at = NOW() WHERE id = ?`, [appointmentId]); } catch {}
      }

      return res.json({ success: true, code: verificationCode });
    } catch (e: any) {
      Logger.error(MODULE, 'cash/select alias error', e);
      return res.status(500).json({ success: false, error: 'Error al seleccionar efectivo' });
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
      const commissionRate = await resolveCommissionRate(appt.provider_id);
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
      Logger.info(MODULE, `🧭 [CONFIRM] Inicio confirm appt=${appointmentId}, session=${sessionId}, user=${user.id}`);
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

      const commissionRate = await resolveCommissionRate(appt.provider_id);
      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) return res.status(500).json({ success: false, error: 'Stripe no configurado' });
      const stripe = new Stripe(stripeSecret);

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      Logger.info(MODULE, `🧭 [CONFIRM] Sesión Stripe: status=${session.status}, payment_status=${session.payment_status}`);
      const isPaid = session.payment_status === 'paid' || session.status === 'complete';
      if (!isPaid) {
        Logger.warn(MODULE, `🧭 [CONFIRM] Aún no pagado. payment_status=${session.payment_status}, status=${session.status}`);
        return res.json({ success: true, confirmed: false, payment: { status: session.payment_status || session.status } });
      }

      // Registrar pago si no existe
      const [existing] = await pool.query('SELECT id FROM payments WHERE appointment_id = ? AND stripe_checkout_session_id = ? LIMIT 1', [appointmentId, sessionId]);
      if ((existing as any[]).length === 0) {
        const amount = Number(session.amount_total || 0);
        const currency = String(session.currency || 'clp');
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as any)?.id;
        Logger.info(MODULE, `🧭 [CONFIRM] Registrando pago amount=${amount} ${currency}, pi=${paymentIntentId}`);
        // Insertar pago con montos de comisión calculados
        const commissionAmount = Math.round(amount * commissionRate / 100);
        const providerAmount = amount - commissionAmount;
        
        const holdHours = Number(process.env.APPOINTMENT_AUTO_RELEASE_HOURS || 48);
        await pool.execute(
          `INSERT INTO payments (
             appointment_id,
             client_id,
             provider_id,
             amount,
             commission_amount,
             provider_amount,
             currency,
             payment_method,
             status,
             captured,
             escrow_reference,
             stripe_checkout_session_id,
             stripe_payment_intent_id,
             paid_at,
             can_release,
             release_status,
             hold_expires_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, 'card', 'completed', 0, ?, ?, ?, CURRENT_TIMESTAMP, FALSE, 'pending', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
          [
            appointmentId,
            appt.client_id,
            appt.provider_id,
            amount,
            commissionAmount,
            providerAmount,
            currency,
            paymentIntentId || sessionId,
            sessionId,
            paymentIntentId || null,
            holdHours
          ]
        );
        Logger.info(MODULE, `🧭 [CONFIRM] Payment recorded: appointment_id=${appointmentId}, amount=${amount}, commission=${commissionAmount}, provider=${providerAmount}, status=completed`);
        
        // 🔐 GENERAR CÓDIGO DE VERIFICACIÓN
        const verificationCode = generateVerificationCode();
        Logger.info(MODULE, `🔐 Generando código de verificación para cita ${appointmentId}: ${verificationCode}`);
        
        try {
          await pool.execute(
            `UPDATE appointments 
             SET verification_code = ?, 
                 code_generated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [verificationCode, appointmentId]
          );
          Logger.info(MODULE, `🧭 [CONFIRM] ✅ Código ${verificationCode} guardado en cita ${appointmentId}`);
          
          // Enviar código al cliente por notificación push
          await PushService.notifyUser(
            Number(appt.client_id),
            '🔐 Código de Verificación',
            `Tu código para verificar el servicio es: ${verificationCode}. Compártelo con el profesional SOLO cuando el servicio esté completado.`,
            { 
              type: 'verification_code', 
              appointment_id: String(appointmentId), 
              code: verificationCode 
            }
          );
          
          // Crear notificación in-app para el cliente
          await PushService.createInAppNotification(
            Number(appt.client_id),
            '🔐 Código de Verificación Generado',
            `Tu código de verificación para la cita #${appointmentId} es: ${verificationCode}. Guárdalo de forma segura.`,
            { 
              type: 'verification_code', 
              appointment_id: String(appointmentId) 
            }
          );
          
          Logger.info(MODULE, `✅ Código enviado al cliente ${appt.client_id} por push y notificación in-app`);
          
        } catch (codeErr) {
          Logger.error(MODULE, `❌ Error generando/enviando código de verificación para cita ${appointmentId}`, codeErr as any);
          // No bloqueamos el flujo si falla el código, pero lo registramos
        }
        
        // Emitir evento de pago completado a proveedor y cliente
        try { emitToUser(appt.provider_id, 'payment:completed', { appointment_id: appointmentId, amount }); } catch {}
        try { emitToUser(appt.client_id, 'payment:completed', { appointment_id: appointmentId, amount }); } catch {}
        // Push al proveedor notificando pago recibido
        try { await PushService.notifyUser(Number(appt.provider_id), 'Pago recibido', `Cliente pagó $${amount} por cita #${appointmentId}`, { type: 'payment', appointment_id: String(appointmentId) }); } catch {}
      }

      return res.json({ success: true, confirmed: true, payment: { status: 'succeeded' } });
    } catch (err) {
      Logger.error(MODULE, '🔴 [CONFIRM] Error confirming appointment payment', err as any);
      return res.status(500).json({ success: false, error: 'Error al confirmar pago' });
    }
  });

  // GET /provider/earnings/summary?month=YYYY-MM&day=YYYY-MM-DD
  router.get('/provider/earnings/summary', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const monthParam = String(req.query.month || '').trim();
      const dayParam = String(req.query.day || '').trim();
      const now = new Date();
      let scope: 'month' | 'day' = 'month';
      let y = now.getFullYear();
      let m = now.getMonth() + 1;
      let start: Date;
      let end: Date;

      if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
        const [dayYear, dayMonth, dayDay] = dayParam.split('-').map(Number);
        y = dayYear;
        m = dayMonth;
        scope = 'day';
        start = new Date(y, m - 1, dayDay);
        end = new Date(y, m - 1, dayDay);
      } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        [y, m] = monthParam.split('-').map(Number);
        start = new Date(y, m - 1, 1);
        end = new Date(y, m, 0);
      } else {
        start = new Date(y, m - 1, 1);
        end = new Date(y, m, 0);
      }

      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

      Logger.info(MODULE, `🧮 [EARNINGS] Provider=${providerId} scope=${scope} range=${startStr}..${endStr}`);

      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT 
            SUM(CASE WHEN status='completed' AND can_release = TRUE AND DATE(paid_at) BETWEEN ? AND ? THEN provider_amount ELSE 0 END) AS releasable_this_month,
            SUM(CASE WHEN status='completed' AND can_release = FALSE AND DATE(paid_at) BETWEEN ? AND ? THEN provider_amount ELSE 0 END) AS pending_release_this_month,
            SUM(CASE WHEN release_status='completed' AND released_at IS NOT NULL AND DATE(released_at) BETWEEN ? AND ? THEN provider_amount ELSE 0 END) AS released_this_month,
            COUNT(CASE WHEN status='completed' AND DATE(paid_at) BETWEEN ? AND ? THEN 1 END) AS paid_count
         FROM payments
         WHERE provider_id = ?`,
        [startStr, endStr, startStr, endStr, startStr, endStr, startStr, endStr, providerId]
      );

      const [seriesRows] = await pool.query(
        scope === 'day'
          ? `SELECT LPAD(HOUR(paid_at), 2, '0') AS bucket, SUM(provider_amount) AS total
             FROM payments
             WHERE provider_id = ? AND status = 'completed' AND DATE(paid_at) BETWEEN ? AND ?
             GROUP BY HOUR(paid_at)
             ORDER BY bucket`
          : `SELECT DATE(paid_at) AS bucket, SUM(provider_amount) AS total
             FROM payments
             WHERE provider_id = ? AND status = 'completed' AND DATE(paid_at) BETWEEN ? AND ?
             GROUP BY DATE(paid_at)
             ORDER BY bucket`,
        [providerId, startStr, endStr]
      );

      const series = (seriesRows as any[]).map((item: any) => {
        if (scope === 'day') {
          const hour = String(item.bucket ?? '00').padStart(2, '0');
          return { bucket: `${hour}:00`, total: Number(item.total || 0) };
        }
        const bucketValue = item.bucket instanceof Date
          ? item.bucket.toISOString().slice(0, 10)
          : String(item.bucket);
        return { bucket: bucketValue, total: Number(item.total || 0) };
      });

      const r: any = (rows as any[])[0] || {};
      const summary = {
        scope,
        month: `${y}-${String(m).padStart(2,'0')}`,
        day: scope === 'day' ? startStr : null,
        range: { start: startStr, end: endStr },
        releasable: Number(r.releasable_this_month || 0),
        pending: Number(r.pending_release_this_month || 0),
        released: Number(r.released_this_month || 0),
        paidCount: Number(r.paid_count || 0),
        series
      };

      Logger.info(MODULE, '🧮 [EARNINGS] Summary', summary);
      return res.json({ success: true, summary });
    } catch (err) {
      Logger.error(MODULE, '🔴 [EARNINGS] Error getting summary', err as any);
      return res.status(500).json({ success: false, error: 'Error al obtener ingresos' });
    }
  });

  return router;
}


