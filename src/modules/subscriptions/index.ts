/**
 * Subscriptions Module
 * Handles plans and subscriptions for providers
 */

import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import Stripe from 'stripe';
import axios from 'axios';
import crypto from 'crypto';
import { JWTUtil } from '../../shared/utils/jwt.util';
import { setupStripeWebhooks } from './webhooks';
import { logFunnelEvent, isValidFunnelEvent } from '../../shared/utils/subscription.util';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import { EmailService } from '../../shared/services/email.service';
import { Logger } from '../../shared/utils/logger.util';

const MODULE = 'SUBSCRIPTIONS_ADMIN';
const FOUNDER_ADMIN_EMAIL = (process.env.FOUNDER_ADMIN_EMAIL || 'juanpablojpw@gmail.com').toLowerCase();

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
    `SELECT 
        id,
        name,
        price,
        currency,
        billing_period,
        duration_months,
        commission_rate,
        features,
        max_services,
        max_bookings,
        benefits,
        metadata
       FROM plans
      WHERE plan_type = 'founder'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`
  );
  let plan = Array.isArray(rows) ? (rows as any[])[0] : rows;

  if (!plan) {
    const [fallbackRows] = await connection.query(
      `SELECT 
          id,
          name,
          price,
          currency,
          billing_period,
          duration_months,
          commission_rate,
          features,
          max_services,
          max_bookings,
          benefits,
          metadata
         FROM plans
        WHERE LOWER(name) LIKE 'founder%'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1`
    );
    plan = Array.isArray(fallbackRows) ? (fallbackRows as any[])[0] : fallbackRows;
  }

  if (!plan) {
    Logger.warn(MODULE, 'Founder plan not found. Ensure a plan exists with plan_type = founder or name matching "Founder"');
  } else {
    Logger.info(MODULE, 'Founder plan resolved', { planId: plan.id, name: plan.name, duration: plan.duration_months });
  }

  return plan;
}

type FounderCodeRow = {
  id: number;
  code: string;
  commune: string;
  region: string;
  category: 'commune' | 'region' | 'special';
  max_uses: number | null;
  current_uses: number;
  benefit_months: number;
  allow_existing: boolean;
  status: 'active' | 'expired' | 'disabled';
  valid_from: Date;
  valid_until: Date;
  metadata: Record<string, any> | null;
};

