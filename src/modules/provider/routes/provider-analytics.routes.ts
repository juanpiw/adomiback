import { Router, Request, Response } from 'express';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';
import { getProviderPlanLimits } from '../../../shared/utils/subscription.util';

const MODULE = 'PROVIDER_ANALYTICS_ROUTES';
const router = Router();

interface DateRange {
  from: Date;
  to: Date;
}

function requireProvider(user: AuthUser, providerId: number): boolean {
  return user.role === 'provider' && Number(user.id) === Number(providerId);
}

function parseRange(req: Request): DateRange {
  const toParam = req.query.to ? String(req.query.to) : null;
  const fromParam = req.query.from ? String(req.query.from) : null;

  const to = toParam ? new Date(toParam) : new Date();
  if (Number.isNaN(to.getTime())) {
    throw new Error('Fecha "to" inválida');
  }
  to.setHours(23, 59, 59, 999);

  const from = fromParam ? new Date(fromParam) : new Date(to);
  if (Number.isNaN(from.getTime())) {
    throw new Error('Fecha "from" inválida');
  }
  from.setMonth(from.getMonth() - 6);
  from.setHours(0, 0, 0, 0);

  if (from > to) {
    throw new Error('El rango de fechas es inválido');
  }

  return { from, to };
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function ensureAdvancedAnalytics(providerId: number) {
  const limits = await getProviderPlanLimits(providerId);
  if (limits.analyticsTier !== 'advanced') {
    const err: any = new Error('Tu plan actual no incluye el dashboard avanzado. Actualiza tu suscripción para acceder a estas métricas.');
    err.statusCode = 403;
    throw err;
  }
}

router.get('/providers/:id/analytics/summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || !requireProvider(user, providerId)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const { from, to } = parseRange(req);
    const planLimits = await getProviderPlanLimits(providerId);
    const canViewRatings = !!planLimits.clientRatingVisible;
    const pool = DatabaseConnection.getPool();

    const [[incomeRow]]: any = await pool.query(
      `SELECT COALESCE(SUM(provider_amount), 0) AS total_income
         FROM payments
        WHERE provider_id = ?
          AND status = 'completed'
          AND paid_at BETWEEN ? AND ?`,
      [providerId, from, to]
    );

    const [[appointmentRow]]: any = await pool.query(
      `SELECT COUNT(*) AS total_completed
         FROM appointments
        WHERE provider_id = ?
          AND status = 'completed'
          AND appointment_date BETWEEN ? AND ?`,
      [providerId, from, to]
    );

    const ratingQuery = canViewRatings
      ? await pool.query(
          `SELECT COALESCE(AVG(rating), 0) AS avg_rating,
                  COUNT(*) AS reviews_count
             FROM reviews
            WHERE provider_id = ?
              AND is_visible = TRUE
              AND created_at BETWEEN ? AND ?`,
          [providerId, from, to]
        )
      : [ [ { avg_rating: null, reviews_count: 0 } ] ];
    const [[ratingRow]]: any = ratingQuery;

    const [clientsRows]: any = await pool.query(
      `SELECT client_id, COUNT(*) AS visits
         FROM appointments
        WHERE provider_id = ?
          AND status = 'completed'
          AND appointment_date BETWEEN ? AND ?
        GROUP BY client_id`,
      [providerId, from, to]
    );

    const totalClients = clientsRows.length;
    const recurringClients = clientsRows.filter((row: any) => Number(row.visits || 0) >= 2).length;
    const recurringRate = totalClients > 0 ? Number(((recurringClients / totalClients) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      period: { from: toISO(from), to: toISO(to) },
      summary: {
        currency: 'CLP',
        totalIncome: Number(incomeRow?.total_income || 0),
        completedAppointments: Number(appointmentRow?.total_completed || 0),
        averageRating: canViewRatings && ratingRow?.avg_rating !== null && ratingRow?.avg_rating !== undefined
          ? Number(Number(ratingRow.avg_rating || 0).toFixed(2))
          : null,
        reviewsCount: canViewRatings ? Number(ratingRow?.reviews_count || 0) : 0,
        totalClients,
        recurringClients,
        recurringRate
      },
      planFeatures: {
        analyticsTier: planLimits.analyticsTier,
        csvExportEnabled: !!planLimits.csvExportEnabled,
        clientRatingVisible: canViewRatings
      }
    });
  } catch (error: any) {
    Logger.error(MODULE, 'Error fetching summary', error);
    const message = error?.message?.includes('Fecha') ? error.message : 'Error obteniendo resumen';
    return res.status(400).json({ success: false, error: message });
  }
});

