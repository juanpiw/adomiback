/**
 * Provider Locations Routes
 * Endpoints para gestionar zonas de cobertura del profesional
 */

import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'ProviderLocationsRoutes';

export class ProviderLocationsRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /provider/coverage-zones - Listar zonas de cobertura
    this.router.get('/provider/coverage-zones', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        Logger.info(MODULE, 'GET /provider/coverage-zones', { userId: user.id });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const pool = DatabaseConnection.getPool();
        const [rows] = await pool.query(
          `SELECT id, commune, region, is_primary, created_at
           FROM provider_locations
           WHERE provider_id = ?
           ORDER BY is_primary DESC, commune ASC`,
          [user.id]
        );

        return res.json({ success: true, zones: rows });
      } catch (error: any) {
        Logger.error(MODULE, 'Error fetching coverage zones', error);
        return res.status(500).json({ success: false, error: 'Error al obtener zonas de cobertura' });
      }
    });

    // POST /provider/coverage-zones - Agregar zona de cobertura
    this.router.post('/provider/coverage-zones', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        Logger.info(MODULE, 'POST /provider/coverage-zones', { userId: user.id, body: req.body });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const { commune, region, is_primary } = req.body;

        // Validaciones
        if (!commune || !region) {
          return res.status(400).json({
            success: false,
            error: 'commune y region son requeridos'
          });
        }

        const pool = DatabaseConnection.getPool();

        // Verificar si ya existe
        const [existing] = await pool.query(
          'SELECT id FROM provider_locations WHERE provider_id = ? AND commune = ?',
          [user.id, commune]
        );

        if ((existing as any[]).length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Esta comuna ya está en tu lista de cobertura'
          });
        }

        // Si es primary, desmarcar las demás
        if (is_primary) {
          await pool.execute(
            'UPDATE provider_locations SET is_primary = FALSE WHERE provider_id = ?',
            [user.id]
          );
        }

        // Insertar zona
        const [result] = await pool.execute(
          `INSERT INTO provider_locations (provider_id, commune, region, is_primary)
           VALUES (?, ?, ?, ?)`,
          [user.id, commune, region, is_primary || false]
        );

        const zoneId = (result as any).insertId;

        // Obtener la zona creada
        const [rows] = await pool.query(
          'SELECT * FROM provider_locations WHERE id = ?',
          [zoneId]
        );

        const zone = (rows as any[])[0];

        Logger.info(MODULE, 'Coverage zone created', { zoneId, userId: user.id });
        return res.status(201).json({ success: true, zone });
      } catch (error: any) {
        Logger.error(MODULE, 'Error creating coverage zone', error);
        return res.status(500).json({ success: false, error: 'Error al agregar zona de cobertura' });
      }
    });

    // DELETE /provider/coverage-zones/:id - Eliminar zona de cobertura
    this.router.delete('/provider/coverage-zones/:id', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const zoneId = req.params.id;
        Logger.info(MODULE, 'DELETE /provider/coverage-zones/:id', { userId: user.id, zoneId });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const pool = DatabaseConnection.getPool();

        // Verificar que la zona pertenece al usuario
        const [rows] = await pool.query(
          'SELECT * FROM provider_locations WHERE id = ? AND provider_id = ?',
          [zoneId, user.id]
        );

        if ((rows as any[]).length === 0) {
          return res.status(404).json({ success: false, error: 'Zona no encontrada' });
        }

        // Eliminar zona
        await pool.execute(
          'DELETE FROM provider_locations WHERE id = ? AND provider_id = ?',
          [zoneId, user.id]
        );

        Logger.info(MODULE, 'Coverage zone deleted', { zoneId, userId: user.id });
        return res.json({ success: true, message: 'Zona eliminada correctamente' });
      } catch (error: any) {
        Logger.error(MODULE, 'Error deleting coverage zone', error);
        return res.status(500).json({ success: false, error: 'Error al eliminar zona' });
      }
    });

    // PUT /provider/availability - Actualizar disponibilidad
    this.router.put('/provider/availability', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        Logger.info(MODULE, 'PUT /provider/availability', { userId: user.id, body: req.body });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const { available_for_bookings, share_real_time_location } = req.body;

        const pool = DatabaseConnection.getPool();

        // Actualizar campos de disponibilidad
        await pool.execute(
          `UPDATE provider_profiles 
           SET available_for_bookings = COALESCE(?, available_for_bookings),
               share_real_time_location = COALESCE(?, share_real_time_location),
               updated_at = CURRENT_TIMESTAMP
           WHERE provider_id = ?`,
          [available_for_bookings, share_real_time_location, user.id]
        );

        // Obtener perfil actualizado
        const [rows] = await pool.query(
          'SELECT available_for_bookings, share_real_time_location FROM provider_profiles WHERE provider_id = ?',
          [user.id]
        );

        const availability = (rows as any[])[0];

        Logger.info(MODULE, 'Availability updated', { userId: user.id });
        return res.json({ success: true, availability });
      } catch (error: any) {
        Logger.error(MODULE, 'Error updating availability', error);
        return res.status(500).json({ success: false, error: 'Error al actualizar disponibilidad' });
      }
    });
  }
}

export default new ProviderLocationsRoutes().router;

