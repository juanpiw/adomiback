import { pool } from '../lib/db';

export type RevenueTrackingRow = {
  id: number;
  user_id: number;
  subscription_id: number | null;
  invoice_id: number | null;
  transaction_type: 'subscription' | 'one_time' | 'refund' | 'chargeback';
  gross_amount: number;
  stripe_fee: number;
  platform_fee: number;
  net_amount: number;
  currency: string;
  stripe_transaction_id: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  processed_at: Date | null;
  created_at: Date;
};

export type PlatformSettingsRow = {
  id: number;
  setting_key: string;
  setting_value: string;
  description: string | null;
  updated_by: number | null;
  updated_at: Date;
};

// Crear registro de ingresos
export async function createRevenueRecord(
  userId: number,
  transactionType: string,
  grossAmount: number,
  stripeTransactionId?: string,
  subscriptionId?: number,
  invoiceId?: number
): Promise<number> {
  // Obtener configuración de comisiones
  const settings = await getPlatformSettings();
  const stripeFeePercentage = parseFloat(settings.stripe_fee_percentage || '2.9');
  const stripeFeeFixed = parseFloat(settings.stripe_fee_fixed || '0.30');
  const platformFeePercentage = parseFloat(settings.platform_fee_percentage || '10.0');
  
  // Calcular comisiones
  const stripeFee = (grossAmount * stripeFeePercentage / 100) + stripeFeeFixed;
  const platformFee = grossAmount * platformFeePercentage / 100;
  const netAmount = grossAmount - stripeFee - platformFee;
  
  const [result] = await pool.execute(`
    INSERT INTO revenue_tracking 
    (user_id, subscription_id, invoice_id, transaction_type, gross_amount, stripe_fee, platform_fee, net_amount, stripe_transaction_id, status, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW())
  `, [userId, subscriptionId, invoiceId, transactionType, grossAmount, stripeFee, platformFee, netAmount, stripeTransactionId]);
  
  return (result as any).insertId;
}

// Obtener configuración de la plataforma
export async function getPlatformSettings(): Promise<Record<string, string>> {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM platform_settings');
  const settings: Record<string, string> = {};
  
  (rows as any[]).forEach((row: any) => {
    settings[row.setting_key] = row.setting_value;
  });
  
  return settings;
}

// Actualizar configuración de la plataforma
export async function updatePlatformSetting(
  key: string,
  value: string,
  description?: string,
  updatedBy?: number
): Promise<boolean> {
  const [result] = await pool.execute(`
    INSERT INTO platform_settings (setting_key, setting_value, description, updated_by)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
    setting_value = VALUES(setting_value),
    description = VALUES(description),
    updated_by = VALUES(updated_by),
    updated_at = NOW()
  `, [key, value, description || null, updatedBy || null]);
  
  return (result as any).affectedRows > 0;
}

