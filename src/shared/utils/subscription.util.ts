import DatabaseConnection from '../database/connection';
import { Logger } from './logger.util';
import { parsePlanMetadata, PlanFeatureMetadata, getDefaultPlanFeatures } from './plan-features.util';

export interface ProviderPlanLimits extends PlanFeatureMetadata {
  providerId: number;
  planId: number | null;
  planType: string | null;
  status: 'active' | 'warning' | 'expired' | 'cancelled' | 'past_due' | 'pending' | null;
  maxServices: number | null;
  maxBookings: number | null;
  commissionRate: number | null;
  promoExpiresAt: Date | null;
}

const LIMIT_UNLIMITED = { services: 0, bookings: 0 };
const FUNNEL_EVENTS = new Set([
  'view_plan',
  'promo_validated',
  'registration_completed',
  'promo_activated',
  'converted_to_paid'
]);

export function isValidFunnelEvent(event: string): boolean {
  return FUNNEL_EVENTS.has(event);
}

export async function logFunnelEvent(connection: any, payload: {
  event: string;
  email?: string | null;
  providerId?: number | null;
  promoCode?: string | null;
  metadata?: Record<string, any> | null;
}) {
  if (!payload?.event || !FUNNEL_EVENTS.has(payload.event)) {
    return;
  }
  try {
    await connection.execute(
      `INSERT INTO subscription_funnel_events (event_type, email, provider_id, promo_code, metadata)
       VALUES (?, ?, ?, ?, ?)` ,
      [
        payload.event,
        payload.email ?? null,
        payload.providerId ?? null,
        payload.promoCode ?? null,
        payload.metadata ? JSON.stringify(payload.metadata) : null
      ]
    );
  } catch (err: any) {
    Logger.warn('SUBSCRIPTION_FUNNEL', 'No se pudo registrar evento de funnel', {
      event: payload.event,
      error: err?.message
    });
  }
}

export async function getProviderPlanLimits(providerId: number): Promise<ProviderPlanLimits> {
  const pool = DatabaseConnection.getPool();
  const [rows] = await pool.query(
    `SELECT 
        u.active_plan_id,
        s.status,
        s.promo_expires_at,
        p.plan_type,
        COALESCE(p.max_services, 0) AS max_services,
        COALESCE(p.max_bookings, 0) AS max_bookings,
        COALESCE(p.commission_rate, 0) AS commission_rate,
        p.metadata
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status IN ('active','warning','past_due')
     LEFT JOIN plans p ON p.id = COALESCE(s.plan_id, u.active_plan_id)
     WHERE u.id = ?
     LIMIT 1`,
    [providerId]
  );

  if ((rows as any[]).length === 0) {
    return {
      providerId,
      planId: null,
      planType: null,
      status: null,
      maxServices: LIMIT_UNLIMITED.services,
      maxBookings: LIMIT_UNLIMITED.bookings,
      commissionRate: null,
      promoExpiresAt: null,
      ...getDefaultPlanFeatures()
    };
  }

  const row = (rows as any[])[0];
  const features = parsePlanMetadata(row.metadata);

  return {
    providerId,
    planId: row.active_plan_id || null,
    planType: row.plan_type || null,
    status: row.status || null,
    maxServices: row.max_services !== null ? Number(row.max_services) : LIMIT_UNLIMITED.services,
    maxBookings: row.max_bookings !== null ? Number(row.max_bookings) : LIMIT_UNLIMITED.bookings,
    commissionRate: row.commission_rate !== null ? Number(row.commission_rate) : null,
    promoExpiresAt: row.promo_expires_at ? new Date(row.promo_expires_at) : null,
    ...features
  };
}

export async function ensureServiceLimit(providerId: number) {
  const pool = DatabaseConnection.getPool();
  const limits = await getProviderPlanLimits(providerId);
  if (!limits.maxServices || limits.maxServices <= 0) {
    return limits;
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM provider_services
      WHERE provider_id = ?
        AND (is_active IS NULL OR is_active = TRUE)`,
    [providerId]
  );

  const countRow = Array.isArray(countRows) ? (countRows as any[])[0] : countRows;
  const current = Number(countRow?.total ?? 0);
  if (current >= limits.maxServices) {
    const message = `Has alcanzado el máximo de ${limits.maxServices} servicios para tu plan actual.`;
    const error: any = new Error(message);
    error.code = 'SERVICE_LIMIT_REACHED';
    error.statusCode = 409;
    throw error;
  }

  return limits;
}

export async function ensureBookingLimit(providerId: number, targetDate: Date) {
  const pool = DatabaseConnection.getPool();
  const limits = await getProviderPlanLimits(providerId);
  if (!limits.maxBookings || limits.maxBookings <= 0) {
    return limits;
  }

  const startOfMonth = new Date(targetDate);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(startOfMonth);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM appointments
      WHERE provider_id = ?
        AND status IN ('confirmed','completed')
        AND appointment_date >= ?
        AND appointment_date < ?`,
    [providerId, startOfMonth, endOfMonth]
  );

  const countRow = Array.isArray(countRows) ? (countRows as any[])[0] : countRows;
  const current = Number(countRow?.total ?? 0);
  if (current >= limits.maxBookings) {
    const message = `Has alcanzado el máximo de ${limits.maxBookings} reservas mensuales permitidas por tu plan.`;
    const error: any = new Error(message);
    error.code = 'BOOKING_LIMIT_REACHED';
    error.statusCode = 409;
    throw error;
  }

  return limits;
}

