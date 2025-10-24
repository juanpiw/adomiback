import { Request, Response, NextFunction } from 'express';
import DatabaseConnection from '../database/connection';
import { Logger } from '../utils/logger.util';

const MODULE = 'CASH_CLOSURE_GATE';

/**
 * Bloquea operaciones de efectivo si el usuario tiene cierres mutuos vencidos (pending_close y closure_due_at < NOW()).
 * Aplica para citas con payment_method='cash'.
 */
export async function cashClosureGate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user || {};
    if (!user?.id) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const pool = DatabaseConnection.getPool();

    // Verificar existencia de columnas para tolerar entornos desfasados
    try {
      const [cols]: any = await pool.query(`SHOW COLUMNS FROM appointments LIKE 'closure_state'`);
      if ((cols as any[]).length === 0) {
        Logger.warn(MODULE, 'closure_state column not found; skipping gate');
        return next();
      }
    } catch (e) {
      Logger.warn(MODULE, 'Error checking columns; skipping gate', e as any);
      return next();
    }

    const [[row]]: any = await pool.query(
      `SELECT COUNT(1) AS cnt
       FROM appointments
       WHERE payment_method = 'cash'
         AND closure_state = 'pending_close'
         AND closure_due_at IS NOT NULL
         AND closure_due_at < NOW()
         AND (provider_id = ? OR client_id = ?)
       LIMIT 1`,
      [user.id, user.id]
    );

    const hasOverdue = Number(row?.cnt || 0) > 0;
    if (hasOverdue) {
      Logger.warn(MODULE, `Blocking cash action for user ${user.id} due to overdue pending_close`);
      return res.status(403).json({ success: false, error: 'cash_block_due_to_overdue_closure' });
    }

    return next();
  } catch (err) {
    Logger.error(MODULE, 'Gate error', err as any);
    return res.status(500).json({ success: false, error: 'gate_error' });
  }
}


