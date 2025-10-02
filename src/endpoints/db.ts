import { Router } from 'express';
import { pool } from '../lib/db';

export function mountDb(router: Router) {
  router.get('/db/health', async (_req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      res.json({ ok: true, db: 'up' });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'db error' });
    }
  });
}
