import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';

export class ClientProviderRoutes {
  private router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // GET /client/providers/:id/detail - Perfil público de proveedor (para clientes)
    this.router.get('/client/providers/:id/detail', authenticateToken, async (req: Request, res: Response) => {
      try {
        const providerId = parseInt(req.params.id, 10);
        if (!providerId || Number.isNaN(providerId)) {
          return res.status(400).json({ success: false, error: 'Provider id inválido' });
        }

        const pool = DatabaseConnection.getPool();

        // Datos básicos del usuario/proveedor y perfil
        const [profileRows] = await pool.query(
          `SELECT 
             u.id as provider_id,
             COALESCE(pp.full_name, u.name) as full_name,
             u.email,
             pp.professional_title,
             pp.main_commune,
             pp.main_region,
             pp.years_experience,
             pp.bio,
             pp.profile_photo_url,
             pp.cover_photo_url,
             COALESCE(pp.rating_average, 0) as rating_average,
             COALESCE(pp.review_count, 0) as review_count,
             pp.is_verified,
             pp.created_at,
             pp.updated_at
           FROM users u
           LEFT JOIN provider_profiles pp ON pp.provider_id = u.id
           WHERE u.id = ? AND u.role = 'provider' AND u.is_active = true`,
          [providerId]
        );
        const profile = (profileRows as any[])[0];
        if (!profile) {
          return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
        }

        // Servicios activos del proveedor
        const [servicesRows] = await pool.query(
          `SELECT id, name, description, price, duration_minutes, custom_category, service_image_url, is_featured
           FROM provider_services
           WHERE provider_id = ? AND is_active = true
           ORDER BY is_featured DESC, order_index ASC, price ASC`,
          [providerId]
        );

        // Portafolio
        const [portfolioRows] = await pool.query(
          `SELECT id, file_url as image_url, title, description
           FROM provider_portfolio
           WHERE provider_id = ? AND is_active = true
           ORDER BY order_index ASC, created_at DESC`,
          [providerId]
        );

        // Reseñas visibles más recientes
        const [reviewsRows] = await pool.query(
          `SELECT r.id, r.rating, r.comment, r.created_at,
                  c.name as client_name
           FROM reviews r
           JOIN users c ON r.client_id = c.id
           WHERE r.provider_id = ? AND r.is_visible = true
           ORDER BY r.created_at DESC
           LIMIT 20`,
          [providerId]
        );

        const apiBase = process.env.API_BASE_URL || 'http://localhost:3000';

        const data = {
          profile: {
            id: profile.provider_id,
            name: profile.full_name,
            email: profile.email,
            title: profile.professional_title,
            location: profile.main_commune || profile.main_region,
            years_experience: profile.years_experience,
            bio: profile.bio,
            avatar_url: profile.profile_photo_url ? `${apiBase}${profile.profile_photo_url}` : null,
            cover_url: profile.cover_photo_url ? `${apiBase}${profile.cover_photo_url}` : null,
            rating: Number(profile.rating_average || 0),
            reviews_count: Number(profile.review_count || 0),
            is_verified: !!profile.is_verified
          },
          services: (servicesRows as any[]).map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            price: s.price,
            duration_minutes: s.duration_minutes,
            category: s.custom_category,
            image_url: s.service_image_url ? `${apiBase}${s.service_image_url}` : null,
            is_featured: !!s.is_featured
          })),
          portfolio: (portfolioRows as any[]).map((p) => ({
            id: p.id,
            image_url: p.image_url?.startsWith('http') ? p.image_url : `${apiBase}${p.image_url}`,
            title: p.title || null,
            description: p.description || null
          })),
          reviews: (reviewsRows as any[]).map((r) => ({
            id: r.id,
            rating: Number(r.rating || 0),
            comment: r.comment || '',
            client_name: r.client_name || 'Cliente',
            created_at: r.created_at
          }))
        };

        return res.json({ success: true, data });
      } catch (error: any) {
        console.error('[CLIENT_PROVIDER] Error obteniendo detalle de proveedor:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener detalle de proveedor' });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}




