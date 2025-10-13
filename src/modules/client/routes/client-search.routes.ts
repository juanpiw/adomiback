import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'CLIENT_SEARCH';

export class ClientSearchRoutes {
  private router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // GET /client/search/providers - Buscar profesionales
    this.router.get('/client/search/providers', authenticateToken, async (req: Request, res: Response) => {
      try {
        const { 
          search, 
          category, 
          location, 
          price_min, 
          price_max, 
          rating_min,
          limit = 20,
          offset = 0
        } = req.query;

        console.log('[CLIENT_SEARCH] Buscando profesionales con filtros:', {
          search, category, location, price_min, price_max, rating_min, limit, offset
        });

        const pool = DatabaseConnection.getPool();
        
        // Construir la consulta base
        let query = `
          SELECT DISTINCT
            pp.provider_id,
            u.name as provider_name,
            u.email as provider_email,
            pp.professional_title as profession,
            pp.bio as description,
            pp.profile_photo_url as avatar_url,
            pp.main_region,
            pp.main_commune as location,
            pp.years_experience,
            pp.is_online,
            COALESCE(AVG(r.rating), 0) as rating,
            COUNT(DISTINCT r.id) as review_count,
            COUNT(DISTINCT ps.id) as services_count
          FROM provider_profiles pp
          JOIN users u ON pp.provider_id = u.id
          LEFT JOIN provider_services ps ON pp.provider_id = ps.provider_id AND ps.is_active = true
          LEFT JOIN reviews r ON pp.provider_id = r.provider_id
          WHERE u.role = 'provider' AND u.is_active = true
        `;

        const conditions: string[] = [];
        const params: any[] = [];

        // Filtro de búsqueda por texto (mejorado para incluir categorías)
        if (search) {
          conditions.push(`(
            u.name LIKE ? OR 
            pp.professional_title LIKE ? OR 
            pp.bio LIKE ? OR
            ps.name LIKE ? OR
            ps.custom_category LIKE ? OR
            EXISTS (
              SELECT 1 FROM service_categories sc 
              WHERE sc.id = ps.category_id AND sc.name LIKE ?
            )
          )`);
          const searchPattern = `%${search}%`;
          params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        // Filtro por categoría
        if (category) {
          conditions.push(`(
            ps.custom_category LIKE ? OR
            EXISTS (
              SELECT 1 FROM service_categories sc 
              WHERE sc.id = ps.category_id AND sc.name LIKE ?
            )
          )`);
          const categoryPattern = `%${category}%`;
          params.push(categoryPattern, categoryPattern);
        }

        // Filtro por ubicación
        if (location) {
          conditions.push(`(
            pp.main_region LIKE ? OR 
            pp.main_commune LIKE ?
          )`);
          const locationPattern = `%${location}%`;
          params.push(locationPattern, locationPattern);
        }

        // Filtro por precio
        if (price_min) {
          conditions.push(`ps.price >= ?`);
          params.push(parseInt(price_min as string));
        }
        if (price_max) {
          conditions.push(`ps.price <= ?`);
          params.push(parseInt(price_max as string));
        }

        // Filtro por rating mínimo
        if (rating_min) {
          conditions.push(`COALESCE(AVG(r.rating), 0) >= ?`);
          params.push(parseFloat(rating_min as string));
        }

        // Agregar condiciones a la consulta
        if (conditions.length > 0) {
          query += ` AND ${conditions.join(' AND ')}`;
        }

        // Agrupar y ordenar
        query += `
          GROUP BY pp.provider_id, u.name, u.email, pp.professional_title, pp.bio, 
                   pp.profile_photo_url, pp.main_region, pp.main_commune, pp.years_experience, pp.is_online
          HAVING services_count > 0
          ORDER BY rating DESC, review_count DESC, services_count DESC
          LIMIT ? OFFSET ?
        `;

        params.push(parseInt(limit as string), parseInt(offset as string));

        console.log('[CLIENT_SEARCH] Query final:', query);
        console.log('[CLIENT_SEARCH] Parámetros:', params);
        console.log('[CLIENT_SEARCH] Número de parámetros:', params.length);
        console.log('[CLIENT_SEARCH] Número de ? en query:', (query.match(/\?/g) || []).length);
        console.log('[CLIENT_SEARCH] Filtros aplicados - search:', search, 'location:', location, 'category:', category);

        const [rows] = await pool.execute(query, params);
        
        // Obtener servicios para cada profesional
        const providers = await Promise.all((rows as any[]).map(async (provider) => {
          const [servicesRows] = await pool.execute(
            `SELECT 
              ps.id,
              ps.name,
              ps.description,
              ps.price,
              ps.duration_minutes,
              ps.custom_category,
              ps.service_image_url,
              ps.is_featured
            FROM provider_services ps
            WHERE ps.provider_id = ? AND ps.is_active = true
            ORDER BY ps.is_featured DESC, ps.order_index ASC
            LIMIT 5`,
            [provider.provider_id]
          );

          return {
            id: provider.provider_id,
            name: provider.provider_name,
            email: provider.provider_email,
            profession: provider.profession || 'Profesional',
            description: provider.description || 'Sin descripción disponible',
            rating: parseFloat(provider.rating.toFixed(1)),
            review_count: provider.review_count,
            avatar_url: provider.avatar_url ? `${process.env.API_BASE_URL || 'http://localhost:3000'}${provider.avatar_url}` : null,
            location: provider.location || provider.main_region,
            services_count: provider.services_count,
            experience_years: provider.years_experience,
            available_for_bookings: provider.available_for_bookings,
            services: (servicesRows as any[]).map(service => ({
              id: service.id,
              name: service.name,
              description: service.description,
              price: service.price,
              duration_minutes: service.duration_minutes,
              category: service.custom_category,
              image_url: service.service_image_url ? `${process.env.API_BASE_URL || 'http://localhost:3000'}${service.service_image_url}` : null,
              is_featured: service.is_featured
            }))
          };
        }));

        console.log('[CLIENT_SEARCH] ✅ Profesionales encontrados:', providers.length);

        Logger.info(MODULE, 'Providers search completed', { 
          count: providers.length, 
          filters: { search, category, location, price_min, price_max, rating_min }
        });

        return res.json({
          success: true,
          data: providers,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            total: providers.length,
            has_more: providers.length === parseInt(limit as string)
          }
        });

      } catch (error: any) {
        console.error('[CLIENT_SEARCH] ❌ Error buscando profesionales:', error);
        Logger.error(MODULE, 'Error searching providers', error);
        return res.status(500).json({
          success: false,
          error: 'Error al buscar profesionales'
        });
      }
    });

