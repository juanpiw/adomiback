import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'PROVIDER_FINANCES';

export function buildProviderFinancesRoutes(): Router {
  const router = Router();

  // GET /provider/finances/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/provider/finances/summary', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const pool = DatabaseConnection.getPool();

      const params: any[] = [providerId];
      let where = 'WHERE p.provider_id = ? AND p.status IN (\'completed\', \'succeeded\')';
      if (from) { where += ' AND DATE(p.paid_at) >= ?'; params.push(from); }
      if (to) { where += ' AND DATE(p.paid_at) <= ?'; params.push(to); }

      const [rows] = await pool.query(
        `SELECT 
           COALESCE(SUM(p.amount), 0) AS gross_amount,
           COALESCE(SUM(p.commission_amount), 0) AS commission_amount,
           COALESCE(SUM(p.provider_amount), 0) AS provider_net
         FROM payments p
         ${where}`,
        params
      );
      const sum = (rows as any[])[0] || { gross_amount: 0, commission_amount: 0, provider_net: 0 };

      // Métrica adicional: citas pagadas en efectivo últimos 7 días
      let cashPaidCount = 0;
      try {
        const [[cnt]]: any = await pool.query(
          `SELECT COUNT(1) AS c
           FROM payments
           WHERE provider_id = ?
             AND status IN ('completed','succeeded')
             AND payment_method = 'cash'
             AND paid_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
          [providerId]
        );
        cashPaidCount = Number(cnt?.c || 0);
      } catch {}

      // Métrica adicional: deuda de comisiones cash pendiente
      let cashCommissionDebt = 0;
      try {
        const [[d]]: any = await pool.query(
          `SELECT COALESCE(SUM(commission_amount),0) AS due
           FROM provider_commission_debts
           WHERE provider_id = ? AND status IN ('pending','overdue')`,
          [providerId]
        );
        cashCommissionDebt = Number(d?.due || 0);
      } catch {}

      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, summary: { ...sum, cashPaidCount, cashCommissionDebt } });
    } catch (err) {
      Logger.error(MODULE, 'Error getting finances summary', err as any);
      return res.status(500).json({ success: false, error: 'Error al obtener resumen' });
    }
  });

  // GET /provider/finances/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50&offset=0
  router.get('/provider/finances/transactions', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const limit = Math.min(Number(req.query.limit || 50), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const pool = DatabaseConnection.getPool();

      const paramsCount: any[] = [providerId];
      const params: any[] = [providerId];
      let where = 'WHERE p.provider_id = ? AND p.status IN (\'completed\', \'succeeded\')';
      if (from) { where += ' AND DATE(p.paid_at) >= ?'; params.push(from); paramsCount.push(from); }
      if (to) { where += ' AND DATE(p.paid_at) <= ?'; params.push(to); paramsCount.push(to); }

      const [rows] = await pool.query(
        `SELECT p.id, p.paid_at, p.amount, p.commission_amount, p.provider_amount, p.currency,
                a.id AS appointment_id, a.date, a.start_time, a.service_id,
                (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
                (SELECT name FROM users WHERE id = a.client_id) AS client_name
         FROM payments p
         JOIN appointments a ON a.id = p.appointment_id
         ${where}
         ORDER BY p.paid_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      const [cnt] = await pool.query(
        `SELECT COUNT(1) AS total
         FROM payments p
         ${where}`,
        paramsCount
      );
      return res.json({ success: true, transactions: rows, total: (cnt as any[])[0]?.total || 0 });
    } catch (err) {
      Logger.error(MODULE, 'Error getting transactions', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar transacciones' });
    }
  });

  // GET /provider/cash/summary
  router.get('/provider/cash/summary', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const pool = DatabaseConnection.getPool();
      const [[sum]]: any = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN status IN ('pending','overdue') THEN commission_amount ELSE 0 END), 0) AS total_due,
           COALESCE(SUM(CASE WHEN status = 'overdue' THEN commission_amount ELSE 0 END), 0) AS overdue_due,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
           SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count
         FROM provider_commission_debts
         WHERE provider_id = ?`,
        [providerId]
      );
      const [[last]]: any = await pool.query(
        `SELECT id, commission_amount, currency, status, due_date, created_at
           FROM provider_commission_debts
          WHERE provider_id = ?
          ORDER BY created_at DESC
          LIMIT 1`,
        [providerId]
      );
      return res.json({
        success: true,
        summary: {
          total_due: Number(sum?.total_due || 0),
          overdue_due: Number(sum?.overdue_due || 0),
          pending_count: Number(sum?.pending_count || 0),
          overdue_count: Number(sum?.overdue_count || 0),
          paid_count: Number(sum?.paid_count || 0),
          last_debt: last ? {
            id: last.id,
            commission_amount: Number(last.commission_amount || 0),
            currency: last.currency || 'CLP',
            status: last.status || null,
            due_date: last.due_date,
            created_at: last.created_at
          } : null
        }
      });
    } catch (err) {
      Logger.error(MODULE, 'Error getting cash summary', err as any);
      return res.status(500).json({ success: false, error: 'Error al obtener resumen de efectivo' });
    }
  });

  // GET /provider/cash/commissions?status=pending|overdue|paid&limit=100&offset=0
  router.get('/provider/cash/commissions', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const status = String(req.query.status || '').trim();
      const limit = Math.min(Number(req.query.limit || 100), 500);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const pool = DatabaseConnection.getPool();
      const params: any[] = [providerId];
      const where: string[] = ['d.provider_id = ?'];
      if (status && ['pending','overdue','paid','cancelled'].includes(status)) {
        where.push('d.status = ?'); params.push(status);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `SELECT d.id, d.commission_amount, d.currency, d.status, d.due_date, d.settlement_reference, d.voucher_url,
                a.id AS appointment_id, a.date, a.start_time, a.end_time,
                (SELECT name FROM users WHERE id = a.client_id) AS client_name
         FROM provider_commission_debts d
         LEFT JOIN appointments a ON a.id = d.appointment_id
         ${whereSql}
         ORDER BY d.due_date ASC, d.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return res.json({ success: true, data: rows });
    } catch (err) {
      Logger.error(MODULE, 'Error listing cash commissions', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar comisiones cash' });
    }
  });

  return router;
}


