import { Router, Request, Response } from 'express';
import DatabaseConnection from '../../../shared/database/connection';
import { JWTUtil } from '../../../shared/utils/jwt.util';

interface AuthUser {
  id: number;
  email: string;
  role: 'client' | 'provider';
}

function authenticateToken(req: Request, res: Response, next: () => void) {
  const token = JWTUtil.extractTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const payload = JWTUtil.verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  (req as any).user = {
    id: payload.userId,
    email: payload.email,
    role: payload.role
  } as AuthUser;
  next();
}

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
    this.router.get('/provider/profile', authenticateToken, async (req: Request, res: Response) => {
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
    this.router.put('/provider/profile', authenticateToken, async (req: Request, res: Response) => {
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
          bio 
        } = req.body;

        console.log('[PROVIDER_ROUTES] Datos recibidos:', {
          full_name, 
          professional_title, 
          main_commune, 
          main_region, 
          years_experience, 
          bio,
          userId: user.id
        });

        // Validar que al menos un campo tenga valor
        if (!full_name && !professional_title && !main_commune && !years_experience && !bio) {
          return res.status(400).json({ 
            success: false, 
            error: 'Al menos un campo debe tener un valor para actualizar' 
          });
        }

        const pool = DatabaseConnection.getPool();
        
        console.log('[PROVIDER_ROUTES] Ejecutando query UPDATE con parámetros:', {
          full_name, 
          professional_title, 
          main_commune, 
          main_region, 
          years_experience, 
          bio, 
          userId: user.id
        });
        
        // Actualizar perfil
        const [updateResult] = await pool.execute(
          `UPDATE provider_profiles 
           SET full_name = COALESCE(NULLIF(?, ''), full_name), 
               professional_title = COALESCE(NULLIF(?, ''), professional_title), 
               main_commune = COALESCE(NULLIF(?, ''), main_commune), 
               main_region = ?, 
               years_experience = COALESCE(?, years_experience), 
               bio = COALESCE(NULLIF(?, ''), bio),
               last_profile_update = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE provider_id = ?`,
          [full_name, professional_title, main_commune, main_region, years_experience, bio, user.id]
        );

        console.log('[PROVIDER_ROUTES] Resultado del UPDATE:', updateResult);

        // También actualizar el nombre en la tabla users
        if (full_name) {
          await pool.execute(
            `UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [full_name, user.id]
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