async function fetchFounderCodeRow(connection: any, code: string, options: { forUpdate?: boolean } = {}): Promise<FounderCodeRow | null> {
  const lock = options.forUpdate ? 'FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT 
        id,
        code,
        commune,
        region,
        category,
        max_uses,
        current_uses,
        benefit_months,
        allow_existing,
        status,
        valid_from,
        valid_until,
        metadata
       FROM founder_codes
      WHERE code = ?
      LIMIT 1 ${lock}`,
    [code]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const row = rows[0] as any;

  return {
    id: row.id,
    code: row.code,
    commune: row.commune,
    region: row.region,
    category: row.category,
    max_uses: row.max_uses !== null ? Number(row.max_uses) : null,
    current_uses: Number(row.current_uses || 0),
    benefit_months: Number(row.benefit_months || 3),
    allow_existing: Boolean(row.allow_existing),
    status: row.status,
    valid_from: row.valid_from instanceof Date ? row.valid_from : new Date(row.valid_from),
    valid_until: row.valid_until instanceof Date ? row.valid_until : new Date(row.valid_until),
    metadata: parseJsonSafe<Record<string, any>>(row.metadata, null)
  };
}

function computeFounderRemaining(code: FounderCodeRow): number | null {
  if (code.max_uses === null) {
    return null;
  }
  return Math.max(0, code.max_uses - code.current_uses);
}

function buildFounderPromoMetadata(code: FounderCodeRow) {
  return {
    campaign: 'founder_codes_rm',
    founder_commune: code.commune,
    founder_region: code.region,
    founder_category: code.category
  };
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

function normalizeBaseUrl(value?: string | null): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function requireEnvAny(keys: string[]): string {
  for (const key of keys) {
    const value = (process.env[key] || '').trim();
    if (value) return value;
  }
  throw new Error(`Missing environment variable: ${keys.join(' or ')}`);
}

function getPlanTbkBase(): string {
  const explicit = normalizeBaseUrl(process.env.TBK_PLANS_BASE_URL);
  if (explicit) return explicit;
  const fallback = normalizeBaseUrl(process.env.TBK_BASE_URL);
  if (fallback) return fallback;
  throw new Error('TBK_PLANS_BASE_URL or TBK_BASE_URL must be configured');
}

function getPlanTbkHeaders() {
  return {
    'Tbk-Api-Key-Id': requireEnvAny(['TBK_PLAN_API_KEY_ID', 'TBK_API_KEY_ID']),
    'Tbk-Api-Key-Secret': requireEnvAny(['TBK_PLAN_API_KEY_SECRET', 'TBK_API_KEY_SECRET']),
    'Content-Type': 'application/json'
  } as Record<string, string>;
}

function getPlanReturnUrl(): string {
  const explicit = (process.env.TBK_PLANS_RETURN_URL || '').trim();
  if (explicit) return explicit;
  const generic = (process.env.TBK_RETURN_URL || '').trim();
  if (generic) return generic;
  const base = normalizeBaseUrl(process.env.FRONTEND_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://adomiapp.com');
  return `${base}/tbk/plan-return`;
}

function generatePlanBuyOrder(providerId: number, planId: number): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  const base = `PL${planId.toString(36).toUpperCase()}${providerId.toString(36).toUpperCase()}${timestamp}${random}`;
  return base.slice(0, 26);
}

function generatePlanSessionId(providerId: number): string {
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PLAN-${providerId}-${random}-${Date.now()}`.slice(0, 40);
}

