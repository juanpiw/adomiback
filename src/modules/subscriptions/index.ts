/**
 * Subscriptions Module
 * Handles plans and subscriptions for providers
 */

import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import Stripe from 'stripe';
import { JWTUtil } from '../../shared/utils/jwt.util';

/**
 * Setup function to mount subscriptions routes
 * @param app Express application
 */
export function setupSubscriptionsModule(app: any) {
  const router = Router();

  // GET /plans - planes activos con shape esperado por el front
  router.get('/plans', async (_req: Request, res: Response) => {
    try {
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(`
        SELECT 
          id,
          name,
          stripe_price_id,
          price,
          currency,
          billing_period AS \`interval\`,
          COALESCE(description, '') AS description,
          COALESCE(features, '[]') AS features,
          0 AS max_services,
          0 AS max_bookings
        FROM plans
        WHERE is_active = TRUE
        ORDER BY price ASC
      `);

      const plans = (rows as any[]).map(r => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        currency: r.currency || 'CLP',
        interval: (String(r.interval).toLowerCase() === 'monthly' ? 'month' : String(r.interval).toLowerCase() === 'yearly' ? 'year' : String(r.interval)) as 'month' | 'year',
        description: r.description || '',
        features: (() => { try { const f = JSON.parse(r.features); return Array.isArray(f) ? f : []; } catch { return []; } })(),
        max_services: Number(r.max_services) || 0,
        max_bookings: Number(r.max_bookings) || 0,
        stripe_price_id: r.stripe_price_id
      }));

      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[PLANS][GET][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener planes' });
    }
  });

  // POST /stripe/create-checkout-session - Crea sesión de checkout de Stripe (modo suscripción)
  router.post('/stripe/create-checkout-session', async (req: Request, res: Response) => {
    try {
      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) {
        return res.status(500).json({ ok: false, error: 'Stripe no configurado (STRIPE_SECRET_KEY faltante)' });
      }
      const stripe = new Stripe(stripeSecret);

      const { planId } = (req.body || {}) as { planId?: number };
      if (!planId) {
        return res.status(400).json({ ok: false, error: 'planId es requerido' });
      }

      // Obtener plan y price id
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        'SELECT id, name, stripe_price_id, price, currency, billing_period FROM plans WHERE id = ? AND is_active = TRUE LIMIT 1',
        [planId]
      );
      const plan = (rows as any[])[0];
      if (!plan || !plan.stripe_price_id) {
        return res.status(404).json({ ok: false, error: 'Plan no encontrado o sin price configurado' });
      }

      // Intentar obtener usuario autenticado (opcional)
      let userId: number | undefined;
      let userEmail: string | undefined;
      try {
        const auth = String(req.headers['authorization'] || '');
        const token = JWTUtil.extractTokenFromHeader(auth);
        if (token) {
          const payload = JWTUtil.verifyAccessToken(token);
          if (payload) {
            userId = payload.userId;
            userEmail = payload.email;
          }
        }
      } catch {}

      const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://adomiapp.com';

      async function createSessionWithPrice(priceId: string) {
        return await stripe.checkout.sessions.create({
          mode: 'subscription',
          line_items: [
            {
              price: priceId,
              quantity: 1
            }
          ],
          success_url: `${FRONTEND_BASE_URL}/auth/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${FRONTEND_BASE_URL}/auth/payment-error`,
          allow_promotion_codes: true,
          customer_email: userEmail,
          client_reference_id: userId ? String(userId) : undefined,
          metadata: {
            planId: String(plan.id),
            userId: userId ? String(userId) : 'guest'
          }
        });
      }

      // helper para montos de moneda sin decimales (CLP, JPY, etc.)
      const ZERO_DECIMAL = new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf']);
      const currency = String(plan.currency || 'CLP').toLowerCase();
      const unitAmount = ZERO_DECIMAL.has(currency) ? Math.round(Number(plan.price)) : Math.round(Number(plan.price) * 100);

      let session;
      try {
        session = await createSessionWithPrice(plan.stripe_price_id);
      } catch (err: any) {
        const isMissingPrice = err?.code === 'resource_missing' || /No such price/i.test(String(err?.message || ''));
        if (!isMissingPrice) throw err;

        // Crear Price al vuelo y actualizar BD
        const lookupKey = `adomi_plan_${plan.id}_${String(plan.billing_period)}`;
        const price = await stripe.prices.create({
          currency,
          unit_amount: unitAmount,
          recurring: { interval: String(plan.billing_period) === 'year' ? 'year' : 'month' },
          product_data: { name: plan.name, metadata: { planId: String(plan.id) } },
          lookup_key: lookupKey
        });

        // Persistir nuevo price id
        try {
          await pool.execute('UPDATE plans SET stripe_price_id = ? WHERE id = ?', [price.id, plan.id]);
        } catch {}

        session = await createSessionWithPrice(price.id);
      }

      return res.json({ ok: true, sessionId: session.id });
    } catch (error: any) {
      console.error('[STRIPE][CHECKOUT][ERROR]', error);
      return res.status(500).json({ ok: false, error: 'Error al crear sesión de pago', details: error.message });
    }
  });

  app.use('/', router);
  console.log('[SUBSCRIPTIONS MODULE] Routes mounted');
}

