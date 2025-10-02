import { pool } from '../lib/db';

export interface PlanExpiration {
  id: number;
  user_id: number;
  subscription_id: number | null;
  plan_id: number;
  expires_at: string;
  status: 'active' | 'expired' | 'cancelled';
  auto_renew: boolean;
  grace_period_days: number;
  downgraded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePlanExpirationData {
  user_id: number;
  subscription_id?: number;
  plan_id: number;
  expires_at: string;
  auto_renew?: boolean;
  grace_period_days?: number;
}

/**
 * Crear una nueva expiración de plan
 */
export async function createPlanExpiration(data: CreatePlanExpirationData): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const [result] = await pool.execute(
      `INSERT INTO plan_expirations 
       (user_id, subscription_id, plan_id, expires_at, auto_renew, grace_period_days) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.user_id,
        data.subscription_id || null,
        data.plan_id,
        data.expires_at,
        data.auto_renew || false,
        data.grace_period_days || 7
      ]
    );

    const insertResult = result as any;
    return { success: true, id: insertResult.insertId };
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][CREATE][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener expiraciones activas de un usuario
 */
export async function getActiveExpirations(userId: number): Promise<PlanExpiration[]> {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM plan_expirations 
       WHERE user_id = ? AND status = 'active' 
       ORDER BY expires_at ASC`,
      [userId]
    );
    return rows as PlanExpiration[];
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][GET_ACTIVE][ERROR]', error);
    return [];
  }
}

/**
 * Obtener expiraciones que están por vencer (próximos 7 días)
 */
export async function getExpiringSoon(days: number = 7): Promise<PlanExpiration[]> {
  try {
    const [rows] = await pool.execute(
      `SELECT pe.*, u.email, u.name, p.name as plan_name 
       FROM plan_expirations pe
       JOIN users u ON pe.user_id = u.id
       JOIN plans p ON pe.plan_id = p.id
       WHERE pe.status = 'active' 
       AND pe.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
       AND pe.expires_at > NOW()
       ORDER BY pe.expires_at ASC`,
      [days]
    );
    return rows as PlanExpiration[];
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][GET_EXPIRING_SOON][ERROR]', error);
    return [];
  }
}

/**
 * Obtener expiraciones que ya vencieron
 */
export async function getExpired(): Promise<PlanExpiration[]> {
  try {
    const [rows] = await pool.execute(
      `SELECT pe.*, u.email, u.name, p.name as plan_name 
       FROM plan_expirations pe
       JOIN users u ON pe.user_id = u.id
       JOIN plans p ON pe.plan_id = p.id
       WHERE pe.status = 'active' 
       AND pe.expires_at < NOW()
       ORDER BY pe.expires_at ASC`,
      []
    );
    return rows as PlanExpiration[];
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][GET_EXPIRED][ERROR]', error);
    return [];
  }
}

/**
 * Marcar expiración como expirada
 */
export async function markAsExpired(expirationId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await pool.execute(
      `UPDATE plan_expirations 
       SET status = 'expired', updated_at = NOW() 
       WHERE id = ?`,
      [expirationId]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][MARK_EXPIRED][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Marcar expiración como degradada
 */
export async function markAsDowngraded(expirationId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await pool.execute(
      `UPDATE plan_expirations 
       SET status = 'expired', downgraded_at = NOW(), updated_at = NOW() 
       WHERE id = ?`,
      [expirationId]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][MARK_DOWNGRADED][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener el plan actual de un usuario (considerando expiraciones)
 */
export async function getUserCurrentPlan(userId: number): Promise<{ plan_id: number; is_expired: boolean; expires_at: string | null } | null> {
  try {
    const [rows] = await pool.execute(
      `SELECT pe.plan_id, pe.expires_at, 
              CASE WHEN pe.expires_at < NOW() THEN true ELSE false END as is_expired
       FROM plan_expirations pe
       WHERE pe.user_id = ? AND pe.status = 'active'
       ORDER BY pe.expires_at DESC
       LIMIT 1`,
      [userId]
    );

    const result = rows as any[];
    if (result.length === 0) {
      // Si no tiene expiración activa, devolver plan básico
      return { plan_id: 1, is_expired: false, expires_at: null };
    }

    return {
      plan_id: result[0].plan_id,
      is_expired: result[0].is_expired,
      expires_at: result[0].expires_at
    };
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][GET_USER_CURRENT_PLAN][ERROR]', error);
    return null;
  }
}

/**
 * Extender expiración de plan
 */
export async function extendPlanExpiration(expirationId: number, newExpiresAt: string): Promise<{ success: boolean; error?: string }> {
  try {
    await pool.execute(
      `UPDATE plan_expirations 
       SET expires_at = ?, updated_at = NOW() 
       WHERE id = ?`,
      [newExpiresAt, expirationId]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][EXTEND][ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener estadísticas de expiraciones
 */
export async function getExpirationStats(): Promise<{
  total_active: number;
  expiring_soon: number;
  expired: number;
  downgraded: number;
}> {
  try {
    const [activeRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM plan_expirations WHERE status = 'active'`
    );
    
    const [expiringRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM plan_expirations 
       WHERE status = 'active' AND expires_at <= DATE_ADD(NOW(), INTERVAL 7 DAY) AND expires_at > NOW()`
    );
    
    const [expiredRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM plan_expirations 
       WHERE status = 'active' AND expires_at < NOW()`
    );
    
    const [downgradedRows] = await pool.execute(
      `SELECT COUNT(*) as count FROM plan_expirations WHERE status = 'expired' AND downgraded_at IS NOT NULL`
    );

    return {
      total_active: (activeRows as any[])[0].count,
      expiring_soon: (expiringRows as any[])[0].count,
      expired: (expiredRows as any[])[0].count,
      downgraded: (downgradedRows as any[])[0].count
    };
  } catch (error: any) {
    console.error('[PLAN_EXPIRATIONS][GET_STATS][ERROR]', error);
    return {
      total_active: 0,
      expiring_soon: 0,
      expired: 0,
      downgraded: 0
    };
  }
}

