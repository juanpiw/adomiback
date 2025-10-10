import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { pool, executeQuery } from '../lib/db';

const router = Router();

/**
 * GET /profile/validate
 * Valida si el usuario tiene todos los datos esenciales del perfil completos
 */
router.get('/profile/validate',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      console.log('[PROFILE_VALIDATION] Validando perfil para usuario:', user.id);
      
      // Obtener información del usuario
      const [userRows] = await executeQuery(
        'SELECT id, name, email, role FROM users WHERE id = ?',
        [user.id]
      );
      
      if (!userRows || (userRows as any[]).length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      const userData = (userRows as any[])[0];
      
      // Si es cliente, verificar client_profiles
      if (userData.role === 'client') {
        const [profileRows] = await executeQuery(
          `SELECT 
            full_name, 
            phone, 
            address, 
            commune, 
            region 
          FROM client_profiles 
          WHERE client_id = ?`,
          [user.id]
        );

        const profile = (profileRows as any[])[0];
        
        // Campos esenciales requeridos para clientes
        const missingFields: string[] = [];
        
        if (!profile) {
          missingFields.push('Todos los datos del perfil');
        } else {
          if (!profile.full_name || profile.full_name.trim() === '') {
            missingFields.push('Nombre completo');
          }
          if (!profile.phone || profile.phone.trim() === '') {
            missingFields.push('Teléfono de contacto');
          }
          if (!profile.address || profile.address.trim() === '') {
            missingFields.push('Dirección principal');
          }
          if (!profile.commune || profile.commune.trim() === '') {
            missingFields.push('Comuna');
          }
          if (!profile.region || profile.region.trim() === '') {
            missingFields.push('Región');
          }
        }

        const isComplete = missingFields.length === 0;
        
        console.log('[PROFILE_VALIDATION] Cliente - Perfil completo:', isComplete);
        console.log('[PROFILE_VALIDATION] Campos faltantes:', missingFields);

        return res.status(200).json({
          success: true,
          isComplete,
          missingFields,
          userType: 'client',
          message: isComplete 
            ? 'Perfil completo' 
            : 'Por favor completa tu perfil para continuar'
        });
      }
      
      // Si es proveedor, verificar provider_profiles
      if (userData.role === 'provider') {
        const [profileRows] = await executeQuery(
          `SELECT 
            full_name, 
            professional_title, 
            main_commune, 
            main_region,
            bio,
            profile_photo_url
          FROM provider_profiles 
          WHERE provider_id = ?`,
          [user.id]
        );

        const profile = (profileRows as any[])[0];
        
        // Campos esenciales requeridos para proveedores
        const missingFields: string[] = [];
        
        if (!profile) {
          missingFields.push('Todos los datos del perfil');
        } else {
          if (!profile.full_name || profile.full_name.trim() === '') {
            missingFields.push('Nombre completo');
          }
          if (!profile.professional_title || profile.professional_title.trim() === '') {
            missingFields.push('Título profesional');
          }
          if (!profile.main_commune || profile.main_commune.trim() === '') {
            missingFields.push('Comuna principal');
          }
          if (!profile.main_region || profile.main_region.trim() === '') {
            missingFields.push('Región principal');
          }
          if (!profile.bio || profile.bio.trim() === '' || profile.bio.length < 50) {
            missingFields.push('Biografía (mínimo 50 caracteres)');
          }
        }

        const isComplete = missingFields.length === 0;
        
        console.log('[PROFILE_VALIDATION] Proveedor - Perfil completo:', isComplete);
        console.log('[PROFILE_VALIDATION] Campos faltantes:', missingFields);

        return res.status(200).json({
          success: true,
          isComplete,
          missingFields,
          userType: 'provider',
          message: isComplete 
            ? 'Perfil completo' 
            : 'Por favor completa tu perfil para continuar'
        });
      }

      // Si es admin, no requiere validación (retornar como cliente para compatibilidad)
      return res.status(200).json({
        success: true,
        isComplete: true,
        missingFields: [],
        userType: 'client',
        message: 'Perfil de administrador'
      });

    } catch (error: any) {
      console.error('[PROFILE_VALIDATION] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Error al validar perfil',
        details: error.message
      });
    }
  });

export default router;

