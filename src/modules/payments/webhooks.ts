import express from 'express';
import Stripe from 'stripe';
import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { emitToUser } from '../../shared/realtime/socket';
import { PushService } from '../notifications/services/push.service';
import { generateVerificationCode } from '../../shared/utils/verification-code.util';

const MODULE = 'PAYMENTS_WEBHOOKS';

export function setupPaymentsWebhooks(app: any) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_APPOINTMENTS_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!stripeSecret || !webhookSecret) {
    Logger.warn(MODULE, 'Stripe appointments webhook not configured (missing STRIPE_SECRET_KEY or STRIPE_APPOINTMENTS_WEBHOOK_SECRET)');
    return;
  }
  
  const stripe = new Stripe(stripeSecret);

  // Webhook genérico de Stripe (alias para compatibilidad)
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req: any, res: any) => {
    return handleStripeWebhook(req, res, stripe, webhookSecret);
  });

  // Webhook específico para pagos de citas (usar raw body)
  app.post('/webhooks/stripe-appointments', express.raw({ type: 'application/json' }), async (req: any, res: any) => {
    return handleStripeWebhook(req, res, stripe, webhookSecret);
  });
  
  // Health check endpoint for webhooks
  app.get('/webhooks/stripe/health', (req: any, res: any) => {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      configured: !!(stripeSecret && webhookSecret),
      endpoints: ['/webhooks/stripe', '/webhooks/stripe-appointments']
    });
  });
  
  app.get('/webhooks/stripe-appointments/health', (req: any, res: any) => {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      configured: !!(stripeSecret && webhookSecret)
    });
  });
  
  Logger.info(MODULE, 'Stripe webhook endpoints configured: POST /webhooks/stripe, POST /webhooks/stripe-appointments');
}

async function handleStripeWebhook(req: any, res: any, stripe: Stripe, webhookSecret: string) {
  Logger.info(MODULE, 'Webhook request received', { 
    headers: req.headers,
    bodyLength: req.body?.length || 0,
    timestamp: new Date().toISOString()
  });
  
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    Logger.error(MODULE, 'Missing stripe-signature header');
    return res.status(400).send('Webhook Error: Missing signature');
  }
  
  let event: Stripe.Event;
  try {
    Logger.info(MODULE, '🔔 [WEBHOOK] Verifying signature...');
    event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
    Logger.info(MODULE, '🔔 [WEBHOOK] Event received', { type: event.type, id: event.id });
  } catch (err: any) {
    Logger.error(MODULE, 'Webhook signature verification failed', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ RESPONDER 200 INMEDIATAMENTE (antes de procesar)
  res.status(200).json({ received: true });

  // Procesar evento de forma asíncrona (después de responder)
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        Logger.info(MODULE, '🔔 [WEBHOOK] checkout.session.completed recibido');
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'payment_intent.succeeded':
        Logger.info(MODULE, '🔔 [WEBHOOK] payment_intent.succeeded', { paymentIntentId: (event.data.object as any).id });
        break;
      default:
        Logger.info(MODULE, `🔔 [WEBHOOK] Unhandled event type: ${event.type}`);
    }

    Logger.info(MODULE, '🔔 [WEBHOOK] Processed successfully', { type: event.type, id: event.id });
  } catch (err) {
    Logger.error(MODULE, 'Webhook handler error', { 
      error: (err as any).message, 
      stack: (err as any).stack,
      eventType: event.type,
      eventId: event.id 
    });
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const pool = DatabaseConnection.getPool();
  try {
    Logger.info(MODULE, '🧭 [HANDLE_COMPLETED] Start', { sessionId: session.id, payment_status: (session as any).payment_status, status: session.status });
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
      Logger.info(MODULE, '🧭 [HANDLE_COMPLETED] Payment already recorded', { appointmentId });
      return;
    }

    // Load appointment to get price and participants
    const [apptRows] = await pool.query('SELECT id, provider_id, client_id, price FROM appointments WHERE id = ? LIMIT 1', [appointmentId]);
    if ((apptRows as any[]).length === 0) {
      Logger.warn(MODULE, '🧭 [HANDLE_COMPLETED] Appointment not found', { appointmentId });
      return;
    }
    const appt = (apptRows as any[])[0];
    const amount = Number(appt.price || 0);
    if (!(amount > 0)) {
      Logger.warn(MODULE, '🧭 [HANDLE_COMPLETED] Invalid amount', { appointmentId, amount });
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

    Logger.info(MODULE, '💰 [HANDLE_COMPLETED] Payment recorded', { appointmentId, amount, clientId, providerId });

    // 🔐 GENERAR CÓDIGO DE VERIFICACIÓN
    const verificationCode = generateVerificationCode();
    Logger.info(MODULE, `🔐 [HANDLE_COMPLETED] Generando código cita ${appointmentId}: ${verificationCode}`);
    
    try {
      await pool.execute(
        `UPDATE appointments 
         SET verification_code = ?, 
             code_generated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [verificationCode, appointmentId]
      );
      Logger.info(MODULE, `✅ [HANDLE_COMPLETED] Código ${verificationCode} guardado en cita ${appointmentId}`);
      
      // Enviar código al cliente por notificación push
      await PushService.notifyUser(
        clientId,
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
        clientId,
        '🔐 Código de Verificación Generado',
        `Tu código de verificación para la cita #${appointmentId} es: ${verificationCode}. Guárdalo de forma segura.`,
        { 
          type: 'verification_code', 
          appointment_id: String(appointmentId) 
        }
      );
      
      Logger.info(MODULE, `✅ [HANDLE_COMPLETED] Código enviado al cliente ${clientId}`);
      
    } catch (codeErr) {
      Logger.error(MODULE, `❌ Error generando/enviando código de verificación para cita ${appointmentId}`, codeErr as any);
      // No bloqueamos el flujo si falla el código, pero lo registramos
    }

    // Emit realtime notifications
    try { 
      Logger.info(MODULE, '🔔 Emitting payment:completed to provider', { providerId, appointmentId, amount });
      emitToUser(providerId, 'payment:completed', { appointment_id: appointmentId, amount }); 
    } catch (e) {
      Logger.warn(MODULE, 'Socket emit to provider failed', e as any);
    }
    try { 
      Logger.info(MODULE, '🔔 Emitting payment:completed to client', { clientId, appointmentId, amount });
      emitToUser(clientId, 'payment:completed', { appointment_id: appointmentId, amount }); 
    } catch (e) {
      Logger.warn(MODULE, 'Socket emit to client failed', e as any);
    }
  } catch (err) {
    Logger.error(MODULE, 'Error handling checkout.session.completed', err as any);
  }
}


