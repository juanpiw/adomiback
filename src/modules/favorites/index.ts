import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import { Logger } from '../../shared/utils/logger.util';

const MODULE = 'FAVORITES';

function buildRouter(): Router {
  const router = Router();

  // Ensure table exists
  async function ensureTable() {
    const pool = DatabaseConnection.getPool();
    await pool.query(`CREATE TABLE IF NOT EXISTS favorites (
      client_id INT NOT NULL,
      provider_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (client_id, provider_id)
    )`);
  }

  // GET /client/favorites
  router.get('/client/favorites', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      await ensureTable();
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT f.provider_id AS id,
                u.name AS name,
                pp.professional_title AS role,
                COALESCE(AVG(r.rating), 0) AS rating
         FROM favorites f
         JOIN users u ON u.id = f.provider_id
         LEFT JOIN provider_profiles pp ON pp.provider_id = f.provider_id
         LEFT JOIN reviews r ON r.provider_id = f.provider_id
         WHERE f.client_id = ?
         GROUP BY f.provider_id, u.name, pp.professional_title
         ORDER BY MAX(f.created_at) DESC`,
        [clientId]
      );
      return res.json({ success: true, favorites: rows });
    } catch (err) {
      Logger.error(MODULE, 'Error listing favorites', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar favoritos' });
    }
  });

  // POST /client/favorites { provider_id }
  router.post('/client/favorites', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      const providerId = Number(req.body?.provider_id);
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      if (!providerId) return res.status(400).json({ success: false, error: 'provider_id requerido' });
      await ensureTable();
      const pool = DatabaseConnection.getPool();
      // Validar que provider existe
      const [p] = await pool.query(`SELECT id FROM users WHERE id = ? AND role = 'provider' LIMIT 1`, [providerId]);
      if ((p as any[]).length === 0) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
      await pool.execute(
        `INSERT INTO favorites (client_id, provider_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP`,
        [clientId, providerId]
      );
      return res.status(201).json({ success: true });
    } catch (err) {
      Logger.error(MODULE, 'Error adding favorite', err as any);
      return res.status(500).json({ success: false, error: 'Error al agregar favorito' });
    }
  });

  // DELETE /client/favorites/:providerId
  router.delete('/client/favorites/:providerId', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      const providerId = Number(req.params.providerId);
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      await ensureTable();
      const pool = DatabaseConnection.getPool();
      await pool.execute(`DELETE FROM favorites WHERE client_id = ? AND provider_id = ?`, [clientId, providerId]);
      return res.json({ success: true });
    } catch (err) {
      Logger.error(MODULE, 'Error removing favorite', err as any);
      return res.status(500).json({ success: false, error: 'Error al eliminar favorito' });
    }
  });

  return router;
}

export function setupFavoritesModule(app: Express) {
  app.use('/', buildRouter());
  Logger.info(MODULE, 'Favorites routes mounted');
}