    // GET /client/search/services - Buscar servicios específicos
    this.router.get('/client/search/services', authenticateToken, async (req: Request, res: Response) => {
      try {
        const { 
          search, 
          category, 
          location, 
          price_min, 
          price_max,
          duration_max,
          limit = 20,
          offset = 0
        } = req.query;

        console.log('[CLIENT_SEARCH] Buscando servicios con filtros:', {
          search, category, location, price_min, price_max, duration_max, limit, offset
        });

        const pool = DatabaseConnection.getPool();
        
        // Construir la consulta base
        let query = `
          SELECT 
            ps.id,
            ps.name,
            ps.description,
            ps.price,
            ps.duration_minutes,
            ps.custom_category,
            ps.service_image_url,
            ps.is_featured,
            ps.provider_id,
            u.name as provider_name,
            pp.professional_title as provider_profession,
            pp.profile_photo_url as provider_avatar_url,
            pp.main_region,
            pp.main_commune as provider_location,
            COALESCE(AVG(r.rating), 0) as provider_rating,
            COUNT(DISTINCT r.id) as provider_review_count
          FROM provider_services ps
          JOIN provider_profiles pp ON ps.provider_id = pp.provider_id
          JOIN users u ON pp.provider_id = u.id
          LEFT JOIN reviews r ON pp.provider_id = r.provider_id
          WHERE ps.is_active = true AND u.role = 'provider' AND u.is_active = true
        `;

        const conditions: string[] = [];
        const params: any[] = [];

        // Filtro de búsqueda por texto
        if (search) {
          conditions.push(`(
            ps.name LIKE ? OR 
            ps.description LIKE ? OR 
            ps.custom_category LIKE ? OR
            u.name LIKE ?
          )`);
          const searchPattern = `%${search}%`;
          params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        // Filtro por categoría
        if (category) {
          conditions.push(`ps.custom_category LIKE ?`);
          params.push(`%${category}%`);
        }

        // Filtro por ubicación
        if (location) {
          conditions.push(`(
            pp.main_region LIKE ? OR 
            pp.main_commune LIKE ?
          )`);
          const locationPattern = `%${location}%`;
          params.push(locationPattern, locationPattern);
        }

        // Filtro por precio
        if (price_min) {
          conditions.push(`ps.price >= ?`);
          params.push(parseInt(price_min as string));
        }
        if (price_max) {
          conditions.push(`ps.price <= ?`);
          params.push(parseInt(price_max as string));
        }

        // Filtro por duración máxima
        if (duration_max) {
          conditions.push(`ps.duration_minutes <= ?`);
          params.push(parseInt(duration_max as string));
        }

        // Agregar condiciones a la consulta
        if (conditions.length > 0) {
          query += ` AND ${conditions.join(' AND ')}`;
        }

        // Agrupar y ordenar
        query += `
          GROUP BY ps.id, ps.name, ps.description, ps.price, ps.duration_minutes, ps.custom_category,
                   ps.service_image_url, ps.is_featured, ps.provider_id, u.name, pp.professional_title,
                   pp.profile_photo_url, pp.main_region, pp.main_commune
          ORDER BY ps.is_featured DESC, ps.order_index ASC, ps.price ASC
          LIMIT ? OFFSET ?
        `;

        params.push(parseInt(limit as string), parseInt(offset as string));

        console.log('[CLIENT_SEARCH] Query servicios:', query);
        console.log('[CLIENT_SEARCH] Parámetros servicios:', params);
        console.log('[CLIENT_SEARCH] Número de parámetros:', params.length);
        console.log('[CLIENT_SEARCH] Número de ? en query:', (query.match(/\?/g) || []).length);
        console.log('[CLIENT_SEARCH] Filtros aplicados - search:', search, 'location:', location, 'category:', category);

        const [rows] = await pool.execute(query, params);
        
        const services = (rows as any[]).map(service => ({
          id: service.id,
          name: service.name,
          description: service.description,
          price: service.price,
          duration_minutes: service.duration_minutes,
          category: service.custom_category,
          image_url: service.service_image_url ? `${process.env.API_BASE_URL || 'http://localhost:3000'}${service.service_image_url}` : null,
          is_featured: service.is_featured,
          provider: {
            id: service.provider_id,
            name: service.provider_name,
            profession: service.provider_profession,
            avatar_url: service.provider_avatar_url ? `${process.env.API_BASE_URL || 'http://localhost:3000'}${service.provider_avatar_url}` : null,
            location: service.provider_location || service.main_region,
            rating: parseFloat(service.provider_rating.toFixed(1)),
            review_count: service.provider_review_count
          }
        }));

        console.log('[CLIENT_SEARCH] ✅ Servicios encontrados:', services.length);

        Logger.info(MODULE, 'Services search completed', { 
          count: services.length, 
          filters: { search, category, location, price_min, price_max, duration_max }
        });

        return res.json({
          success: true,
          data: services,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            total: services.length,
            has_more: services.length === parseInt(limit as string)
          }
        });

      } catch (error: any) {
        console.error('[CLIENT_SEARCH] ❌ Error buscando servicios:', error);
        Logger.error(MODULE, 'Error searching services', error);
        return res.status(500).json({
          success: false,
          error: 'Error al buscar servicios'
        });
      }
    });

