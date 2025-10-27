/**
 * Provider Locations Routes
 * Endpoints para gestionar zonas de cobertura del profesional
 */

import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser, requireRole } from '../../../shared/middleware/auth.middleware';
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
    this.router.get('/provider/coverage-zones', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
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
    this.router.post('/provider/coverage-zones', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
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
    this.router.delete('/provider/coverage-zones/:id', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
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

    // PUT /provider/coverage-zones/:id/location - Establecer coordenadas (lat/lng) de una zona
    this.router.put('/provider/coverage-zones/:id/location', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const zoneId = Number(req.params.id);
        const { lat, lng } = req.body as any;

        Logger.info(MODULE, 'PUT /provider/coverage-zones/:id/location', { userId: user.id, zoneId, body: req.body });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        if (!zoneId || Number.isNaN(zoneId)) {
          return res.status(400).json({ success: false, error: 'ID de zona inválido' });
        }

        const latNum = Number(lat);
        const lngNum = Number(lng);
        if (
          Number.isNaN(latNum) || Number.isNaN(lngNum) ||
          latNum < -90 || latNum > 90 ||
          lngNum < -180 || lngNum > 180
        ) {
          return res.status(400).json({ success: false, error: 'lat/lng inválidos' });
        }

        const pool = DatabaseConnection.getPool();

        // Verificar propiedad de la zona
        const [rows] = await pool.query(
          'SELECT id FROM provider_locations WHERE id = ? AND provider_id = ?',
          [zoneId, user.id]
        );
        if ((rows as any[]).length === 0) {
          return res.status(404).json({ success: false, error: 'Zona no encontrada' });
        }

        // Actualizar lat/lng de la zona
        await pool.execute(
          `UPDATE provider_locations
           SET lat = ?, lng = ?
           WHERE id = ? AND provider_id = ?`,
          [latNum, lngNum, zoneId, user.id]
        );

        const [updated] = await pool.query(
          'SELECT id, commune, region, lat, lng, is_primary, created_at FROM provider_locations WHERE id = ? AND provider_id = ?',
          [zoneId, user.id]
        );

        return res.json({ success: true, zone: (updated as any[])[0] });
      } catch (error: any) {
        Logger.error(MODULE, 'Error updating coverage zone location', error);
        return res.status(500).json({ success: false, error: 'Error al actualizar coordenadas de zona' });
      }
    });

    // PUT /provider/coverage-zones/:id/primary - Marcar una zona como principal
    this.router.put('/provider/coverage-zones/:id/primary', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const zoneId = Number(req.params.id);
        Logger.info(MODULE, 'PUT /provider/coverage-zones/:id/primary', { userId: user.id, zoneId });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        if (!zoneId || Number.isNaN(zoneId)) {
          return res.status(400).json({ success: false, error: 'ID de zona inválido' });
        }

        const pool = DatabaseConnection.getPool();

        // Verificar propiedad de la zona
        const [rows] = await pool.query(
          'SELECT id, commune FROM provider_locations WHERE id = ? AND provider_id = ?',
          [zoneId, user.id]
        );
        const zone = (rows as any[])[0];
        if (!zone) {
          return res.status(404).json({ success: false, error: 'Zona no encontrada' });
        }

        // Desmarcar todas las zonas como principal
        await pool.execute('UPDATE provider_locations SET is_primary = FALSE WHERE provider_id = ?', [user.id]);
        // Marcar esta zona como principal
        await pool.execute('UPDATE provider_locations SET is_primary = TRUE WHERE id = ? AND provider_id = ?', [zoneId, user.id]);

        // Opcional: sincronizar main_commune en el perfil
        if (zone?.commune) {
          await pool.execute(
            'UPDATE provider_profiles SET main_commune = ?, updated_at = CURRENT_TIMESTAMP WHERE provider_id = ?',
            [zone.commune, user.id]
          );
        }

        // Devolver zonas actualizadas
        const [zones] = await pool.query(
          `SELECT id, commune, region, lat, lng, is_primary, created_at
           FROM provider_locations WHERE provider_id = ? ORDER BY is_primary DESC, commune ASC`,
          [user.id]
        );
        return res.json({ success: true, zones });
      } catch (error: any) {
        Logger.error(MODULE, 'Error setting primary zone', error);
        return res.status(500).json({ success: false, error: 'Error al marcar zona principal' });
      }
    });

    // PUT /provider/availability - Actualizar disponibilidad (online y compartir ubicación)
    this.router.put('/provider/availability', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        Logger.info(MODULE, 'PUT /provider/availability', { userId: user.id, body: req.body });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const { is_online, share_real_time_location } = req.body as any;

        const pool = DatabaseConnection.getPool();

        // Actualizar campos de disponibilidad
        await pool.execute(
          `UPDATE provider_profiles 
           SET is_online = COALESCE(?, is_online),
               share_real_time_location = COALESCE(?, share_real_time_location),
               updated_at = CURRENT_TIMESTAMP
           WHERE provider_id = ?`,
          [is_online, share_real_time_location, user.id]
        );

        // Obtener perfil actualizado
        const [rows] = await pool.query(
          'SELECT is_online, share_real_time_location FROM provider_profiles WHERE provider_id = ?',
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

    // PUT /provider/current-location - Actualizar ubicación en tiempo real (lat/lng)
    this.router.put('/provider/current-location', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        Logger.info(MODULE, 'PUT /provider/current-location', { userId: user.id, body: req.body });

        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
        }

        const { lat, lng } = req.body as any;

        const latNum = Number(lat);
        const lngNum = Number(lng);
        if (
          Number.isNaN(latNum) || Number.isNaN(lngNum) ||
          latNum < -90 || latNum > 90 ||
          lngNum < -180 || lngNum > 180
        ) {
          return res.status(400).json({ success: false, error: 'lat/lng inválidos' });
        }

        const pool = DatabaseConnection.getPool();
        await pool.execute(
          `UPDATE provider_profiles
           SET current_lat = ?, current_lng = ?, current_location_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE provider_id = ?`,
          [latNum, lngNum, user.id]
        );

        const [rows] = await pool.query(
          'SELECT current_lat, current_lng, current_location_updated_at, share_real_time_location FROM provider_profiles WHERE provider_id = ?',
          [user.id]
        );

        return res.json({ success: true, location: (rows as any[])[0] });
      } catch (error: any) {
        Logger.error(MODULE, 'Error updating current location', error);
        return res.status(500).json({ success: false, error: 'Error al actualizar ubicación actual' });
      }
    });
  }
}

export default new ProviderLocationsRoutes().router;

