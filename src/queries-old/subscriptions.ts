import { pool } from '../lib/db';
import { getStripeCustomerByUserId } from './stripe-customers';

// Helper function para obtener stripe_customer_id
async function getStripeCustomerIdForUser(userId: number): Promise<string | null> {
  const customer = await getStripeCustomerByUserId(userId);
  return customer ? customer.stripe_customer_id : null;
}

export type SubscriptionRow = {
  id: number;
  user_id: number;
  plan_id: number;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused';
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  canceled_at: Date | null;
  trial_start: Date | null;
  trial_end: Date | null;
  created_at: Date;
  updated_at: Date;
};

// Crear una nueva suscripción
export async function createSubscription(subscriptionData: {
  user_id: number;
  plan_id: number;
  stripe_subscription_id: string;
  status: string;
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end?: boolean;
  trial_start?: Date;
  trial_end?: Date;
}): Promise<number> {
  // Obtener stripe_customer_id desde la tabla stripe_customers
  const stripeCustomerId = await getStripeCustomerIdForUser(subscriptionData.user_id);
  if (!stripeCustomerId) {
    throw new Error(`No se encontró stripe_customer_id para el usuario ${subscriptionData.user_id}`);
  }

  const [result] = await pool.execute(`
    INSERT INTO subscriptions (
      user_id, plan_id, stripe_subscription_id, stripe_customer_id, status,
      current_period_start, current_period_end, cancel_at_period_end,
      trial_start, trial_end
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    subscriptionData.user_id,
    subscriptionData.plan_id,
    subscriptionData.stripe_subscription_id,
    stripeCustomerId,
    subscriptionData.status,
    subscriptionData.current_period_start,
    subscriptionData.current_period_end,
    subscriptionData.cancel_at_period_end || false,
    subscriptionData.trial_start || null,
    subscriptionData.trial_end || null
  ]);
  
  return (result as any).insertId;
}

// Obtener suscripción por ID
export async function getSubscriptionById(subscriptionId: number): Promise<SubscriptionRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM subscriptions WHERE id = ?',
    [subscriptionId]
  );
  const subscriptions = rows as SubscriptionRow[];
  return subscriptions.length > 0 ? subscriptions[0] : null;
}

// Obtener suscripción por Stripe ID
export async function getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<SubscriptionRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM subscriptions WHERE stripe_subscription_id = ?',
    [stripeSubscriptionId]
  );
  const subscriptions = rows as SubscriptionRow[];
  return subscriptions.length > 0 ? subscriptions[0] : null;
}

// Obtener suscripción activa de un usuario
export async function getActiveUserSubscription(userId: number): Promise<SubscriptionRow | null> {
  const [rows] = await pool.query(`
    SELECT s.* FROM subscriptions s
    WHERE s.user_id = ? AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1
  `, [userId]);
  
  const subscriptions = rows as SubscriptionRow[];
  return subscriptions.length > 0 ? subscriptions[0] : null;
}

// Obtener todas las suscripciones de un usuario
export async function getUserSubscriptions(userId: number): Promise<SubscriptionRow[]> {
  const [rows] = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows as SubscriptionRow[];
}

// Actualizar estado de suscripción
export async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: string,
  currentPeriodStart?: Date,
  currentPeriodEnd?: Date,
  cancelAtPeriodEnd?: boolean,
  canceledAt?: Date
): Promise<boolean> {
  const fields = ['status = ?', 'updated_at = NOW()'];
  const values = [status];
  
  if (currentPeriodStart) {
    fields.push('current_period_start = ?');
    values.push(currentPeriodStart.toISOString());
  }
  
  if (currentPeriodEnd) {
    fields.push('current_period_end = ?');
    values.push(currentPeriodEnd.toISOString());
  }
  
  if (cancelAtPeriodEnd !== undefined) {
    fields.push('cancel_at_period_end = ?');
    values.push(cancelAtPeriodEnd.toString());
  }
  
  if (canceledAt) {
    fields.push('canceled_at = ?');
    values.push(canceledAt.toISOString());
  }
  
  values.push(stripeSubscriptionId);
  
  const [result] = await pool.execute(`
    UPDATE subscriptions SET ${fields.join(', ')} WHERE stripe_subscription_id = ?
  `, values);
  
  return (result as any).affectedRows > 0;
}

// Cancelar suscripción
export async function cancelSubscription(subscriptionId: number, canceledAt: Date): Promise<boolean> {
  const [result] = await pool.execute(`
    UPDATE subscriptions 
    SET status = 'canceled', canceled_at = ?, updated_at = NOW()
    WHERE id = ?
  `, [canceledAt, subscriptionId]);
  
  return (result as any).affectedRows > 0;
}

// Obtener suscripciones que expiran pronto (para notificaciones)
export async function getSubscriptionsExpiringSoon(days: number = 7): Promise<SubscriptionRow[]> {
  const [rows] = await pool.query(`
    SELECT * FROM subscriptions 
    WHERE status = 'active' 
    AND current_period_end BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
    ORDER BY current_period_end ASC
  `, [days]);
  
  return rows as SubscriptionRow[];
}

// Obtener estadísticas de suscripciones
export async function getSubscriptionStats(): Promise<{
  total_subscriptions: number;
  active_subscriptions: number;
  canceled_subscriptions: number;
  trial_subscriptions: number;
  monthly_revenue: number;
}> {
  const [rows] = await pool.query(`
    SELECT 
      COUNT(*) as total_subscriptions,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_subscriptions,
      SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as canceled_subscriptions,
      SUM(CASE WHEN status = 'trialing' THEN 1 ELSE 0 END) as trial_subscriptions,
      COALESCE(SUM(CASE WHEN status = 'active' THEN p.price ELSE 0 END), 0) as monthly_revenue
    FROM subscriptions s
    LEFT JOIN plans p ON s.plan_id = p.id
    WHERE s.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
  `);
  
  const result = (rows as any[])[0];
  return {
    total_subscriptions: parseInt(result.total_subscriptions) || 0,
    active_subscriptions: parseInt(result.active_subscriptions) || 0,
    canceled_subscriptions: parseInt(result.canceled_subscriptions) || 0,
    trial_subscriptions: parseInt(result.trial_subscriptions) || 0,
    monthly_revenue: parseFloat(result.monthly_revenue) || 0
  };
}