// Obtener resumen de ingresos
export async function getRevenueSummary(startDate?: Date, endDate?: Date): Promise<{
  totalGross: number;
  totalStripeFees: number;
  totalPlatformFees: number;
  totalNet: number;
  transactionCount: number;
}> {
  let query = `
    SELECT 
      SUM(gross_amount) as total_gross,
      SUM(stripe_fee) as total_stripe_fees,
      SUM(platform_fee) as total_platform_fees,
      SUM(net_amount) as total_net,
      COUNT(*) as transaction_count
    FROM revenue_tracking 
    WHERE status = 'completed'
  `;
  
  const params: any[] = [];
  
  if (startDate && endDate) {
    query += ' AND created_at BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }
  
  const [rows] = await pool.query(query, params);
  const result = (rows as any[])[0];
  
  return {
    totalGross: parseFloat(result.total_gross) || 0,
    totalStripeFees: parseFloat(result.total_stripe_fees) || 0,
    totalPlatformFees: parseFloat(result.total_platform_fees) || 0,
    totalNet: parseFloat(result.total_net) || 0,
    transactionCount: parseInt(result.transaction_count) || 0
  };
}

// Obtener ingresos por usuario
export async function getUserRevenue(userId: number): Promise<RevenueTrackingRow[]> {
  const [rows] = await pool.query(
    'SELECT * FROM revenue_tracking WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows as RevenueTrackingRow[];
}

// Obtener ingresos por período
export async function getRevenueByPeriod(
  startDate: Date, 
  endDate: Date
): Promise<RevenueTrackingRow[]> {
  const [rows] = await pool.query(
    'SELECT * FROM revenue_tracking WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC',
    [startDate, endDate]
  );
  return rows as RevenueTrackingRow[];
}

// Obtener ingresos por tipo de transacción
export async function getRevenueByTransactionType(
  transactionType: string,
  startDate?: Date,
  endDate?: Date
): Promise<RevenueTrackingRow[]> {
  let query = 'SELECT * FROM revenue_tracking WHERE transaction_type = ?';
  const params: any[] = [transactionType];
  
  if (startDate && endDate) {
    query += ' AND created_at BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const [rows] = await pool.query(query, params);
  return rows as RevenueTrackingRow[];
}

// Obtener estadísticas de ingresos por mes
export async function getMonthlyRevenueStats(months: number = 12): Promise<{
  month: string;
  total_gross: number;
  total_stripe_fees: number;
  total_platform_fees: number;
  total_net: number;
  transaction_count: number;
}[]> {
  const [rows] = await pool.query(`
    SELECT 
      DATE_FORMAT(created_at, '%Y-%m') as month,
      SUM(gross_amount) as total_gross,
      SUM(stripe_fee) as total_stripe_fees,
      SUM(platform_fee) as total_platform_fees,
      SUM(net_amount) as total_net,
      COUNT(*) as transaction_count
    FROM revenue_tracking 
    WHERE status = 'completed' 
    AND created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY month DESC
  `, [months]);
  
  return rows as any[];
}

// Obtener top usuarios por ingresos
export async function getTopUsersByRevenue(limit: number = 10): Promise<{
  user_id: number;
  total_gross: number;
  total_net: number;
  transaction_count: number;
}[]> {
  const [rows] = await pool.query(`
    SELECT 
      user_id,
      SUM(gross_amount) as total_gross,
      SUM(net_amount) as total_net,
      COUNT(*) as transaction_count
    FROM revenue_tracking 
    WHERE status = 'completed'
    GROUP BY user_id
    ORDER BY total_gross DESC
    LIMIT ?
  `, [limit]);
  
  return rows as any[];
}

// Obtener métricas de rentabilidad
export async function getProfitabilityMetrics(): Promise<{
  gross_revenue: number;
  stripe_fees: number;
  platform_fees: number;
  net_revenue: number;
  profit_margin: number;
  average_transaction_value: number;
}> {
  const [rows] = await pool.query(`
    SELECT 
      SUM(gross_amount) as gross_revenue,
      SUM(stripe_fee) as stripe_fees,
      SUM(platform_fee) as platform_fees,
      SUM(net_amount) as net_revenue,
      AVG(gross_amount) as average_transaction_value
    FROM revenue_tracking 
    WHERE status = 'completed'
  `);
  
  const result = (rows as any[])[0];
  const grossRevenue = parseFloat(result.gross_revenue) || 0;
  const netRevenue = parseFloat(result.net_revenue) || 0;
  const profitMargin = grossRevenue > 0 ? (netRevenue / grossRevenue) * 100 : 0;
  
  return {
    gross_revenue: grossRevenue,
    stripe_fees: parseFloat(result.stripe_fees) || 0,
    platform_fees: parseFloat(result.platform_fees) || 0,
    net_revenue: netRevenue,
    profit_margin: profitMargin,
    average_transaction_value: parseFloat(result.average_transaction_value) || 0
  };
}

