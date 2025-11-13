import DatabaseConnection from '../../shared/database/connection';

const PREMIUM_PLAN_MIN_ID = Number(process.env.QUOTES_MIN_PLAN_ID ?? 2);

export async function ensureQuotesFeature(providerId: number): Promise<void> {
  const pool = DatabaseConnection.getPool();
  const [[row]]: any = await pool.query(
    `
      SELECT 
        u.active_plan_id,
        COALESCE(p.plan_type, 'paid') AS plan_type,
        p.name AS plan_name
      FROM users u
      LEFT JOIN plans p ON p.id = u.active_plan_id
      WHERE u.id = ?
      LIMIT 1
    `,
    [providerId]
  );

  const planId = Number(row?.active_plan_id ?? 0);
  const planType = String(row?.plan_type ?? '').toLowerCase();

  const allowedPlanTypes = new Set<string>(
    (process.env.QUOTES_ALLOWED_PLAN_TYPES ?? 'premium,founder').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  );

  const allowAll = process.env.QUOTES_FEATURE_ALLOW_ALL === 'true';

  if (allowAll) {
    return;
  }

  if (planId >= PREMIUM_PLAN_MIN_ID) {
    return;
  }

  if (planType && allowedPlanTypes.has(planType)) {
    return;
  }

  const err: any = new Error('Tu plan actual no incluye el módulo de cotizaciones. Actualiza tu suscripción para continuar.');
  err.code = 'QUOTES_FEATURE_LOCKED';
  err.statusCode = 403;
  throw err;
}

