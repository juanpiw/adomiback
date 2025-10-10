import { pool } from '../lib/db';

export type PaymentMethodRow = {
  id: number;
  user_id: number;
  stripe_payment_method_id: string;
  type: string;
  card_brand: string;
  card_last4: string;
  card_exp_month: number;
  card_exp_year: number;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
};

export type InvoiceRow = {
  id: number;
  user_id: number;
  subscription_id: number | null;
  stripe_invoice_id: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

// Crear método de pago
export async function createPaymentMethod(paymentMethodData: {
  user_id: number;
  stripe_payment_method_id: string;
  type: string;
  card_brand: string;
  card_last4: string;
  card_exp_month: number;
  card_exp_year: number;
  is_default?: boolean;
}): Promise<number> {
  // Si es el método por defecto, desactivar otros métodos del usuario
  if (paymentMethodData.is_default) {
    await pool.execute(
      'UPDATE payment_methods SET is_default = false WHERE user_id = ?',
      [paymentMethodData.user_id]
    );
  }
  
  const [result] = await pool.execute(`
    INSERT INTO payment_methods (
      user_id, stripe_payment_method_id, type, card_brand, 
      card_last4, card_exp_month, card_exp_year, is_default
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    paymentMethodData.user_id,
    paymentMethodData.stripe_payment_method_id,
    paymentMethodData.type,
    paymentMethodData.card_brand,
    paymentMethodData.card_last4,
    paymentMethodData.card_exp_month,
    paymentMethodData.card_exp_year,
    paymentMethodData.is_default || false
  ]);
  
  return (result as any).insertId;
}

// Obtener métodos de pago de un usuario
export async function getUserPaymentMethods(userId: number): Promise<PaymentMethodRow[]> {
  const [rows] = await pool.query(
    'SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
    [userId]
  );
  return rows as PaymentMethodRow[];
}

// Obtener método de pago por defecto
export async function getDefaultPaymentMethod(userId: number): Promise<PaymentMethodRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM payment_methods WHERE user_id = ? AND is_default = true LIMIT 1',
    [userId]
  );
  const methods = rows as PaymentMethodRow[];
  return methods.length > 0 ? methods[0] : null;
}

// Establecer método de pago por defecto
export async function setDefaultPaymentMethod(userId: number, paymentMethodId: number): Promise<boolean> {
  // Desactivar todos los métodos del usuario
  await pool.execute(
    'UPDATE payment_methods SET is_default = false WHERE user_id = ?',
    [userId]
  );
  
  // Activar el método seleccionado
  const [result] = await pool.execute(
    'UPDATE payment_methods SET is_default = true WHERE id = ? AND user_id = ?',
    [paymentMethodId, userId]
  );
  
  return (result as any).affectedRows > 0;
}

// Eliminar método de pago
export async function deletePaymentMethod(paymentMethodId: number, userId: number): Promise<boolean> {
  const [result] = await pool.execute(
    'DELETE FROM payment_methods WHERE id = ? AND user_id = ?',
    [paymentMethodId, userId]
  );
  
  return (result as any).affectedRows > 0;
}

// Crear factura
export async function createInvoice(invoiceData: {
  user_id: number;
  subscription_id?: number;
  stripe_invoice_id: string;
  amount: number;
  currency: string;
  status: string;
  paid_at?: Date;
}): Promise<number> {
  const [result] = await pool.execute(`
    INSERT INTO invoices (
      user_id, subscription_id, stripe_invoice_id, amount, currency, status, paid_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    invoiceData.user_id,
    invoiceData.subscription_id || null,
    invoiceData.stripe_invoice_id,
    invoiceData.amount,
    invoiceData.currency,
    invoiceData.status,
    invoiceData.paid_at || null
  ]);
  
  return (result as any).insertId;
}

// Obtener facturas de un usuario
export async function getUserInvoices(userId: number): Promise<InvoiceRow[]> {
  const [rows] = await pool.query(`
    SELECT i.*, s.stripe_subscription_id, p.name as plan_name
    FROM invoices i
    LEFT JOIN subscriptions s ON i.subscription_id = s.id
    LEFT JOIN plans p ON s.plan_id = p.id
    WHERE i.user_id = ?
    ORDER BY i.created_at DESC
  `, [userId]);
  
  return rows as InvoiceRow[];
}

// Obtener factura por Stripe ID
export async function getInvoiceByStripeId(stripeInvoiceId: string): Promise<InvoiceRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM invoices WHERE stripe_invoice_id = ?',
    [stripeInvoiceId]
  );
  const invoices = rows as InvoiceRow[];
  return invoices.length > 0 ? invoices[0] : null;
}

// Actualizar estado de factura
export async function updateInvoiceStatus(
  stripeInvoiceId: string,
  status: string,
  paidAt?: Date
): Promise<boolean> {
  const fields = ['status = ?', 'updated_at = NOW()'];
  const values = [status];
  
  if (paidAt) {
    fields.push('paid_at = ?');
    values.push(paidAt.toISOString());
  }
  
  values.push(stripeInvoiceId);
  
  const [result] = await pool.execute(`
    UPDATE invoices SET ${fields.join(', ')} WHERE stripe_invoice_id = ?
  `, values);
  
  return (result as any).affectedRows > 0;
}

// Obtener estadísticas de pagos
export async function getPaymentStats(userId?: number): Promise<{
  total_invoices: number;
  paid_invoices: number;
  pending_invoices: number;
  total_amount: number;
  paid_amount: number;
}> {
  let query = `
    SELECT 
      COUNT(*) as total_invoices,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_invoices,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as pending_invoices,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount
    FROM invoices
  `;
  
  const params: any[] = [];
  if (userId) {
    query += ' WHERE user_id = ?';
    params.push(userId);
  }
  
  const [rows] = await pool.query(query, params);
  const result = (rows as any[])[0];
  
  return {
    total_invoices: parseInt(result.total_invoices) || 0,
    paid_invoices: parseInt(result.paid_invoices) || 0,
    pending_invoices: parseInt(result.pending_invoices) || 0,
    total_amount: parseFloat(result.total_amount) || 0,
    paid_amount: parseFloat(result.paid_amount) || 0
  };
}
