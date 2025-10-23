import express from 'express';
import Stripe from 'stripe';
import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { emitToUser } from '../../shared/realtime/socket';
import { PushService } from '../notifications/services/push.service';
import { generateVerificationCode } from '../../shared/utils/verification-code.util';
import { EmailService } from '../../shared/services/email.service';
import type StripeNamespace from 'stripe';

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
      case 'invoice.payment_succeeded':
        Logger.info(MODULE, '🔔 [WEBHOOK] invoice.payment_succeeded', { invoiceId: (event.data.object as any).id });
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        Logger.info(MODULE, '🔔 [WEBHOOK] invoice.payment_failed', { invoiceId: (event.data.object as any).id });
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        Logger.info(MODULE, '🔔 [WEBHOOK] customer.subscription.updated', { subscriptionId: (event.data.object as any).id });
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        Logger.info(MODULE, '🔔 [WEBHOOK] customer.subscription.deleted', { subscriptionId: (event.data.object as any).id });
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
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
  if (!pool) {
    Logger.error(MODULE, 'Database connection not available in handleCheckoutSessionCompleted');
    return;
  }
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

    // === Emails ===
    try {
      // Obtener emails de cliente y proveedor
      const [[clientRow]]: any = await pool.query('SELECT email FROM users WHERE id = ? LIMIT 1', [clientId]);
      const [[providerRow]]: any = await pool.query('SELECT email FROM users WHERE id = ? LIMIT 1', [providerId]);
      const clientEmail: string | undefined = clientRow?.email;
      const providerEmail: string | undefined = providerRow?.email;

      // Intentar enriquecer con URLs de Stripe si hay invoice / recibo
      let invoicePdfUrl: string | null = null;
      let receiptUrl: string | null = null;
      try {
        const stripePaymentIntentId = paymentIntentId;
        if (stripePaymentIntentId) {
          const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);
          const pi: any = await stripeClient.paymentIntents.retrieve(stripePaymentIntentId, { expand: ['latest_charge'] });
          const latestCharge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
          receiptUrl = latestCharge?.receipt_url || null;
          // Nota: el invoice PDF existe principalmente en flujos de factura; en checkout de cita puede no existir
        }
      } catch {}

      if (clientEmail) {
        await EmailService.sendClientReceipt(clientEmail, {
          appName: 'Adomi',
          amount,
          currency: 'CLP',
          receiptNumber: null,
          invoiceNumber: null,
          invoicePdfUrl,
          receiptUrl,
          paymentDateISO: new Date().toISOString(),
          appointmentId
        });
      }
      if (providerEmail) {
        await EmailService.sendProviderPaymentSummary(providerEmail, {
          appName: 'Adomi',
          appointmentId,
          amount,
          commissionAmount,
          providerAmount,
          currency: 'CLP',
          paymentDateISO: new Date().toISOString()
        });
      }
      Logger.info(MODULE, '✉️ Emails de pago enviados');
    } catch (emailErr) {
      Logger.error(MODULE, 'Error enviando emails de pago', emailErr as any);
    }

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

// === Handlers portados de subscriptions/webhooks.ts (sin acceso directo al pool) ===
async function handleInvoicePaymentSucceeded(invoice: StripeNamespace.Invoice) {
  const pool = DatabaseConnection.getPool();
  try {
    const invoiceAny = invoice as any;
    const subscriptionId = typeof invoiceAny.subscription === 'string' 
      ? invoiceAny.subscription 
      : invoiceAny.subscription?.id;
    if (subscriptionId) {
      await pool?.execute(
        `UPDATE subscriptions 
         SET status = 'active', updated_at = CURRENT_TIMESTAMP 
         WHERE stripe_subscription_id = ?`,
        [subscriptionId]
      );
      Logger.info(MODULE, 'Subscription reactivated after payment', { subscriptionId });
    }
  } catch (error: any) {
    Logger.error(MODULE, 'Error processing payment success', error);
  }
}

async function handleInvoicePaymentFailed(invoice: StripeNamespace.Invoice) {
  const pool = DatabaseConnection.getPool();
  try {
    const invoiceAny = invoice as any;
    const subscriptionId = typeof invoiceAny.subscription === 'string' 
      ? invoiceAny.subscription 
      : invoiceAny.subscription?.id;
    if (subscriptionId) {
      await pool?.execute(
        `UPDATE subscriptions 
         SET status = 'past_due', updated_at = CURRENT_TIMESTAMP 
         WHERE stripe_subscription_id = ?`,
        [subscriptionId]
      );
      Logger.info(MODULE, 'Subscription marked as past_due', { subscriptionId });
    }
  } catch (error: any) {
    Logger.error(MODULE, 'Error processing payment failure', error);
  }
}

async function handleSubscriptionUpdated(subscription: StripeNamespace.Subscription) {
  const pool = DatabaseConnection.getPool();
  try {
    await pool?.execute(
      `UPDATE subscriptions 
       SET status = ?,
           current_period_start = FROM_UNIXTIME(?),
           current_period_end = FROM_UNIXTIME(?),
           cancel_at_period_end = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = ?`,
      [
        subscription.status,
        (subscription as any).current_period_start,
        (subscription as any).current_period_end,
        subscription.cancel_at_period_end || false,
        subscription.id
      ]
    );
    Logger.info(MODULE, 'Subscription updated in database', { subscriptionId: subscription.id, status: subscription.status });
  } catch (error: any) {
    Logger.error(MODULE, 'Error updating subscription', error);
  }
}

async function handleSubscriptionDeleted(subscription: StripeNamespace.Subscription) {
  const pool = DatabaseConnection.getPool();
  try {
    await pool?.execute(
      `UPDATE subscriptions 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
       WHERE stripe_subscription_id = ?`,
      [subscription.id]
    );
    await pool?.execute(
      'UPDATE users SET active_plan_id = 1 WHERE stripe_customer_id = ?',
      [subscription.customer]
    );
    Logger.info(MODULE, 'Subscription cancelled and user downgraded', { 
      subscriptionId: subscription.id, 
      customerId: subscription.customer 
    });
  } catch (error: any) {
    Logger.error(MODULE, 'Error cancelling subscription', error);
  }
}


