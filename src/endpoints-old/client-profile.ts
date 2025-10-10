import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { pool, executeQuery } from '../lib/db';
import { ipRateLimit } from '../middleware/rate-limit';
import { validateContentType, validatePayloadSize, sanitizeInput } from '../middleware/validation';

const router = Router();

// Rate limiting
const profileLimit = ipRateLimit(20, 15 * 60 * 1000); // 20 requests cada 15 minutos

/**
 * GET /client/profile
 * Obtener perfil del cliente
 */
router.get('/client/profile',
  authenticateToken,
  profileLimit,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      console.log('[CLIENT_PROFILE][GET] Obteniendo perfil para usuario:', user.id);

      // Verificar que sea cliente
      if (user.role !== 'client') {
        return res.status(403).json({
          success: false,
          error: 'Solo clientes pueden acceder a este endpoint'
        });
      }

      // Obtener perfil
      const [profileRows] = await executeQuery(
        `SELECT 
          client_id,
          full_name,
          phone,
          profile_photo_url,
          address,
          commune,
          region,
          preferred_language,
          created_at,
          updated_at
        FROM client_profiles 
        WHERE client_id = ?`,
        [user.id]
      );

      const profile = (profileRows as any[])[0];

      if (!profile) {
        console.log('[CLIENT_PROFILE][GET] Perfil no existe, retornando datos vacíos');
        return res.status(200).json({
          success: true,
          profile: {
            client_id: user.id,
            full_name: user.name || '',
            phone: '',
            profile_photo_url: null,
            address: '',
            commune: '',
            region: '',
            preferred_language: 'es',
            created_at: null,
            updated_at: null
          }
        });
      }

      console.log('[CLIENT_PROFILE][GET] Perfil encontrado');

      res.status(200).json({
        success: true,
        profile
      });

    } catch (error: any) {
      console.error('[CLIENT_PROFILE][GET] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener perfil'
      });
    }
  });

/**
 * POST /client/profile
 * Crear o actualizar perfil del cliente
 */
router.post('/client/profile',
  authenticateToken,
  profileLimit,
  validateContentType(['application/json']),
  validatePayloadSize(50 * 1024), // 50KB max
  sanitizeInput,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      console.log('[CLIENT_PROFILE][SAVE] 🚀 Guardando perfil para usuario:', user.id);
      console.log('[CLIENT_PROFILE][SAVE] 📝 Datos recibidos:', req.body);

      // Verificar que sea cliente
      if (user.role !== 'client') {
        return res.status(403).json({
          success: false,
          error: 'Solo clientes pueden acceder a este endpoint'
        });
      }

      const {
        full_name,
        phone,
        profile_photo_url,
        address,
        commune,
        region,
        preferred_language,
        notes
      } = req.body;

      // Validar campos requeridos
      if (!full_name || !phone || !address || !commune || !region) {
        console.log('[CLIENT_PROFILE][SAVE] ❌ Campos requeridos faltantes');
        return res.status(400).json({
          success: false,
          error: 'Campos requeridos: full_name, phone, address, commune, region'
        });
      }

      // Verificar si el perfil ya existe
      const [existingRows] = await executeQuery(
        'SELECT client_id FROM client_profiles WHERE client_id = ?',
        [user.id]
      );

      const profileExists = (existingRows as any[]).length > 0;

      if (profileExists) {
        // Actualizar perfil existente
        console.log('[CLIENT_PROFILE][SAVE] 🔄 Actualizando perfil existente');
        
        await executeQuery(
          `UPDATE client_profiles SET
            full_name = ?,
            phone = ?,
            profile_photo_url = ?,
            address = ?,
            commune = ?,
            region = ?,
            preferred_language = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE client_id = ?`,
          [
            full_name,
            phone,
            profile_photo_url || null,
            address,
            commune,
            region,
            preferred_language || 'es',
            user.id
          ]
        );

        console.log('[CLIENT_PROFILE][SAVE] ✅ Perfil actualizado exitosamente');

      } else {
        // Crear nuevo perfil
        console.log('[CLIENT_PROFILE][SAVE] 🆕 Creando nuevo perfil');
        
        await executeQuery(
          `INSERT INTO client_profiles (
            client_id,
            full_name,
            phone,
            profile_photo_url,
            address,
            commune,
            region,
            preferred_language
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            full_name,
            phone,
            profile_photo_url || null,
            address,
            commune,
            region,
            preferred_language || 'es'
          ]
        );

        console.log('[CLIENT_PROFILE][SAVE] ✅ Perfil creado exitosamente');
      }

      // Obtener el perfil actualizado
      const [updatedRows] = await executeQuery(
        `SELECT 
          client_id,
          full_name,
          phone,
          profile_photo_url,
          address,
          commune,
          region,
          preferred_language,
          created_at,
          updated_at
        FROM client_profiles 
        WHERE client_id = ?`,
        [user.id]
      );

      const updatedProfile = (updatedRows as any[])[0];

      res.status(200).json({
        success: true,
        profile: updatedProfile,
        message: profileExists ? 'Perfil actualizado exitosamente' : 'Perfil creado exitosamente'
      });

    } catch (error: any) {
      console.error('[CLIENT_PROFILE][SAVE] ❌ Error:', error);
      console.error('[CLIENT_PROFILE][SAVE] 🔍 Detalles:', {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sql: error.sql
      });
      
      res.status(500).json({
        success: false,
        error: 'Error al guardar perfil',
        details: error.message
      });
    }
  });

export default router;

