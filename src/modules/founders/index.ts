import { Express, Request, Response, Router } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import { Logger } from '../../shared/utils/logger.util';
import { FOUNDER_COMMUNE_CODES } from './founder-codes.data';

const MODULE = 'FOUNDER_CODES';
const ADMIN_EMAIL = (process.env.FOUNDER_ADMIN_EMAIL || 'juanpablojpw@gmail.com').toLowerCase();
const STATUS_CRON_INTERVAL = Number(process.env.FOUNDER_CODES_CRON_INTERVAL_MS || 1000 * 60 * 60 * 6); // 6 horas

function ensureFounderAdmin(req: Request): boolean {
  const user = (req as any)?.user;
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  return email === ADMIN_EMAIL;
}

async function listFounderCodes() {
  const pool = DatabaseConnection.getPool();
  const [rows] = await pool.query(
    `SELECT 
        id,
        code,
        commune,
        region,
        category,
        max_uses,
        current_uses,
        benefit_months,
        status,
        valid_from,
        valid_until,
        metadata
       FROM founder_codes
      ORDER BY CASE WHEN category = 'region' THEN 0 ELSE 1 END,
               commune ASC`
  );

  const map = new Map<string, any>();
  (rows as any[]).forEach((row) => map.set(row.code, row));

  for (const seed of FOUNDER_COMMUNE_CODES) {
    if (!map.has(seed.code)) {
      map.set(seed.code, {
        id: null,
        code: seed.code,
        commune: seed.commune,
        region: seed.region,
        category: seed.code === 'FUNDADORRM' ? 'region' : 'commune',
        max_uses: seed.maxUses,
        current_uses: 0,
        benefit_months: 3,
        status: 'disabled',
        valid_from: null,
        valid_until: null,
        metadata: null
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.commune.localeCompare(b.commune));
}

function toCsvValue(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function runFounderStatusCron() {
  try {
    const pool = DatabaseConnection.getPool();
    await pool.execute(
      `UPDATE founder_codes
          SET status = 'expired',
              updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active'
          AND valid_until < NOW()`
    );
    await pool.execute(
      `UPDATE founder_codes
          SET status = 'active',
              updated_at = CURRENT_TIMESTAMP
        WHERE status = 'expired'
          AND valid_until >= NOW()
          AND (max_uses IS NULL OR current_uses < max_uses)`
    );
  } catch (error: any) {
    Logger.error(MODULE, 'Founder status cron failed', { error: error?.message });
  }
}

function scheduleFounderStatusCron() {
  Logger.info(MODULE, `Scheduling founder code cron every ${Math.round(STATUS_CRON_INTERVAL / 1000 / 60)} min`);
  runFounderStatusCron().catch((err) => Logger.error(MODULE, 'Initial cron run failed', err));
  setInterval(() => {
    runFounderStatusCron().catch((err) => Logger.error(MODULE, 'Cron run failed', err));
  }, STATUS_CRON_INTERVAL);
}

export function setupFounderModule(app: Express) {
  const router = Router();

  router.get('/founder-codes', authenticateToken, async (req: Request, res: Response) => {
    try {
      if (!ensureFounderAdmin(req)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      const rows = await listFounderCodes();
      res.json({ ok: true, codes: rows });
    } catch (error: any) {
      Logger.error(MODULE, 'Error listing founder codes', { error: error?.message });
      res.status(500).json({ ok: false, error: 'No fue posible obtener los códigos Fundador.' });
    }
  });

  router.get('/founder-codes/export.csv', authenticateToken, async (req: Request, res: Response) => {
    try {
      if (!ensureFounderAdmin(req)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      const rows = await listFounderCodes();
      const header = [
        'code',
        'commune',
        'region',
        'category',
        'max_uses',
        'current_uses',
        'remaining',
        'benefit_months',
        'valid_from',
        'valid_until',
        'status'
      ];
      const lines = rows.map((row: any) => {
        const remaining = row.max_uses !== null && row.max_uses !== undefined
          ? Math.max(0, Number(row.max_uses) - Number(row.current_uses || 0))
          : '';
        return [
          row.code,
          row.commune,
          row.region,
          row.category,
          row.max_uses ?? '',
          row.current_uses ?? 0,
          remaining,
          row.benefit_months ?? 3,
          row.valid_from ? new Date(row.valid_from).toISOString() : '',
          row.valid_until ? new Date(row.valid_until).toISOString() : '',
          row.status
        ].map(toCsvValue).join(',');
      });

      const csv = [header.map(toCsvValue).join(','), ...lines].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="founder-codes.csv"');
      res.send(csv);
    } catch (error: any) {
      Logger.error(MODULE, 'Error exporting founder codes', { error: error?.message });
      res.status(500).json({ ok: false, error: 'No fue posible exportar los códigos Fundador.' });
    }
  });

  app.use(router);
  scheduleFounderStatusCron();
}

