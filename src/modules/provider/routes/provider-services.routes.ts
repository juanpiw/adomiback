/**
 * Provider Services Routes
 * Endpoints para gestionar los servicios que ofrece un profesional
 */

import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'ProviderServicesRoutes';

export class ProviderServicesRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /provider/services - Listar servicios del profesional
    this.router.get('/provider/services', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        Logger.info(MODULE, 'GET /provider/services', { userId: user.id });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const pool = DatabaseConnection.getPool();
        const [rows] = await pool.query(
          `SELECT id, name, description, price, duration_minutes, 
                  category_id, custom_category, is_active, order_index, 
                  service_image_url, is_featured, booking_count, average_rating,
                  created_at, updated_at
           FROM provider_services
           WHERE provider_id = ?
           ORDER BY order_index ASC, created_at DESC`,
          [user.id]
        );

        return res.json({ success: true, services: rows });
      } catch (error: any) {
        Logger.error(MODULE, 'Error fetching services', error);
        return res.status(500).json({ success: false, error: 'Error al obtener servicios' });
      }
    });

    // POST /provider/services - Crear nuevo servicio
    this.router.post('/provider/services', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        console.log('[PROVIDER_SERVICES] POST /provider/services - Usuario:', user.id, 'Datos:', req.body);
        Logger.info(MODULE, 'POST /provider/services', { userId: user.id, body: req.body });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const {
          name,
          description,
          price,
          duration_minutes,
          category_id,
          custom_category,
          service_image_url
        } = req.body;

        // Validaciones
        if (!name || !price || !duration_minutes) {
          return res.status(400).json({
            success: false,
            error: 'name, price y duration_minutes son requeridos'
          });
        }

        if (price < 0) {
          return res.status(400).json({ success: false, error: 'El precio debe ser mayor o igual a 0' });
        }

        if (duration_minutes < 1 || duration_minutes > 480) {
          return res.status(400).json({
            success: false,
            error: 'La duración debe estar entre 1 y 480 minutos'
          });
        }

        const pool = DatabaseConnection.getPool();

        // Obtener el siguiente order_index
        const [countResult] = await pool.query(
          'SELECT COUNT(*) as count FROM provider_services WHERE provider_id = ?',
          [user.id]
        );
        const nextOrder = (countResult as any[])[0].count;

        // Insertar servicio
        const [result] = await pool.execute(
          `INSERT INTO provider_services 
           (provider_id, name, description, price, duration_minutes, category_id, 
            custom_category, service_image_url, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            name,
            description || null,
            price,
            duration_minutes,
            category_id || null,
            custom_category || null,
            service_image_url || null,
            nextOrder
          ]
        );

        const serviceId = (result as any).insertId;

        // Obtener el servicio creado
        const [rows] = await pool.query(
          'SELECT * FROM provider_services WHERE id = ?',
          [serviceId]
        );

        const service = (rows as any[])[0];

        // Actualizar profile_completion (agregar +15% si es el primer servicio)
        if (nextOrder === 0) {
          await pool.execute(
            `UPDATE provider_profiles 
             SET profile_completion = LEAST(100, profile_completion + 15)
             WHERE provider_id = ?`,
            [user.id]
          );
        }

        Logger.info(MODULE, 'Service created', { serviceId, userId: user.id });
        return res.status(201).json({ success: true, service });
      } catch (error: any) {
        Logger.error(MODULE, 'Error creating service', error);
        return res.status(500).json({ success: false, error: 'Error al crear servicio' });
      }
    });

    // PUT /provider/services/:id - Actualizar servicio
    this.router.put('/provider/services/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const serviceId = req.params.id;
        Logger.info(MODULE, 'PUT /provider/services/:id', { userId: user.id, serviceId, body: req.body });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const {
          name,
          description,
          price,
          duration_minutes,
          category_id,
          custom_category,
          service_image_url,
          is_active,
          is_featured
        } = req.body;

        const pool = DatabaseConnection.getPool();

        // Verificar que el servicio pertenece al usuario
        const [rows] = await pool.query(
          'SELECT * FROM provider_services WHERE id = ? AND provider_id = ?',
          [serviceId, user.id]
        );

        if ((rows as any[]).length === 0) {
          return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
        }

        // Actualizar servicio
        await pool.execute(
          `UPDATE provider_services 
           SET name = COALESCE(?, name),
               description = COALESCE(?, description),
               price = COALESCE(?, price),
               duration_minutes = COALESCE(?, duration_minutes),
               category_id = COALESCE(?, category_id),
               custom_category = COALESCE(?, custom_category),
               service_image_url = COALESCE(?, service_image_url),
               is_active = COALESCE(?, is_active),
               is_featured = COALESCE(?, is_featured),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND provider_id = ?`,
          [
            name,
            description,
            price,
            duration_minutes,
            category_id,
            custom_category,
            service_image_url,
            is_active,
            is_featured,
            serviceId,
            user.id
          ]
        );

        // Obtener servicio actualizado
        const [updatedRows] = await pool.query(
          'SELECT * FROM provider_services WHERE id = ?',
          [serviceId]
        );

        const service = (updatedRows as any[])[0];

        Logger.info(MODULE, 'Service updated', { serviceId, userId: user.id });
        return res.json({ success: true, service });
      } catch (error: any) {
        Logger.error(MODULE, 'Error updating service', error);
        return res.status(500).json({ success: false, error: 'Error al actualizar servicio' });
      }
    });

    // DELETE /provider/services/:id - Eliminar servicio
    this.router.delete('/provider/services/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const serviceId = req.params.id;
        Logger.info(MODULE, 'DELETE /provider/services/:id', { userId: user.id, serviceId });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const pool = DatabaseConnection.getPool();

        // Verificar que el servicio pertenece al usuario
        const [rows] = await pool.query(
          'SELECT * FROM provider_services WHERE id = ? AND provider_id = ?',
          [serviceId, user.id]
        );

        if ((rows as any[]).length === 0) {
          return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
        }

        // TODO: Verificar si tiene citas futuras programadas
        // Por ahora, permitir eliminación

        // Eliminar servicio
        await pool.execute(
          'DELETE FROM provider_services WHERE id = ? AND provider_id = ?',
          [serviceId, user.id]
        );

        Logger.info(MODULE, 'Service deleted', { serviceId, userId: user.id });
        return res.json({ success: true, message: 'Servicio eliminado correctamente' });
      } catch (error: any) {
        Logger.error(MODULE, 'Error deleting service', error);
        return res.status(500).json({ success: false, error: 'Error al eliminar servicio' });
      }
    });
  }
}

export default new ProviderServicesRoutes().router;