router.get('/providers/:id/analytics/revenue-timeseries', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || !requireProvider(user, providerId)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    try {
      await ensureAdvancedAnalytics(providerId);
    } catch (planErr: any) {
      return res.status(planErr.statusCode || 403).json({ success: false, error: planErr.message });
    }

    const { from, to } = parseRange(req);
    const group = String(req.query.group || 'month').toLowerCase();
    const groupKey = group === 'week' ? '%x-%v' : '%Y-%m';

    const pool = DatabaseConnection.getPool();

    const [incomeRows]: any = await pool.query(
      `SELECT DATE_FORMAT(paid_at, ?) AS period,
              COALESCE(SUM(provider_amount), 0) AS income,
              COUNT(*) AS payments
         FROM payments
        WHERE provider_id = ?
          AND status = 'completed'
          AND paid_at BETWEEN ? AND ?
        GROUP BY period
        ORDER BY period`,
      [groupKey, providerId, from, to]
    );

    const [appointmentRows]: any = await pool.query(
      `SELECT DATE_FORMAT(appointment_date, ?) AS period,
              COUNT(*) AS appointments
         FROM appointments
        WHERE provider_id = ?
          AND status = 'completed'
          AND appointment_date BETWEEN ? AND ?
        GROUP BY period
        ORDER BY period`,
      [groupKey, providerId, from, to]
    );

    const map = new Map<string, { period: string; income: number; payments: number; appointments: number }>();

    incomeRows.forEach((row: any) => {
      const key = row.period;
      if (!key) return;
      map.set(key, {
        period: key,
        income: Number(row.income || 0),
        payments: Number(row.payments || 0),
        appointments: 0
      });
    });

    appointmentRows.forEach((row: any) => {
      const key = row.period;
      if (!key) return;
      const existing = map.get(key) || { period: key, income: 0, payments: 0, appointments: 0 };
      existing.appointments = Number(row.appointments || 0);
      map.set(key, existing);
    });

    const series = Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));

    return res.json({
      success: true,
      period: { from: toISO(from), to: toISO(to) },
      group,
      series
    });
  } catch (error: any) {
    Logger.error(MODULE, 'Error fetching revenue timeseries', error);
    const message = error?.message?.includes('Fecha') ? error.message : 'Error obteniendo series de ingresos';
    return res.status(400).json({ success: false, error: message });
  }
});

router.get('/providers/:id/analytics/services-top', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || !requireProvider(user, providerId)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    try {
      await ensureAdvancedAnalytics(providerId);
    } catch (planErr: any) {
      return res.status(planErr.statusCode || 403).json({ success: false, error: planErr.message });
    }

    const { from, to } = parseRange(req);
    const limit = Math.min(Number(req.query.limit || 5), 10);
    const pool = DatabaseConnection.getPool();

    let rows: any[] = [];
    try {
      const [primary]: any = await pool.query(
        `SELECT ps.id, ps.name,
                COUNT(*) AS bookings,
                COALESCE(SUM(pay.provider_amount), 0) AS income
           FROM appointments a
           JOIN provider_services ps ON ps.id = a.service_id
           LEFT JOIN payments pay ON pay.appointment_id = a.id AND pay.status = 'completed'
          WHERE a.provider_id = ?
            AND a.status = 'completed'
            AND a.appointment_date BETWEEN ? AND ?
          GROUP BY ps.id, ps.name
          ORDER BY bookings DESC, income DESC
          LIMIT ?`,
        [providerId, from, to, limit]
      );
      rows = primary;
    } catch (primaryError: any) {
      Logger.warn(MODULE, 'Fallo consulta de servicios con provider_services, usando fallback', {
        providerId,
        error: primaryError?.message || primaryError
      });

      const [fallback]: any = await pool.query(
        `SELECT 
            COALESCE(a.service_id, 0) AS service_id,
            COUNT(*) AS bookings,
            COALESCE(SUM(pay.provider_amount), 0) AS income
         FROM appointments a
         LEFT JOIN payments pay ON pay.appointment_id = a.id AND pay.status = 'completed'
        WHERE a.provider_id = ?
          AND a.status = 'completed'
          AND a.appointment_date BETWEEN ? AND ?
        GROUP BY COALESCE(a.service_id, 0)
        ORDER BY bookings DESC, income DESC
        LIMIT ?`,
        [providerId, from, to, limit]
      );

      rows = (fallback as any[]).map(row => ({
        id: row.service_id,
        name: row.service_id ? `Servicio #${row.service_id}` : 'Servicio sin identificar',
        bookings: Number(row.bookings || 0),
        income: Number(row.income || 0)
      }));

      return res.json({ success: true, period: { from: toISO(from), to: toISO(to) }, services: rows });
    }

    const services = rows.map((row: any) => ({
      serviceId: row.id,
      name: row.name,
      bookings: Number(row.bookings || 0),
      income: Number(row.income || 0)
    }));

    return res.json({ success: true, period: { from: toISO(from), to: toISO(to) }, services });
  } catch (error: any) {
    Logger.error(MODULE, 'Error fetching top services', error);
    const message = error?.message?.includes('Fecha') ? error.message : 'Error obteniendo ranking de servicios';
    return res.status(400).json({ success: false, error: message });
  }
});

router.get('/providers/:id/analytics/reviews', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!Number.isFinite(providerId) || !requireProvider(user, providerId)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    try {
      await ensureAdvancedAnalytics(providerId);
    } catch (planErr: any) {
      return res.status(planErr.statusCode || 403).json({ success: false, error: planErr.message });
    }

    const limit = Math.min(Number(req.query.limit || 5), 20);
    const pool = DatabaseConnection.getPool();

    const [rows]: any = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              COALESCE(c.name, 'Cliente') AS client_name,
              ps.name AS service_name
         FROM reviews r
         JOIN users c ON c.id = r.client_id
         LEFT JOIN appointments a ON a.id = r.appointment_id
         LEFT JOIN provider_services ps ON ps.id = a.service_id
        WHERE r.provider_id = ?
          AND r.is_visible = TRUE
        ORDER BY r.created_at DESC
        LIMIT ?`,
      [providerId, limit]
    );

    const reviews = rows.map((row: any) => ({
      id: row.id,
      rating: Number(row.rating || 0),
      comment: row.comment || null,
      createdAt: row.created_at,
      clientName: row.client_name,
      serviceName: row.service_name || null
    }));

    return res.json({ success: true, reviews });
  } catch (error: any) {
    Logger.error(MODULE, 'Error fetching reviews', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo reseñas' });
  }
});

export default router;


