import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, requireRole, AuthUser } from '../../../shared/middleware/auth.middleware';

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
  }
}

