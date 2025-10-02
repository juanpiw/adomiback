import { Router } from 'express';
import { 
  getActiveUserSubscription,
  getUserSubscriptions,
  getSubscriptionById,
  getSubscriptionByStripeId,
  updateSubscriptionStatus,
  cancelSubscription,
  getSubscriptionsExpiringSoon,
  getSubscriptionStats
} from '../queries/subscriptions';
import { createStripeCustomer, createCheckoutSession, getSubscription, cancelSubscription as stripeCancelSubscription } from '../lib/stripe';
import { createRevenueRecord } from '../queries/accounting';
import { subscriptionRateLimit } from '../config/rate-limits';

export function mountSubscriptions(router: Router) {
  // GET /subscriptions/user/:userId - Obtener suscripción activa del usuario
  router.get('/subscriptions/user/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ ok: false, error: 'ID de usuario inválido' });
      }

      const subscription = await getActiveUserSubscription(userId);
      res.json({ ok: true, subscription });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][GET_USER][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener suscripción del usuario' });
    }
  });

  // GET /subscriptions/user/:userId/all - Obtener todas las suscripciones del usuario
  router.get('/subscriptions/user/:userId/all', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ ok: false, error: 'ID de usuario inválido' });
      }

      const subscriptions = await getUserSubscriptions(userId);
      res.json({ ok: true, subscriptions });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][GET_USER_ALL][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener suscripciones del usuario' });
    }
  });

  // GET /subscriptions/:id - Obtener suscripción por ID
  router.get('/subscriptions/:id', async (req, res) => {
    try {
      const subscriptionId = parseInt(req.params.id);
      if (isNaN(subscriptionId)) {
        return res.status(400).json({ ok: false, error: 'ID de suscripción inválido' });
      }

      const subscription = await getSubscriptionById(subscriptionId);
      if (!subscription) {
        return res.status(404).json({ ok: false, error: 'Suscripción no encontrada' });
      }

      res.json({ ok: true, subscription });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][GET_BY_ID][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener suscripción' });
    }
  });

  // POST /subscriptions/create-checkout - Crear sesión de checkout
  router.post('/subscriptions/create-checkout', subscriptionRateLimit, async (req, res) => {
    try {
      const { planId, userEmail, userName } = req.body;

      if (!planId || !userEmail || !userName) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Faltan campos requeridos: planId, userEmail, userName' 
        });
      }

      // Obtener el plan para obtener el price_id
      const { getPlanById } = await import('../queries/plans');
      const plan = await getPlanById(planId);
      if (!plan) {
        return res.status(404).json({ ok: false, error: 'Plan no encontrado' });
      }

      // Verificar si las credenciales de Stripe están configuradas
      if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('your_stripe_secret_key_here')) {
        // Modo de prueba - simular checkout exitoso
        const mockSessionId = `cs_test_${Date.now()}`;
        const successUrl = `${process.env.FRONTEND_URL}/auth/payment-success?session_id=${mockSessionId}`;
        
        res.json({ 
          ok: true, 
          checkoutUrl: successUrl,
          sessionId: mockSessionId,
          message: 'Modo de prueba - Stripe no configurado'
        });
        return;
      }

      // Crear o obtener customer de Stripe
      const customerResult = await createStripeCustomer(userEmail, userName, 0);
      if (!customerResult.success) {
        return res.status(500).json({ 
          ok: false, 
          error: 'Error al crear customer en Stripe' 
        });
      }

      // Crear sesión de checkout
      const successUrl = `${process.env.FRONTEND_URL}/auth/payment-success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${process.env.FRONTEND_URL}/auth/payment-error`;

      const checkoutResult = await createCheckoutSession(
        plan.stripe_price_id,
        customerResult.customerId!,
        successUrl,
        cancelUrl,
        { planId, userEmail, userName }
      );

      if (!checkoutResult.success) {
        return res.status(500).json({ 
          ok: false, 
          error: 'Error al crear sesión de checkout' 
        });
      }

      res.json({ 
        ok: true, 
        checkoutUrl: checkoutResult.url,
        sessionId: checkoutResult.sessionId
      });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][CREATE_CHECKOUT][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al crear sesión de checkout' });
    }
  });

  // POST /subscriptions/cancel - Cancelar suscripción
  router.post('/subscriptions/cancel', async (req, res) => {
    try {
      const { subscriptionId, userId } = req.body;

      if (!subscriptionId || !userId) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Faltan campos requeridos: subscriptionId, userId' 
        });
      }

      // Obtener suscripción
      const subscription = await getSubscriptionById(subscriptionId);
      if (!subscription) {
        return res.status(404).json({ ok: false, error: 'Suscripción no encontrada' });
      }

      // Verificar que pertenece al usuario
      if (subscription.user_id !== userId) {
        return res.status(403).json({ ok: false, error: 'No autorizado' });
      }

      // Cancelar en Stripe
      const stripeResult = await stripeCancelSubscription(subscription.stripe_subscription_id);
      if (!stripeResult.success) {
        return res.status(500).json({ 
          ok: false, 
          error: 'Error al cancelar suscripción en Stripe' 
        });
      }

      // Actualizar en base de datos
      const success = await cancelSubscription(subscriptionId, new Date());
      if (!success) {
        return res.status(500).json({ 
          ok: false, 
          error: 'Error al actualizar suscripción en base de datos' 
        });
      }

      res.json({ ok: true, message: 'Suscripción cancelada exitosamente' });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][CANCEL][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al cancelar suscripción' });
    }
  });

  // GET /subscriptions/expiring - Obtener suscripciones que expiran pronto (admin)
  router.get('/subscriptions/expiring', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const subscriptions = await getSubscriptionsExpiringSoon(days);
      res.json({ ok: true, subscriptions });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][EXPIRING][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener suscripciones que expiran' });
    }
  });

  // GET /subscriptions/stats - Obtener estadísticas de suscripciones (admin)
  router.get('/subscriptions/stats', async (req, res) => {
    try {
      const stats = await getSubscriptionStats();
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][STATS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener estadísticas' });
    }
  });

  // POST /subscriptions/webhook - Webhook para actualizar suscripciones
  router.post('/subscriptions/webhook', async (req, res) => {
    try {
      const { type, data } = req.body;

      switch (type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(data.object);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(data.object);
          break;
        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(data.object);
          break;
        case 'invoice.payment_failed':
          await handlePaymentFailed(data.object);
          break;
        default:
          console.log('[WEBHOOK] Evento no manejado:', type);
      }

      res.json({ ok: true, received: true });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][WEBHOOK][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al procesar webhook' });
    }
  });
}

