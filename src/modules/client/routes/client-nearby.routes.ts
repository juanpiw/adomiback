import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'ClientNearbySearchRoutes';

class ClientNearbySearchRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // GET /client/search/nearby-providers?lat&lng&radius_km&search&category&rating_min&is_now&date&start&end&limit&offset
    this.router.get('/client/search/nearby-providers', authenticateToken, async (req: Request, res: Response) => {
      try {
        const {
          lat,
          lng,
          radius_km = '10',
          search,
          category,
          rating_min,
          is_now,
          date,
          start,
          end,
          limit = '20',
          offset = '0'
        } = req.query as any;

        if (!lat || !lng) {
          return res.status(400).json({ success: false, error: 'Parámetros requeridos: lat, lng' });
        }

        const latNum = parseFloat(String(lat));
        const lngNum = parseFloat(String(lng));
        const radiusNum = Math.max(0.1, Math.min(50, parseFloat(String(radius_km)) || 10));
        const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 20));
        const offsetNum = Math.max(0, parseInt(String(offset), 10) || 0);

        const pool = DatabaseConnection.getPool();

        // Base query con distancia (Haversine aproximado en km)
        // Nota: usamos MIN(distance_km) por proveedor cuando hay múltiples provider_locations
        let query = `
          SELECT 
            u.id AS provider_id,
            u.name AS provider_name,
            pp.professional_title AS profession,
            pp.bio AS description,
            pp.profile_photo_url AS avatar_url,
            pp.main_region,
            pp.main_commune AS location,
            pp.is_online,
            pl.lat AS lat,
            pl.lng AS lng,
            COALESCE(AVG(r.rating), 0) AS rating,
            COUNT(DISTINCT r.id) AS review_count,
            COUNT(DISTINCT ps.id) AS services_count,
            MIN(111.045 * DEGREES(ACOS(
              COS(RADIANS(?)) * COS(RADIANS(pl.lat)) * COS(RADIANS(pl.lng) - RADIANS(?)) +
              SIN(RADIANS(?)) * SIN(RADIANS(pl.lat))
            ))) AS distance_km
          FROM users u
          JOIN provider_profiles pp ON pp.provider_id = u.id
          JOIN provider_locations pl ON pl.provider_id = u.id AND pl.lat IS NOT NULL AND pl.lng IS NOT NULL
          LEFT JOIN provider_services ps ON ps.provider_id = u.id AND ps.is_active = TRUE
          LEFT JOIN reviews r ON r.provider_id = u.id
          WHERE u.role = 'provider' AND u.is_active = TRUE
            AND (pp.share_real_time_location = TRUE OR (pp.current_lat IS NOT NULL AND pp.current_lng IS NOT NULL))
        `;

        const params: any[] = [latNum, lngNum, latNum];

        // Filtros de texto/categoría
        if (search) {
          query += ` AND (
            u.name LIKE ? OR 
            pp.professional_title LIKE ? OR 
            pp.bio LIKE ? OR
            ps.name LIKE ? OR
            ps.custom_category LIKE ?
          )`;
          const sp = `%${search}%`;
          params.push(sp, sp, sp, sp, sp);
        }

        if (category) {
          query += ` AND (
            ps.custom_category LIKE ? OR
            EXISTS (
              SELECT 1 FROM service_categories sc 
              WHERE sc.id = ps.category_id AND sc.name LIKE ?
            )
          )`;
          const cp = `%${category}%`;
          params.push(cp, cp);
        }

        query += `
          GROUP BY u.id, u.name, pp.professional_title, pp.bio, pp.profile_photo_url, pp.main_region, pp.main_commune, pp.is_online, pl.lat, pl.lng
          HAVING distance_km <= ? AND services_count > 0
        `;
        params.push(radiusNum);

        if (rating_min) {
          query += ` AND rating >= ?`;
          params.push(parseFloat(String(rating_min)));
        }

        // Filtro "Ahora" o por fecha/hora
        const nowFlag = String(is_now || '').toLowerCase();
        const isNow = nowFlag === '1' || nowFlag === 'true';
        if (isNow || (date && start && end)) {
          query += ` AND EXISTS (
            SELECT 1 FROM provider_availability pa
            WHERE pa.provider_id = u.id
              AND pa.is_active = TRUE
              AND pa.day_of_week = LOWER(DAYNAME(?))
              AND ? >= pa.start_time AND ? <= pa.end_time
          )`;
          const d = date || new Date().toISOString().slice(0, 10);
          params.push(d, start || '00:00', end || '23:59');

          query += ` AND NOT EXISTS (
            SELECT 1 FROM availability_exceptions ae
            WHERE ae.provider_id = u.id
              AND ae.exception_date = ?
              AND (
                (ae.start_time IS NULL AND ae.end_time IS NULL) OR
                (? < ae.end_time AND ? > ae.start_time)
              )
          )`;
          params.push(d, start || '00:00', end || '23:59');

          query += ` AND NOT EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.provider_id = u.id
              AND a.appointment_date = ?
              AND a.status IN ('pending','confirmed')
              AND (
                (a.start_time < ? AND a.end_time > ?) OR
                (a.start_time < ? AND a.end_time > ?) OR
                (a.start_time >= ? AND a.end_time <= ?)
              )
          )`;
          params.push(d, end || '23:59', start || '00:00', start || '00:00', end || '23:59', start || '00:00', end || '23:59');

          if (isNow) {
            query += ` AND pp.is_online = TRUE`;
          }
        }

        query += `
          ORDER BY distance_km ASC, rating DESC
          LIMIT ${limitNum} OFFSET ${offsetNum}
        `;

        Logger.debug(MODULE, 'Nearby final query', { query, params });
        const [rows] = await pool.query(query, params);

        const publicBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3000';
        const providers = (rows as any[]).map(row => ({
          id: row.provider_id,
          name: row.provider_name,
          profession: row.profession || 'Profesional',
          description: row.description || 'Sin descripción disponible',
          rating: Math.round(Number(row.rating || 0) * 10) / 10,
          reviews: Number(row.review_count || 0),
          avatar_url: row.avatar_url ? `${publicBase}${row.avatar_url}` : null,
          location: row.location || row.main_region,
          is_online: !!row.is_online,
          distance_km: Math.round(Number(row.distance_km || 0) * 10) / 10,
          lat: row.lat !== null && row.lat !== undefined ? Number(row.lat) : null,
          lng: row.lng !== null && row.lng !== undefined ? Number(row.lng) : null
        }));

        return res.json({
          success: true,
          data: providers,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            total: providers.length,
            has_more: providers.length === limitNum
          }
        });
      } catch (error: any) {
        Logger.error(MODULE, 'Error in nearby search', error);
        return res.status(500).json({ success: false, error: 'Error al buscar proveedores cercanos' });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default new ClientNearbySearchRoutes().getRouter();


