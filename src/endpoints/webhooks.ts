import { Router } from 'express';
import { verifyWebhookSignature } from '../lib/stripe';
import { 
  getSubscriptionByStripeId, 
  updateSubscriptionStatus, 
  createSubscription 
} from '../queries/subscriptions';
import { createRevenueRecord } from '../queries/accounting';
import { getPlanByStripePriceId } from '../queries/plans';

export function mountWebhooks(router: Router) {
  // POST /webhooks/stripe - Webhook principal de Stripe
  router.post('/webhooks/stripe', async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const payload = JSON.stringify(req.body);

      // Verificar la firma del webhook
      const verification = verifyWebhookSignature(payload, signature);
      if (!verification.success) {
        console.error('[WEBHOOK] Signature verification failed:', verification.error);
        return res.status(400).json({ ok: false, error: 'Invalid signature' });
      }

      const event = verification.event;
      console.log('[WEBHOOK] Received event:', event.type);

      // Procesar el evento según su tipo
      switch (event.type) {
        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;
        case 'customer.subscription.trial_will_end':
          await handleTrialWillEnd(event.data.object);
          break;
        case 'invoice.payment_action_required':
          await handlePaymentActionRequired(event.data.object);
          break;
        default:
          console.log('[WEBHOOK] Unhandled event type:', event.type);
      }

      res.json({ ok: true, received: true });
    } catch (error: any) {
      console.error('[WEBHOOK][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Webhook processing failed' });
    }
  });

  // GET /webhooks/stripe - Verificar webhook (para configuración)
  router.get('/webhooks/stripe', (req, res) => {
    res.json({ 
      ok: true, 
      message: 'Stripe webhook endpoint is active',
      timestamp: new Date().toISOString()
    });
  });
}

// Funciones auxiliares para manejar eventos de webhook

async function handleSubscriptionCreated(subscription: any) {
  try {
    console.log('[WEBHOOK] Subscription created:', subscription.id);
    
    // Obtener el plan por el price_id
    const priceId = subscription.items.data[0].price.id;
    const plan = await getPlanByStripePriceId(priceId);
    
    if (!plan) {
      console.error('[WEBHOOK] Plan not found for price_id:', priceId);
      return;
    }

    // Crear suscripción en la base de datos
    await createSubscription({
      user_id: parseInt(subscription.metadata.userId),
      plan_id: plan.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined
    });

    console.log('[WEBHOOK] Subscription created in database');
  } catch (error) {
    console.error('[WEBHOOK] Error handling subscription created:', error);
  }
}

async function handleSubscriptionUpdated(subscription: any) {
  try {
    console.log('[WEBHOOK] Subscription updated:', subscription.id);
    
    const existingSubscription = await getSubscriptionByStripeId(subscription.id);
    
    if (existingSubscription) {
      // Actualizar suscripción existente
      await updateSubscriptionStatus(
        subscription.id,
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
        subscription.cancel_at_period_end,
        subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : undefined
      );
      console.log('[WEBHOOK] Subscription updated in database');
    } else {
      console.error('[WEBHOOK] Subscription not found for update:', subscription.id);
    }
  } catch (error) {
    console.error('[WEBHOOK] Error handling subscription updated:', error);
  }
}

async function handleSubscriptionDeleted(subscription: any) {
  try {
    console.log('[WEBHOOK] Subscription deleted:', subscription.id);
    
    await updateSubscriptionStatus(
      subscription.id,
      'canceled',
      undefined,
      undefined,
      undefined,
      new Date()
    );
    
    console.log('[WEBHOOK] Subscription marked as canceled');
  } catch (error) {
    console.error('[WEBHOOK] Error handling subscription deleted:', error);
  }
}

async function handlePaymentSucceeded(invoice: any) {
  try {
    console.log('[WEBHOOK] Payment succeeded for invoice:', invoice.id);
    
    if (invoice.subscription) {
      // Es una suscripción
      const subscription = await getSubscriptionByStripeId(invoice.subscription);
      if (subscription) {
        await createRevenueRecord(
          subscription.user_id,
          'subscription',
          invoice.amount_paid / 100, // Stripe usa centavos
          invoice.payment_intent,
          subscription.id
        );
        console.log('[WEBHOOK] Revenue record created for subscription');
      }
    } else {
      // Es un pago único
      if (invoice.metadata.userId) {
        await createRevenueRecord(
          parseInt(invoice.metadata.userId),
          'one_time',
          invoice.amount_paid / 100,
          invoice.payment_intent
        );
        console.log('[WEBHOOK] Revenue record created for one-time payment');
      }
    }
  } catch (error) {
    console.error('[WEBHOOK] Error handling payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice: any) {
  try {
    console.log('[WEBHOOK] Payment failed for invoice:', invoice.id);
    
    // Aquí podrías implementar lógica para:
    // - Notificar al usuario
    // - Enviar email de recordatorio
    // - Actualizar el estado de la suscripción
    // - Registrar en logs para seguimiento
    
    // Por ahora solo logueamos el error
    console.log('[WEBHOOK] Payment failed details:', {
      invoice_id: invoice.id,
      customer: invoice.customer,
      amount: invoice.amount_due,
      attempt_count: invoice.attempt_count
    });
  } catch (error) {
    console.error('[WEBHOOK] Error handling payment failed:', error);
  }
}

async function handleTrialWillEnd(subscription: any) {
  try {
    console.log('[WEBHOOK] Trial will end for subscription:', subscription.id);
    
    // Aquí podrías implementar lógica para:
    // - Enviar notificación al usuario
    // - Mostrar banner en la app
    // - Enviar email de recordatorio
    
    console.log('[WEBHOOK] Trial ending details:', {
      subscription_id: subscription.id,
      trial_end: subscription.trial_end,
      customer: subscription.customer
    });
  } catch (error) {
    console.error('[WEBHOOK] Error handling trial will end:', error);
  }
}

async function handlePaymentActionRequired(invoice: any) {
  try {
    console.log('[WEBHOOK] Payment action required for invoice:', invoice.id);
    
    // Aquí podrías implementar lógica para:
    // - Notificar al usuario que necesita completar el pago
    // - Redirigir a una página de confirmación
    // - Enviar email con instrucciones
    
    console.log('[WEBHOOK] Payment action required details:', {
      invoice_id: invoice.id,
      customer: invoice.customer,
      amount: invoice.amount_due,
      payment_intent: invoice.payment_intent
    });
  } catch (error) {
    console.error('[WEBHOOK] Error handling payment action required:', error);
  }
}
