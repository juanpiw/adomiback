import { pool } from '../lib/db';

export type FounderBenefitsRow = {
  id: number;
  user_id: number;
  benefits: string; // JSON string
  discount_percentage: number;
  notes: string | null;
  assigned_by: number;
  assigned_at: Date;
  expires_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

// Crear beneficios de fundador
export async function createFounderBenefits(founderData: {
  user_id: number;
  benefits: string[];
  discount_percentage: number;
  notes?: string;
  assigned_by: number;
  expires_at?: Date;
}): Promise<number> {
  const [result] = await pool.execute(`
    INSERT INTO founder_benefits (
      user_id, benefits, discount_percentage, notes, assigned_by, expires_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, true)
  `, [
    founderData.user_id,
    JSON.stringify(founderData.benefits),
    founderData.discount_percentage,
    founderData.notes || null,
    founderData.assigned_by,
    founderData.expires_at || null
  ]);
  
  return (result as any).insertId;
}

// Obtener beneficios de fundador por usuario
export async function getFounderBenefitsByUserId(userId: number): Promise<FounderBenefitsRow | null> {
  const [rows] = await pool.query(`
    SELECT * FROM founder_benefits 
    WHERE user_id = ? 
    AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId]);
  
  const benefits = rows as FounderBenefitsRow[];
  return benefits.length > 0 ? benefits[0] : null;
}

// Obtener todos los fundadores
export async function getAllFounders(): Promise<FounderBenefitsRow[]> {
  const [rows] = await pool.query(`
    SELECT * FROM founder_benefits
    ORDER BY assigned_at DESC
  `);
  
  return rows as FounderBenefitsRow[];
}

// Obtener fundadores activos
export async function getActiveFounders(): Promise<FounderBenefitsRow[]> {
  const [rows] = await pool.query(`
    SELECT * FROM founder_benefits
    WHERE (expires_at IS NULL OR expires_at > NOW())
    ORDER BY assigned_at DESC
  `);
  
  return rows as FounderBenefitsRow[];
}

// Verificar si un usuario es fundador
export async function isUserFounder(userId: number): Promise<boolean> {
  const [rows] = await pool.query(`
    SELECT COUNT(*) as count FROM founder_benefits 
    WHERE user_id = ? 
    AND (expires_at IS NULL OR expires_at > NOW())
  `, [userId]);
  
  const result = (rows as any[])[0];
  return parseInt(result.count) > 0;
}

// Obtener descuento de fundador
export async function getFounderDiscount(userId: number): Promise<number> {
  const benefits = await getFounderBenefitsByUserId(userId);
  return benefits ? benefits.discount_percentage : 0;
}

// Obtener beneficios de fundador
export async function getFounderBenefitsList(userId: number): Promise<string[]> {
  const benefits = await getFounderBenefitsByUserId(userId);
  if (!benefits) return [];
  
  try {
    return JSON.parse(benefits.benefits);
  } catch (error) {
    console.error('[FOUNDER] Error parsing benefits JSON:', error);
    return [];
  }
}

// Actualizar beneficios de fundador
export async function updateFounderBenefits(
  founderId: number,
  updateData: {
    benefits?: string[];
    discount_percentage?: number;
    notes?: string;
    expires_at?: Date;
    is_active?: boolean;
  }
): Promise<boolean> {
  const fields = [];
  const values = [];
  
  if (updateData.benefits) {
    fields.push('benefits = ?');
    values.push(JSON.stringify(updateData.benefits));
  }
  
  if (updateData.discount_percentage !== undefined) {
    fields.push('discount_percentage = ?');
    values.push(updateData.discount_percentage);
  }
  
  if (updateData.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updateData.notes);
  }
  
  if (updateData.expires_at !== undefined) {
    fields.push('expires_at = ?');
    values.push(updateData.expires_at);
  }
  
  if (updateData.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updateData.is_active);
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = NOW()');
  values.push(founderId);
  
  const [result] = await pool.execute(`
    UPDATE founder_benefits SET ${fields.join(', ')} WHERE id = ?
  `, values);
  
  return (result as any).affectedRows > 0;
}

// Desactivar beneficios de fundador
export async function deactivateFounderBenefits(founderId: number): Promise<boolean> {
  const [result] = await pool.execute(`
    UPDATE founder_benefits 
    SET is_active = false, updated_at = NOW() 
    WHERE id = ?
  `, [founderId]);
  
  return (result as any).affectedRows > 0;
}

// Obtener estadísticas de fundadores
export async function getFounderStats(): Promise<{
  total_founders: number;
  active_founders: number;
  expired_founders: number;
  average_discount: number;
}> {
  const [rows] = await pool.query(`
    SELECT 
      COUNT(*) as total_founders,
      SUM(CASE WHEN is_active = true AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 ELSE 0 END) as active_founders,
      SUM(CASE WHEN is_active = true AND expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 ELSE 0 END) as expired_founders,
      AVG(CASE WHEN is_active = true AND (expires_at IS NULL OR expires_at > NOW()) THEN discount_percentage ELSE NULL END) as average_discount
    FROM founder_benefits
  `);
  
  const result = (rows as any[])[0];
  return {
    total_founders: parseInt(result.total_founders) || 0,
    active_founders: parseInt(result.active_founders) || 0,
    expired_founders: parseInt(result.expired_founders) || 0,
    average_discount: parseFloat(result.average_discount) || 0
  };
}

// Obtener fundadores que expiran pronto
export async function getFoundersExpiringSoon(days: number = 30): Promise<FounderBenefitsRow[]> {
  const [rows] = await pool.query(`
    SELECT * FROM founder_benefits
    WHERE expires_at IS NOT NULL 
    AND expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
    ORDER BY expires_at ASC
  `, [days]);
  
  return rows as FounderBenefitsRow[];
}

// Aplicar descuento de fundador a un precio
export async function applyFounderDiscount(userId: number, originalPrice: number): Promise<{
  original_price: number;
  discount_percentage: number;
  discount_amount: number;
  final_price: number;
  is_founder: boolean;
}> {
  const discountPercentage = await getFounderDiscount(userId);
  const isFounder = discountPercentage > 0;
  
  const discountAmount = isFounder ? (originalPrice * discountPercentage / 100) : 0;
  const finalPrice = originalPrice - discountAmount;
  
  return {
    original_price: originalPrice,
    discount_percentage: discountPercentage,
    discount_amount: discountAmount,
    final_price: finalPrice,
    is_founder: isFounder
  };
}