    // GET /client/search/categories - Obtener categorías disponibles
    this.router.get('/client/search/categories', async (req: Request, res: Response) => {
      try {
        console.log('[CLIENT_SEARCH] Obteniendo categorías disponibles');

        const pool = DatabaseConnection.getPool();
        
        const [rows] = await pool.execute(`
          SELECT DISTINCT 
            ps.custom_category as name,
            COUNT(*) as count
          FROM provider_services ps
          JOIN provider_profiles pp ON ps.provider_id = pp.provider_id
          JOIN users u ON pp.provider_id = u.id
          WHERE ps.is_active = true 
            AND u.role = 'provider' 
            AND u.is_active = true
            AND ps.custom_category IS NOT NULL
            AND ps.custom_category != ''
          GROUP BY ps.custom_category
          ORDER BY count DESC, ps.custom_category ASC
        `);

        const categories = (rows as any[]).map(row => ({
          name: row.name,
          count: row.count
        }));

        console.log('[CLIENT_SEARCH] ✅ Categorías encontradas:', categories.length);

        return res.json({
          success: true,
          data: categories
        });

      } catch (error: any) {
        console.error('[CLIENT_SEARCH] ❌ Error obteniendo categorías:', error);
        Logger.error(MODULE, 'Error getting categories', error);
        return res.status(500).json({
          success: false,
          error: 'Error al obtener categorías'
        });
      }
    });

    // GET /client/search/locations - Obtener ubicaciones disponibles
    this.router.get('/client/search/locations', async (req: Request, res: Response) => {
      try {
        console.log('[CLIENT_SEARCH] Obteniendo ubicaciones disponibles');

        const pool = DatabaseConnection.getPool();
        
        const [rows] = await pool.execute(`
          SELECT DISTINCT 
            pp.main_region as region,
            pp.main_commune as commune,
            COUNT(*) as count
          FROM provider_profiles pp
          JOIN users u ON pp.provider_id = u.id
          WHERE u.role = 'provider' 
            AND u.is_active = true
            AND pp.main_region IS NOT NULL
            AND pp.main_commune IS NOT NULL
          GROUP BY pp.main_region, pp.main_commune
          ORDER BY pp.main_region ASC, count DESC
        `);

        const locations = (rows as any[]).map(row => ({
          region: row.region,
          commune: row.commune,
          count: row.count
        }));

        console.log('[CLIENT_SEARCH] ✅ Ubicaciones encontradas:', locations.length);

        return res.json({
          success: true,
          data: locations
        });

      } catch (error: any) {
        console.error('[CLIENT_SEARCH] ❌ Error obteniendo ubicaciones:', error);
        Logger.error(MODULE, 'Error getting locations', error);
        return res.status(500).json({
          success: false,
          error: 'Error al obtener ubicaciones'
        });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}
