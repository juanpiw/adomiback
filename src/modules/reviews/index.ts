import { Express, Router, Request, Response } from 'express';
import DatabaseConnection from '../../shared/database/connection';
import { authenticateToken, requireRole, AuthUser } from '../../shared/middleware/auth.middleware';
import { Logger } from '../../shared/utils/logger.util';

const MODULE = 'REVIEWS';

type ClientReviewSummary = {
  reviewCount: number;
  reviewAverage: number;
};

async function getClientReviewSummary(clientId: number): Promise<ClientReviewSummary> {
  const pool = DatabaseConnection.getPool();
  const [[agg]]: any = await pool.query(
    `SELECT 
        COUNT(*) AS review_count,
        AVG(rating) AS review_average
     FROM client_reviews
     WHERE client_id = ?`,
    [clientId]
  );

  const reviewCount = Number(agg?.review_count || 0);
  const averageRaw = agg?.review_average;
  const reviewAverage = reviewCount > 0 ? Number((Number(averageRaw) || 0).toFixed(2)) : 0;

  return { reviewCount, reviewAverage };
}

async function updateClientReviewAggregates(clientId: number): Promise<ClientReviewSummary> {
  const summary = await getClientReviewSummary(clientId);
  const pool = DatabaseConnection.getPool();

  const [updateResult]: any = await pool.execute(
    `UPDATE client_profiles 
        SET client_review_count = ?, 
            client_rating_average = ? 
      WHERE client_id = ?`,
    [summary.reviewCount, summary.reviewAverage, clientId]
  );

  if (updateResult?.affectedRows === 0) {
    try {
      const [[userRow]]: any = await pool.query(
        'SELECT name FROM users WHERE id = ? LIMIT 1',
        [clientId]
      );
      const fallbackName = (userRow?.name && String(userRow.name).trim()) || 'Cliente Adomi';
      await pool.execute(
        `INSERT INTO client_profiles (
            client_id,
            full_name,
            phone,
            profile_photo_url,
            address,
            commune,
            region,
            preferred_language,
            notes,
            client_rating_average,
            client_review_count
         ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 'es', NULL, ?, ?)
         ON DUPLICATE KEY UPDATE 
           client_rating_average = VALUES(client_rating_average),
           client_review_count = VALUES(client_review_count)`,
        [clientId, fallbackName, summary.reviewAverage, summary.reviewCount]
      );
    } catch (err) {
      Logger.warn(MODULE, `No se pudo crear perfil básico para cliente ${clientId} al actualizar agregados`, err as any);
    }
  }

  return summary;
}

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

  // POST /provider/clients/:clientId/reviews – proveedor califica a un cliente
  router.post(
    '/provider/clients/:clientId/reviews',
    authenticateToken,
    requireRole('provider'),
    async (req: Request, res: Response) => {
      try {
        const provider = (req as any).user as AuthUser;
        const clientId = Number(req.params.clientId);
        const { appointment_id, rating, comment } = req.body || {};

        if (!Number.isInteger(clientId) || clientId <= 0) {
          return res.status(400).json({ success: false, error: 'clientId inválido' });
        }

        const appointmentId = Number(appointment_id);
        const ratingNumber = Number(rating);
        if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
          return res.status(400).json({ success: false, error: 'appointment_id inválido' });
        }
        if (!Number.isFinite(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) {
          return res.status(400).json({ success: false, error: 'rating debe estar entre 1 y 5' });
        }

        const trimmedComment =
          typeof comment === 'string' ? comment.trim().slice(0, 2000) : null;

        const pool = DatabaseConnection.getPool();

        const [appointmentRows]: any = await pool.query(
          `SELECT id, client_id, provider_id, status 
             FROM appointments 
            WHERE id = ? 
            LIMIT 1`,
          [appointmentId]
        );

        if (!Array.isArray(appointmentRows) || appointmentRows.length === 0) {
          return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        }

        const appointment = appointmentRows[0];
        if (Number(appointment.provider_id) !== Number(provider.id)) {
          return res.status(403).json({ success: false, error: 'No autorizado para calificar esta cita' });
        }
        if (Number(appointment.client_id) !== clientId) {
          return res.status(400).json({ success: false, error: 'La cita no pertenece a este cliente' });
        }
        if (String(appointment.status) !== 'completed') {
          return res.status(400).json({ success: false, error: 'La cita debe estar completada para calificar al cliente' });
        }

        const [existingRows]: any = await pool.query(
          `SELECT id 
             FROM client_reviews 
            WHERE appointment_id = ? 
              AND provider_id = ? 
            LIMIT 1`,
          [appointmentId, provider.id]
        );

        if (Array.isArray(existingRows) && existingRows.length > 0) {
          return res.status(409).json({ success: false, error: 'Ya registraste una reseña para esta cita' });
        }

        const [insertResult]: any = await pool.execute(
          `INSERT INTO client_reviews (appointment_id, client_id, provider_id, rating, comment)
           VALUES (?, ?, ?, ?, ?)`,
          [appointmentId, clientId, provider.id, ratingNumber, trimmedComment || null]
        );

        const reviewId = insertResult?.insertId ? Number(insertResult.insertId) : null;

        const summary = await updateClientReviewAggregates(clientId);

        Logger.info(
          MODULE,
          `Cliente ${clientId} calificado por proveedor ${provider.id} para cita ${appointmentId}`,
          { providerId: provider.id, clientId, appointmentId, rating: ratingNumber }
        );

        return res.json({
          success: true,
          review: {
            id: reviewId,
            appointment_id: appointmentId,
            client_id: clientId,
            provider_id: provider.id,
            rating: ratingNumber,
            comment: trimmedComment
          },
          summary
        });
      } catch (err) {
        console.error('[REVIEWS] error creating client review:', (err as any)?.message, (err as any)?.stack);
        Logger.error(MODULE, 'Error creando reseña de cliente', err as any);
        return res.status(500).json({ success: false, error: 'Error al crear reseña del cliente' });
      }
    }
  );

  // GET /provider/clients/:clientId/reviews – listar reseñas de un cliente (vista proveedor)
  router.get(
    '/provider/clients/:clientId/reviews',
    authenticateToken,
    requireRole('provider'),
    async (req: Request, res: Response) => {
      try {
        const provider = (req as any).user as AuthUser;
        const clientId = Number(req.params.clientId);
        if (!Number.isInteger(clientId) || clientId <= 0) {
          return res.status(400).json({ success: false, error: 'clientId inválido' });
        }

        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const offset = Math.max(Number(req.query.offset) || 0, 0);

        const pool = DatabaseConnection.getPool();

        const [relationshipRows]: any = await pool.query(
          `SELECT id FROM appointments 
            WHERE provider_id = ? AND client_id = ?
            LIMIT 1`,
          [provider.id, clientId]
        );

        if (!Array.isArray(relationshipRows) || relationshipRows.length === 0) {
          return res.status(404).json({ success: false, error: 'No se encontraron citas compartidas con este cliente' });
        }

        const summary = await getClientReviewSummary(clientId);

        const [rows]: any = await pool.query(
          `SELECT cr.id,
                  cr.appointment_id,
                  cr.provider_id,
                  cr.rating,
                  cr.comment,
                  cr.created_at,
                  u.name AS provider_name
             FROM client_reviews cr
             LEFT JOIN users u ON u.id = cr.provider_id
            WHERE cr.client_id = ?
            ORDER BY cr.created_at DESC
            LIMIT ? OFFSET ?`,
          [clientId, limit, offset]
        );

        const reviews = (rows as any[]).map((row) => ({
          id: row.id,
          appointment_id: row.appointment_id,
          provider_id: row.provider_id,
          provider_name: row.provider_name || null,
          rating: Number(row.rating),
          comment: row.comment || null,
          created_at: row.created_at
        }));

        return res.json({
          success: true,
          summary: {
            count: summary.reviewCount,
            average: summary.reviewAverage
          },
          pagination: {
            limit,
            offset,
            hasMore: offset + reviews.length < summary.reviewCount
          },
          reviews
        });
      } catch (err) {
        console.error('[REVIEWS] error listing client reviews:', (err as any)?.message, (err as any)?.stack);
        Logger.error(MODULE, 'Error listando reseñas de clientes', err as any);
        return res.status(500).json({ success: false, error: 'Error al obtener reseñas del cliente' });
      }
    }
  );

  // GET /provider/clients/:clientId/reviewable-appointments – citas completadas sin reseña
  router.get(
    '/provider/clients/:clientId/reviewable-appointments',
    authenticateToken,
    requireRole('provider'),
    async (req: Request, res: Response) => {
      try {
        const provider = (req as any).user as AuthUser;
        const clientId = Number(req.params.clientId);
        if (!Number.isInteger(clientId) || clientId <= 0) {
          return res.status(400).json({ success: false, error: 'clientId inválido' });
        }

        const pool = DatabaseConnection.getPool();
        const [rows]: any = await pool.query(
          `SELECT a.id,
                  a.date,
                  a.start_time,
                  a.end_time,
                  a.status,
                  ps.name AS service_name
             FROM appointments a
             LEFT JOIN provider_services ps ON ps.id = a.service_id
            WHERE a.provider_id = ?
              AND a.client_id = ?
              AND a.status = 'completed'
              AND NOT EXISTS (
                  SELECT 1
                    FROM client_reviews cr
                   WHERE cr.appointment_id = a.id
                     AND cr.provider_id = a.provider_id
              )
            ORDER BY a.date DESC, a.start_time DESC
            LIMIT 50`,
          [provider.id, clientId]
        );

        const appointments = (rows as any[]).map((row) => ({
          id: row.id,
          date: row.date,
          start_time: row.start_time,
          end_time: row.end_time,
          status: row.status,
          service_name: row.service_name || null
        }));

        return res.json({ success: true, appointments });
      } catch (err) {
        console.error('[REVIEWS] error listing reviewable appointments:', (err as any)?.message, (err as any)?.stack);
        Logger.error(MODULE, 'Error listando citas calificables', err as any);
        return res.status(500).json({ success: false, error: 'Error al obtener citas para calificar' });
      }
    }
  );

  return router;
}

