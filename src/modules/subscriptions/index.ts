/**
 * Subscriptions Module
 * Handles plans and subscriptions for providers
 */

import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import Stripe from 'stripe';
import crypto from 'crypto';
import { JWTUtil } from '../../shared/utils/jwt.util';
import { setupStripeWebhooks } from './webhooks';
import { logFunnelEvent, isValidFunnelEvent } from '../../shared/utils/subscription.util';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import { EmailService } from '../../shared/services/email.service';
import { Logger } from '../../shared/utils/logger.util';

const MODULE = 'SUBSCRIPTIONS_ADMIN';
const FOUNDER_ADMIN_EMAIL = 'juanpablojpw@gmail.com';

function parseJsonSafe<T>(value: any, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed !== undefined ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeInterval(interval: string): 'month' | 'year' {
  const normalized = String(interval || '').toLowerCase();
  if (normalized === 'monthly' || normalized === 'month') return 'month';
  if (normalized === 'yearly' || normalized === 'year') return 'year';
  return 'month';
}

async function fetchPromoRow(connection: any, code: string) {
  const [rows] = await connection.query(`
    SELECT 
      pc.id as promo_id,
      pc.code,
      pc.description as promo_description,
      pc.plan_type as promo_plan_type,
      pc.max_redemptions,
      pc.current_redemptions,
      pc.discount_percentage,
      pc.duration_months as promo_duration_months,
      pc.grant_commission_override,
      pc.applies_to_existing,
      pc.valid_from,
      pc.expires_at,
      pc.allowed_roles,
      pc.metadata as promo_metadata,
      pc.is_active,
      p.id as plan_id,
      p.name,
      p.price,
      p.currency,
      p.billing_period,
      p.description,
      p.features,
      p.max_services,
      p.max_bookings,
      p.commission_rate,
      p.plan_type,
      p.duration_months as plan_duration_months,
      p.benefits,
      p.metadata as plan_metadata
    FROM promo_codes pc
    INNER JOIN plans p ON p.id = pc.plan_id
    WHERE UPPER(pc.code) = ?
    LIMIT 1
  `, [code]);
  return (rows as any[])[0] || null;
}

const PROMO_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sanitizePromoCodeInput(raw?: string): string | null {
  if (!raw) return null;
  const cleaned = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  return cleaned.length ? cleaned : null;
}

function validateEmailAddress(email?: string | null): boolean {
  if (!email) return false;
  const value = String(email).trim().toLowerCase();
  if (!value) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(value);
}

function toMySqlDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function generateUniqueFounderCode(connection: any, prefix = 'FDR', length = 6): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = prefix;
    for (let i = 0; i < length; i++) {
      const index = crypto.randomInt(0, PROMO_CODE_ALPHABET.length);
      code += PROMO_CODE_ALPHABET[index];
    }
    const [rows] = await connection.query('SELECT id FROM promo_codes WHERE code = ? LIMIT 1', [code]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return code;
    }
  }
  throw new Error('No fue posible generar un código único tras múltiples intentos');
}

async function findFounderPlan(connection: any) {
  const [rows] = await connection.query(
    `SELECT id, name, duration_months, commission_rate, metadata
       FROM plans
      WHERE plan_type = 'founder'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`
  );
  return Array.isArray(rows) ? (rows as any[])[0] : rows;
}