// Funciones auxiliares para webhooks
async function handleSubscriptionUpdate(subscription: any) {
  try {
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
    } else {
      // Crear nueva suscripción
      const { createSubscription } = await import('../queries/subscriptions');
      await createSubscription({
        user_id: parseInt(subscription.metadata.userId),
        plan_id: parseInt(subscription.metadata.planId),
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000),
        current_period_end: new Date(subscription.current_period_end * 1000),
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined
      });
    }
  } catch (error) {
    console.error('[WEBHOOK] Error handling subscription update:', error);
  }
}

async function handleSubscriptionDeleted(subscription: any) {
  try {
    await updateSubscriptionStatus(
      subscription.id,
      'canceled',
      undefined,
      undefined,
      undefined,
      new Date()
    );
  } catch (error) {
    console.error('[WEBHOOK] Error handling subscription deletion:', error);
  }
}

async function handlePaymentSucceeded(invoice: any) {
  try {
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
      }
    } else {
      // Es un pago único
      await createRevenueRecord(
        parseInt(invoice.metadata.userId),
        'one_time',
        invoice.amount_paid / 100,
        invoice.payment_intent
      );
    }
  } catch (error) {
    console.error('[WEBHOOK] Error handling payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice: any) {
  try {
    console.log('[WEBHOOK] Payment failed for invoice:', invoice.id);
    // Aquí podrías implementar lógica para notificar al usuario
  } catch (error) {
    console.error('[WEBHOOK] Error handling payment failed:', error);
  }
}
