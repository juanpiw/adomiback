import { pool } from '../lib/db';

export type PlanRow = {
  id: number;
  name: string;
  stripe_price_id: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  description: string;
  features: string;
  max_services: number;
  max_bookings: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

// Obtener todos los planes activos
export async function getActivePlans(): Promise<PlanRow[]> {
  const [rows] = await pool.query(
    'SELECT * FROM plans WHERE is_active = true ORDER BY price ASC'
  );
  return rows as PlanRow[];
}

// Obtener un plan por ID
export async function getPlanById(planId: number): Promise<PlanRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM plans WHERE id = ? AND is_active = true',
    [planId]
  );
  const plans = rows as PlanRow[];
  return plans.length > 0 ? plans[0] : null;
}

// Obtener un plan por Stripe Price ID
export async function getPlanByStripePriceId(stripePriceId: string): Promise<PlanRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM plans WHERE stripe_price_id = ? AND is_active = true',
    [stripePriceId]
  );
  const plans = rows as PlanRow[];
  return plans.length > 0 ? plans[0] : null;
}

// Crear un nuevo plan
export async function createPlan(planData: {
  name: string;
  stripe_price_id: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  description: string;
  features: string;
  max_services: number;
  max_bookings: number;
}): Promise<number> {
  const [result] = await pool.execute(`
    INSERT INTO plans (name, stripe_price_id, price, currency, interval, description, features, max_services, max_bookings, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true)
  `, [
    planData.name,
    planData.stripe_price_id,
    planData.price,
    planData.currency,
    planData.interval,
    planData.description,
    planData.features,
    planData.max_services,
    planData.max_bookings
  ]);
  
  return (result as any).insertId;
}

// Actualizar un plan
export async function updatePlan(planId: number, planData: Partial<PlanRow>): Promise<boolean> {
  const fields = [];
  const values = [];
  
  Object.entries(planData).forEach(([key, value]) => {
    if (value !== undefined && key !== 'id' && key !== 'created_at') {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });
  
  if (fields.length === 0) return false;
  
  values.push(planId);
  
  const [result] = await pool.execute(`
    UPDATE plans SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?
  `, values);
  
  return (result as any).affectedRows > 0;
}

// Desactivar un plan
export async function deactivatePlan(planId: number): Promise<boolean> {
  const [result] = await pool.execute(
    'UPDATE plans SET is_active = false, updated_at = NOW() WHERE id = ?',
    [planId]
  );
  
  return (result as any).affectedRows > 0;
}

// Obtener planes con información de suscripciones
export async function getPlansWithSubscriptionCount(): Promise<(PlanRow & { subscription_count: number })[]> {
  const [rows] = await pool.query(`
    SELECT 
      p.*,
      COUNT(s.id) as subscription_count
    FROM plans p
    LEFT JOIN subscriptions s ON p.id = s.plan_id AND s.status = 'active'
    WHERE p.is_active = true
    GROUP BY p.id
    ORDER BY p.price ASC
  `);
  
  return rows as (PlanRow & { subscription_count: number })[];
}

