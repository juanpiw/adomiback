import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { compressImage, generateThumbnail } from '../lib/image-compression';
import { authenticateToken } from '../middleware/auth';
import { ipRateLimit } from '../middleware/rate-limit';
import { executeQuery } from '../lib/db';

const router = Router();

// Rate limiting
const uploadLimit = ipRateLimit(10, 60 * 60 * 1000); // 10 uploads por hora

// Configuración de multer para fotos de perfil
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/profiles/clients';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const user = (req as any).user;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `client-${user.id}-${uniqueSuffix}${ext}`);
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
      cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, WebP)'));
    }
  }
});

/**
 * POST /client/profile/photo
 * Subir foto de perfil del cliente
 */
router.post('/client/profile/photo',
  authenticateToken,
  uploadLimit,
  upload.single('profile_photo'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      console.log('[CLIENT_PROFILE_PHOTO] 📸 Subiendo foto de perfil para usuario:', user.id);

      // Verificar que sea cliente
      if (user.role !== 'client') {
        return res.status(403).json({
          success: false,
          error: 'Solo clientes pueden subir foto de perfil'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No se proporcionó archivo de imagen'
        });
      }

      const originalPath = req.file.path;
      console.log('[CLIENT_PROFILE_PHOTO] 📁 Archivo recibido:', {
        originalName: req.file.originalname,
        size: `${(req.file.size / 1024).toFixed(2)} KB`,
        mimetype: req.file.mimetype,
        path: originalPath
      });

      // Crear directorio para imágenes optimizadas
      const optimizedDir = 'uploads/profiles/clients/optimized';
      if (!fs.existsSync(optimizedDir)) {
        fs.mkdirSync(optimizedDir, { recursive: true });
      }

      // Generar nombre para imagen optimizada
      const optimizedFileName = `${path.basename(req.file.filename, path.extname(req.file.filename))}-optimized.jpg`;
      const optimizedPath = path.join(optimizedDir, optimizedFileName);

      // Comprimir y optimizar imagen
      console.log('[CLIENT_PROFILE_PHOTO] 🔄 Comprimiendo imagen...');
      const compressionResult = await compressImage(originalPath, optimizedPath, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 85,
        format: 'jpeg',
        progressive: true
      });

      console.log('[CLIENT_PROFILE_PHOTO] ✅ Imagen comprimida:', {
        originalSize: `${(compressionResult.originalSize / 1024).toFixed(2)} KB`,
        compressedSize: `${(compressionResult.compressedSize / 1024).toFixed(2)} KB`,
        saved: `${compressionResult.compressionRatio.toFixed(2)}%`,
        dimensions: compressionResult.dimensions
      });

      // Generar thumbnail
      const thumbnailDir = 'uploads/profiles/clients/thumbnails';
      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }

      const thumbnailFileName = `${path.basename(req.file.filename, path.extname(req.file.filename))}-thumb.jpg`;
      const thumbnailPath = path.join(thumbnailDir, thumbnailFileName);

      console.log('[CLIENT_PROFILE_PHOTO] 🔄 Generando thumbnail...');
      await generateThumbnail(optimizedPath, thumbnailPath, 200);
      console.log('[CLIENT_PROFILE_PHOTO] ✅ Thumbnail generado');

      // Eliminar imagen original (no optimizada)
      fs.unlinkSync(originalPath);
      console.log('[CLIENT_PROFILE_PHOTO] 🗑️ Imagen original eliminada');

      // Construir URL relativa de la imagen
      const photoUrl = `/uploads/profiles/clients/optimized/${optimizedFileName}`;
      const thumbnailUrl = `/uploads/profiles/clients/thumbnails/${thumbnailFileName}`;

      console.log('[CLIENT_PROFILE_PHOTO] 📝 URLs generadas:', {
        photoUrl,
        thumbnailUrl
      });

      // Actualizar profile_photo_url en client_profiles
      console.log('[CLIENT_PROFILE_PHOTO] 💾 Actualizando URL en base de datos...');
      
      // Verificar si el perfil existe
      const [existingRows] = await executeQuery(
        'SELECT client_id FROM client_profiles WHERE client_id = ?',
        [user.id]
      );

      const profileExists = (existingRows as any[]).length > 0;

      if (profileExists) {
        // Actualizar profile_photo_url
        await executeQuery(
          `UPDATE client_profiles 
           SET profile_photo_url = ?, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE client_id = ?`,
          [photoUrl, user.id]
        );
        console.log('[CLIENT_PROFILE_PHOTO] ✅ URL actualizada en perfil existente');
      } else {
        // Crear perfil básico con solo la foto
        await executeQuery(
          `INSERT INTO client_profiles (
            client_id,
            full_name,
            profile_photo_url
          ) VALUES (?, ?, ?)`,
          [user.id, user.name || 'Usuario', photoUrl]
        );
        console.log('[CLIENT_PROFILE_PHOTO] ✅ Perfil creado con foto');
      }

      res.status(200).json({
        success: true,
        photoUrl,
        thumbnailUrl,
        compressionInfo: {
          originalSize: compressionResult.originalSize,
          compressedSize: compressionResult.compressedSize,
          saved: `${compressionResult.compressionRatio.toFixed(2)}%`,
          dimensions: compressionResult.dimensions
        },
        message: 'Foto de perfil subida exitosamente'
      });

    } catch (error: any) {
      console.error('[CLIENT_PROFILE_PHOTO] ❌ Error:', error);
      
      // Limpiar archivos si hubo error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: 'Error al subir foto de perfil',
        details: error.message
      });
    }
  });

/**
 * DELETE /client/profile/photo
 * Eliminar foto de perfil del cliente
 */
router.delete('/client/profile/photo',
  authenticateToken,
  uploadLimit,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      console.log('[CLIENT_PROFILE_PHOTO] 🗑️ Eliminando foto de perfil para usuario:', user.id);

      // Verificar que sea cliente
      if (user.role !== 'client') {
        return res.status(403).json({
          success: false,
          error: 'Solo clientes pueden eliminar su foto de perfil'
        });
      }

      // Obtener URL actual de la foto
      const [profileRows] = await executeQuery(
        'SELECT profile_photo_url FROM client_profiles WHERE client_id = ?',
        [user.id]
      );

      if ((profileRows as any[]).length > 0) {
        const photoUrl = (profileRows as any[])[0].profile_photo_url;

        if (photoUrl) {
          // Construir rutas de archivos
          const photoPath = path.join(process.cwd(), photoUrl);
          const thumbnailPath = photoPath.replace('/optimized/', '/thumbnails/').replace('-optimized', '-thumb');

          // Eliminar archivos si existen
          if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
            console.log('[CLIENT_PROFILE_PHOTO] 🗑️ Imagen eliminada:', photoPath);
          }

          if (fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
            console.log('[CLIENT_PROFILE_PHOTO] 🗑️ Thumbnail eliminado:', thumbnailPath);
          }
        }

        // Actualizar BD para eliminar la URL
        await executeQuery(
          'UPDATE client_profiles SET profile_photo_url = NULL WHERE client_id = ?',
          [user.id]
        );

        console.log('[CLIENT_PROFILE_PHOTO] ✅ Foto eliminada de la base de datos');
      }

      res.status(200).json({
        success: true,
        message: 'Foto de perfil eliminada exitosamente'
      });

    } catch (error: any) {
      console.error('[CLIENT_PROFILE_PHOTO] ❌ Error:', error);
      res.status(500).json({
        success: false,
        error: 'Error al eliminar foto de perfil'
      });
    }
  });

export default router;