function buildFounderEmailHtml(params: { name?: string | null; code: string; expiresAt?: string | null; durationMonths?: number | null; customMessage?: string | null; }): string {
  const { name, code, expiresAt, durationMonths, customMessage } = params;
  const recipient = name ? `<strong>${name}</strong>` : 'Hola';
  const expiresCopy = expiresAt ? `Este beneficio vence el <strong>${new Date(expiresAt).toLocaleDateString('es-CL')}</strong>.` : '';
  const durationCopy = durationMonths ? `Tu plan Fundador incluye <strong>${durationMonths}</strong> meses gratuitos para activar y hacer crecer tu perfil.` : 'Tu plan Fundador incluye meses gratuitos para activar y hacer crecer tu perfil.';
  const customSection = customMessage ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1f2937;background:#eef2ff;border-left:4px solid #6366f1;padding:12px 18px;border-radius:12px;">${customMessage}</p>` : '';

  return `
  <div style="background:#f8fafc;padding:32px 0;font-family:'Segoe UI',Tahoma,sans-serif;color:#0f172a;">
    <table width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 15px 45px rgba(15,23,42,0.12);">
      <tr>
        <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 28px;color:#ffffff;">
          <h1 style="margin:0;font-size:26px;font-weight:700;letter-spacing:-0.02em;">AdomiApp</h1>
          <p style="margin:12px 0 0;font-size:16px;opacity:0.85;">Tu acceso exclusivo al Plan Fundador está listo.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 28px 16px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${recipient},</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">${durationCopy} Aprovecha la visibilidad prioritaria y las comisiones preferenciales para sumar clientes desde el primer día.</p>
          ${customSection}
          <div style="padding:22px;border-radius:14px;background:#f1f5f9;border:1px solid #e2e8f0;margin-bottom:20px;text-align:center;">
            <p style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#475569;">Tu código Fundador</p>
            <div style="display:inline-block;padding:14px 28px;font-size:22px;font-weight:700;letter-spacing:0.24em;background:#1e293b;color:#ffffff;border-radius:12px;">${code}</div>
          </div>
          <p style="margin:0 0 16px;font-size:15px;color:#1f2937;">Sigue estos pasos para activarlo:</p>
          <ol style="margin:0 0 20px 20px;font-size:15px;line-height:1.8;color:#334155;">
            <li>Ingresa a <a href="https://adomiapp.com/auth/select-plan" style="color:#4f46e5;text-decoration:none;font-weight:600;">adomiapp.com/auth/select-plan</a>.</li>
            <li>Selecciona la tarjeta “Plan Fundador” e introduce tu código.</li>
            <li>Completa tu registro como profesional y comienza a recibir clientes.</li>
          </ol>
          ${expiresCopy ? `<p style="margin:0 0 14px;font-size:14px;color:#475569;">${expiresCopy}</p>` : ''}
          <p style="margin:0;font-size:14px;color:#475569;">¿Necesitas ayuda? Escríbenos a <a href="mailto:hola@adomiapp.com" style="color:#4f46e5;font-weight:600;text-decoration:none;">hola@adomiapp.com</a>.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px;background:#0f172a;color:#e2e8f0;font-size:12px;text-align:center;">
          <p style="margin:0 0 6px;">© ${new Date().getFullYear()} AdomiApp. Todos los derechos reservados.</p>
          <p style="margin:0;opacity:0.7;">Eres parte de un grupo selecto de profesionales invitadas/os al Plan Fundador.</p>
        </td>
      </tr>
    </table>
  </div>
  `;
}


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

  router.post('/subscriptions/admin/founder-code', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any)?.user;
      const requesterEmail = String(user?.email || '').toLowerCase();
      if (!user || requesterEmail !== FOUNDER_ADMIN_EMAIL) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }

      const providedSecret = (req.headers['x-admin-secret'] as string | undefined) || (typeof req.body?.adminSecret === 'string' ? String(req.body.adminSecret) : '');
      const expectedSecret = (process.env.ADMIN_PANEL_SECRET || '').trim();

      if (!providedSecret) {
        return res.status(403).json({ ok: false, error: 'admin_secret_required' });
      }

      if (expectedSecret && providedSecret !== expectedSecret) {
        return res.status(403).json({ ok: false, error: 'admin_secret_invalid' });
      }

      if (!expectedSecret) {
        Logger.warn(MODULE, 'ADMIN_PANEL_SECRET no configurado; aplicando validación básica.');
      }

      const pool = DatabaseConnection.getPool();
      const actionRaw = typeof req.body?.action === 'string' ? String(req.body.action).toLowerCase() : '';
      const action = actionRaw === 'send' ? 'send' : 'generate';

      if (action === 'generate') {
        const plan = await findFounderPlan(pool);
        if (!plan || !plan.id) {
          return res.status(400).json({ ok: false, error: 'founder_plan_not_configured' });
        }

        const customCodeInput = sanitizePromoCodeInput(req.body?.code);
        let code = customCodeInput || await generateUniqueFounderCode(pool);

        if (customCodeInput) {
          const [existingRows] = await pool.query('SELECT id FROM promo_codes WHERE code = ? LIMIT 1', [code]);
          if (Array.isArray(existingRows) && existingRows.length > 0) {
            return res.status(409).json({ ok: false, error: 'code_already_exists' });
          }
        }

        const rawDuration = Number(req.body?.durationMonths);
        let durationMonths = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration) : Number(plan.duration_months) || 3;
        if (durationMonths <= 0) durationMonths = 3;

        const rawExpiryMonths = Number(req.body?.expiryMonths);
        let expiresAtDate: Date | null = null;
        if (req.body?.expiresAt) {
          const parsed = new Date(req.body.expiresAt);
          if (!Number.isNaN(parsed.getTime())) {
            expiresAtDate = parsed;
          }
        }
        if (!expiresAtDate) {
          const monthsToAdd = Number.isFinite(rawExpiryMonths) && rawExpiryMonths > 0 ? Math.floor(rawExpiryMonths) : 6;
          const base = new Date();
          base.setMonth(base.getMonth() + monthsToAdd);
          expiresAtDate = base;
        }
        const expiresAtSql = expiresAtDate ? toMySqlDatetime(expiresAtDate) : null;

        const rawMaxRedemptions = Number(req.body?.maxRedemptions);
        const maxRedemptions = Number.isFinite(rawMaxRedemptions) && rawMaxRedemptions > 0 ? Math.floor(rawMaxRedemptions) : 1;

        const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : '';
        const initialRecipientEmail = typeof req.body?.recipientEmail === 'string' ? req.body.recipientEmail.trim().toLowerCase() : '';

        const metadataObj: Record<string, any> = {
          source: 'admin-pagos-ui',
          generated_by: requesterEmail,
          generated_at: new Date().toISOString()
        };
        if (notes) metadataObj.notes = notes;
        if (validateEmailAddress(initialRecipientEmail)) {
          metadataObj.recipient_email = initialRecipientEmail;
        }

        const metadataJson = JSON.stringify(metadataObj);
        const description = 'Código Fundador generado desde Admin Pagos';
        const allowedRolesJson = JSON.stringify(['provider']);
        const commissionOverride = Number(plan.commission_rate ?? 0);

        await pool.execute(
          `INSERT INTO promo_codes (
              code,
              description,
              plan_id,
              plan_type,
              max_redemptions,
              duration_months,
              grant_commission_override,
              applies_to_existing,
              valid_from,
              expires_at,
              allowed_roles,
              metadata,
              is_active,
              created_at,
              updated_at
            )
            VALUES (
              ?, ?, ?, 'founder', ?, ?, ?, FALSE, NOW(), ?, ?, ?, TRUE, NOW(), NOW()
            )`,
          [
            code,
            description,
            plan.id,
            maxRedemptions,
            durationMonths,
            commissionOverride,
            expiresAtSql,
            allowedRolesJson,
            metadataJson
          ]
        );

        const [promoRows] = await pool.query(
          'SELECT id, code, duration_months, expires_at, max_redemptions, metadata FROM promo_codes WHERE code = ? LIMIT 1',
          [code]
        );
        const promoRow = Array.isArray(promoRows) ? (promoRows as any[])[0] : promoRows;

        Logger.info(MODULE, 'Founder code generated', { code, by: requesterEmail });

        return res.json({
          ok: true,
          action: 'generate',
          promo: {
            id: promoRow?.id || null,
            code,
            duration_months: promoRow?.duration_months ?? durationMonths,
            expires_at: promoRow?.expires_at || expiresAtSql,
            max_redemptions: promoRow?.max_redemptions ?? maxRedemptions
          },
          emailSent: false
        });
      }

      const normalizedCode = sanitizePromoCodeInput(req.body?.code);
      if (!normalizedCode) {
        return res.status(400).json({ ok: false, error: 'code_required' });
      }

      const recipientEmailRaw = typeof req.body?.recipientEmail === 'string' ? req.body.recipientEmail.trim().toLowerCase() : '';
      if (!validateEmailAddress(recipientEmailRaw)) {
        return res.status(400).json({ ok: false, error: 'email_invalid' });
      }

      const recipientName = typeof req.body?.recipientName === 'string' ? req.body.recipientName.trim().slice(0, 120) : '';
      const customMessage = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 600) : '';

      const promo = await fetchPromoRow(pool, normalizedCode);
      if (!promo || !promo.promo_id) {
        return res.status(404).json({ ok: false, error: 'promo_not_found' });
      }

      if (String(promo.plan_type || '').toLowerCase() !== 'founder') {
        return res.status(400).json({ ok: false, error: 'promo_not_founder' });
      }

      const now = Date.now();
      if (promo.expires_at && new Date(promo.expires_at).getTime() < now) {
        return res.status(400).json({ ok: false, error: 'promo_expired' });
      }

      let emailSent = false;
      let emailError: string | null = null;
      try {
        const html = buildFounderEmailHtml({
          name: recipientName,
          code: promo.code,
          expiresAt: promo.expires_at,
          durationMonths: promo.promo_duration_months || promo.plan_duration_months,
          customMessage: customMessage || null
        });
        await EmailService.sendRaw(recipientEmailRaw, 'Tu acceso al Plan Fundador de AdomiApp', html);
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message || 'No fue posible enviar el correo';
        Logger.error(MODULE, 'Founder promo email failed', {
          code: promo.code,
          recipient: recipientEmailRaw,
          error: emailError
        });
      }

      const metadata = parseJsonSafe<Record<string, any>>(promo.promo_metadata, {});
      metadata.last_email_sent_at = new Date().toISOString();
      metadata.last_email_recipient = recipientEmailRaw;
      metadata.last_email_sender = requesterEmail;
      if (recipientName) metadata.recipient_name = recipientName;
      if (customMessage) metadata.custom_message = customMessage;

      await pool.execute('UPDATE promo_codes SET metadata = ?, updated_at = NOW() WHERE id = ?', [JSON.stringify(metadata), promo.promo_id]);

      return res.json({
        ok: true,
        action: 'send',
        promo: {
          id: promo.promo_id,
          code: promo.code,
          expires_at: promo.expires_at
        },
        emailSent,
        emailError
      });
    } catch (error: any) {
      Logger.error(MODULE, 'Error en founder-code admin endpoint', { error: error?.message });
      return res.status(500).json({ ok: false, error: 'Error al gestionar el código Fundador' });
    }
  });

  router.post('/plans/validate-code', async (req: Request, res: Response) => {
    try {
      const { code, email, providerId, billing } = (req.body || {}) as {
        code?: string;
        email?: string;
        providerId?: number;
        billing?: string;
      };

      if (!code || !String(code).trim()) {
        return res.status(400).json({ ok: false, error: 'Debes ingresar un código promocional.' });
      }

      const normalizedCode = String(code).trim().toUpperCase();
      const pool = DatabaseConnection.getPool();

      const promo = await fetchPromoRow(pool, normalizedCode);

      if (!promo) {
        return res.status(404).json({ ok: false, error: 'Código no válido o no disponible.' });
      }
      if (!promo.is_active) {
        return res.status(400).json({ ok: false, error: 'Este código ya no se encuentra activo.' });
      }

      const now = Date.now();
      if (promo.valid_from && new Date(promo.valid_from).getTime() > now) {
        return res.status(400).json({ ok: false, error: 'Este código aún no está disponible.' });
      }
      if (promo.expires_at && new Date(promo.expires_at).getTime() < now) {
        return res.status(400).json({ ok: false, error: 'Este código expiró.' });
      }

      // Validar redenciones
      let usedCount = Number(promo.current_redemptions) || 0;
      if (promo.max_redemptions !== null && promo.max_redemptions !== undefined) {
        const [usageRows] = await pool.query(
          'SELECT COUNT(*) AS used FROM subscriptions WHERE promo_code_id = ? AND status IN ("active","warning","past_due")',
          [promo.promo_id]
        );
        const usageRow = Array.isArray(usageRows) ? (usageRows as any[])[0] : usageRows;
        usedCount = Math.max(usedCount, Number(usageRow?.used ?? 0));
        if (promo.max_redemptions > 0 && usedCount >= promo.max_redemptions) {
          return res.status(400).json({ ok: false, error: 'Este código ya alcanzó el número máximo de usos.' });
        }
      }

      // Validar elegibilidad de proveedor existente si aplica
      if (!promo.applies_to_existing) {
        if (providerId) {
          const [subscriptionCheck] = await pool.query(
            `SELECT id FROM subscriptions WHERE user_id = ? AND status IN ('active','warning','past_due') LIMIT 1`,
            [providerId]
          );
          if ((subscriptionCheck as any[]).length > 0) {
            return res.status(400).json({ ok: false, error: 'Este código está limitado a nuevos proveedores.' });
          }
        } else if (email) {
          const [userCheck] = await pool.query(
            `SELECT id FROM users WHERE email = ? AND role = 'provider' LIMIT 1`,
            [email]
          );
          if ((userCheck as any[]).length > 0) {
            return res.status(400).json({ ok: false, error: 'Este código aplica solo a cuentas nuevas.' });
          }
        }
      }

      const allowedRoles = parseJsonSafe<string[]>(promo.allowed_roles, []);
      if (allowedRoles.length > 0 && !allowedRoles.includes('provider')) {
        return res.status(400).json({ ok: false, error: 'Este código no está disponible para este tipo de cuenta.' });
      }

      const benefits = parseJsonSafe<any[]>(promo.benefits, []);
      const features = parseJsonSafe<any[]>(promo.features, []);
      const planMetadata = parseJsonSafe<Record<string, any>>(promo.plan_metadata, {});
      const promoMetadata = parseJsonSafe<Record<string, any>>(promo.promo_metadata, {});

      const durationMonths = promo.promo_duration_months || promo.plan_duration_months || 3;

      const responsePlan = {
        id: promo.plan_id,
        name: promo.name,
        price: 0,
        currency: promo.currency || 'CLP',
        interval: normalizeInterval(promo.billing_period),
        description: promo.description || '',
        features,
        max_services: Number(promo.max_services) || 0,
        max_bookings: Number(promo.max_bookings) || 0,
        commission_rate: Number(promo.commission_rate) || 0,
        duration_months: durationMonths,
        isPromo: true,
        promoCode: promo.code,
        benefits,
        metadata: planMetadata
      };

      const remaining = promo.max_redemptions
        ? Math.max(0, promo.max_redemptions - usedCount)
        : null;

      const promoResponse = {
        code: promo.code,
        label: promo.promo_description || 'Plan Fundador',
        message: promoMetadata?.success_message || 'Código aplicado correctamente.',
        expires_at: promo.expires_at,
        max_duration_months: durationMonths,
        remaining_spots: remaining,
        metadata: promoMetadata
      };

      await logFunnelEvent(pool, {
        event: 'promo_validated',
        email: email ? String(email).toLowerCase() : null,
        providerId: providerId ? Number(providerId) : null,
        promoCode: normalizedCode,
        metadata: {
          plan_id: promo.plan_id,
          plan_type: promo.plan_type,
          duration_months: durationMonths,
          remaining_spots: remaining
        }
      });

      res.json({ ok: true, plan: responsePlan, promo: promoResponse });
    } catch (error: any) {
      console.error('[PLANS][VALIDATE_CODE][ERROR]', error);
      res.status(500).json({ ok: false, error: 'No pudimos validar el código. Intenta más tarde.' });
    }
  });

  router.post('/subscriptions/funnel/event', async (req: Request, res: Response) => {
    try {
      const { event, email, providerId, promoCode, metadata } = req.body || {};
      if (!event || !isValidFunnelEvent(String(event))) {
        return res.status(400).json({ ok: false, error: 'Evento inválido' });
      }
      const pool = DatabaseConnection.getPool();
      await logFunnelEvent(pool, {
        event: String(event),
        email: email ? String(email).trim().toLowerCase() : null,
        providerId: providerId ? Number(providerId) : null,
        promoCode: promoCode ? String(promoCode).trim().toUpperCase() : null,
        metadata: metadata && typeof metadata === 'object' ? metadata : null
      });
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][FUNNEL_EVENT][ERROR]', error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar el evento' });
    }
  });

  router.get('/subscriptions/funnel/metrics', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ ok: false, error: 'Solo administradores pueden acceder a esta métrica' });
      }

      const pool = DatabaseConnection.getPool();
      const [totals] = await pool.query(
        `SELECT event_type, COUNT(*) AS total
           FROM subscription_funnel_events
          GROUP BY event_type`
      );

      const [promoBreakdown] = await pool.query(
        `SELECT promo_code, COUNT(*) as total
           FROM subscription_funnel_events
          WHERE event_type = 'promo_validated'
          GROUP BY promo_code
          ORDER BY total DESC`
      );

      const [activations] = await pool.query(
        `SELECT promo_code, COUNT(*) as total
           FROM subscription_funnel_events
          WHERE event_type = 'promo_activated'
          GROUP BY promo_code
          ORDER BY total DESC`
      );

      res.json({
        ok: true,
        data: {
          totals,
          promoValidated: promoBreakdown,
          promoActivated: activations
        }
      });
    } catch (error: any) {
      console.error('[SUBSCRIPTIONS][FUNNEL_METRICS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener métricas' });
    }
  });

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
          COALESCE(max_services, 0) AS max_services,
          COALESCE(max_bookings, 0) AS max_bookings,
          COALESCE(commission_rate, 0) AS commission_rate,
          plan_type,
          duration_months,
          COALESCE(benefits, '[]') AS benefits,
          metadata
        FROM plans
        WHERE is_active = TRUE
          AND plan_type IN ('paid','free')
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
        commission_rate: Number(r.commission_rate) || 0,
        stripe_price_id: r.stripe_price_id,
        plan_type: r.plan_type,
        duration_months: r.duration_months ? Number(r.duration_months) : null,
        benefits: (() => { try { const b = JSON.parse(r.benefits); return Array.isArray(b) ? b : []; } catch { return []; } })(),
        metadata: (() => { try { return r.metadata ? JSON.parse(r.metadata) : null; } catch { return null; } })()
      }));

      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[PLANS][GET][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener planes' });
    }
  });

  router.post('/subscriptions/promo/apply', async (req: Request, res: Response) => {
    const pool = DatabaseConnection.getPool();
    const { providerId, code } = (req.body || {}) as {
      providerId?: number;
      code?: string;
    };

    if (!providerId || Number.isNaN(Number(providerId))) {
      return res.status(400).json({ ok: false, error: 'Debes indicar el proveedor' });
    }
    if (!code || !String(code).trim()) {
      return res.status(400).json({ ok: false, error: 'Debes ingresar un código promocional.' });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [userRows] = await connection.query(
        `SELECT id, role, email, active_plan_id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
        [providerId]
      );
      if ((userRows as any[]).length === 0) {
        await connection.rollback();
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado.' });
      }
      const provider = (userRows as any[])[0];
      if (provider.role !== 'provider') {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'El código solo aplica a cuentas de proveedor.' });
      }

      const promo = await fetchPromoRow(connection, normalizedCode);
      if (!promo) {
        await connection.rollback();
        return res.status(404).json({ ok: false, error: 'Código no válido o no disponible.' });
      }

      const now = Date.now();
      if (!promo.is_active) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Este código ya no está activo.' });
      }
      if (promo.valid_from && new Date(promo.valid_from).getTime() > now) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Este código aún no está disponible.' });
      }
      if (promo.expires_at && new Date(promo.expires_at).getTime() < now) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Este código expiró.' });
      }

      if (!promo.applies_to_existing) {
        if (provider.active_plan_id) {
          await connection.rollback();
          return res.status(400).json({ ok: false, error: 'El código Fundador está limitado a cuentas nuevas.' });
        }
        const [subscriptionCheck] = await connection.query(
          `SELECT id FROM subscriptions WHERE user_id = ? AND status IN ('active','warning','past_due') LIMIT 1 FOR UPDATE`,
          [providerId]
        );
        if ((subscriptionCheck as any[]).length > 0) {
          await connection.rollback();
          return res.status(400).json({ ok: false, error: 'Ya existe una suscripción activa para este proveedor.' });
        }
      }

      let usedCount = Number(promo.current_redemptions) || 0;
      if (promo.max_redemptions !== null && promo.max_redemptions !== undefined) {
        const [usageRows] = await connection.query(
          'SELECT COUNT(*) AS used FROM subscriptions WHERE promo_code_id = ? AND status IN ("active","warning","past_due")',
          [promo.promo_id]
        );
        const usageRow = Array.isArray(usageRows) ? (usageRows as any[])[0] : usageRows;
        usedCount = Math.max(usedCount, Number(usageRow?.used ?? 0));
        if (promo.max_redemptions > 0 && usedCount >= promo.max_redemptions) {
          await connection.rollback();
          return res.status(400).json({ ok: false, error: 'Este código ya alcanzó el número máximo de usos.' });
        }
      }

      const allowedRoles = parseJsonSafe<string[]>(promo.allowed_roles, []);
      if (allowedRoles.length > 0 && !allowedRoles.includes('provider')) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Este código no está disponible para este tipo de cuenta.' });
      }

      const durationMonths = Math.max(Number(promo.promo_duration_months || promo.plan_duration_months || 3), 1);

      const metadataPayload = {
        source: 'promo',
        code: promo.code,
        promo_plan_type: promo.promo_plan_type,
        granted_at: new Date().toISOString()
      };

      await connection.execute(
        `INSERT INTO subscriptions (
            user_id,
            plan_id,
            stripe_subscription_id,
            status,
            current_period_start,
            current_period_end,
            cancel_at_period_end,
            promo_code_id,
            promo_code,
            plan_origin,
            promo_expires_at,
            metadata,
            services_used,
            bookings_used
          )
          VALUES (
            ?,
            ?,
            NULL,
            'active',
            NOW(),
            DATE_ADD(NOW(), INTERVAL ? MONTH),
            FALSE,
            ?,
            ?,
            'promo',
            DATE_ADD(NOW(), INTERVAL ? MONTH),
            JSON_OBJECT('source', ?, 'code', ?, 'plan_type', ?, 'granted_at', ?),
            0,
            0
          )`,
        [
          providerId,
          promo.plan_id,
          durationMonths,
          promo.promo_id,
          normalizedCode,
          durationMonths,
          metadataPayload.source,
          normalizedCode,
          promo.promo_plan_type || 'founder',
          metadataPayload.granted_at
        ]
      );

      await connection.execute(
        'UPDATE users SET active_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [promo.plan_id, providerId]
      );

      const [promoUpdate]: any = await connection.execute(
        `UPDATE promo_codes
            SET current_redemptions = current_redemptions + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND is_active = TRUE
            AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)` ,
        [promo.promo_id]
      );

      if (!promoUpdate || promoUpdate.affectedRows === 0) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Ya no quedan cupos disponibles para este código.' });
      }

      const [subscriptionRow] = await connection.query(
        `SELECT id, current_period_end FROM subscriptions WHERE user_id = ? AND promo_code = ? ORDER BY created_at DESC LIMIT 1`,
        [providerId, normalizedCode]
      );
      const subscription = (subscriptionRow as any[])[0];

      if (subscription?.id) {
        await connection.execute(
          `INSERT INTO provider_subscription_events (subscription_id, event_type, new_status, metadata)
           VALUES (?, 'promo_applied', 'active', JSON_OBJECT('code', ?, 'plan_id', ?, 'duration_months', ?))`,
          [subscription.id, normalizedCode, promo.plan_id, durationMonths]
        );
      }

      await connection.commit();

      await logFunnelEvent(pool, {
        event: 'promo_activated',
        providerId,
        promoCode: normalizedCode,
        metadata: {
          subscription_id: subscription?.id || null,
          plan_id: promo.plan_id
        }
      });

      res.json({
        ok: true,
        subscription: {
          id: subscription?.id,
          provider_id: providerId,
          plan_id: promo.plan_id,
          status: 'active',
          ends_at: subscription?.current_period_end,
          duration_months: durationMonths,
          promo_code: normalizedCode
        }
      });
    } catch (error: any) {
      try { await connection.rollback(); } catch {}
      console.error('[SUBSCRIPTIONS][PROMO_APPLY][ERROR]', error);
      res.status(500).json({ ok: false, error: 'No pudimos activar el plan Fundador. Intenta más tarde.' });
    } finally {
      connection.release();
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

