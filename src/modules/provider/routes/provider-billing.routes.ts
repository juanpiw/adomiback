import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';

const MODULE = 'PROVIDER_BILLING';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

const router = Router();

// POST /providers/:id/billing/setup-intent
router.post('/providers/:id/billing/setup-intent', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || providerId !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado' });
    const stripe = getStripe();
    if (!stripe) return res.status(500).json({ success: false, error: 'Stripe no configurado' });

    const pool = DatabaseConnection.getPool();
    // Asegurar billing profile y stripe_customer_id
    let customerId: string | null = null;
    try {
      const [[bp]]: any = await pool.query('SELECT stripe_customer_id FROM provider_billing_profiles WHERE provider_id = ? LIMIT 1', [providerId]);
      customerId = (bp && bp.stripe_customer_id) ? String(bp.stripe_customer_id) : null;
    } catch {}
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { provider_id: String(providerId) }
      });
      customerId = customer.id;
      try {
        await pool.execute(
          `INSERT INTO provider_billing_profiles (provider_id, stripe_customer_id, status)
           VALUES (?, ?, 'setup_required')
           ON DUPLICATE KEY UPDATE stripe_customer_id = VALUES(stripe_customer_id), updated_at = CURRENT_TIMESTAMP`,
          [providerId, customerId]
        );
      } catch (e) {
        Logger.warn(MODULE, 'provider_billing_profiles missing; created customer without persisting');
      }
    }

    const setup = await stripe.setupIntents.create({
      customer: customerId || undefined,
      payment_method_types: ['card'],
      usage: 'off_session'
    });
    return res.json({ success: true, client_secret: setup.client_secret, customer_id: customerId });
  } catch (err: any) {
    Logger.error(MODULE, 'setup-intent error', err);
    return res.status(500).json({ success: false, error: 'Error creando setup intent' });
  }
});

// GET /providers/:id/debts
router.get('/providers/:id/debts', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || providerId !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado' });
    const pool = DatabaseConnection.getPool();
    const [rows] = await pool.query(
      `SELECT d.id, d.commission_amount, d.settled_amount, d.currency, d.status, d.due_date, d.last_attempt_at, d.attempt_count,
              a.id AS appointment_id, a.date, a.start_time
       FROM provider_commission_debts d
       LEFT JOIN appointments a ON a.id = d.appointment_id
       WHERE d.provider_id = ?
       ORDER BY d.status DESC, d.due_date ASC, d.id DESC`,
      [providerId]
    );
    return res.json({ success: true, debts: rows });
  } catch (err: any) {
    Logger.error(MODULE, 'list debts error', err);
    return res.status(500).json({ success: false, error: 'Error listando deudas' });
  }
});

export default router;