function renderPlanReturnLanding(token: string, redirectUrl: string): string {
  const escapedToken = escapeHtml(token);
  const escapedRedirect = escapeHtml(redirectUrl);

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Procesando pago</title>
    <style>
      body {
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f8fafc;
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .card {
        background: #fff;
        border-radius: 20px;
        padding: 32px 28px;
        width: min(500px, 92%);
        text-align: center;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.15);
        border: 1px solid rgba(148, 163, 184, 0.2);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.75rem;
        color: #0f172a;
      }
      p {
        margin: 0;
        color: #475569;
        line-height: 1.6;
      }
      .status--success h1 {
        color: #047857;
      }
      .status--error h1 {
        color: #dc2626;
      }
      .spinner {
        margin: 24px auto;
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: 4px solid rgba(7, 89, 133, 0.2);
        border-top-color: #0ea5e9;
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      a.button {
        display: inline-block;
        margin-top: 24px;
        padding: 12px 24px;
        background: #0ea5e9;
        color: #fff;
        text-decoration: none;
        border-radius: 999px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="card status--loading" id="tbk-plan-card">
      <div class="spinner" id="tbk-plan-spinner"></div>
      <h1 id="tbk-plan-title">Procesando pago...</h1>
      <p id="tbk-plan-message">Estamos confirmando tu suscripción. Por favor, no cierres esta ventana.</p>
      <a href="${escapedRedirect}" id="tbk-plan-link" class="button" style="display:none">Volver a Adomi</a>
    </div>
    <script>
      (function() {
        const token = "${escapedToken}";
        const card = document.getElementById('tbk-plan-card');
        const title = document.getElementById('tbk-plan-title');
        const message = document.getElementById('tbk-plan-message');
        const spinner = document.getElementById('tbk-plan-spinner');
        const link = document.getElementById('tbk-plan-link');
        const redirectUrl = "${escapedRedirect}";

        function setStatus(type, newTitle, newMessage) {
          card.className = 'card status--' + type;
          title.textContent = newTitle;
          message.textContent = newMessage;
          spinner.style.display = 'none';
          link.style.display = 'inline-block';
        }

        if (!token) {
          setStatus('error', 'No pudimos confirmar tu pago', 'Faltó el token de confirmación. Intenta nuevamente.');
          return;
        }

        fetch('/plans/tbk/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_ws: token })
        })
        .then(async response => {
          const data = await response.json().catch(() => ({}));
          if (response.ok && data && data.ok) {
            setStatus('success', 'Pago confirmado', 'Tu suscripción está activa. Te redirigiremos enseguida.');
            setTimeout(() => { window.location.href = redirectUrl + '?token_ws=' + encodeURIComponent(token); }, 1500);
          } else {
            setStatus('error', 'No pudimos confirmar tu pago', 'Revisa tu correo o intenta nuevamente.');
          }
        })
        .catch(() => {
          setStatus('error', 'No pudimos confirmar tu pago', 'Se produjo un error de conexión. Intenta nuevamente.');
        });
      })();
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  const safe = value || '';
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function computePlanPeriodMonths(plan: any): number {
  if (Number(plan?.duration_months) > 0) {
    return Math.max(1, Number(plan.duration_months));
  }
  const raw = String(plan?.billing_period || plan?.interval || '').toLowerCase();
  if (['year', 'yearly', 'anual', 'annual'].includes(raw)) return 12;
  if (['semester', 'semiannual', 'semestre'].includes(raw)) return 6;
  if (['quarter', 'quarterly', 'trimestral'].includes(raw)) return 3;
  return 1;
}

function addMonthsSafe(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
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
        Logger.info(MODULE, 'Founder code generation requested', {
          by: requesterEmail,
          durationMonths: req.body?.durationMonths,
          expiryMonths: req.body?.expiryMonths,
          notes: req.body?.notes ? '[provided]' : undefined,
          recipientEmailProvided: !!req.body?.recipientEmail
        });
        const plan = await findFounderPlan(pool);
        if (!plan || !plan.id) {
          Logger.warn(MODULE, 'Founder code generation aborted – plan not configured');
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

      Logger.info(MODULE, 'Founder code send requested', {
        by: requesterEmail,
        code: normalizedCode,
        recipientEmail: recipientEmailRaw,
        hasCustomMessage: !!customMessage
      });

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

      const now = Date.now();
      const promo = await fetchPromoRow(pool, normalizedCode);

      if (promo) {
        if (!promo.is_active) {
          return res.status(400).json({ ok: false, error: 'Este código ya no se encuentra activo.' });
        }
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

        return res.json({ ok: true, plan: responsePlan, promo: promoResponse });
      }

      const founder = await fetchFounderCodeRow(pool, normalizedCode);
      if (!founder) {
        return res.status(404).json({ ok: false, error: 'Código no válido o no disponible.' });
      }
      if (founder.status === 'disabled') {
        return res.status(400).json({ ok: false, error: 'Este código no está disponible en este momento.' });
      }
      if (founder.status === 'expired' || founder.valid_until.getTime() < now) {
        return res.status(400).json({ ok: false, error: 'Este código expiró.' });
      }
      if (founder.valid_from.getTime() > now) {
        return res.status(400).json({ ok: false, error: 'Este código aún no está disponible.' });
      }

      const remainingFounderSpots = computeFounderRemaining(founder);
      if (remainingFounderSpots !== null && remainingFounderSpots <= 0) {
        return res.status(400).json({ ok: false, error: 'Este código ya alcanzó el número máximo de usos.' });
      }

      if (!founder.allow_existing) {
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

      const founderPlan = await findFounderPlan(pool);
      if (!founderPlan || !founderPlan.id) {
        return res.status(500).json({ ok: false, error: 'Plan Fundador no configurado.' });
      }

      const features = parseJsonSafe<any[]>(founderPlan.features, []);
      const benefits = parseJsonSafe<any[]>(founderPlan.benefits, []);
      const planMetadata = parseJsonSafe<Record<string, any>>(founderPlan.metadata, {});
      const durationMonths = Math.max(Number(founder.benefit_months || founderPlan.duration_months || 3), 1);
      const founderMeta = buildFounderPromoMetadata(founder);

      const responsePlan = {
        id: founderPlan.id,
        name: founderPlan.name || 'Plan Fundador',
        price: 0,
        currency: founderPlan.currency || 'CLP',
        interval: normalizeInterval(founderPlan.billing_period || 'month'),
        description: planMetadata?.description || 'Beneficios completos del programa Fundadores.',
        features,
        max_services: Number(founderPlan.max_services) || 0,
        max_bookings: Number(founderPlan.max_bookings) || 0,
        commission_rate: Number(founderPlan.commission_rate) || 0,
        duration_months: durationMonths,
        isPromo: true,
        promoCode: founder.code,
        benefits,
        metadata: {
          ...planMetadata,
          ...founderMeta
        }
      };

      const promoResponse = {
        code: founder.code,
        label: `Fundador ${founder.commune}`,
        message: `Activaste el plan Fundador para ${founder.commune}.`,
        expires_at: founder.valid_until.toISOString(),
        max_duration_months: durationMonths,
        remaining_spots: remainingFounderSpots,
        metadata: {
          ...founderMeta,
          remaining_spots: remainingFounderSpots,
          valid_until: founder.valid_until
        }
      };

      await logFunnelEvent(pool, {
        event: 'promo_validated',
        email: email ? String(email).toLowerCase() : null,
        providerId: providerId ? Number(providerId) : null,
        promoCode: normalizedCode,
        metadata: {
          plan_id: founderPlan.id,
          plan_type: 'founder',
          duration_months: durationMonths,
          remaining_spots: remainingFounderSpots,
          founder_commune: founder.commune
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

  router.post('/plans/tbk/init', authenticateToken, async (req: Request, res: Response) => {
    try {
      const authUser = (req as any)?.user;
      if (!authUser?.id) {
        return res.status(401).json({ ok: false, error: 'auth_required' });
      }

      const rawPlanId = (req.body || {}).planId;
      const planId = Number(rawPlanId);
      if (!Number.isFinite(planId) || planId <= 0) {
        return res.status(400).json({ ok: false, error: 'plan_invalid' });
      }

      const pool = DatabaseConnection.getPool();
      const [[userRow]]: any = await pool.query(
        'SELECT id, role, pending_role, email FROM users WHERE id = ? LIMIT 1',
        [authUser.id]
      );
      if (!userRow) {
        return res.status(404).json({ ok: false, error: 'user_not_found' });
      }

      const role = String(userRow.role || '').toLowerCase();
      const pendingRole = String(userRow.pending_role || '').toLowerCase();
      if (role !== 'provider' && pendingRole !== 'provider') {
        return res.status(403).json({ ok: false, error: 'not_provider' });
      }

      const [[planRow]]: any = await pool.query(
        `SELECT id, name, price, currency, billing_period, plan_type, duration_months
           FROM plans
          WHERE id = ? AND is_active = TRUE
          LIMIT 1`,
        [planId]
      );
      if (!planRow) {
        return res.status(404).json({ ok: false, error: 'plan_not_found' });
      }

      const planPrice = Number(planRow.price || 0);
      if (!(planPrice > 0)) {
        return res.status(400).json({ ok: false, error: 'plan_amount_invalid' });
      }

      const currency = String(planRow.currency || 'CLP').toUpperCase();
      const amount = Math.round(planPrice);
      const buyOrder = generatePlanBuyOrder(userRow.id, planRow.id);
      const sessionId = generatePlanSessionId(userRow.id);
      const returnUrl = getPlanReturnUrl();
      const baseUrl = getPlanTbkBase();
      const headers = getPlanTbkHeaders();

      Logger.info(MODULE, 'TBK plan init', {
        providerId: userRow.id,
        planId,
        amount,
        currency,
        buyOrder,
        sessionId,
        returnUrl,
        baseUrl
      });

      const planParentCommerceCode = (process.env.TBK_PLAN_COMMERCE_CODE || process.env.TBK_API_KEY_ID || '').trim();
      const planChildCommerceCode = (process.env.TBK_PLAN_CHILD_COMMERCE_CODE || process.env.TBK_PLATFORM_CHILD_CODE || '').trim();
      const isMallIntegration = !!planParentCommerceCode && !!planChildCommerceCode && planParentCommerceCode !== planChildCommerceCode;

      if (isMallIntegration && !planChildCommerceCode) {
        Logger.error(MODULE, 'TBK plan init abortado: falta código de comercio hijo para mall');
        return res.status(500).json({ ok: false, error: 'tbk_plan_child_missing' });
      }

      const detailBuyOrder = `${buyOrder}-P`;

      const payload = isMallIntegration ? {
        buy_order: buyOrder,
        session_id: sessionId,
        return_url: returnUrl,
        details: [
          {
            amount,
            commerce_code: planChildCommerceCode,
            buy_order: detailBuyOrder
          }
        ]
      } : {
        buy_order: buyOrder,
        session_id: sessionId,
        amount,
        return_url: returnUrl
      };

      const { data } = await axios.post(
        `${baseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions`,
        payload,
        { headers }
      );

      const token = (data as any)?.token;
      const url = (data as any)?.url;

      if (!token || !url) {
        Logger.error(MODULE, 'TBK plan init invalid response', { data });
        return res.status(502).json({ ok: false, error: 'tbk_init_invalid_response' });
      }

      Logger.info(MODULE, 'TBK plan init response', {
        providerId: userRow.id,
        planId,
        token,
        buyOrder,
        sessionId
      });

      const metadata = {
        plan_name: planRow.name,
        billing_period: planRow.billing_period,
        duration_months: planRow.duration_months,
        initiated_by: userRow.email || null,
        currency,
        commerce_parent: planParentCommerceCode || null,
        commerce_child: isMallIntegration ? planChildCommerceCode : null,
        is_mall: isMallIntegration
      };

      const [insertResult]: any = await pool.execute(
        `INSERT INTO provider_plan_payments (
            provider_id,
            plan_id,
            gateway,
            status,
            amount,
            currency,
            tbk_token,
            tbk_buy_order,
            tbk_session_id,
            redirect_url,
            return_url,
            metadata
          )
          VALUES (?, ?, 'tbk', 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userRow.id,
          planRow.id,
          amount,
          currency,
          token,
          buyOrder,
          sessionId,
          url,
          returnUrl,
          JSON.stringify(metadata)
        ]
      );

      const paymentId = insertResult?.insertId || null;

      return res.status(201).json({
        ok: true,
        token,
        url,
        paymentId,
        buy_order: buyOrder
      });
    } catch (error: any) {
      const status = error?.response?.status;
      const details = error?.response?.data || error?.message || 'error';
      Logger.error(MODULE, 'TBK plan init error', { message: error?.message, status, details });
      return res.status(status && status >= 400 ? status : 500).json({
        ok: false,
        error: 'tbk_init_failed',
        details
      });
    }
  });

  router.post('/plans/tbk/commit', async (req: Request, res: Response) => {
    const token = String(
      (req.body as any)?.token_ws ||
      (req.query as any)?.token_ws ||
      (req.body as any)?.token ||
      (req.query as any)?.token ||
      ''
    ).trim();

    if (!token) {
      return res.status(400).json({ ok: false, error: 'token_ws_required' });
    }

    let conn: any;
    try {
      const baseUrl = getPlanTbkBase();
      const headers = getPlanTbkHeaders();
      Logger.info(MODULE, 'TBK plan commit', { token, baseUrl });

      const { data } = await axios.put(
        `${baseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`,
        {},
        { headers }
      );

      const pool = DatabaseConnection.getPool();
      conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [rows]: any = await conn.query(
          'SELECT * FROM provider_plan_payments WHERE tbk_token = ? LIMIT 1 FOR UPDATE',
          [token]
        );
        if (!Array.isArray(rows) || rows.length === 0) {
          await conn.rollback();
          conn.release();
          return res.status(404).json({ ok: false, error: 'payment_not_found' });
        }

        const payment = rows[0];
        const alreadyPaid = String(payment.status || '').toLowerCase() === 'paid';

        const detailSource: any = Array.isArray((data as any)?.details) && (data as any).details.length
          ? (data as any).details[0]
          : data;

        const tbkStatus = String(detailSource?.status || data?.status || '').toUpperCase();
        const tbkResponseCode = Number(detailSource?.response_code ?? (data as any)?.response_code ?? -1);
        const tbkAuthorization = detailSource?.authorization_code || (data as any)?.authorization_code || null;
        const tbkPaymentType = detailSource?.payment_type_code || (data as any)?.payment_type_code || null;
        const tbkInstallments = Number(detailSource?.installments_number ?? (data as any)?.installments_number ?? null);

        const isAuthorized = tbkStatus === 'AUTHORIZED' && tbkResponseCode === 0;
        const finalStatus = isAuthorized ? 'paid' : (alreadyPaid ? 'paid' : 'failed');

        await conn.execute(
          `UPDATE provider_plan_payments
              SET status = ?,
                  tbk_authorization_code = ?,
                  tbk_response_code = ?,
                  tbk_installments_number = ?,
                  tbk_payment_type_code = ?,
                  tbk_details = ?,
                  error_message = ?,
                  paid_at = CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [
            finalStatus,
            tbkAuthorization,
            Number.isFinite(tbkResponseCode) ? tbkResponseCode : null,
            Number.isFinite(tbkInstallments) ? tbkInstallments : null,
            tbkPaymentType,
            JSON.stringify(data),
            isAuthorized || alreadyPaid ? null : (detailSource?.status || data?.status || 'authorization_failed'),
            finalStatus,
            payment.id
          ]
        );

        let subscriptionPayload: any = null;

        if (isAuthorized && !alreadyPaid) {
          const [[provider]]: any = await conn.query(
            'SELECT id, role, pending_role FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
            [payment.provider_id]
          );
          if (!provider) {
            await conn.rollback();
            conn.release();
            return res.status(404).json({ ok: false, error: 'provider_not_found' });
          }

          const [[planRow]]: any = await conn.query(
            'SELECT id, name, billing_period, duration_months FROM plans WHERE id = ? LIMIT 1 FOR UPDATE',
            [payment.plan_id]
          );
          if (!planRow) {
            await conn.rollback();
            conn.release();
            return res.status(404).json({ ok: false, error: 'plan_not_found' });
          }

          const months = computePlanPeriodMonths(planRow);
          const now = new Date();
          const periodEnd = addMonthsSafe(now, months);

          const metadata = {
            source: 'tbk',
            gateway: 'tbk',
            payment_id: payment.id,
            buy_order: payment.tbk_buy_order,
            token_ws: token,
            authorization_code: tbkAuthorization,
            payment_type_code: tbkPaymentType,
            installments_number: Number.isFinite(tbkInstallments) ? tbkInstallments : null,
            response_code: Number.isFinite(tbkResponseCode) ? tbkResponseCode : null,
            amount: payment.amount,
            currency: payment.currency
          };

          await conn.execute(
            `UPDATE subscriptions
                SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND status IN ('active','warning','past_due','pending')`,
            [payment.provider_id]
          );

          const [insertResult]: any = await conn.execute(
            `INSERT INTO subscriptions (
                user_id,
                plan_id,
                stripe_subscription_id,
                status,
                current_period_start,
                current_period_end,
                cancel_at_period_end,
                plan_origin,
                metadata
              )
              VALUES (?, ?, NULL, 'active', ?, ?, FALSE, 'tbk', ?)`,
            [
              payment.provider_id,
              payment.plan_id,
              toMySqlDatetime(now),
              toMySqlDatetime(periodEnd),
              JSON.stringify(metadata)
            ]
          );

          const subscriptionId = insertResult?.insertId || null;

          if (subscriptionId) {
            await conn.execute(
              `INSERT INTO provider_subscription_events (subscription_id, event_type, new_status, metadata)
               VALUES (?, 'created', 'active', JSON_OBJECT('gateway','tbk','payment_id', ?, 'buy_order', ?, 'amount', ?, 'currency', ?))`,
              [subscriptionId, payment.id, payment.tbk_buy_order, payment.amount, payment.currency]
            );
          }

          const shouldSwitch = String(provider.pending_role || '').toLowerCase() === 'provider' ? 1 : 0;

          await conn.execute(
            `UPDATE users
                SET active_plan_id = ?,
                    role = CASE WHEN ? = 1 THEN 'provider' ELSE role END,
                    pending_role = CASE WHEN ? = 1 THEN NULL ELSE pending_role END,
                    pending_plan_id = NULL,
                    pending_started_at = NULL,
                    account_switch_in_progress = 0,
                    account_switched_at = CASE WHEN ? = 1 THEN NOW() ELSE account_switched_at END,
                    account_switch_source = CASE WHEN ? = 1 THEN COALESCE(account_switch_source, 'tbk') ELSE account_switch_source END,
                    updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [payment.plan_id, shouldSwitch, shouldSwitch, shouldSwitch, shouldSwitch, payment.provider_id]
          );

          subscriptionPayload = {
            id: subscriptionId,
            provider_id: payment.provider_id,
            plan_id: payment.plan_id,
            status: 'active',
            current_period_start: toMySqlDatetime(now),
            current_period_end: toMySqlDatetime(periodEnd)
          };
        }

        await conn.commit();
        conn.release();
        conn = null;

        if (isAuthorized && !alreadyPaid) {
          try {
            await logFunnelEvent(pool, {
              event: 'converted_to_paid',
              providerId: Number(payment.provider_id),
              metadata: {
                plan_id: Number(payment.plan_id),
                gateway: 'tbk',
                payment_id: Number(payment.id),
                buy_order: payment.tbk_buy_order
              }
            });
          } catch (logErr: any) {
            Logger.warn(MODULE, 'Unable to log TBK converted_to_paid', { error: logErr?.message });
          }
        }

        return res.json({
          ok: isAuthorized || alreadyPaid,
          status: finalStatus,
          paymentId: payment.id,
          subscription: subscriptionPayload,
          commit: data
        });
      } catch (dbError: any) {
        if (conn) {
          try { await conn.rollback(); } catch {}
          try { conn.release(); } catch {}
          conn = null;
        }
        Logger.error(MODULE, 'TBK plan commit DB error', { error: dbError?.message });
        return res.status(500).json({ ok: false, error: 'tbk_commit_failed', details: dbError?.message });
      }
    } catch (error: any) {
      if (conn) {
        try { conn.release(); } catch {}
        conn = null;
      }
      const status = error?.response?.status;
      const details = error?.response?.data || error?.message || 'error';
      Logger.error(MODULE, 'TBK plan commit error', { message: error?.message, status, details });
      return res.status(status && status >= 400 ? status : 500).json({
        ok: false,
        error: 'tbk_commit_failed',
        details
      });
    }
  });

  router.get('/tbk/plan-return', async (req: Request, res: Response) => {
    const token = String(
      (req.query as any)?.token_ws ||
      (req.query as any)?.TBK_TOKEN ||
      (req.query as any)?.token ||
      ''
    ).trim();

    const fallbackBase = normalizeBaseUrl(
      process.env.FRONTEND_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      'https://adomiapp.com'
    );
    const redirectUrl = `${fallbackBase}/tbk/plan-return`;

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res
      .status(200)
      .send(renderPlanReturnLanding(token, redirectUrl));
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
        `SELECT id, role, pending_role, account_switch_in_progress, email, active_plan_id
           FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
        [providerId]
      );
      if ((userRows as any[]).length === 0) {
        await connection.rollback();
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado.' });
      }
      const provider = (userRows as any[])[0];
      const isPendingProvider = String(provider.pending_role || '').toLowerCase() === 'provider';
      if (provider.role !== 'provider' && !isPendingProvider) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'El código solo aplica a cuentas de proveedor.' });
      }

      const promo = await fetchPromoRow(connection, normalizedCode);
      const now = Date.now();

      if (promo) {
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
          `UPDATE users 
              SET active_plan_id = ?,
                  role = 'provider',
                  pending_role = NULL,
                  account_switch_in_progress = 0,
                  account_switched_at = NOW(),
                  account_switch_source = COALESCE(account_switch_source, 'promo'),
                  updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
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

        return res.json({
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
      }

      const founderCode = await fetchFounderCodeRow(connection, normalizedCode, { forUpdate: true });
      if (!founderCode) {
        await connection.rollback();
        return res.status(404).json({ ok: false, error: 'Código no válido o no disponible.' });
      }

      if (founderCode.status === 'disabled') {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Este código no está disponible en este momento.' });
      }
      if (founderCode.status === 'expired' || founderCode.valid_until.getTime() < now) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Este código expiró.' });
      }
      if (founderCode.valid_from.getTime() > now) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Este código aún no está disponible.' });
      }

      const founderRemaining = computeFounderRemaining(founderCode);
      if (founderRemaining !== null && founderRemaining <= 0) {
        await connection.rollback();
        return res.status(400).json({ ok: false, error: 'Ya no quedan cupos disponibles para este código.' });
      }

      if (!founderCode.allow_existing) {
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

      const founderPlan = await findFounderPlan(connection);
      if (!founderPlan || !founderPlan.id) {
        await connection.rollback();
        return res.status(500).json({ ok: false, error: 'Plan Fundador no configurado.' });
      }

      const founderDurationMonths = Math.max(Number(founderCode.benefit_months || founderPlan.duration_months || 3), 1);
      const founderMetadata = buildFounderPromoMetadata(founderCode);

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
            NULL,
            ?,
            'promo',
            DATE_ADD(NOW(), INTERVAL ? MONTH),
            JSON_OBJECT(
              'source', 'founder_code',
              'code', ?,
              'commune', ?,
              'region', ?,
              'category', ?,
              'granted_at', ?
            ),
            0,
            0
          )`,
        [
          providerId,
          founderPlan.id,
          founderDurationMonths,
          normalizedCode,
          founderDurationMonths,
          normalizedCode,
          founderCode.commune,
          founderCode.region,
          founderCode.category,
          new Date().toISOString()
        ]
      );

      await connection.execute(
        `UPDATE users 
            SET active_plan_id = ?,
                role = 'provider',
                pending_role = NULL,
                account_switch_in_progress = 0,
                account_switched_at = NOW(),
                account_switch_source = 'founder_code',
                founder_code = ?,
                founder_activated_at = NOW(),
                founder_expires_at = DATE_ADD(NOW(), INTERVAL ? MONTH),
                is_founder = 1,
                updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [founderPlan.id, normalizedCode, founderDurationMonths, providerId]
      );

      await connection.execute(
        `UPDATE provider_profiles
            SET founder_badge_until = DATE_ADD(NOW(), INTERVAL ? MONTH)
         WHERE provider_id = ?`,
        [founderDurationMonths, providerId]
      );

      const [founderUpdate]: any = await connection.execute(
        `UPDATE founder_codes
            SET current_uses = current_uses + 1,
                status = CASE 
                  WHEN max_uses IS NOT NULL AND current_uses + 1 >= max_uses THEN 'expired'
                  ELSE status
                END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
            AND valid_from <= NOW()
            AND valid_until >= NOW()
            AND (max_uses IS NULL OR current_uses < max_uses)`,
        [founderCode.id]
      );

      if (!founderUpdate || founderUpdate.affectedRows === 0) {
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
           VALUES (?, 'promo_applied', 'active', JSON_OBJECT('code', ?, 'plan_id', ?, 'duration_months', ?, 'source', 'founder_code'))`,
          [subscription.id, normalizedCode, founderPlan.id, founderDurationMonths]
        );
      }

      await connection.commit();

      await logFunnelEvent(pool, {
        event: 'promo_activated',
        providerId,
        promoCode: normalizedCode,
        metadata: {
          subscription_id: subscription?.id || null,
          plan_id: founderPlan.id,
          founder_commune: founderCode.commune
        }
      });

      res.json({
        ok: true,
        subscription: {
          id: subscription?.id,
          provider_id: providerId,
          plan_id: founderPlan.id,
          status: 'active',
          ends_at: subscription?.current_period_end,
          duration_months: founderDurationMonths,
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

