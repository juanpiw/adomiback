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
  const usedSecretSource = process.env.STRIPE_APPOINTMENTS_WEBHOOK_SECRET ? 'STRIPE_APPOINTMENTS_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET';
  const secretSuffix = webhookSecret ? String(webhookSecret).slice(-6) : null;
  
  if (!stripeSecret || !webhookSecret) {
    Logger.warn(MODULE, 'Stripe appointments webhook not configured (missing STRIPE_SECRET_KEY or STRIPE_APPOINTMENTS_WEBHOOK_SECRET)');
    return;
  }
  
  const stripe = new Stripe(stripeSecret);
  Logger.info(MODULE, 'Webhook configured', {
    usedSecretSource,
    hasAppointmentsSecret: !!process.env.STRIPE_APPOINTMENTS_WEBHOOK_SECRET,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    secretSuffix
  });

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
      endpoints: ['/webhooks/stripe', '/webhooks/stripe-appointments'],
      usedSecretSource,
      secretSuffix
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
    // Idempotencia: registrar evento si no existe
    try {
      const pool = DatabaseConnection.getPool();
      const payloadHash = require('crypto').createHash('sha256').update(Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body))).digest('hex');
      await pool?.execute(
        `INSERT IGNORE INTO stripe_events (event_id, event_type, payload_hash, status, delivered_at, raw_payload)
         VALUES (?, ?, ?, 'received', CURRENT_TIMESTAMP(6), JSON_OBJECT('type', ?, 'id', ?, 'receivedAt', NOW(6)))`,
        [event.id, event.type, payloadHash, event.type, event.id]
      );
    } catch (e) {
      Logger.warn(MODULE, 'Idempotency insert failed/ignored', e as any);
    }

    Logger.info(MODULE, '🔔 [WEBHOOK] Dispatching handler', { type: event.type });
    switch (event.type) {
      case 'invoice.payment_succeeded':
        Logger.info(MODULE, '🔔 [WEBHOOK] invoice.payment_succeeded', { invoiceId: (event.data.object as any).id });
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        try {
          // Promover a provider si estaba pendiente (cuando el plan es de proveedor)
          const inv: any = event.data.object as any;
          const customer = inv.customer;
          const pool = DatabaseConnection.getPool();
          if (customer) {
            const [[dbRowBeforeCtx]]: any = await pool.query('SELECT DATABASE() AS db');
            const [[u]]: any = await pool.query('SELECT id, role, pending_role, email FROM users WHERE stripe_customer_id = ? LIMIT 1', [customer]);
            Logger.info(MODULE, '🧪 [PROMO] Context before update', { db: dbRowBeforeCtx?.db, stripe_customer_id: customer, userId: u?.id, role: u?.role, pending_role: u?.pending_role });
            if (u && String(u.pending_role) === 'provider') {
              const [[before]]: any = await pool.query('SELECT role, pending_role, updated_at FROM users WHERE id = ? LIMIT 1', [u.id]);
              Logger.info(MODULE, '🧪 [PROMO] Before update', { userId: u.id, before });
              const [upd]: any = await pool.execute("UPDATE users SET role = 'provider', pending_role = NULL, pending_plan_id = NULL, pending_started_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [u.id]);
              Logger.info(MODULE, '🧪 [PROMO] Update result', { affectedRows: upd?.affectedRows });
              const [[after]]: any = await pool.query('SELECT role, pending_role, updated_at FROM users WHERE id = ? LIMIT 1', [u.id]);
              const [[dbRowAfterCtx]]: any = await pool.query('SELECT DATABASE() AS db');
              Logger.info(MODULE, '🧪 [PROMO] After update', { db: dbRowAfterCtx?.db, userId: u.id, after });
              // Crear provider_profiles si no existe y copiar avatar de client_profiles si está disponible
              try {
                const [[cp]]: any = await pool.query('SELECT profile_photo_url FROM client_profiles WHERE client_id = ? LIMIT 1', [u.id]);
                const avatar = cp?.profile_photo_url || null;
                await pool.execute(
                  `INSERT INTO provider_profiles (provider_id, full_name, profile_completion, profile_photo_url)
                   VALUES (?, (SELECT name FROM users WHERE id = ?), 0, ?)
                   ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
                  [u.id, u.id, avatar]
                );
              } catch {}
              Logger.info(MODULE, '✅ Promoted user to provider after invoice.payment_succeeded', { userId: u.id });

              // Enviar recibo/boleta del plan al correo del proveedor
              try {
                const customerEmail = (inv as any).customer_email || u.email || null;
                const invoicePdfUrl = (inv as any).invoice_pdf || null;
                if (customerEmail) {
                  const currency = String((inv as any).currency || 'clp').toUpperCase();
                  const ZERO_DECIMAL = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF']);
                  const rawAmount = Number((inv as any).amount_paid || 0);
                  const amount = ZERO_DECIMAL.has(currency) ? rawAmount : Number((rawAmount / 100).toFixed(2));
                  await EmailService.sendClientReceipt(customerEmail, {
                    appName: 'Adomi',
                    amount,
                    currency,
                    receiptNumber: (inv as any).number || null,
                    invoiceNumber: (inv as any).number || null,
                    invoicePdfUrl,
                    receiptUrl: null,
                    paymentDateISO: (inv as any).status_transitions?.paid_at ? new Date(((inv as any).status_transitions.paid_at as any) * 1000).toISOString() : new Date().toISOString(),
                    appointmentId: null
                  });
                  Logger.info(MODULE, '✉️ [INVOICE] Provider plan receipt sent', { to: customerEmail, amount, currency });
                } else {
                  Logger.warn(MODULE, '✉️ [INVOICE] Missing customer email; skipping provider plan receipt');
                }
              } catch (e) {
                Logger.warn(MODULE, '✉️ [INVOICE] Failed sending provider plan receipt', e as any);
              }
            }
          }
        } catch (e) {
          Logger.warn(MODULE, 'Could not promote pending provider on invoice.payment_succeeded');
        }
        break;
      case 'account.updated':
        Logger.info(MODULE, '🔔 [WEBHOOK] account.updated', { accountId: (event.data.object as any).id });
        await handleAccountUpdated(event.data.object as any as Stripe.Account);
        break;
      case 'checkout.session.completed':
        Logger.info(MODULE, '🔔 [WEBHOOK] checkout.session.completed recibido');
        {
          const s = event.data.object as Stripe.Checkout.Session;
          // Si es suscripción, vincular el customer al usuario por client_reference_id
          if ((s as any).mode === 'subscription') {
            await handleSubscriptionCheckoutCompleted(s);
          } else {
            await handleCheckoutSessionCompleted(s);
          }
        }
        break;
      case 'invoice.payment_succeeded':
        Logger.info(MODULE, '🔔 [WEBHOOK] invoice.payment_succeeded', { invoiceId: (event.data.object as any).id });
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        try {
          // Enviar email de factura al cliente si existe invoice PDF
          const inv = event.data.object as Stripe.Invoice;
          const invoicePdfUrl = (inv as any).invoice_pdf || null;
          const customerEmail = (inv as any).customer_email || (inv as any).customer?.email || null;
          Logger.info(MODULE, '✉️ [INVOICE] Preparing email from invoice.payment_succeeded', {
            customerEmail: !!customerEmail,
            invoicePdfUrl: !!invoicePdfUrl,
            amount_paid: inv.amount_paid,
            currency: inv.currency,
            number: (inv as any).number
          });
          if (customerEmail && invoicePdfUrl) {
            await EmailService.sendClientReceipt(customerEmail, {
              appName: 'Adomi',
              amount: Number((inv.amount_paid || 0) / 100),
              currency: (inv.currency || 'clp').toUpperCase(),
              receiptNumber: inv.number || null,
              invoiceNumber: inv.number || null,
              invoicePdfUrl,
              receiptUrl: null,
              paymentDateISO: inv.status_transitions?.paid_at ? new Date((inv.status_transitions.paid_at as any) * 1000).toISOString() : new Date().toISOString(),
              appointmentId: null
            });
            Logger.info(MODULE, '✉️ Invoice email sent from invoice.payment_succeeded');
          }
        } catch (e) {
          Logger.warn(MODULE, '❕ Could not send invoice email on invoice.payment_succeeded', e as any);
        }
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
        await handleProviderDebtChargeSucceeded(event.data.object as any as Stripe.PaymentIntent);
        break;
      default:
        Logger.info(MODULE, `🔔 [WEBHOOK] Unhandled event type: ${event.type}`);
    }

    Logger.info(MODULE, '🔔 [WEBHOOK] Processed successfully', { type: event.type, id: event.id });
    try {
      const pool = DatabaseConnection.getPool();
      await pool?.execute(
        `UPDATE stripe_events SET status = 'processed', processed_at = CURRENT_TIMESTAMP(6) WHERE event_id = ?`,
        [event.id]
      );
    } catch (e) {
      Logger.warn(MODULE, 'Idempotency update processed failed', e as any);
    }
  } catch (err) {
    Logger.error(MODULE, 'Webhook handler error', { 
      error: (err as any).message, 
      stack: (err as any).stack,
      eventType: event.type,
      eventId: event.id 
    });
    try {
      const pool = DatabaseConnection.getPool();
      await pool?.execute(
        `UPDATE stripe_events SET status = 'error', error_message = ? WHERE event_id = ?`,
        [String((err as any).message || 'error'), event.id]
      );
    } catch (e) {
      Logger.warn(MODULE, 'Idempotency update error failed', e as any);
    }
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

    // Detect model from metadata (connect vs mor)
    const marketplaceModel = String((session.metadata as any)?.marketplace_model || 'mor');
    let destinationAccountId: string | null = null;
    let applicationFeeId: string | null = null;
    let transferId: string | null = null;
    let chargeId: string | null = null;
    try {
      const pi: any = paymentIntentId ? await (new Stripe(process.env.STRIPE_SECRET_KEY as string)).paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge', 'transfer_data.destination', 'charges.data.balance_transaction'] }) : null;
      chargeId = typeof pi?.latest_charge === 'object' ? pi.latest_charge?.id || null : null;
      // Nota: application_fee_id y transfer pueden requerir expand diferente segun modo
      applicationFeeId = (pi?.application_fee_amount && pi?.charges?.data?.[0]?.application_fee) ? String(pi.charges.data[0].application_fee) : null;
      // destination account: en checkout con transfer_data, se refleja en transfer o en pi.transfer_data.destination
      destinationAccountId = pi?.transfer_data?.destination || null;
      transferId = typeof pi?.transfer === 'string' ? pi.transfer : null;
    } catch {}

    // Commission over net base (amount without VAT if configured)
    let commissionRate = 15.0;
    let vatPercent = 0.0;
    try {
      const [setRows] = await pool.query('SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ("default_commission_rate","vat_rate_percent")');
      (setRows as any[]).forEach((r: any) => {
        if (r.setting_key === 'default_commission_rate') commissionRate = Number(r.setting_value) || 15.0;
        if (r.setting_key === 'vat_rate_percent') vatPercent = Number(r.setting_value) || 0.0;
      });
    } catch {}
    // If VAT configured, assume amount is VAT-inclusive: tax = amount * vat/(100+vat)
    const taxAmount = vatPercent > 0 ? Number((amount * (vatPercent / (100 + vatPercent))).toFixed(2)) : 0;
    const netBase = Number((amount - taxAmount).toFixed(2));
    const commissionAmount = Number((netBase * (commissionRate / 100)).toFixed(2));
    const providerAmount = Number((amount - commissionAmount).toFixed(2));

    await pool.execute(
      `INSERT INTO payments (appointment_id, client_id, provider_id, amount, tax_amount, commission_amount, provider_amount, currency, payment_method, stripe_payment_intent_id, status, paid_at, marketplace_model, stripe_destination_account_id, stripe_application_fee_id, stripe_transfer_id, stripe_charge_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CLP', 'card', ?, 'completed', CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
      [appointmentId, clientId, providerId, amount, taxAmount, commissionAmount, providerAmount, paymentIntentId || null, marketplaceModel, destinationAccountId, applicationFeeId, transferId, chargeId]
    );

    Logger.info(MODULE, '💰 [HANDLE_COMPLETED] Payment recorded', { appointmentId, amount, clientId, providerId });

    // === Emails ===
    try {
      // Obtener emails de cliente y proveedor
      const [[clientRow]]: any = await pool.query('SELECT email FROM users WHERE id = ? LIMIT 1', [clientId]);
      const [[providerRow]]: any = await pool.query('SELECT email FROM users WHERE id = ? LIMIT 1', [providerId]);
      let clientEmail: string | undefined = clientRow?.email;
      const providerEmail: string | undefined = providerRow?.email;

      // Fallback a correo del Checkout Session si el usuario no tiene email en DB
      if (!clientEmail) {
        const s: any = session as any;
        clientEmail = s?.customer_details?.email || s?.customer_email || clientEmail;
      }

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

      Logger.info(MODULE, '✉️ [EMAIL] Prepared emails', {
        clientEmail: !!clientEmail,
        providerEmail: !!providerEmail,
        hasReceiptUrl: !!receiptUrl
      });

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

async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session) {
  const pool = DatabaseConnection.getPool();
  if (!pool) return;
  try {
    Logger.info(MODULE, '🧭 [SUB_CHECKOUT_COMPLETED] Start', {
      sessionId: session.id,
      mode: (session as any).mode,
      client_reference_id: (session as any).client_reference_id,
      customer: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id
    });
    const customerId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id;
    const clientReferenceId = (session as any).client_reference_id;
    if (customerId && clientReferenceId) {
      const userId = Number(clientReferenceId);
      if (Number.isFinite(userId)) {
        Logger.info(MODULE, '🧭 [SUB_CHECKOUT_COMPLETED] Persisting stripe_customer_id to user', { userId, customerId });
        await pool.execute(
          'UPDATE users SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (stripe_customer_id IS NULL OR stripe_customer_id = \'\')',
          [customerId, userId]
        );
        Logger.info(MODULE, '🧭 [SUB_CHECKOUT_COMPLETED] Linked stripe_customer_id to user', { userId, customerId });
      }
    } else {
      Logger.warn(MODULE, '🧭 [SUB_CHECKOUT_COMPLETED] Missing customer or client_reference_id', { sessionId: session.id });
    }
  } catch (err) {
    Logger.error(MODULE, 'Error in handleSubscriptionCheckoutCompleted', err as any);
  }
}

async function handleAccountUpdated(account: StripeNamespace.Account) {
  const pool = DatabaseConnection.getPool();
  try {
    const acctId = account.id;
    const payoutsEnabled = !!account.payouts_enabled;
    const requirements = (account as any).requirements || null;
    // Encontrar usuario por stripe_account_id
    await pool.execute(
      `UPDATE users 
       SET stripe_payouts_enabled = ?, 
           stripe_onboarding_status = ?, 
           stripe_requirements = JSON_OBJECT('currently_due', JSON_ARRAY(), 'event_time', NOW())
       WHERE stripe_account_id = ?`,
      [payoutsEnabled ? 1 : 0, payoutsEnabled ? 'completed' : 'requirements_due', acctId]
    );
    Logger.info(MODULE, 'Account updated synced to users', { acctId, payoutsEnabled });
  } catch (err) {
    Logger.error(MODULE, 'Error syncing account.updated', err as any);
  }
}

async function handleProviderDebtChargeSucceeded(pi: Stripe.PaymentIntent) {
  const pool = DatabaseConnection.getPool();
  try {
    const meta: any = (pi as any).metadata || {};
    if (meta.type !== 'commission_debt' || !meta.debt_id) return;
    const debtId = Number(meta.debt_id);
    const amount = Number(pi.amount_received || pi.amount || 0);
    // Obtener charge id de forma segura (expandir si es necesario)
    let chargeId: string | null = null;
    try {
      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);
      const piFull: any = await stripeClient.paymentIntents.retrieve(pi.id, { expand: ['latest_charge', 'charges.data'] } as any);
      if (typeof piFull.latest_charge === 'string') chargeId = piFull.latest_charge;
      else if (piFull.latest_charge?.id) chargeId = String(piFull.latest_charge.id);
      else if (piFull.charges?.data?.[0]?.id) chargeId = String(piFull.charges.data[0].id);
    } catch {}
    // Insert settlement and update debt
    await pool.execute(
      `INSERT INTO provider_commission_settlements (debt_id, provider_id, settled_amount, method, stripe_payment_intent_id, stripe_charge_id)
       VALUES (?, ?, ?, 'card', ?, ?)`,
      [debtId, Number(meta.provider_id || 0), amount, pi.id, chargeId]
    );
    await pool.execute(
      `UPDATE provider_commission_debts SET settled_amount = LEAST(commission_amount, settled_amount + ?), status = CASE WHEN settled_amount + ? >= commission_amount THEN 'paid' ELSE status END, last_attempt_at = NOW(), attempt_count = attempt_count + 1
       WHERE id = ?`,
      [amount, amount, debtId]
    );
  } catch (err) {
    Logger.error(MODULE, 'Error handling provider debt charge succeeded', err as any);
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


