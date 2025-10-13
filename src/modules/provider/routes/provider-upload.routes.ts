/**
 * Provider Upload Routes
 * Endpoints para subir archivos (fotos de perfil, portada, portafolio)
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'ProviderUploadRoutes';

// Configurar multer para almacenamiento de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const user = (req as any).user as AuthUser;
    const uploadDir = path.join('uploads', 'providers', String(user.id));
    
    // Crear directorio si no existe
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo imágenes JPG, PNG, WEBP, GIF'));
    }
  }
});

export class ProviderUploadRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // POST /provider/upload/photo - Subir foto de perfil o portada
    this.router.post(
      '/provider/upload/photo',
      authenticateToken,
      upload.single('photo'),
      async (req: Request, res: Response) => {
        try {
          const user = (req as any).user as AuthUser;
          const file = req.file;
          const photoType = req.body.type; // 'profile' | 'cover'

          Logger.info(MODULE, 'POST /provider/upload/photo', { 
            userId: user.id, 
            photoType, 
            fileName: file?.filename 
          });

          if (user.role !== 'provider') {
            return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
          }

          if (!file) {
            return res.status(400).json({ success: false, error: 'No se recibió archivo' });
          }

          if (!['profile', 'cover'].includes(photoType)) {
            return res.status(400).json({ 
              success: false, 
              error: 'type debe ser "profile" o "cover"' 
            });
          }

          // Construir URL pública del archivo
          const fileUrl = `/uploads/providers/${user.id}/${file.filename}`;

          const pool = DatabaseConnection.getPool();

          // Actualizar la URL correspondiente en provider_profiles
          const column = photoType === 'profile' ? 'profile_photo_url' : 'cover_photo_url';
          
          await pool.execute(
            `UPDATE provider_profiles 
             SET ${column} = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE provider_id = ?`,
            [fileUrl, user.id]
          );

          // Si es la primera foto de perfil, aumentar completitud
          if (photoType === 'profile') {
            await pool.execute(
              `UPDATE provider_profiles 
               SET profile_completion = LEAST(100, profile_completion + 15)
               WHERE provider_id = ? AND profile_photo_url IS NULL`,
              [user.id]
            );
          }

          Logger.info(MODULE, 'Photo uploaded successfully', { userId: user.id, photoType, fileUrl });
          return res.json({ success: true, url: fileUrl });
        } catch (error: any) {
          Logger.error(MODULE, 'Error uploading photo', error);
          return res.status(500).json({ 
            success: false, 
            error: 'Error al subir foto',
            details: error.message 
          });
        }
      }
    );

    // POST /provider/upload/portfolio - Subir imagen/video al portafolio
    this.router.post(
      '/provider/upload/portfolio',
      authenticateToken,
      upload.single('file'),
      async (req: Request, res: Response) => {
        try {
          const user = (req as any).user as AuthUser;
          const file = req.file;
          const { title, description } = req.body;

          Logger.info(MODULE, 'POST /provider/upload/portfolio', { 
            userId: user.id, 
            fileName: file?.filename 
          });

          if (user.role !== 'provider') {
            return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
          }

          if (!file) {
            return res.status(400).json({ success: false, error: 'No se recibió archivo' });
          }

          const pool = DatabaseConnection.getPool();

          // Verificar límite de 10 items
          const [countResult] = await pool.query(
            'SELECT COUNT(*) as count FROM provider_portfolio WHERE provider_id = ? AND is_active = TRUE',
            [user.id]
          );
          const currentCount = (countResult as any[])[0].count;

          if (currentCount >= 10) {
            // Eliminar el archivo subido
            fs.unlinkSync(file.path);
            return res.status(400).json({
              success: false,
              error: 'Has alcanzado el límite máximo de 10 items en el portafolio'
            });
          }

          // Construir URL pública
          const fileUrl = `/uploads/providers/${user.id}/${file.filename}`;
          const fileType = file.mimetype.startsWith('video/') ? 'video' : 'image';

          // Insertar en BD
          const [result] = await pool.execute(
            `INSERT INTO provider_portfolio 
             (provider_id, file_url, file_type, title, description, 
              file_size, mime_type, order_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id,
              fileUrl,
              fileType,
              title || null,
              description || null,
              file.size,
              file.mimetype,
              currentCount
            ]
          );

          const itemId = (result as any).insertId;

          // Actualizar completitud si tiene al menos 2 items
          if (currentCount === 1) {
            await pool.execute(
              `UPDATE provider_profiles 
               SET profile_completion = LEAST(100, profile_completion + 10)
               WHERE provider_id = ?`,
              [user.id]
            );
          }

          Logger.info(MODULE, 'Portfolio item uploaded', { userId: user.id, itemId, fileUrl });
          return res.json({ 
            success: true, 
            item: {
              id: itemId,
              file_url: fileUrl,
              file_type: fileType,
              title: title || null,
              description: description || null
            }
          });
        } catch (error: any) {
          Logger.error(MODULE, 'Error uploading portfolio item', error);
          return res.status(500).json({ 
            success: false, 
            error: 'Error al subir archivo',
            details: error.message 
          });
        }
      }
    );
  }
}

export default new ProviderUploadRoutes().router;

