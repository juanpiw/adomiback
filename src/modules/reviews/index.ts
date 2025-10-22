import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import { authenticateToken } from '../../shared/middleware/auth.middleware';
import { Logger } from '../../shared/utils/logger.util';

const MODULE = 'REVIEWS';

function buildRouter(): Router {
  const router = Router();

  // POST /reviews – crear reseña de una cita completada
  router.post('/reviews', authenticateToken, async (req: Request, res: Response) => {
    try {
      console.log('[REVIEWS] 🎯 POST /reviews recibido');
      console.log('[REVIEWS] 📦 Body completo:', JSON.stringify(req.body, null, 2));
      console.log('[REVIEWS] 🔐 Usuario autenticado:', (req as any).user);
      
      const user = (req as any).user || {};
      const { appointment_id, provider_id, rating, comment } = req.body || {};
      
      console.log('[REVIEWS] 📋 Datos extraídos:', { appointment_id, provider_id, rating, comment });
      if (!appointment_id || !provider_id || !Number.isFinite(Number(rating))) {
        console.warn('[REVIEWS] validation failed', { appointment_id, provider_id, rating });
        return res.status(400).json({ success: false, error: 'appointment_id, provider_id y rating son requeridos' });
      }
      const stars = Math.max(1, Math.min(5, Number(rating)));
      const pool = DatabaseConnection.getPool();

      // Validar que la cita existe, pertenece al cliente actual y está completada
      const [rows] = await pool.query(
        `SELECT id, client_id, provider_id, status FROM appointments WHERE id = ? LIMIT 1`,
        [appointment_id]
      );
      if ((rows as any[]).length === 0) {
        console.warn('[REVIEWS] appointment not found', { appointment_id });
        return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      }
      const appt = (rows as any[])[0];
      if (Number(appt.client_id) !== Number(user.id)) {
        console.warn('[REVIEWS] forbidden: client mismatch', { user_id: user.id, appt_client_id: appt.client_id });
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }
      if (String(appt.status) !== 'completed') {
        console.warn('[REVIEWS] invalid status for review', { appt_status: appt.status });
        return res.status(400).json({ success: false, error: 'La cita debe estar completada para reseñar' });
      }

      // Crear tabla si no existe (simple safeguard)
      await pool.query(`CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_id INT NOT NULL,
        provider_id INT NOT NULL,
        client_id INT NOT NULL,
        rating TINYINT NOT NULL,
        comment TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

      await pool.execute(
        `INSERT INTO reviews (appointment_id, provider_id, client_id, rating, comment)
         VALUES (?, ?, ?, ?, ?)`,
        [appointment_id, provider_id, user.id, stars, comment || null]
      );
      console.log('[REVIEWS] review created', { appointment_id, provider_id, client_id: user.id, stars });
      Logger.info(MODULE, `Review creada para cita ${appointment_id} por cliente ${user.id}`);
      return res.json({ success: true, review: { appointment_id, provider_id, rating: stars, comment: comment || null } });
    } catch (err) {
      console.error('[REVIEWS] error creating review:', (err as any)?.message, (err as any)?.stack);
      Logger.error(MODULE, 'Error creando review', err as any);
      return res.status(500).json({ success: false, error: 'Error al crear reseña' });
    }
  });

  // GET /providers/:id/reviews – listar reseñas de un proveedor
  router.get('/providers/:id/reviews', async (req: Request, res: Response) => {
    try {
      const providerId = Number(req.params.id);
      console.log('[REVIEWS][GET /providers/:id/reviews] providerId=', providerId);
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(
        `SELECT r.*, 
                (SELECT name FROM users WHERE id = r.client_id) AS client_name
         FROM reviews r
         WHERE r.provider_id = ?
         ORDER BY r.created_at DESC`,
        [providerId]
      );
      console.log('[REVIEWS] reviews fetched:', Array.isArray(rows) ? (rows as any[]).length : 0);
      return res.json({ success: true, reviews: rows });
    } catch (err) {
      console.error('[REVIEWS] error listing reviews:', (err as any)?.message, (err as any)?.stack);
      Logger.error(MODULE, 'Error listando reviews', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar reseñas' });
    }
  });

  return router;
}

export function setupReviewsModule(app: Express) {
  console.log('[REVIEWS] 🚀 Inicializando módulo de reviews...');
  app.use('/', buildRouter());
  console.log('[REVIEWS] ✅ Rutas de reviews montadas correctamente');
  Logger.info(MODULE, 'Reviews routes mounted');
}

