/**
 * Stripe Webhooks
 * Handles Stripe webhook events to update subscription status
 */

import { Request, Response, Express } from 'express';
import express from 'express';
import Stripe from 'stripe';
import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { logFunnelEvent } from '../../shared/utils/subscription.util';

const MODULE = 'StripeWebhooks';

// Webhook unificado se monta desde payments/webhooks.ts
export function setupStripeWebhooks(_app: Express) {
  Logger.info(MODULE, 'Stripe webhook is handled by payments module (unified endpoint)');
}

/**
 * Handle successful checkout session completion
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session, pool: any) {
  Logger.info(MODULE, 'Processing checkout.session.completed', { sessionId: session.id });
  
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;
  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  Logger.info(MODULE, 'Session metadata', { userId, planId, subscriptionId, customerId });

  if (!userId || !planId) {
    Logger.error(MODULE, 'Missing required metadata in checkout session');
    return;
  }

  try {
    // Actualizar usuario con customer_id y plan activo
    await pool.execute(
      'UPDATE users SET stripe_customer_id = ?, active_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [customerId, planId, userId]
    );
    Logger.info(MODULE, 'User updated with customer_id and plan', { userId, customerId, planId });

    // Crear o actualizar suscripción
    const [existing] = await pool.query(
      'SELECT id FROM subscriptions WHERE user_id = ? AND status = "active"',
      [userId]
    );

    if ((existing as any[]).length > 0) {
      // Actualizar suscripción existente
      await pool.execute(
        `UPDATE subscriptions 
         SET stripe_subscription_id = ?, 
             plan_id = ?, 
             status = 'active',
             current_period_start = NOW(),
             current_period_end = DATE_ADD(NOW(), INTERVAL 1 MONTH),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND status = 'active'`,
        [subscriptionId, planId, userId]
      );
      Logger.info(MODULE, 'Existing subscription updated', { userId, subscriptionId });
    } else {
      // Crear nueva suscripción
      await pool.execute(
        `INSERT INTO subscriptions 
         (user_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end) 
         VALUES (?, ?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH))`,
        [userId, planId, subscriptionId]
      );
      Logger.info(MODULE, 'New subscription created', { userId, subscriptionId });
    }

    await logFunnelEvent(pool, {
      event: 'converted_to_paid',
      providerId: Number(userId),
      metadata: {
        plan_id: Number(planId),
        subscription_id: subscriptionId || null
      }
    });

  } catch (error: any) {
    Logger.error(MODULE, 'Error processing checkout session', error);
    throw error;
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription, pool: any) {
  Logger.info(MODULE, 'Processing subscription.updated', { subscriptionId: subscription.id });
  
  try {
    await pool.execute(
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
    throw error;
  }
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription, pool: any) {
  Logger.info(MODULE, 'Processing subscription.deleted', { subscriptionId: subscription.id });
  
  try {
    // Marcar suscripción como cancelada
    await pool.execute(
      `UPDATE subscriptions 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
       WHERE stripe_subscription_id = ?`,
      [subscription.id]
    );
    
    // Degradar usuario a plan básico (plan_id = 1)
    await pool.execute(
      'UPDATE users SET active_plan_id = 1 WHERE stripe_customer_id = ?',
      [subscription.customer]
    );
    
    Logger.info(MODULE, 'Subscription cancelled and user downgraded', { 
      subscriptionId: subscription.id, 
      customerId: subscription.customer 
    });
  } catch (error: any) {
    Logger.error(MODULE, 'Error cancelling subscription', error);
    throw error;
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice, pool: any) {
  Logger.info(MODULE, 'Processing payment.succeeded', { invoiceId: invoice.id });
  
  try {
    const invoiceAny = invoice as any;
    const subscriptionId = typeof invoiceAny.subscription === 'string' 
      ? invoiceAny.subscription 
      : invoiceAny.subscription?.id;
      
    if (subscriptionId) {
      await pool.execute(
        `UPDATE subscriptions 
         SET status = 'active', updated_at = CURRENT_TIMESTAMP 
         WHERE stripe_subscription_id = ?`,
        [subscriptionId]
      );
      Logger.info(MODULE, 'Subscription reactivated after payment', { subscriptionId });
    }
  } catch (error: any) {
    Logger.error(MODULE, 'Error processing payment success', error);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice, pool: any) {
  Logger.info(MODULE, 'Processing payment.failed', { invoiceId: invoice.id });
  
  try {
    const invoiceAny = invoice as any;
    const subscriptionId = typeof invoiceAny.subscription === 'string' 
      ? invoiceAny.subscription 
      : invoiceAny.subscription?.id;
      
    if (subscriptionId) {
      await pool.execute(
        `UPDATE subscriptions 
         SET status = 'past_due', updated_at = CURRENT_TIMESTAMP 
         WHERE stripe_subscription_id = ?`,
        [subscriptionId]
      );
      Logger.info(MODULE, 'Subscription marked as past_due', { subscriptionId });
    }
  } catch (error: any) {
    Logger.error(MODULE, 'Error processing payment failure', error);
    throw error;
  }
}
