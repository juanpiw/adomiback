import DatabaseConnection from '../../shared/database/connection';
import { Logger } from '../../shared/utils/logger.util';
import { PushService } from '../notifications/services/push.service';

const MODULE = 'CLOSURE_CRON';

function toDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  try {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const [hh, mm] = String(timeStr).slice(0, 5).split(':').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

async function activatePendingClose(offsetMinutes: number) {
  const pool = DatabaseConnection.getPool();
  // Seleccionar citas cash sin cierre marcadas, cuya hora de fin + offset ya pasó
  const [rows]: any = await pool.query(
    `SELECT id, client_id, provider_id, date, end_time
     FROM appointments
     WHERE payment_method = 'cash'
       AND closure_state = 'none'
       AND status IN ('confirmed','in_progress','completed')`
  );

  const now = new Date();
  for (const a of rows as any[]) {
    const endDt = toDateTime(String(a.date), String(a.end_time));
    if (!endDt) continue;
    const activateAt = new Date(endDt.getTime() + offsetMinutes * 60_000);
    if (now >= activateAt) {
      try {
        await pool.execute(
          `UPDATE appointments
             SET closure_state = 'pending_close',
                 closure_due_at = DATE_ADD(CONCAT(date, ' ', end_time), INTERVAL ? HOUR),
                 updated_at = NOW()
           WHERE id = ? AND closure_state = 'none'`,
          [25, a.id]
        );
        try {
          await PushService.notifyUser(Number(a.provider_id), 'Pendiente de Cierre', 'Confirma el cierre de tu cita (efectivo).', { type: 'closure', appointment_id: String(a.id) });
        } catch {}
        try {
          await PushService.notifyUser(Number(a.client_id), 'Pendiente de Cierre', 'Confirma si tu servicio se completó correctamente.', { type: 'closure', appointment_id: String(a.id) });
        } catch {}
      } catch (e) {
        Logger.error(MODULE, 'activatePendingClose error', e as any);
      }
    }
  }
}

async function autoResolveClose() {
  const pool = DatabaseConnection.getPool();
  const [rows]: any = await pool.query(
    `SELECT id, provider_id, client_id, price, closure_provider_action, closure_client_action
       FROM appointments
      WHERE closure_state = 'pending_close'
        AND closure_due_at IS NOT NULL
        AND closure_due_at < NOW()`
  );
  for (const a of rows as any[]) {
    try {
      const providerAction = String(a.closure_provider_action || 'none');
      const clientAction = String(a.closure_client_action || 'none');

      // Si coincide no_show + no_show → resolver sin comisión
      if (providerAction === 'no_show' && clientAction === 'no_show') {
        await pool.execute(`UPDATE appointments SET closure_state = 'resolved', updated_at = NOW() WHERE id = ?`, [a.id]);
        continue;
      }

      // Si ya hay payment completed, solo resolver
      const [[pay]]: any = await pool.query(`SELECT id FROM payments WHERE appointment_id = ? AND status = 'completed' LIMIT 1`, [a.id]);
      if (pay) {
        await pool.execute(`UPDATE appointments SET closure_state = 'resolved', updated_at = NOW() WHERE id = ?`, [a.id]);
        continue;
      }

      // Si cliente dijo OK o no hay acciones (gatillo), generar payment cash + deuda
      if (clientAction === 'ok' || providerAction === 'code_entered' || (providerAction === 'none' && clientAction === 'none')) {
        const amount = Number(a.price || 0);
        // Cargar settings
        let taxRate = 19.0, commissionRate = 15.0, dueDays = 3, cashCap = 150000;
        try {
          const [setRows]: any = await pool.query(`SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ('default_tax_rate','default_commission_rate','cash_commission_due_days','cash_max_amount')`);
          for (const r of setRows as any[]) {
            if (r.setting_key === 'default_tax_rate') taxRate = Number(r.setting_value) || taxRate;
            if (r.setting_key === 'default_commission_rate') commissionRate = Number(r.setting_value) || commissionRate;
            if (r.setting_key === 'cash_commission_due_days') dueDays = Number(r.setting_value) || dueDays;
            if (r.setting_key === 'cash_max_amount') cashCap = Number(r.setting_value) || cashCap;
          }
        } catch {}
        if (amount > cashCap) {
          await pool.execute(`UPDATE appointments SET closure_state = 'resolved', updated_at = NOW() WHERE id = ?`, [a.id]);
          continue;
        }
        const priceBase = Number((amount / (1 + taxRate / 100)).toFixed(2));
        const taxAmount = Number((amount - priceBase).toFixed(2));
        const commissionAmount = Number((priceBase * (commissionRate / 100)).toFixed(2));
        const providerAmount = Number((priceBase - commissionAmount).toFixed(2));
        const [[ids]]: any = await pool.query(`SELECT provider_id, client_id FROM appointments WHERE id = ? LIMIT 1`, [a.id]);
        const providerId = Number(ids?.provider_id || 0);
        const clientId = Number(ids?.client_id || 0);
        const [ins]: any = await pool.execute(
          `INSERT INTO payments (appointment_id, client_id, provider_id, amount, tax_amount, commission_amount, provider_amount, currency, payment_method, status, paid_at, can_release, release_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'CLP', 'cash', 'completed', NOW(), TRUE, 'eligible')`,
          [a.id, clientId, providerId, amount, taxAmount, commissionAmount, providerAmount]
        );
        const paymentId = ins.insertId;
        try {
          await pool.execute(
            `INSERT INTO provider_commission_debts (provider_id, appointment_id, payment_id, commission_amount, currency, status, due_date, created_at)
             VALUES (?, ?, ?, ?, 'CLP', 'pending', DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
            [providerId, a.id, paymentId, commissionAmount, dueDays]
          );
        } catch {}
        await pool.execute(`UPDATE appointments SET closure_state = 'resolved', updated_at = NOW() WHERE id = ?`, [a.id]);
      } else {
        // Cualquier otra combinación: resolver sin generar payment
        await pool.execute(`UPDATE appointments SET closure_state = 'resolved', updated_at = NOW() WHERE id = ?`, [a.id]);
      }
    } catch (e) {
      Logger.error(MODULE, 'autoResolveClose error', e as any);
    }
  }
}

export function setupClosureCron() {
  const activateOffsetMin = Number(process.env.CLOSURE_ACTIVATE_OFFSET_MIN || 60);
  const intervalMs = Math.max(60_000, Number(process.env.CLOSURE_CRON_INTERVAL_MS || 300_000)); // default 5 min

  // Primera ejecución diferida 30s
  setTimeout(() => {
    activatePendingClose(activateOffsetMin).catch(() => {});
    autoResolveClose().catch(() => {});
  }, 30_000);

  setInterval(() => {
    activatePendingClose(activateOffsetMin).catch(() => {});
    autoResolveClose().catch(() => {});
  }, intervalMs);

  Logger.info(MODULE, `Closure cron started (activate +${activateOffsetMin}m, interval ${Math.round(intervalMs/1000)}s)`);
}


