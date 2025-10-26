import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';

const MODULE = 'PROVIDER_STRIPE_CONNECT';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const CONNECT_ENABLED = String(process.env.STRIPE_CONNECT_ENABLED || '').toLowerCase() === 'true';
const ONBOARD_RETURN_URL = process.env.STRIPE_CONNECT_ONBOARD_RETURN_URL || (process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:4200');
const ONBOARD_REFRESH_URL = process.env.STRIPE_CONNECT_ONBOARD_REFRESH_URL || ONBOARD_RETURN_URL;

function ensureStripe(): Stripe | null {
  if (!STRIPE_SECRET) return null;
  return new Stripe(STRIPE_SECRET);
}

// Helper: get provider row incl. stripe fields if exist
async function getUserStripeFields(userId: number): Promise<{ stripe_account_id?: string | null; stripe_payouts_enabled?: number | boolean | null }>{
  const pool = DatabaseConnection.getPool();
  try {
    const [rows] = await pool.query('SELECT stripe_account_id, stripe_payouts_enabled FROM users WHERE id = ? LIMIT 1', [userId]);
    const r: any = (rows as any[])[0] || {};
    return { stripe_account_id: r?.stripe_account_id || null, stripe_payouts_enabled: r?.stripe_payouts_enabled ?? null };
  } catch (e) {
    Logger.warn(MODULE, 'users table missing stripe columns? proceeding without them');
    return {};
  }
}

async function setUserStripeAccount(userId: number, acctId: string): Promise<void> {
  const pool = DatabaseConnection.getPool();
  try {
    await pool.execute('UPDATE users SET stripe_account_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [acctId, userId]);
  } catch (e) {
    Logger.warn(MODULE, 'Could not persist stripe_account_id to users (missing column?)');
  }
}

// Optional: log onboarding link creation
async function logOnboarding(providerId: number, acctId: string, url: string, expiresAt: Date | null): Promise<void> {
  const pool = DatabaseConnection.getPool();
  try {
    await pool.execute(
      `INSERT INTO provider_connect_onboarding (provider_id, stripe_account_id, account_link_url, account_link_expires_at, status)
       VALUES (?, ?, ?, ?, 'created')`,
      [providerId, acctId, url, expiresAt ? new Date(expiresAt) : null]
    );
  } catch (e) {
    Logger.warn(MODULE, 'provider_connect_onboarding missing; skipping log');
  }
}

const router = Router();

// POST /providers/:id/stripe/connect/create
router.post('/providers/:id/stripe/connect/create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || providerId !== Number(user.id)) {
      return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    if (!CONNECT_ENABLED) return res.status(400).json({ success: false, error: 'Stripe Connect deshabilitado' });
    const stripe = ensureStripe();
    if (!stripe) return res.status(500).json({ success: false, error: 'Stripe no configurado' });

    // Idempotencia: si ya tiene acct, retornamos estado actual
    const current = await getUserStripeFields(providerId);
    let accountId = current.stripe_account_id || '';
    if (!accountId) {
      const acct = await stripe.accounts.create({ type: 'express' });
      accountId = acct.id;
      await setUserStripeAccount(providerId, accountId);
    }

    // Crear account link para onboarding
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: ONBOARD_REFRESH_URL,
      return_url: ONBOARD_RETURN_URL,
      type: 'account_onboarding'
    });
    await logOnboarding(providerId, accountId, link.url, link.expires_at ? new Date(link.expires_at * 1000) : null);
    return res.json({ success: true, account_id: accountId, onboarding_url: link.url, expires_at: link.expires_at || null });
  } catch (err: any) {
    Logger.error(MODULE, 'create connect account error', err);
    return res.status(500).json({ success: false, error: 'Error creando cuenta conectada' });
  }
});

// POST /providers/:id/stripe/connect/onboarding-link
router.post('/providers/:id/stripe/connect/onboarding-link', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || providerId !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado' });
    if (!CONNECT_ENABLED) return res.status(400).json({ success: false, error: 'Stripe Connect deshabilitado' });
    const stripe = ensureStripe();
    if (!stripe) return res.status(500).json({ success: false, error: 'Stripe no configurado' });

    const { stripe_account_id } = await getUserStripeFields(providerId);
    if (!stripe_account_id) return res.status(400).json({ success: false, error: 'Cuenta conectada no creada' });

    const link = await stripe.accountLinks.create({
      account: stripe_account_id,
      refresh_url: ONBOARD_REFRESH_URL,
      return_url: ONBOARD_RETURN_URL,
      type: 'account_onboarding'
    });
    await logOnboarding(providerId, stripe_account_id, link.url, link.expires_at ? new Date(link.expires_at * 1000) : null);
    return res.json({ success: true, onboarding_url: link.url, expires_at: link.expires_at || null });
  } catch (err: any) {
    Logger.error(MODULE, 'onboarding link error', err);
    return res.status(500).json({ success: false, error: 'Error generando onboarding link' });
  }
});

// GET /providers/:id/stripe/connect/dashboard
router.get('/providers/:id/stripe/connect/dashboard', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || providerId !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado' });
    if (!CONNECT_ENABLED) return res.status(400).json({ success: false, error: 'Stripe Connect deshabilitado' });
    const stripe = ensureStripe();
    if (!stripe) return res.status(500).json({ success: false, error: 'Stripe no configurado' });

    const { stripe_account_id } = await getUserStripeFields(providerId);
    if (!stripe_account_id) return res.status(400).json({ success: false, error: 'Cuenta conectada no creada' });

    const login = await stripe.accounts.createLoginLink(stripe_account_id);
    return res.json({ success: true, url: login.url });
  } catch (err: any) {
    Logger.error(MODULE, 'dashboard link error', err);
    return res.status(500).json({ success: false, error: 'Error generando dashboard link' });
  }
});

export default router;


