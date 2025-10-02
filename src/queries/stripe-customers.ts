import { pool } from '../lib/db';

export type StripeCustomerRow = {
  id: number;
  user_id: number;
  stripe_customer_id: string;
  email: string;
  name: string | null;
  created_at: Date;
};

// Crear un cliente de Stripe
export async function createStripeCustomer(customerData: {
  user_id: number;
  stripe_customer_id: string;
  email: string;
  name?: string;
}): Promise<number> {
  const [result] = await pool.execute(`
    INSERT INTO stripe_customers (user_id, stripe_customer_id, email, name)
    VALUES (?, ?, ?, ?)
  `, [
    customerData.user_id,
    customerData.stripe_customer_id,
    customerData.email,
    customerData.name || null
  ]);
  
  return (result as any).insertId;
}

// Obtener cliente de Stripe por user_id
export async function getStripeCustomerByUserId(userId: number): Promise<StripeCustomerRow | null> {
  const [rows] = await pool.query(`
    SELECT * FROM stripe_customers 
    WHERE user_id = ? 
    LIMIT 1
  `, [userId]);
  
  const customers = rows as StripeCustomerRow[];
  return customers.length > 0 ? customers[0] : null;
}

// Obtener cliente de Stripe por stripe_customer_id
export async function getStripeCustomerByStripeId(stripeCustomerId: string): Promise<StripeCustomerRow | null> {
  const [rows] = await pool.query(`
    SELECT * FROM stripe_customers 
    WHERE stripe_customer_id = ? 
    LIMIT 1
  `, [stripeCustomerId]);
  
  const customers = rows as StripeCustomerRow[];
  return customers.length > 0 ? customers[0] : null;
}

// Actualizar cliente de Stripe
export async function updateStripeCustomer(userId: number, updates: {
  stripe_customer_id?: string;
  email?: string;
  name?: string;
}): Promise<boolean> {
  const fields = [];
  const values = [];
  
  if (updates.stripe_customer_id !== undefined) {
    fields.push('stripe_customer_id = ?');
    values.push(updates.stripe_customer_id);
  }
  
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  
  if (fields.length === 0) return false;
  
  values.push(userId);
  
  const [result] = await pool.execute(`
    UPDATE stripe_customers SET ${fields.join(', ')} WHERE user_id = ?
  `, values);
  
  return (result as any).affectedRows > 0;
}

// Eliminar cliente de Stripe
export async function deleteStripeCustomer(userId: number): Promise<boolean> {
  const [result] = await pool.execute(`
    DELETE FROM stripe_customers WHERE user_id = ?
  `, [userId]);
  
  return (result as any).affectedRows > 0;
}

