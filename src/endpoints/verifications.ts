import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { compressImage, generateThumbnail } from '../lib/image-compression';
import { 
  createUserVerification, 
  getUserVerifications, 
  getUserVerificationById,
  updateUserVerification,
  getPendingVerifications,
  getVerificationStats,
  hasPendingVerification,
  CreateVerificationData
} from '../queries/user-verifications';
import { authenticateToken, securityLogger } from '../middleware/auth';
import { authRateLimit } from '../config/rate-limits';
import { validateBody, sanitizeInput, validatePayloadSize, validateContentType } from '../middleware/validation';
import Joi from 'joi';

export function mountVerifications(router: Router) {
  const authLogger = securityLogger('VERIFICATION_EVENT');

  // Configuración de multer para subida de archivos
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = 'uploads/verifications';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `verification-${uniqueSuffix}${ext}`);
    }
  });

  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB límite
    },
    fileFilter: (req, file, cb) => {
      // Solo permitir imágenes
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten archivos de imagen'));
      }
    }
  });

  // Esquemas de validación
  const createVerificationSchema = Joi.object({
    document_type: Joi.string().valid('id_card', 'background_check').required(),
    notes: Joi.string().max(500).optional()
  });

  const updateVerificationSchema = Joi.object({
    status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    notes: Joi.string().max(1000).optional()
  });

  // POST /verifications/upload - Subir documento de verificación
  router.post('/verifications/upload',
    authenticateToken,
    authRateLimit,
    authLogger,
    upload.fields([
      { name: 'front_image', maxCount: 1 },
      { name: 'back_image', maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Autenticación requerida'
          });
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        const { document_type } = req.body;

        if (!files.front_image || !files.back_image) {
          return res.status(400).json({
            success: false,
            error: 'Se requieren ambas imágenes (anverso y reverso)'
          });
        }

        if (!document_type || !['id_card', 'background_check'].includes(document_type)) {
          return res.status(400).json({
            success: false,
            error: 'Tipo de documento inválido'
          });
        }

        // Verificar si ya tiene una verificación pendiente
        const hasPending = await hasPendingVerification(req.user.id, document_type);
        if (hasPending) {
          return res.status(409).json({
            success: false,
            error: 'Ya tienes una verificación pendiente de este tipo'
          });
        }

        // Comprimir imágenes
        const frontOriginalPath = files.front_image[0].path;
        const backOriginalPath = files.back_image[0].path;
        
        const frontCompressedPath = frontOriginalPath.replace(/\.[^/.]+$/, '_compressed.jpg');
        const backCompressedPath = backOriginalPath.replace(/\.[^/.]+$/, '_compressed.jpg');

        console.log('[VERIFICATION][COMPRESSION] Comprimiendo imágenes...');

        // Comprimir ambas imágenes
        const [frontCompression, backCompression] = await Promise.all([
          compressImage(frontOriginalPath, frontCompressedPath, {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
            format: 'jpeg',
            progressive: true
          }),
          compressImage(backOriginalPath, backCompressedPath, {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
            format: 'jpeg',
            progressive: true
          })
        ]);

        console.log('[VERIFICATION][COMPRESSION] Resultados:', {
          front: {
            original: `${(frontCompression.originalSize / 1024).toFixed(2)}KB`,
            compressed: `${(frontCompression.compressedSize / 1024).toFixed(2)}KB`,
            ratio: `${frontCompression.compressionRatio.toFixed(1)}%`
          },
          back: {
            original: `${(backCompression.originalSize / 1024).toFixed(2)}KB`,
            compressed: `${(backCompression.compressedSize / 1024).toFixed(2)}KB`,
            ratio: `${backCompression.compressionRatio.toFixed(1)}%`
          }
        });

        // Eliminar archivos originales
        fs.unlinkSync(frontOriginalPath);
        fs.unlinkSync(backOriginalPath);

        // Crear URLs de los archivos comprimidos
        const frontImageUrl = `/uploads/verifications/${path.basename(frontCompressedPath)}`;
        const backImageUrl = `/uploads/verifications/${path.basename(backCompressedPath)}`;

        // Crear registros de verificación
        const frontVerification: CreateVerificationData = {
          user_id: req.user.id,
          document_type: document_type as 'id_card' | 'background_check',
          file_url: frontImageUrl
        };

        const backVerification: CreateVerificationData = {
          user_id: req.user.id,
          document_type: document_type as 'id_card' | 'background_check',
          file_url: backImageUrl
        };

        const frontId = await createUserVerification(frontVerification);
        const backId = await createUserVerification(backVerification);

        console.log('[VERIFICATION][UPLOAD] Documents uploaded successfully:', {
          userId: req.user.id,
          documentType: document_type,
          frontId,
          backId
        });

        return res.status(201).json({
          success: true,
          message: 'Documentos subidos y comprimidos correctamente',
          data: {
            front_verification_id: frontId,
            back_verification_id: backId,
            status: 'pending',
            compression: {
              front: {
                original_size: frontCompression.originalSize,
                compressed_size: frontCompression.compressedSize,
                compression_ratio: frontCompression.compressionRatio,
                dimensions: frontCompression.dimensions
              },
              back: {
                original_size: backCompression.originalSize,
                compressed_size: backCompression.compressedSize,
                compression_ratio: backCompression.compressionRatio,
                dimensions: backCompression.dimensions
              }
            }
          }
        });

      } catch (error: any) {
        console.error('[VERIFICATION][UPLOAD][ERROR]', error);
        
        // Limpiar archivos subidos en caso de error
        if (req.files) {
          const files = req.files as { [fieldname: string]: Express.Multer.File[] };
          Object.values(files).forEach(fileArray => {
            fileArray.forEach(file => {
              const filePath = file.path;
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            });
          });
        }

        return res.status(500).json({
          success: false,
          error: 'Error interno del servidor'
        });
      }
    }
  );

  // GET /verifications/my - Obtener mis verificaciones
  router.get('/verifications/my',
    authenticateToken,
    authLogger,
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Autenticación requerida'
          });
        }

        const verifications = await getUserVerifications(req.user.id);

        return res.json({
          success: true,
          data: verifications
        });

      } catch (error: any) {
        console.error('[VERIFICATION][MY][ERROR]', error);
        return res.status(500).json({
          success: false,
          error: 'Error interno del servidor'
        });
      }
    }
  );

  // GET /verifications/:id - Obtener verificación específica
  router.get('/verifications/:id',
    authenticateToken,
    authLogger,
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Autenticación requerida'
          });
        }

        const verificationId = parseInt(req.params.id);
        if (isNaN(verificationId)) {
          return res.status(400).json({
            success: false,
            error: 'ID de verificación inválido'
          });
        }

        const verification = await getUserVerificationById(verificationId);
        if (!verification) {
          return res.status(404).json({
            success: false,
            error: 'Verificación no encontrada'
          });
        }

        // Verificar que el usuario solo pueda ver sus propias verificaciones
        if (verification.user_id !== req.user.id) {
          return res.status(403).json({
            success: false,
            error: 'No tienes permisos para ver esta verificación'
          });
        }

        return res.json({
          success: true,
          data: verification
        });

      } catch (error: any) {
        console.error('[VERIFICATION][GET][ERROR]', error);
        return res.status(500).json({
          success: false,
          error: 'Error interno del servidor'
        });
      }
    }
  );

  // PUT /verifications/:id - Actualizar verificación (solo admin)
  router.put('/verifications/:id',
    authenticateToken,
    authLogger,
    validateContentType(),
    validatePayloadSize(),
    sanitizeInput,
    validateBody(updateVerificationSchema),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Autenticación requerida'
          });
        }

        // Verificar que sea admin (esto debería implementarse con roles)
        // Por ahora permitimos a todos los usuarios autenticados
        // TODO: Implementar sistema de roles

        const verificationId = parseInt(req.params.id);
        if (isNaN(verificationId)) {
          return res.status(400).json({
            success: false,
            error: 'ID de verificación inválido'
          });
        }

        const { status, notes } = req.body;
        const updateData: any = {};

        if (status) updateData.status = status;
        if (notes) updateData.notes = notes;
        updateData.reviewed_by = req.user.id;

        const updated = await updateUserVerification(verificationId, updateData);

        if (!updated) {
          return res.status(404).json({
            success: false,
            error: 'Verificación no encontrada'
          });
        }

        console.log('[VERIFICATION][UPDATE] Verification updated:', {
          verificationId,
          updatedBy: req.user.id,
          status,
          notes
        });

        return res.json({
          success: true,
          message: 'Verificación actualizada correctamente'
        });

      } catch (error: any) {
        console.error('[VERIFICATION][UPDATE][ERROR]', error);
        return res.status(500).json({
          success: false,
          error: 'Error interno del servidor'
        });
      }
    }
  );

  // GET /verifications/admin/pending - Obtener verificaciones pendientes (admin)
  router.get('/verifications/admin/pending',
    authenticateToken,
    authLogger,
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Autenticación requerida'
          });
        }

        // Verificar que sea admin
        // Por ahora permitimos a todos los usuarios autenticados
        // TODO: Implementar sistema de roles

        const pendingVerifications = await getPendingVerifications();

        return res.json({
          success: true,
          data: pendingVerifications
        });

      } catch (error: any) {
        console.error('[VERIFICATION][ADMIN][PENDING][ERROR]', error);
        return res.status(500).json({
          success: false,
          error: 'Error interno del servidor'
        });
      }
    }
  );

  // GET /verifications/admin/stats - Obtener estadísticas (admin)
  router.get('/verifications/admin/stats',
    authenticateToken,
    authLogger,
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Autenticación requerida'
          });
        }

        // Verificar que sea admin
        // Por ahora permitimos a todos los usuarios autenticados
        // TODO: Implementar sistema de roles

        const stats = await getVerificationStats();

        return res.json({
          success: true,
          data: stats
        });

      } catch (error: any) {
        console.error('[VERIFICATION][ADMIN][STATS][ERROR]', error);
        return res.status(500).json({
          success: false,
          error: 'Error interno del servidor'
        });
      }
    }
  );
}