export function setupReviewsModule(app: Express) {
  console.log('⭐'.repeat(20));
  console.log('⭐ MÓDULO DE REVIEWS INICIANDO ⭐');
  console.log('⭐'.repeat(20));
  console.log('[REVIEWS] 🚀 Inicializando módulo de reviews...');
  console.log('[REVIEWS] 📁 Archivo: backend/src/modules/reviews/index.ts');
  console.log('[REVIEWS] 🎯 Montando rutas en app...');
  
  app.use('/', buildRouter());
  
  console.log('[REVIEWS] ✅ Rutas de reviews montadas correctamente');
  console.log('[REVIEWS] 🔗 Endpoints disponibles:');
  console.log('[REVIEWS]   - POST /reviews');
  console.log('[REVIEWS]   - GET /providers/:id/reviews');
  console.log('[REVIEWS]   - POST /provider/clients/:clientId/reviews');
  console.log('[REVIEWS]   - GET /provider/clients/:clientId/reviews');
  console.log('[REVIEWS]   - GET /provider/clients/:clientId/reviewable-appointments');
  console.log('[REVIEWS] 📊 Módulo de reviews completamente inicializado');
  console.log('⭐'.repeat(20));
  console.log('⭐ MÓDULO DE REVIEWS LISTO ⭐');
  console.log('⭐'.repeat(20));
  
  Logger.info(MODULE, 'Reviews routes mounted');
}

export { getClientReviewSummary };
