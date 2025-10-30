import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';
import { EmailService } from '../../../shared/services/email.service';

type TermValidationReason = 'too_short' | 'offensive';
interface TermValidationResult {
  ok: boolean;
  sanitized: string;
  normalized: string;
  reason?: TermValidationReason;
}

const DEFAULT_BLACKLIST_TERMS = [
  'puta', 'puto', 'mierda', 'caca', 'kaka', 'sexo', 'porn', 'porno', 'verga', 'pene', 'vagina',
  'fuck', 'shit', 'asshole', 'bitch', 'faggot', 'slut', 'cock', 'dick', 'anal', 'pedo',
  'rape', 'rapist'
];

const TERM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_ATTEMPTS = 5;

const blacklistCache: { terms: Set<string>; loadedAt: number } = {
  terms: new Set<string>(),
  loadedAt: 0
};

const inviteRateLimiter = new Map<string, { count: number; resetAt: number }>();

const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.CLIENT_APP_URL || 'https://adomiapp.com').replace(/\/$/, '');

function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeTermForComparison(term: string): string {
  return stripDiacritics(term).toLowerCase();
}

async function loadBlacklist(pool: ReturnType<typeof DatabaseConnection.getPool>) {
  const now = Date.now();
  if (now - blacklistCache.loadedAt < TERM_CACHE_TTL_MS && blacklistCache.terms.size > 0) {
    return;
  }
  try {
    const [rows]: any[] = await pool.query('SELECT term FROM referral_blacklist_terms');
    const normalized = rows.map((row: any) => normalizeTermForComparison(String(row.term || '')));
    blacklistCache.terms = new Set(normalized.filter(Boolean));
    blacklistCache.loadedAt = now;
  } catch (error) {
    Logger.warn(MODULE, 'No se pudo cargar blacklist de términos', error as any);
    blacklistCache.terms = new Set<string>();
    blacklistCache.loadedAt = now;
  }
}

async function getBlacklist(pool: ReturnType<typeof DatabaseConnection.getPool>): Promise<Set<string>> {
  await loadBlacklist(pool);
  const merged = new Set<string>();
  DEFAULT_BLACKLIST_TERMS.forEach(term => {
    const normalized = normalizeTermForComparison(term);
    if (normalized) merged.add(normalized);
  });
  blacklistCache.terms.forEach(term => {
    if (term) merged.add(term);
  });
  return merged;
}

function sanitizeRawTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 120);
}

async function validateSearchTerm(pool: ReturnType<typeof DatabaseConnection.getPool>, rawTerm: string): Promise<TermValidationResult> {
  const sanitized = sanitizeRawTerm(rawTerm);
  if (!sanitized) {
    return { ok: false, sanitized: '', normalized: '', reason: 'too_short' };
  }
  if (sanitized.length < 2) {
    return { ok: false, sanitized, normalized: normalizeTermForComparison(sanitized), reason: 'too_short' };
  }

  const normalized = normalizeTermForComparison(sanitized);
  if (!normalized) {
    return { ok: false, sanitized: '', normalized: '', reason: 'too_short' };
  }

  const blacklist = await getBlacklist(pool);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const normalizedWithoutSpaces = normalized.replace(/\s+/g, '');

  for (const banned of blacklist) {
    if (!banned) continue;
    if (normalized.includes(banned)) {
      return { ok: false, sanitized, normalized, reason: 'offensive' };
    }
    if (normalizedWithoutSpaces.includes(banned)) {
      return { ok: false, sanitized, normalized, reason: 'offensive' };
    }
    if (tokens.some(token => token === banned)) {
      return { ok: false, sanitized, normalized, reason: 'offensive' };
    }
  }

  return { ok: true, sanitized, normalized };
}

function checkInviteRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = inviteRateLimiter.get(key);
  if (!entry || now > entry.resetAt) {
    inviteRateLimiter.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

function buildReferralLink(normalizedTerm: string, channel: 'email' | 'whatsapp' | 'copy'): string {
  const slug = normalizedTerm.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const baseLink = `${PUBLIC_APP_URL}/auth/register`;
  const params = new URLSearchParams({
    ref: 'explore-empty',
    term: slug || 'servicio',
    utm_source: 'referral',
    utm_medium: channel,
    utm_campaign: 'explore-empty'
  });
  return `${baseLink}?${params.toString()}`;
}


const MODULE = 'CLIENT_SEARCH';

export class ClientSearchRoutes {
  private router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // POST /client/search/validate-term - validar término de búsqueda
    this.router.post('/client/search/validate-term', authenticateToken, async (req: Request, res: Response) => {
      try {
        const pool = DatabaseConnection.getPool();
        const rawTerm = String((req.body?.term ?? '')).slice(0, 256);
        const validation = await validateSearchTerm(pool, rawTerm);
        return res.json({
          ok: validation.ok,
          sanitized: validation.sanitized,
          normalized: validation.normalized,
          reason: validation.reason ?? null
        });
      } catch (error) {
        Logger.error(MODULE, 'Error validating search term', error as any);
        return res.status(500).json({ ok: false, error: 'Error al validar término' });
      }
    });

    // POST /client/referrals/invite - registrar invitación y enviar email opcional
    this.router.post('/client/referrals/invite', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user || {};
        const clientId = user?.role === 'client' ? Number(user.id) : null;
        const pool = DatabaseConnection.getPool();
        const rawTerm = String((req.body?.searchTerm ?? '')).slice(0, 256);
        const validation = await validateSearchTerm(pool, rawTerm);

        if (!validation.ok) {
          return res.status(400).json({ ok: false, reason: validation.reason ?? 'too_short', sanitized: validation.sanitized });
        }

        let channel = String(req.body?.channel || '').toLowerCase();
        if (!['email', 'whatsapp', 'copy'].includes(channel)) {
          channel = 'whatsapp';
        }

        let source = String(req.body?.source || 'explore-empty').toLowerCase();
        if (!['explore-empty', 'share-link'].includes(source)) {
          source = 'explore-empty';
        }

        const inviteeEmailRaw = typeof req.body?.inviteeEmail === 'string' ? req.body.inviteeEmail.trim() : '';
        const inviteeEmail = inviteeEmailRaw ? inviteeEmailRaw.toLowerCase() : '';
        if (inviteeEmail) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(inviteeEmail)) {
            return res.status(400).json({ ok: false, error: 'email_invalid' });
          }
        }

        const rateKey = clientId ? `client:${clientId}` : `ip:${req.ip}`;
        if (!checkInviteRateLimit(rateKey)) {
          return res.status(429).json({ ok: false, error: 'rate_limit' });
        }

        const referralLink = buildReferralLink(validation.normalized, channel as 'email' | 'whatsapp' | 'copy');
        const locationLabel = typeof req.body?.locationLabel === 'string' ? String(req.body.locationLabel).trim().slice(0, 120) : '';

        await pool.execute(
          `INSERT INTO referral_invites (client_id, search_term, invitee_email, source, channel, referral_link, meta)
           VALUES (?, ?, ?, ?, ?, ?, JSON_OBJECT('user_agent', ?, 'ip', ?, 'location', ?))`,
          [
            clientId || null,
            validation.sanitized,
            inviteeEmail || null,
            source,
            channel,
            referralLink,
            req.get('user-agent') || '',
            req.ip || '',
            locationLabel
          ]
        );

        let emailSent = false;
        if (channel === 'email' && inviteeEmail) {
          try {
            const subject = `Te invitaron a ofrecer ${validation.sanitized} en AdomiApp`;
            const html = `
              <p>Hola 👋</p>
              <p>Te invitaron a unirte a <strong>AdomiApp</strong> para ofrecer servicios de <strong>${validation.sanitized}</strong>.</p>
              <p>Regístrate aquí y comienza a recibir clientes:</p>
              <p><a href="${referralLink}" target="_blank" rel="noopener noreferrer">${referralLink}</a></p>
              <p>¡Te esperamos!<br/>Equipo AdomiApp</p>
            `;
            await EmailService.sendRaw(inviteeEmail, subject, html);
            emailSent = true;
          } catch (err) {
            Logger.warn(MODULE, 'No se pudo enviar email de invitación', err as any);
          }
        }

        Logger.info(MODULE, 'Referral invite registrada', {
          clientId,
          source,
          channel,
          sanitized: validation.sanitized,
          inviteeEmail: inviteeEmail || null
        });

        return res.json({ ok: true, referralLink, emailSent });
      } catch (error) {
        Logger.error(MODULE, 'Error registrando invitación de referidos', error as any);
        return res.status(500).json({ ok: false, error: 'Error al registrar invitación' });
      }
    });

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
        
        // Validate and sanitize pagination to avoid prepared statements issues with LIMIT/OFFSET
        const limitNumber = Math.max(1, Math.min(100, Number.parseInt(limit as string, 10) || 20));
        const offsetNumber = Math.max(0, Number.parseInt(offset as string, 10) || 0);
        
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

        // Filtro por ubicación (acepta slug con guiones y con espacios)
        if (location) {
          const rawLocation = String(location).toLowerCase();
          const locationWithSpaces = rawLocation.replace(/-/g, ' ');
          const patternSpaces = `%${locationWithSpaces}%`;
          const patternSlug = `%${rawLocation}%`;
          conditions.push(`(
            LOWER(pp.main_region) LIKE ? OR 
            LOWER(pp.main_commune) LIKE ? OR
            LOWER(REPLACE(pp.main_region, ' ', '-')) LIKE ? OR
            LOWER(REPLACE(pp.main_commune, ' ', '-')) LIKE ? OR
            EXISTS (
              SELECT 1 FROM provider_locations pl
              WHERE pl.provider_id = pp.provider_id AND (
                LOWER(pl.region) LIKE ? OR
                LOWER(pl.commune) LIKE ? OR
                LOWER(REPLACE(pl.region, ' ', '-')) LIKE ? OR
                LOWER(REPLACE(pl.commune, ' ', '-')) LIKE ?
              )
            )
          )`);
          params.push(patternSpaces, patternSpaces, patternSlug, patternSlug, patternSpaces, patternSpaces, patternSlug, patternSlug);
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

        // Nota: el filtro de rating mínimo se aplicará en HAVING para no usar agregados en WHERE

        // Agregar condiciones a la consulta
        if (conditions.length > 0) {
          query += ` AND ${conditions.join(' AND ')}`;
        }

        // Agrupar
        query += `
          GROUP BY pp.provider_id, u.name, u.email, pp.professional_title, pp.bio, 
                   pp.profile_photo_url, pp.main_region, pp.main_commune, pp.years_experience, pp.is_online
        `;

        // HAVING dinámico (services_count y rating mínimo)
        const havingClauses: string[] = ['services_count > 0'];
        if (rating_min) {
          havingClauses.push('rating >= ?');
          params.push(parseFloat(rating_min as string));
        }
        query += `
          HAVING ${havingClauses.join(' AND ')}
          ORDER BY rating DESC, review_count DESC, services_count DESC
          LIMIT ${limitNumber} OFFSET ${offsetNumber}
        `;

        console.log('[CLIENT_SEARCH] Query final:', query);
        console.log('[CLIENT_SEARCH] Parámetros:', params);
        console.log('[CLIENT_SEARCH] Número de parámetros:', params.length);
        console.log('[CLIENT_SEARCH] Número de ? en query:', (query.match(/\?/g) || []).length);
        console.log('[CLIENT_SEARCH] Filtros aplicados - search:', search, 'location:', location, 'category:', category);

        const [rows] = await pool.execute(query, params);
        
        // Obtener servicios para cada profesional
        // Base pública para construir URLs absolutas de imágenes
        // Preferir PUBLIC_BASE_URL; si no existe, usar host del request (soporta HTTPS y dominios en prod)
        const publicBase = process.env.PUBLIC_BASE_URL 
          || process.env.API_BASE_URL 
          || `${req.protocol}://${req.get('host')}`;
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

          const ratingNumber = Number(provider.rating ?? 0);
          const ratingRounded = Math.round(ratingNumber * 10) / 10;

          return {
            id: provider.provider_id,
            name: provider.provider_name,
            email: provider.provider_email,
            profession: provider.profession || 'Profesional',
            description: provider.description || 'Sin descripción disponible',
            rating: ratingRounded,
            review_count: provider.review_count,
            avatar_url: provider.avatar_url ? `${publicBase}${provider.avatar_url}` : null,
            location: provider.location || provider.main_region,
            services_count: provider.services_count,
            experience_years: provider.years_experience,
            is_online: !!provider.is_online,
            available_for_bookings: provider.available_for_bookings,
            services: (servicesRows as any[]).map(service => ({
              id: service.id,
              name: service.name,
              description: service.description,
              price: service.price,
              duration_minutes: service.duration_minutes,
              category: service.custom_category,
              image_url: service.service_image_url ? `${publicBase}${service.service_image_url}` : null,
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
            limit: limitNumber,
            offset: offsetNumber,
            total: providers.length,
            has_more: providers.length === limitNumber
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
        
        // Validate and sanitize pagination to avoid prepared statements issues with LIMIT/OFFSET
        const limitNumber = Math.max(1, Math.min(100, Number.parseInt(limit as string, 10) || 20));
        const offsetNumber = Math.max(0, Number.parseInt(offset as string, 10) || 0);
        
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

        // Filtro por ubicación (acepta slug con guiones y con espacios)
        if (location) {
          const rawLocation = String(location).toLowerCase();
          const locationWithSpaces = rawLocation.replace(/-/g, ' ');
          const patternSpaces = `%${locationWithSpaces}%`;
          const patternSlug = `%${rawLocation}%`;
          conditions.push(`(
            LOWER(pp.main_region) LIKE ? OR 
            LOWER(pp.main_commune) LIKE ? OR
            LOWER(REPLACE(pp.main_region, ' ', '-')) LIKE ? OR
            LOWER(REPLACE(pp.main_commune, ' ', '-')) LIKE ? OR
            EXISTS (
              SELECT 1 FROM provider_locations pl
              WHERE pl.provider_id = pp.provider_id AND (
                LOWER(pl.region) LIKE ? OR
                LOWER(pl.commune) LIKE ? OR
                LOWER(REPLACE(pl.region, ' ', '-')) LIKE ? OR
                LOWER(REPLACE(pl.commune, ' ', '-')) LIKE ?
              )
            )
          )`);
          params.push(patternSpaces, patternSpaces, patternSlug, patternSlug, patternSpaces, patternSpaces, patternSlug, patternSlug);
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

        // Agrupar, ordenar y paginar
        query += `
          GROUP BY ps.id, ps.name, ps.description, ps.price, ps.duration_minutes, ps.custom_category,
                   ps.service_image_url, ps.is_featured, ps.provider_id, u.name, pp.professional_title,
                   pp.profile_photo_url, pp.main_region, pp.main_commune
          ORDER BY ps.is_featured DESC, ps.order_index ASC, ps.price ASC
          LIMIT ${limitNumber} OFFSET ${offsetNumber}
        `;

        console.log('[CLIENT_SEARCH] Query servicios:', query);
        console.log('[CLIENT_SEARCH] Parámetros servicios:', params);
        console.log('[CLIENT_SEARCH] Número de parámetros:', params.length);
        console.log('[CLIENT_SEARCH] Número de ? en query:', (query.match(/\?/g) || []).length);
        console.log('[CLIENT_SEARCH] Filtros aplicados - search:', search, 'location:', location, 'category:', category);

        const [rows] = await pool.execute(query, params);
        
        const services = (rows as any[]).map(service => {
          const providerRatingNumber = Number(service.provider_rating ?? 0);
          const providerRatingRounded = Math.round(providerRatingNumber * 10) / 10;

          return {
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
              rating: providerRatingRounded,
              review_count: service.provider_review_count
            }
          };
        });

        console.log('[CLIENT_SEARCH] ✅ Servicios encontrados:', services.length);

        Logger.info(MODULE, 'Services search completed', { 
          count: services.length, 
          filters: { search, category, location, price_min, price_max, duration_max }
        });

        return res.json({
          success: true,
          data: services,
          pagination: {
            limit: limitNumber,
            offset: offsetNumber,
            total: services.length,
            has_more: services.length === limitNumber
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
