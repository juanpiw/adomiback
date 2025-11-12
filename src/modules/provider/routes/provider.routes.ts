import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, requireRole, AuthUser } from '../../../shared/middleware/auth.middleware';
import { getClientReviewSummary } from '../../reviews';

// Use shared authenticateToken which re-hydrates role from DB

export class ProviderRoutes {
  private router: Router;

  constructor() {
    this.router = Router();
    this.mountRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private mountRoutes() {
    // GET /provider/profile - Obtener perfil del provider
    this.router.get('/provider/profile', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        console.log('[PROVIDER_ROUTES] GET /provider/profile - Usuario:', user.id, 'rol:', user.role);
        
        if (user.role !== 'provider') {
          console.log('[PROVIDER_ROUTES] Usuario no es provider');
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder a este endpoint' });
        }

        const pool = DatabaseConnection.getPool();
        
        // Obtener datos del usuario
        const [userRows] = await pool.query(
          `SELECT id, name, email, role FROM users WHERE id = ?`,
          [user.id]
        );
        const userData = (userRows as any[])[0];
        console.log('[PROVIDER_ROUTES] Datos de usuario:', userData);

        // Obtener perfil de provider
        const [profileRows] = await pool.query(
          `SELECT 
            provider_id,
            full_name,
            professional_title,
            main_commune,
            main_region,
            years_experience,
            bio,
            profile_photo_url,
            cover_photo_url,
            profile_completion,
            is_verified,
            verification_status,
            profile_views,
            rating_average,
            review_count,
            completed_appointments,
            is_online,
            last_seen,
            bank_name,
            bank_account,
            account_holder,
            account_rut,
            account_type,
            created_at,
            updated_at
          FROM provider_profiles 
          WHERE provider_id = ?`,
          [user.id]
        );
        
        const profile = (profileRows as any[])[0];
        console.log('[PROVIDER_ROUTES] Perfil encontrado:', profile ? 'sí' : 'no');

        // Si no existe el perfil, crearlo con datos básicos
        if (!profile) {
          console.log('[PROVIDER_ROUTES] Creando perfil básico para provider:', user.id);
          await pool.execute(
            `INSERT INTO provider_profiles (provider_id, full_name, profile_completion) VALUES (?, ?, ?)`,
            [user.id, userData.name || 'Provider', 0]
          );
          
          // Obtener el perfil recién creado
          const [newProfileRows] = await pool.query(
            `SELECT * FROM provider_profiles WHERE provider_id = ?`,
            [user.id]
          );
          
          const newProfile = (newProfileRows as any[])[0];
          console.log('[PROVIDER_ROUTES] Perfil creado:', newProfile);
          
          return res.status(200).json({
            success: true,
            profile: {
              ...userData,
              ...newProfile,
              profile_photo_url: newProfile.profile_photo_url || null
            }
          });
        }

        // Combinar datos del usuario y del perfil
        const fullProfile = {
          ...userData,
          ...profile,
          profile_photo_url: profile.profile_photo_url || null
        };

        console.log('[PROVIDER_ROUTES] Perfil completo:', fullProfile);
        return res.status(200).json({ success: true, profile: fullProfile });
        
      } catch (error: any) {
        console.error('[PROVIDER_ROUTES] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener perfil', details: error.message });
      }
    });

    // PUT /provider/profile - Actualizar perfil del provider
    this.router.put('/provider/profile', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        console.log('[PROVIDER_ROUTES] PUT /provider/profile - Usuario:', user.id);
        
        if (user.role !== 'provider') {
          return res.status(403).json({ success: false, error: 'Solo providers pueden acceder a este endpoint' });
        }

        const { 
          full_name, 
          professional_title, 
          main_commune, 
          main_region, 
          years_experience, 
          bio,
          bank_name,
          bank_account,
          account_holder,
          account_rut,
          account_type
        } = req.body;

        // Convertir undefined a null para MySQL2
        const processedData = {
          full_name: full_name || null,
          professional_title: professional_title || null,
          main_commune: main_commune || null,
          main_region: main_region || null,
          years_experience: years_experience || null,
          bio: bio || null,
          bank_name: bank_name || null,
          bank_account: bank_account || null,
          account_holder: account_holder || null,
          account_rut: account_rut || null,
          account_type: account_type || null
        };

        console.log('[PROVIDER_ROUTES] Datos recibidos:', {
          full_name, 
          professional_title, 
          main_commune, 
          main_region, 
          years_experience, 
          bio,
          bank_name,
          bank_account,
          account_holder,
          account_rut,
          account_type,
          userId: user.id
        });

        console.log('[PROVIDER_ROUTES] Datos procesados:', {
          ...processedData,
          userId: user.id
        });

        // Validar que al menos un campo tenga valor
        if (!processedData.full_name && !processedData.professional_title && !processedData.main_commune && !processedData.years_experience && !processedData.bio && !processedData.bank_name && !processedData.bank_account && !processedData.account_holder && !processedData.account_rut && !processedData.account_type) {
          return res.status(400).json({ 
            success: false, 
            error: 'Al menos un campo debe tener un valor para actualizar' 
          });
        }

        const pool = DatabaseConnection.getPool();
        
        console.log('[PROVIDER_ROUTES] Ejecutando query UPDATE con parámetros procesados:', {
          ...processedData,
          userId: user.id
        });
        
        // Actualizar perfil
        const [updateResult] = await pool.execute(
          `UPDATE provider_profiles 
           SET full_name = COALESCE(NULLIF(?, ''), full_name), 
               professional_title = COALESCE(NULLIF(?, ''), professional_title), 
               main_commune = COALESCE(NULLIF(?, ''), main_commune), 
               main_region = COALESCE(?, main_region), 
               years_experience = COALESCE(?, years_experience), 
               bio = COALESCE(NULLIF(?, ''), bio),
               bank_name = COALESCE(NULLIF(?, ''), bank_name),
               bank_account = COALESCE(NULLIF(?, ''), bank_account),
               account_holder = COALESCE(NULLIF(?, ''), account_holder),
               account_rut = COALESCE(NULLIF(?, ''), account_rut),
               account_type = COALESCE(NULLIF(?, ''), account_type),
               last_profile_update = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE provider_id = ?`,
          [
            processedData.full_name, 
            processedData.professional_title, 
            processedData.main_commune, 
            processedData.main_region, 
            processedData.years_experience, 
            processedData.bio,
            processedData.bank_name,
            processedData.bank_account,
            processedData.account_holder,
            processedData.account_rut,
            processedData.account_type,
            user.id
          ]
        );

        console.log('[PROVIDER_ROUTES] Resultado del UPDATE:', updateResult);

        // También actualizar el nombre en la tabla users
        if (processedData.full_name) {
          await pool.execute(
            `UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [processedData.full_name, user.id]
          );
        }

        // Obtener perfil actualizado
        const [rows] = await pool.query(
          `SELECT * FROM provider_profiles WHERE provider_id = ?`,
          [user.id]
        );

        const profile = (rows as any[])[0];
        console.log('[PROVIDER_ROUTES] Perfil actualizado:', profile);

        return res.status(200).json({ success: true, profile });
        
      } catch (error: any) {
        console.error('[PROVIDER_ROUTES] Error:', error);
        return res.status(500).json({ success: false, error: 'Error al actualizar perfil', details: error.message });
      }
    });

    // GET /provider/clients/:clientId/profile - Ver perfil del cliente asociado al proveedor
    this.router.get('/provider/clients/:clientId/profile', authenticateToken, requireRole('provider'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        const clientId = Number(req.params.clientId);

        if (!Number.isFinite(clientId) || clientId <= 0) {
          return res.status(400).json({ success: false, error: 'clientId inválido' });
        }

        const pool = DatabaseConnection.getPool();

        const [relationRows]: any = await pool.query(
          `SELECT id FROM appointments WHERE provider_id = ? AND client_id = ? LIMIT 1`,
          [user.id, clientId]
        );

        if (!Array.isArray(relationRows) || relationRows.length === 0) {
          return res.status(404).json({ success: false, error: 'Cliente no asociado a este proveedor' });
        }

        const [rows]: any = await pool.query(
          `SELECT 
             u.id AS client_id,
             u.name AS user_name,
             u.email,
             u.created_at AS user_created_at,
             cp.full_name,
             cp.phone,
             cp.profile_photo_url,
             cp.address,
             cp.commune,
             cp.region,
             cp.preferred_language,
             cp.notes,
             cp.verification_status,
             cp.is_verified,
             cp.client_rating_average,
             cp.client_review_count,
             cp.created_at AS profile_created_at,
             cp.updated_at AS profile_updated_at
           FROM users u
           LEFT JOIN client_profiles cp ON cp.client_id = u.id
           WHERE u.id = ?
           LIMIT 1`,
          [clientId]
        );

        if (!Array.isArray(rows) || rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        const row = rows[0];
        const publicBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const profilePhotoUrl = row.profile_photo_url ? `${publicBase}${row.profile_photo_url}` : null;

        const summary = await getClientReviewSummary(clientId);

        const [recentReviewRows]: any = await pool.query(
          `SELECT cr.id,
                  cr.appointment_id,
                  cr.rating,
                  cr.comment,
                  cr.created_at,
                  up.name AS provider_name
             FROM client_reviews cr
             LEFT JOIN users up ON up.id = cr.provider_id
            WHERE cr.client_id = ?
            ORDER BY cr.created_at DESC
            LIMIT 5`,
          [clientId]
        );

        const recentReviews = (recentReviewRows as any[]).map((review) => ({
          id: review.id,
          appointment_id: review.appointment_id,
          rating: Number(review.rating),
          comment: review.comment || null,
          created_at: review.created_at,
          provider_name: review.provider_name || null
        }));

        return res.status(200).json({
          success: true,
          client: {
            client_id: row.client_id,
            full_name: row.full_name || row.user_name || '',
            display_name: row.user_name || '',
            email: row.email || '',
            phone: row.phone || '',
            address: row.address || '',
            commune: row.commune || '',
            region: row.region || '',
            preferred_language: row.preferred_language || 'es',
            notes: row.notes || '',
            verification_status: row.verification_status || 'none',
            is_verified: !!row.is_verified,
            rating_average: row.client_rating_average !== null && row.client_rating_average !== undefined
              ? Number(row.client_rating_average)
              : summary.reviewAverage,
            review_count: row.client_review_count !== null && row.client_review_count !== undefined
              ? Number(row.client_review_count)
              : summary.reviewCount,
            profile_photo_url: profilePhotoUrl,
            profile_created_at: row.profile_created_at,
            profile_updated_at: row.profile_updated_at,
            user_created_at: row.user_created_at
          },
          reviews: {
            summary: {
              count: summary.reviewCount,
              average: summary.reviewAverage
            },
            recent: recentReviews
          }
        });
      } catch (error: any) {
        console.error('[PROVIDER_ROUTES] Error obteniendo perfil de cliente:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener perfil del cliente', details: error.message });
      }
    });
  }
}

