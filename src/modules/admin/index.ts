import { Express, Router } from 'express';
import { adminAuth } from '../../shared/middleware/admin-auth';
import { Logger } from '../../shared/utils/logger.util';
import DatabaseConnection from '../../shared/database/connection';

export function setupAdminModule(app: Express) {
  const router = Router();

  router.get('/health', adminAuth, (req, res) => {
    res.json({ success: true, message: 'admin ok', ts: new Date().toISOString() });
  });

  // Placeholder endpoint to validate protection
  router.get('/whoami', adminAuth, (req: any, res) => {
    res.json({ success: true, user: req.user });
  });

  router.get('/payments', adminAuth, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT p.id,
                p.appointment_id,
                p.client_id,
                uc.email AS client_email,
                c.name AS client_name,
                p.provider_id,
                up.email AS provider_email,
                pr.name AS provider_name,
                p.amount, p.commission_amount, p.provider_amount,
                p.currency, p.payment_method, p.status, p.paid_at,
                p.stripe_payment_intent_id
         FROM payments p
         LEFT JOIN users uc ON uc.id = p.client_id
         LEFT JOIN users up ON up.id = p.provider_id
         LEFT JOIN client_profiles c ON c.client_id = p.client_id
         LEFT JOIN provider_profiles pr ON pr.provider_id = p.provider_id
         ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      res.json({ success: true, data: rows, pagination: { limit, offset } });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error fetching payments', e);
      res.status(500).json({ success: false, error: 'query_error' });
    }
  });

  app.use('/admin', router);
  Logger.info('ADMIN_MODULE', 'Admin module mounted on /admin');
}

/**
 * Admin Module
 * Handles admin panel functionality, verifications, and platform settings
 */

// TODO: Import and export routes when implemented

/**
 * Setup function to mount admin routes
 * @param app Express application
 */
export function setupAdminModule(app: any) {
  // TODO: Implement when routes are ready
  console.log('[ADMIN MODULE] Module structure ready - awaiting implementation');
}

