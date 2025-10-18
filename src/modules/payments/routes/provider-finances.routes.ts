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
      return res.json({ success: true, summary: sum });
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

  return router;
}


