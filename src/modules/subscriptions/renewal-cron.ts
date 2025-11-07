import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { PushService } from '../notifications/services/push.service';

const MODULE = 'SUBSCRIPTION_CRON';
const DEFAULT_INTERVAL_MS = 1000 * 60 * 60; // 1 hora

async function fetchFallbackPlanId(connection: any): Promise<number | null> {
  const [rows] = await connection.query(
    `SELECT id FROM plans
      WHERE is_active = TRUE
      ORDER BY CASE WHEN plan_type = 'free' THEN 0 ELSE 1 END, price ASC
      LIMIT 1`
  );
  return (rows as any[])[0]?.id || null;
}

async function processWarnings(connection: any) {
  const [rows] = await connection.query(
    `SELECT 
        s.id,
        s.user_id,
        s.plan_id,
        TIMESTAMPDIFF(DAY, NOW(), s.promo_expires_at) AS days_remaining
      FROM subscriptions s
      WHERE s.plan_origin = 'promo'
        AND s.status IN ('active','warning')
        AND s.promo_expires_at IS NOT NULL
        AND TIMESTAMPDIFF(DAY, NOW(), s.promo_expires_at) BETWEEN 1 AND 15
        AND (s.warning_sent_at IS NULL OR s.warning_sent_at < DATE_SUB(NOW(), INTERVAL 1 DAY))`
  );

  for (const row of rows as any[]) {
    try {
      await connection.execute(
        `UPDATE subscriptions
           SET status = 'warning', warning_sent_at = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [row.id]
      );

      await connection.execute(
        `INSERT INTO provider_subscription_events (subscription_id, event_type, new_status, metadata)
         VALUES (?, 'warning_sent', 'warning', JSON_OBJECT('days_remaining', ?, 'source', 'cron'))`,
        [row.id, row.days_remaining]
      );

      const message = row.days_remaining === 1
        ? 'Tu plan Fundador expira mañana. Elige un plan para no perder tus clientes.'
        : `Tu plan Fundador expira en ${row.days_remaining} días. Elige un plan para mantener tus servicios activos.`;

      try {
        await PushService.notifyUser(row.user_id, 'Tu Plan Fundador está por expirar', message, {
          type: 'subscription_warning',
          days_remaining: row.days_remaining
        });
      } catch (pushErr) {
        Logger.warn(MODULE, 'No se pudo enviar push de warning', { userId: row.user_id, error: pushErr?.message });
      }
    } catch (err: any) {
      Logger.error(MODULE, 'Error procesando warning de suscripción', { subscriptionId: row.id, error: err.message });
    }
  }
}

async function processExpirations(connection: any) {
  const fallbackPlanId = await fetchFallbackPlanId(connection);

  const [rows] = await connection.query(
    `SELECT 
        s.id,
        s.user_id,
        s.plan_id,
        s.promo_expires_at
      FROM subscriptions s
      WHERE s.plan_origin = 'promo'
        AND s.status IN ('active','warning','past_due')
        AND s.promo_expires_at IS NOT NULL
        AND s.promo_expires_at <= NOW()
        AND (s.expired_notified_at IS NULL OR s.expired_notified_at < DATE_SUB(NOW(), INTERVAL 12 HOUR))`
  );

  for (const row of rows as any[]) {
    const transaction = await connection.getConnection();
    try {
      await transaction.beginTransaction();

      await transaction.execute(
        `UPDATE subscriptions
           SET status = 'expired', expired_notified_at = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [row.id]
      );

      if (fallbackPlanId) {
        await transaction.execute(
          `UPDATE users SET active_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [fallbackPlanId, row.user_id]
        );
      }

      await transaction.execute(
        `INSERT INTO provider_subscription_events (subscription_id, event_type, new_status, metadata)
         VALUES (?, 'expired', 'expired', JSON_OBJECT('promo_expires_at', ?, 'source', 'cron'))`,
        [row.id, row.promo_expires_at]
      );

      await transaction.commit();

      try {
        await PushService.notifyUser(row.user_id, 'Tu Plan Fundador expiró', 'Selecciona un plan de pago para reactivar tus servicios y seguir recibiendo clientes.', {
          type: 'subscription_expired'
        });
      } catch (pushErr) {
        Logger.warn(MODULE, 'No se pudo enviar push de expiración', { userId: row.user_id, error: pushErr?.message });
      }
    } catch (err: any) {
      await transaction.rollback();
      Logger.error(MODULE, 'Error procesando expiración de suscripción', { subscriptionId: row.id, error: err.message });
    } finally {
      transaction.release();
    }
  }
}

async function runSubscriptionCron() {
  try {
    const pool = DatabaseConnection.getPool();
    await processWarnings(pool);
    await processExpirations(pool);
  } catch (err: any) {
    Logger.error(MODULE, 'Error en ciclo de renovación de suscripciones', err);
  }
}

export function setupSubscriptionRenewalCron() {
  const intervalMs = Number(process.env.SUBSCRIPTION_CRON_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  Logger.info(MODULE, `Iniciando cron de suscripciones (intervalo ${intervalMs / 1000 / 60} minutos)`);

  runSubscriptionCron().catch(err => Logger.error(MODULE, 'Cron inicial falló', err));
  setInterval(() => {
    runSubscriptionCron().catch(err => Logger.error(MODULE, 'Cron ejecutado con error', err));
  }, intervalMs);
}


