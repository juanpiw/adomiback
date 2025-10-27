/**
 * Subscriptions Module
 * Handles plans and subscriptions for providers
 */

import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import Stripe from 'stripe';
import { JWTUtil } from '../../shared/utils/jwt.util';
import { setupStripeWebhooks } from './webhooks';

/**
 * Setup function to mount subscriptions routes
 * @param app Express application
 * @param webhookOnly Si es true, solo monta el webhook (antes de express.json)
 */
export function setupSubscriptionsModule(app: any, webhookOnly: boolean = false) {
  // Si webhookOnly = true, solo montar el webhook y salir
  if (webhookOnly) {
    setupStripeWebhooks(app);
    console.log('[SUBSCRIPTIONS MODULE] Stripe webhooks configured with raw body (webhook-only mode)');
    return;
  }
  
  // Modo normal: montar todas las rutas (excepto webhook que ya se montó)
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

  // GET /plan-expirations/user/:userId/current - Obtener plan actual del usuario
  router.get('/plan-expirations/user/:userId/current', async (req: Request, res: Response) => {
    try {
      const userId = Number(req.params.userId);
      if (!userId) {
        return res.status(400).json({ ok: false, error: 'ID de usuario requerido' });
      }

      const pool = DatabaseConnection.getPool();
      
      // Obtener información del plan actual del usuario
      const [userRows] = await pool.query(`
        SELECT 
          u.id,
          u.active_plan_id,
          p.name as plan_name,
          s.status as subscription_status,
          s.current_period_end,
          s.updated_at
        FROM users u
        LEFT JOIN plans p ON u.active_plan_id = p.id
        LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
        WHERE u.id = ?
      `, [userId]);

      if ((userRows as any[]).length === 0) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }

      const user = (userRows as any[])[0];
      
      // Si no tiene plan activo, retornar plan básico
      if (!user.active_plan_id) {
        return res.json({
          ok: true,
          currentPlan: {
            id: 1,
            name: 'Plan Básico',
            expires_at: null,
            is_expired: false,
            days_remaining: null
          }
        });
      }

      // Calcular días restantes si hay suscripción activa
      let expiresAt = null;
      let isExpired = false;
      let daysRemaining = null;

      if (user.subscription_status === 'active' && user.current_period_end) {
        expiresAt = user.current_period_end;
        const now = new Date();
        const expirationDate = new Date(user.current_period_end);
        const diffTime = expirationDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        isExpired = diffDays <= 0;
        daysRemaining = diffDays > 0 ? diffDays : 0;
      }

      res.json({
        ok: true,
        currentPlan: {
          id: user.active_plan_id,
          name: user.plan_name || 'Plan Desconocido',
          expires_at: expiresAt,
          is_expired: isExpired,
          days_remaining: daysRemaining
        }
      });

    } catch (error: any) {
      console.error('[PLAN-EXPIRATIONS][GET][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener información del plan' });
    }
  });

  // POST /stripe/create-checkout-session - Crea sesión de checkout de Stripe (modo suscripción)
  router.post('/stripe/create-checkout-session', async (req: Request, res: Response) => {
    try {
      const stripeSecretRaw = process.env.STRIPE_SECRET_KEY || '';
      const stripeSecret = stripeSecretRaw.trim();
      if (!stripeSecret || stripeSecret.startsWith('pk_')) {
        return res.status(500).json({ ok: false, error: 'Stripe no configurado (STRIPE_SECRET_KEY faltante)' });
      }
      
      // ✅ Log para verificar tipo de clave
      console.log('[STRIPE] Usando clave:', stripeSecret.startsWith('sk_live_') ? 'LIVE' : 'TEST');
      
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
        console.log('[SUBS][CHECKOUT] Creating session with priceId=', priceId, 'planId=', plan.id, 'currency=', currency, 'unitAmount=', unitAmount, 'userId=', userId || 'guest');
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
        if (!isMissingPrice) {
          console.error('[SUBS][CHECKOUT] Stripe error creating session with existing price', {
            planId: plan.id,
            stripe_price_id: plan.stripe_price_id,
            statusCode: err?.statusCode,
            type: err?.type || err?.rawType,
            code: err?.code,
            param: err?.param,
            message: err?.message,
            requestId: err?.requestId || err?.raw?.requestId,
            request_log_url: err?.raw?.request_log_url
          });
          // Propagar errores 4xx de Stripe como 400 para evitar 500 engañoso
          if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
            return res.status(400).json({ ok: false, error: err?.message || 'Stripe error', code: err?.code, param: err?.param, requestId: err?.requestId || err?.raw?.requestId, request_log_url: err?.raw?.request_log_url });
          }
          throw err;
        }

        // Crear Price al vuelo y actualizar BD (manejo de colisión de lookup_key)
        const lookupKey = `adomi_plan_${plan.id}_${String(plan.billing_period)}`;
        let priceIdToUse: string | null = null;
        try {
          const price = await stripe.prices.create({
            currency,
            unit_amount: unitAmount,
            recurring: { interval: String(plan.billing_period) === 'year' ? 'year' : 'month' },
            product_data: { name: plan.name, metadata: { planId: String(plan.id) } },
            lookup_key: lookupKey
          });
          priceIdToUse = price.id;
        } catch (createErr: any) {
          const lookupCollision = /already uses that lookup key/i.test(String(createErr?.message || ''));
          if (!lookupCollision) {
            if (createErr?.statusCode && createErr.statusCode >= 400 && createErr.statusCode < 500) {
              console.error('[SUBS][CHECKOUT] Stripe price create error', {
                planId: plan.id,
                lookup_key: lookupKey,
                statusCode: createErr?.statusCode,
                type: createErr?.type || createErr?.rawType,
                code: createErr?.code,
                param: createErr?.param,
                message: createErr?.message,
                requestId: createErr?.requestId || createErr?.raw?.requestId,
                request_log_url: createErr?.raw?.request_log_url
              });
              return res.status(400).json({ ok: false, error: createErr?.message || 'Stripe error', code: createErr?.code, param: createErr?.param, requestId: createErr?.requestId || createErr?.raw?.requestId, request_log_url: createErr?.raw?.request_log_url });
            }
            throw createErr;
          }
          // Buscar Price existente por lookup_key y reutilizarlo
          let existing = null as any;
          try {
            const listActive = await stripe.prices.list({ active: true, limit: 100 });
            existing = listActive.data.find(p => p.lookup_key === lookupKey) || null;
            if (!existing) {
              const listAll = await stripe.prices.list({ active: false, limit: 100 });
              existing = listAll.data.find(p => p.lookup_key === lookupKey) || null;
            }
          } catch {}
          if (!existing) {
            // Si no pudimos listar (límite) o no se encontró, propagamos el error original
            console.error('[SUBS][CHECKOUT] Lookup key collision but price not found via list', { planId: plan.id, lookup_key: lookupKey });
            return res.status(400).json({ ok: false, error: createErr?.message || 'Stripe price lookup_key collision', lookup_key: lookupKey });
          }
          priceIdToUse = existing.id;
        }

        // Persistir price id elegido
        if (priceIdToUse) {
          try {
            await pool.execute('UPDATE plans SET stripe_price_id = ? WHERE id = ?', [priceIdToUse, plan.id]);
          } catch {}
          session = await createSessionWithPrice(priceIdToUse);
        }
      }

      return res.json({ ok: true, sessionId: session.id });
    } catch (error: any) {
      console.error('[STRIPE][CHECKOUT][ERROR]', {
        message: error?.message,
        statusCode: error?.statusCode,
        type: error?.type || error?.rawType,
        code: error?.code,
        param: error?.param,
        requestId: error?.requestId || error?.raw?.requestId,
        request_log_url: error?.raw?.request_log_url
      });
      if (error?.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        return res.status(400).json({ ok: false, error: error?.message || 'Stripe error', code: error?.code, param: error?.param, requestId: error?.requestId || error?.raw?.requestId, request_log_url: error?.raw?.request_log_url });
      }
      return res.status(500).json({ ok: false, error: 'Error al crear sesión de pago', details: error?.message || 'unknown' });
    }
  });

  app.use('/', router);
  console.log('[SUBSCRIPTIONS MODULE] Routes mounted');
}

