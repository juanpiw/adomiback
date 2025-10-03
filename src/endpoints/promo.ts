import { Router, Request, Response } from 'express';
import { pool, executeQuery } from '../lib/db';
import { validateContentType, validatePayloadSize, sanitizeInput } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { ipRateLimit } from '../middleware/rate-limit';

const router = Router();

// Rate limiting para signup de promoción
const promoSignupLimit = ipRateLimit(3, 15 * 60 * 1000); // 3 intentos por IP cada 15 minutos

// Rate limiting para endpoints de admin
const adminLimit = ipRateLimit(60, 1 * 60 * 1000); // 60 requests por IP por minuto

/**
 * POST /promo/signup
 * Registrar usuario para prueba gratis
 */
router.post('/signup',
  validateContentType(),
  validatePayloadSize(),
  sanitizeInput,
  promoSignupLimit,
  async (req: Request, res: Response) => {
    try {
      console.log('[PROMO][SIGNUP] Starting signup process...');
      console.log('[PROMO][SIGNUP] Request body:', req.body);

      const { nombre, correo, profesion, notas } = req.body;

      // Validaciones
      if (!nombre || !correo || !profesion) {
        return res.status(400).json({
          success: false,
          error: 'Nombre, correo y profesión son requeridos'
        });
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(correo)) {
        return res.status(400).json({
          success: false,
          error: 'El formato del correo no es válido'
        });
      }

      // Verificar si el email ya existe
      const [existingRows] = await executeQuery(
        'SELECT id FROM promo_signups WHERE correo = ?',
        [correo]
      );
      const existing = existingRows as any[];

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Este correo ya está registrado para la promoción'
        });
      }

      // Insertar nuevo registro
      const [result] = await executeQuery(
        `INSERT INTO promo_signups (nombre, correo, profesion, notas, status) 
         VALUES (?, ?, ?, ?, 'pending')`,
        [nombre, correo, profesion, notas || null]
      );

      const insertResult = result as any;
      const newId = insertResult.insertId;

      console.log(`[PROMO][SIGNUP] Successfully registered user with ID: ${newId}`);

      // Obtener el registro creado
      const [newRows] = await executeQuery(
        'SELECT * FROM promo_signups WHERE id = ?',
        [newId]
      );
      const newRecord = (newRows as any[])[0];

      // Aquí podrías enviar un email de confirmación
      // await sendWelcomeEmail(correo, nombre);

      res.status(201).json({
        success: true,
        message: '¡Registro exitoso! Te contactaremos pronto para activar tu prueba gratis.',
        data: {
          id: newRecord.id,
          nombre: newRecord.nombre,
          correo: newRecord.correo,
          profesion: newRecord.profesion,
          status: newRecord.status,
          created_at: newRecord.created_at
        }
      });

    } catch (error: any) {
      console.error('[PROMO][SIGNUP][ERROR] Full error details:');
      console.error('[PROMO][SIGNUP][ERROR] Error message:', error?.message);
      console.error('[PROMO][SIGNUP][ERROR] Error code:', error?.code);

      const code = error?.code;
      const msg = error?.message || 'Error interno del servidor';

      if (code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          error: 'Este correo ya está registrado'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        details: process.env.NODE_ENV === 'development' ? msg : undefined
      });
    }
  }
);

/**
 * GET /promo/signups
 * Obtener todos los registros (solo admin)
 */
router.get('/signups',
  authenticateToken,
  adminLimit,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para acceder a esta información'
        });
      }

      const [rows] = await executeQuery(
        'SELECT * FROM promo_signups ORDER BY created_at DESC'
      );

      res.json({
        success: true,
        message: 'Registros obtenidos exitosamente',
        data: rows
      });

    } catch (error: any) {
      console.error('[PROMO][SIGNUPS][ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener los registros'
      });
    }
  }
);

/**
 * GET /promo/stats
 * Obtener estadísticas de promociones (solo admin)
 */
router.get('/stats',
  authenticateToken,
  adminLimit,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para acceder a esta información'
        });
      }

      // Obtener estadísticas generales
      const [totalRows] = await executeQuery('SELECT COUNT(*) as total FROM promo_signups');
      const total = (totalRows as any[])[0].total;

      const [statusRows] = await executeQuery(
        'SELECT status, COUNT(*) as count FROM promo_signups GROUP BY status'
      );
      const statusStats = (statusRows as any[]).reduce((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {} as Record<string, number>);

      const [profesionRows] = await executeQuery(
        'SELECT profesion, COUNT(*) as count FROM promo_signups GROUP BY profesion'
      );
      const profesionStats = (profesionRows as any[]).reduce((acc, row) => {
        acc[row.profesion] = row.count;
        return acc;
      }, {} as Record<string, number>);

      const stats = {
        total,
        pending: statusStats.pending || 0,
        contacted: statusStats.contacted || 0,
        converted: statusStats.converted || 0,
        cancelled: statusStats.cancelled || 0,
        by_profesion: profesionStats
      };

      res.json({
        success: true,
        message: 'Estadísticas obtenidas exitosamente',
        data: stats
      });

    } catch (error: any) {
      console.error('[PROMO][STATS][ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener las estadísticas'
      });
    }
  }
);

/**
 * PATCH /promo/signups/:id/status
 * Actualizar estado de un registro (solo admin)
 */
router.patch('/signups/:id/status',
  authenticateToken,
  adminLimit,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para realizar esta acción'
        });
      }

      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['pending', 'contacted', 'converted', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Estado inválido'
        });
      }

      await executeQuery(
        'UPDATE promo_signups SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id]
      );

      res.json({
        success: true,
        message: 'Estado actualizado exitosamente'
      });

    } catch (error: any) {
      console.error('[PROMO][UPDATE_STATUS][ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'Error al actualizar el estado'
      });
    }
  }
);

/**
 * GET /promo/signups/:id
 * Obtener registro por ID (solo admin)
 */
router.get('/signups/:id',
  authenticateToken,
  adminLimit,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para acceder a esta información'
        });
      }

      const { id } = req.params;

      const [rows] = await executeQuery(
        'SELECT * FROM promo_signups WHERE id = ?',
        [id]
      );

      const record = (rows as any[])[0];
      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'Registro no encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Registro obtenido exitosamente',
        data: record
      });

    } catch (error: any) {
      console.error('[PROMO][GET_SIGNUP][ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener el registro'
      });
    }
  }
);

/**
 * DELETE /promo/signups/:id
 * Eliminar registro (solo admin)
 */
router.delete('/signups/:id',
  authenticateToken,
  adminLimit,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para realizar esta acción'
        });
      }

      const { id } = req.params;

      await executeQuery('DELETE FROM promo_signups WHERE id = ?', [id]);

      res.json({
        success: true,
        message: 'Registro eliminado exitosamente'
      });

    } catch (error: any) {
      console.error('[PROMO][DELETE_SIGNUP][ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'Error al eliminar el registro'
      });
    }
  }
);

export default router;
