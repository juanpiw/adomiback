import express from 'express';
import Stripe from 'stripe';
import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { emitToUser } from '../../shared/realtime/socket';

const MODULE = 'PAYMENTS_WEBHOOKS';

export function setupPaymentsWebhooks(app: any) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_APPOINTMENTS_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeSecret || !webhookSecret) {
    Logger.warn(MODULE, 'Stripe webhook not configured (missing STRIPE_SECRET_KEY or STRIPE_APPOINTMENTS_WEBHOOK_SECRET)');
  }
  const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

  // Webhook específico para pagos de citas (usar raw body)
  app.post('/webhooks/stripe-appointments', express.raw({ type: 'application/json' }), async (req: any, res: any) => {
    try {
      if (!stripe || !webhookSecret) {
        return res.status(500).send('Stripe not configured');
      }
      const sig = req.headers['stripe-signature'];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
      } catch (err: any) {
        Logger.error(MODULE, 'Webhook signature verification failed', err);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'payment_intent.succeeded':
          // Optional: can be handled if needed
          break;
        default:
          Logger.info(MODULE, `Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      Logger.error(MODULE, 'Webhook handler error', err as any);
      res.status(500).send('Webhook handler error');
    }
  });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const pool = DatabaseConnection.getPool();
  try {
    const appointmentId = Number(session.metadata?.appointmentId || 0);
    const clientId = Number(session.metadata?.clientId || 0);
    const providerId = Number(session.metadata?.providerId || 0);
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as any)?.id;

    if (!appointmentId || !clientId || !providerId) {
      Logger.warn(MODULE, 'Session completed without required metadata', { sessionId: session.id });
      return;
    }

    // Mark checkout session as completed
    try {
      await pool.execute(
        `UPDATE appointment_checkout_sessions 
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP, stripe_payment_intent_id = ?
         WHERE stripe_checkout_session_id = ?`,
        [paymentIntentId || null, session.id]
      );
    } catch {}

    // Avoid duplicate payments for the same appointment
    const [existingRows] = await pool.query('SELECT id FROM payments WHERE appointment_id = ? AND status = "completed" LIMIT 1', [appointmentId]);
    if ((existingRows as any[]).length > 0) {
      Logger.info(MODULE, 'Payment already recorded for appointment', { appointmentId });
      return;
    }

    // Load appointment to get price and participants
    const [apptRows] = await pool.query('SELECT id, provider_id, client_id, price FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
    if ((apptRows as any[]).length === 0) {
      Logger.warn(MODULE, 'Appointment not found for payment', { appointmentId });
      return;
    }
    const appt = (apptRows as any[])[0];
    const amount = Number(appt.price || 0);
    if (!(amount > 0)) {
      Logger.warn(MODULE, 'Invalid appointment amount', { appointmentId, amount });
      return;
    }

    // Commission rate from settings or default 15%
    let commissionRate = 15.0;
    try {
      const [setRows] = await pool.query('SELECT setting_value FROM platform_settings WHERE setting_key = "default_commission_rate" LIMIT 1');
      if ((setRows as any[]).length) commissionRate = Number((setRows as any[])[0].setting_value) || 15.0;
    } catch {}
    const commissionAmount = Number((amount * (commissionRate / 100)).toFixed(2));
    const providerAmount = Number((amount - commissionAmount).toFixed(2));

    await pool.execute(
      `INSERT INTO payments (appointment_id, client_id, provider_id, amount, commission_amount, provider_amount, currency, payment_method, stripe_payment_intent_id, status, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CLP', 'card', ?, 'completed', CURRENT_TIMESTAMP)`,
      [appointmentId, clientId, providerId, amount, commissionAmount, providerAmount, paymentIntentId || null]
    );

    // Emit realtime notifications
    try { emitToUser(providerId, 'payment:completed', { appointment_id: appointmentId, amount }); } catch {}
    try { emitToUser(clientId, 'payment:completed', { appointment_id: appointmentId, amount }); } catch {}
  } catch (err) {
    Logger.error(MODULE, 'Error handling checkout.session.completed', err as any);
  }
}


