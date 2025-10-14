import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';

export class ClientAvailabilitySearchRoutes {
  private router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // GET /client/search/available-providers?date=YYYY-MM-DD&start=HH:mm&end=HH:mm&location=&category=
    this.router.get('/client/search/available-providers', authenticateToken, async (req: Request, res: Response) => {
      try {
        const { date, start, end, location, category, limit = 20, offset = 0, is_now } = req.query as any;
        if (!date || !start || !end) {
          return res.status(400).json({ success: false, error: 'Parámetros requeridos: date, start, end' });
        }

        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

        const pool = DatabaseConnection.getPool();

        const todayIso = new Date().toISOString().slice(0, 10);
        const isNow = String(is_now || '').toLowerCase() === '1' || String(is_now || '').toLowerCase() === 'true' || (date === todayIso);

        // Query base: providers activos con disponibilidad que cubra el intervalo solicitado
        let query = `
          SELECT DISTINCT
            u.id as provider_id,
            u.name as provider_name,
            pp.professional_title as profession,
            pp.bio as description,
            pp.profile_photo_url as avatar_url,
            COALESCE(pp.rating_average, 0) as rating,
            COALESCE(pp.review_count, 0) as review_count,
            pp.main_region,
            pp.main_commune as location
          FROM users u
          JOIN provider_profiles pp ON pp.provider_id = u.id
          JOIN provider_availability pa ON pa.provider_id = u.id AND pa.is_active = TRUE
          WHERE u.role = 'provider' AND u.is_active = TRUE
            AND pa.day_of_week = LOWER(DAYNAME(?))
            AND pa.start_time <= ?
            AND pa.end_time >= ?
        `;

        if (isNow) {
          query += ` AND COALESCE(pp.is_online, FALSE) = TRUE`;
        }

        query += `
            AND NOT EXISTS (
              SELECT 1 FROM availability_exceptions ae
              WHERE ae.provider_id = u.id
                AND ae.exception_date = ?
                AND (
                  ae.is_available = FALSE OR (
                    ae.start_time IS NOT NULL AND ae.end_time IS NOT NULL AND
                    ae.start_time < ? AND ae.end_time > ?
                  )
                )
            )
            AND NOT EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.provider_id = u.id
                AND DATE(a.start_time) = ?
                AND (
                  TIME(a.start_time) < ? AND TIME(a.end_time) > ?
                )
            )
        `;

        const params: any[] = [date, start, end, date, end, start, date, end, start];

        // Filtros opcionales
        if (location) {
          const raw = String(location).toLowerCase();
          const withSpaces = raw.replace(/-/g, ' ');
          query += ` AND (
            LOWER(pp.main_region) LIKE ? OR LOWER(pp.main_commune) LIKE ? OR
            LOWER(REPLACE(pp.main_region, ' ', '-')) LIKE ? OR LOWER(REPLACE(pp.main_commune, ' ', '-')) LIKE ?
          )`;
          params.push(`%${withSpaces}%`, `%${withSpaces}%`, `%${raw}%`, `%${raw}%`);
        }

        if (category) {
          query += ` AND (
            EXISTS (
              SELECT 1 FROM provider_services ps
              WHERE ps.provider_id = u.id AND ps.is_active = TRUE AND (ps.custom_category LIKE ?)
            )
          )`;
          params.push(`%${category}%`);
        }

        query += ` ORDER BY rating DESC, review_count DESC, provider_name ASC LIMIT ${limitNum} OFFSET ${offsetNum}`;

        const [rows] = await pool.query(query, params);

        const providers = (rows as any[]).map(p => ({
          id: p.provider_id,
          name: p.provider_name,
          profession: p.profession,
          description: p.description || 'Sin descripción disponible',
          rating: Number(p.rating || 0),
          review_count: Number(p.review_count || 0),
          avatar_url: p.avatar_url ? `${process.env.API_BASE_URL || 'http://localhost:3000'}${p.avatar_url}` : null,
          location: p.location || p.main_region,
          services_count: undefined,
          experience_years: undefined,
          is_online: undefined,
          services: []
        }));

        return res.json({
          success: true,
          data: providers,
          pagination: { limit: limitNum, offset: offsetNum, total: providers.length, has_more: providers.length === limitNum }
        });
      } catch (error: any) {
        console.error('[CLIENT_AVAILABILITY_SEARCH] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al buscar disponibilidad' });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}


