import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'CLIENT_PAYMENT_METHODS';

export function buildClientPaymentMethodsRoutes(): Router {
  const router = Router();

  // GET /client/payment-methods
  router.get('/client/payment-methods', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT id, stripe_payment_method_id, card_brand, card_last4, card_exp_month AS exp_month, card_exp_year AS exp_year, is_default
         FROM payment_methods
         WHERE client_id = ? AND is_active = TRUE
         ORDER BY is_default DESC, id DESC`,
        [clientId]
      );
      // Guardar preferencia si la columna existe; si no, devolver null
      let preference: string | null = null;
      try {
        const [colRows]: any = await pool.query(`SHOW COLUMNS FROM client_profiles LIKE 'payment_method_pref'`);
        const hasCol = (colRows as any[]).length > 0;
        if (hasCol) {
          const [[prefRow]]: any = await pool.query(
            `SELECT payment_method_pref FROM client_profiles WHERE client_id = ? LIMIT 1`,
            [clientId]
          );
          preference = prefRow?.payment_method_pref || null;
        }
      } catch {}
      return res.json({ success: true, data: { cards: rows, preference } });
    } catch (err) {
      Logger.error(MODULE, 'Error listing client payment methods', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar métodos de pago' });
    }
  });

  // POST /client/payment-methods/set-primary { id?: number }
  router.post('/client/payment-methods/set-primary', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const { id } = req.body || {};

      const pool = DatabaseConnection.getPool();
      if (id && Number(id) > 0) {
        // Marcar todas en false y la elegida en true
        await pool.execute(`UPDATE payment_methods SET is_default = FALSE WHERE client_id = ?`, [clientId]);
        const [upd]: any = await pool.execute(`UPDATE payment_methods SET is_default = TRUE WHERE id = ? AND client_id = ?`, [id, clientId]);
        if (upd.affectedRows === 0) return res.status(404).json({ success: false, error: 'card_not_found' });
        // Preferencia global: card
        try {
          const [colRows]: any = await pool.query(`SHOW COLUMNS FROM client_profiles LIKE 'payment_method_pref'`);
          const hasCol = (colRows as any[]).length > 0;
          if (!hasCol) {
            await pool.query(`ALTER TABLE client_profiles ADD COLUMN payment_method_pref ENUM('card','cash') NULL AFTER preferred_language`);
          }
          await pool.execute(`UPDATE client_profiles SET payment_method_pref = 'card', updated_at = CURRENT_TIMESTAMP WHERE client_id = ?`, [clientId]);
        } catch {}
        return res.json({ success: true });
      } else {
        // Sin id => preferir efectivo
        try {
          const [colRows]: any = await pool.query(`SHOW COLUMNS FROM client_profiles LIKE 'payment_method_pref'`);
          const hasCol = (colRows as any[]).length > 0;
          if (!hasCol) {
            await pool.query(`ALTER TABLE client_profiles ADD COLUMN payment_method_pref ENUM('card','cash') NULL AFTER preferred_language`);
          }
          await pool.execute(
            `UPDATE client_profiles SET payment_method_pref = 'cash', updated_at = CURRENT_TIMESTAMP WHERE client_id = ?`,
            [clientId]
          );
        } catch {}
        return res.json({ success: true });
      }
    } catch (err) {
      Logger.error(MODULE, 'Error setting primary payment method', err as any);
      return res.status(500).json({ success: false, error: 'Error al guardar preferencia de pago' });
    }
  });

  // DELETE /client/payment-methods/:id
  router.delete('/client/payment-methods/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, error: 'id requerido' });

      const pool = DatabaseConnection.getPool();
      const [upd]: any = await pool.execute(
        `UPDATE payment_methods SET is_active = FALSE, is_default = FALSE WHERE id = ? AND client_id = ?`,
        [id, clientId]
      );
      if (upd.affectedRows === 0) return res.status(404).json({ success: false, error: 'card_not_found' });
      return res.json({ success: true });
    } catch (err) {
      Logger.error(MODULE, 'Error deleting payment method', err as any);
      return res.status(500).json({ success: false, error: 'Error al eliminar método de pago' });
    }
  });

  return router;
}


