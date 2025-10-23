import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import { Logger } from '../../shared/utils/logger.util';

const MODULE = 'FAVORITES';

function buildRouter(): Router {
  const router = Router();

  // Ensure table exists and has service_id for per-service favorites
  async function ensureTable() {
    const pool = DatabaseConnection.getPool();
    await pool.query(`CREATE TABLE IF NOT EXISTS favorites (
      client_id INT NOT NULL,
      provider_id INT NOT NULL,
      service_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (client_id, provider_id, service_id)
    )`);
    // Try to add service_id if the table existed without it; ignore errors if already present
    try { await pool.query(`ALTER TABLE favorites ADD COLUMN service_id INT NULL`); } catch (e) {}
    // Ensure composite primary key (client_id, provider_id, service_id)
    try { await pool.query(`ALTER TABLE favorites DROP PRIMARY KEY, ADD PRIMARY KEY (client_id, provider_id, service_id)`); } catch (e) {}
  }

  // GET /client/favorites
  router.get('/client/favorites', authenticateToken, async (req: Request, res: Response) => {
    try {
      console.log('[FAVORITES] 🎯 GET /client/favorites recibido');
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      console.log('[FAVORITES] 👤 Usuario:', user, 'ClientId:', clientId);
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      await ensureTable();
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT 
            f.provider_id AS id,
            f.service_id AS service_id,
            u.name AS name,
            pp.professional_title AS role,
            COALESCE(AVG(r.rating), 0) AS rating,
            MAX(f.created_at) AS created_at
         FROM favorites f
         JOIN users u ON u.id = f.provider_id
         LEFT JOIN provider_profiles pp ON pp.provider_id = f.provider_id
         LEFT JOIN reviews r ON r.provider_id = f.provider_id
         WHERE f.client_id = ?
         GROUP BY f.provider_id, f.service_id, u.name, pp.professional_title
         ORDER BY created_at DESC`,
        [clientId]
      );
      return res.json({ success: true, favorites: rows });
    } catch (err) {
      Logger.error(MODULE, 'Error listing favorites', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar favoritos' });
    }
  });

  // POST /client/favorites { provider_id, service_id? }
  router.post('/client/favorites', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      const providerId = Number(req.body?.provider_id);
      const serviceId = req.body?.service_id != null ? Number(req.body?.service_id) : null;
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      if (!providerId) return res.status(400).json({ success: false, error: 'provider_id requerido' });
      await ensureTable();
      const pool = DatabaseConnection.getPool();
      // Validar que provider existe
      const [p] = await pool.query(`SELECT id FROM users WHERE id = ? AND role = 'provider' LIMIT 1`, [providerId]);
      if ((p as any[]).length === 0) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
      await pool.execute(
        `INSERT INTO favorites (client_id, provider_id, service_id) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP`,
        [clientId, providerId, serviceId]
      );
      return res.status(201).json({ success: true });
    } catch (err) {
      Logger.error(MODULE, 'Error adding favorite', err as any);
      return res.status(500).json({ success: false, error: 'Error al agregar favorito' });
    }
  });

  // DELETE /client/favorites/:providerId?serviceId=XXX
  router.delete('/client/favorites/:providerId', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const clientId = Number(user.id);
      const providerId = Number(req.params.providerId);
      const serviceId = req.query.serviceId != null ? Number(req.query.serviceId) : null;
      if (!clientId) return res.status(401).json({ success: false, error: 'No autorizado' });
      await ensureTable();
      const pool = DatabaseConnection.getPool();
      if (serviceId != null && !Number.isNaN(serviceId)) {
        await pool.execute(`DELETE FROM favorites WHERE client_id = ? AND provider_id = ? AND (service_id <=> ?)`, [clientId, providerId, serviceId]);
      } else {
        // Backward compat: elimina todos los favoritos de ese provider para el cliente
        await pool.execute(`DELETE FROM favorites WHERE client_id = ? AND provider_id = ?`, [clientId, providerId]);
      }
      return res.json({ success: true });
    } catch (err) {
      Logger.error(MODULE, 'Error removing favorite', err as any);
      return res.status(500).json({ success: false, error: 'Error al eliminar favorito' });
    }
  });

  return router;
}

export function setupFavoritesModule(app: Express) {
  console.log('❤️'.repeat(20));
  console.log('❤️ MÓDULO DE FAVORITOS INICIANDO ❤️');
  console.log('❤️'.repeat(20));
  console.log('[FAVORITES] 🚀 Inicializando módulo de favoritos...');
  console.log('[FAVORITES] 📁 Archivo: backend/src/modules/favorites/index.ts');
  console.log('[FAVORITES] 🎯 Montando rutas en app...');
  
  app.use('/', buildRouter());
  
  console.log('[FAVORITES] ✅ Rutas de favoritos montadas correctamente');
  console.log('[FAVORITES] 🔗 Endpoints disponibles:');
  console.log('[FAVORITES]   - GET /client/favorites');
  console.log('[FAVORITES]   - POST /client/favorites');
  console.log('[FAVORITES]   - DELETE /client/favorites/:providerId');
  console.log('[FAVORITES] 📊 Módulo de favoritos completamente inicializado');
  console.log('❤️'.repeat(20));
  console.log('❤️ MÓDULO DE FAVORITOS LISTO ❤️');
  console.log('❤️'.repeat(20));
  
  Logger.info(MODULE, 'Favorites routes mounted');
}


