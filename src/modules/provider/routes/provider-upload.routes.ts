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
import { getPresignedPutUrl, getPublicUrlForKey, requireEnv } from '../../../shared/utils/s3.util';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';

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

    // POST /provider/upload/portfolio/sign - Obtener URL firmada S3 para subida directa
    this.router.post(
      '/provider/upload/portfolio/sign',
      authenticateToken,
      async (req: Request, res: Response) => {
        try {
          const user = (req as any).user as AuthUser;
          const { type, contentType, sizeBytes } = req.body || {};
          Logger.info(MODULE, 'SIGN request received', { userId: user?.id, type, contentType, sizeBytes });

          if (user.role !== 'provider') {
            return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
          }
          if (!type || !['image', 'video'].includes(String(type))) {
            return res.status(400).json({ success: false, error: 'type debe ser "image" o "video"' });
          }
          if (!contentType || typeof contentType !== 'string') {
            return res.status(400).json({ success: false, error: 'contentType requerido' });
          }

          // Validaciones de tamaño y MIME
          const maxImageMb = Number(process.env.PORTFOLIO_IMAGE_MAX_MB || 6);
          const maxVideoMb = Number(process.env.PORTFOLIO_VIDEO_MAX_MB || 120);
          const maxBytes = (type === 'image' ? maxImageMb : maxVideoMb) * 1024 * 1024;
          if (sizeBytes && Number(sizeBytes) > maxBytes) {
            return res.status(400).json({ success: false, error: `Archivo supera el máximo de ${type === 'image' ? maxImageMb : maxVideoMb}MB` });
          }
          const isImage = contentType.startsWith('image/');
          const isVideo = contentType === 'video/mp4' || contentType.startsWith('video/');
          if (type === 'image' && !isImage) {
            return res.status(400).json({ success: false, error: 'Solo se permiten imágenes (jpeg/png/webp)' });
          }
          if (type === 'video' && !isVideo) {
            return res.status(400).json({ success: false, error: 'Solo se permiten videos MP4' });
          }

          const pool = DatabaseConnection.getPool();
          // Límite: 10 items totales, 2 videos máximo
          const [[{ total }]]: any = await pool.query('SELECT COUNT(*) AS total FROM provider_portfolio WHERE provider_id = ? AND is_active = TRUE', [user.id]);
          Logger.info(MODULE, 'Portfolio counters', { userId: user.id, total });
          if (total >= 10) {
            return res.status(400).json({ success: false, error: 'Has alcanzado el límite máximo de 10 items en el portafolio' });
          }
          if (type === 'video') {
            const [[{ videos }]]: any = await pool.query('SELECT COUNT(*) AS videos FROM provider_portfolio WHERE provider_id = ? AND is_active = TRUE AND file_type = "video"', [user.id]);
            Logger.info(MODULE, 'Portfolio video counter', { userId: user.id, videos });
            if (videos >= 2) {
              return res.status(400).json({ success: false, error: 'Has alcanzado el límite máximo de 2 videos' });
            }
          }

          const bucket = requireEnv('AWS_S3_BUCKET');
          const region = process.env.AWS_REGION || '';
          const aclEnv = process.env.S3_OBJECT_ACL || 'public-read';
          const hasKey = !!process.env.AWS_ACCESS_KEY_ID;
          const hasSecret = !!process.env.AWS_SECRET_ACCESS_KEY;
          Logger.info(MODULE, 'S3 env check', { bucket, region, acl: aclEnv, hasKey, hasSecret });
          const ext = mime.extension(contentType) || (type === 'image' ? 'jpg' : 'mp4');
          const key = `providers/${user.id}/portfolio/${uuidv4()}.${ext}`;
          const acl: any = (process.env.S3_OBJECT_ACL || 'public-read') as any;

          let url: string; let headers: Record<string, string>;
          try {
            ({ url, headers } = await getPresignedPutUrl({ bucket, key, contentType, acl, expiresSeconds: 300 }));
          } catch (e: any) {
            Logger.error(MODULE, 'Error generating S3 presigned URL', {
              message: e?.message,
              name: e?.name,
              code: e?.code,
              httpStatus: e?.$metadata?.httpStatusCode,
              stack: e?.stack
            });
            return res.status(500).json({ success: false, error: 'No se pudo firmar la subida (S3)' });
          }
          const publicUrl = getPublicUrlForKey(key) || `https://${bucket}.s3.amazonaws.com/${key}`;

          Logger.info(MODULE, 'Issued S3 presign', { userId: user.id, key, contentType });
          return res.json({ success: true, uploadUrl: url, headers, key, url: publicUrl });
        } catch (error: any) {
          Logger.error(MODULE, 'Error signing S3 upload (outer)', { message: error?.message, stack: error?.stack });
          return res.status(500).json({ success: false, error: 'No se pudo firmar la subida' });
        }
      }
    );

    // POST /provider/upload/portfolio/finalize - Registrar item tras subida a S3
    this.router.post(
      '/provider/upload/portfolio/finalize',
      authenticateToken,
      async (req: Request, res: Response) => {
        try {
          const user = (req as any).user as AuthUser;
          const { type, key, url, thumb_url, width, height, duration_seconds, caption, sizeBytes, mimeType } = req.body || {};
          Logger.info(MODULE, 'FINALIZE request received', { userId: user?.id, type, key, hasUrl: !!url, sizeBytes, mimeType });

          if (user.role !== 'provider') {
            return res.status(403).json({ success: false, error: 'Solo providers pueden acceder' });
          }
          if (!type || !['image', 'video'].includes(String(type))) {
            return res.status(400).json({ success: false, error: 'type debe ser "image" o "video"' });
          }
          if (!key || !url) {
            return res.status(400).json({ success: false, error: 'key y url son requeridos' });
          }

          const pool = DatabaseConnection.getPool();
          const [[{ total }]]: any = await pool.query('SELECT COUNT(*) AS total FROM provider_portfolio WHERE provider_id = ? AND is_active = TRUE', [user.id]);
          if (total >= 10) {
            return res.status(400).json({ success: false, error: 'Has alcanzado el límite máximo de 10 items en el portafolio' });
          }
          if (type === 'video') {
            const [[{ videos }]]: any = await pool.query('SELECT COUNT(*) AS videos FROM provider_portfolio WHERE provider_id = ? AND is_active = TRUE AND file_type = "video"', [user.id]);
            if (videos >= 2) {
              return res.status(400).json({ success: false, error: 'Has alcanzado el límite máximo de 2 videos' });
            }
          }

          const orderIndex = total; // siguiente posición
          const [result] = await pool.execute(
            `INSERT INTO provider_portfolio 
             (provider_id, file_url, file_type, title, description, file_size, mime_type, thumbnail_url, order_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id,
              url,
              type,
              caption || null,
              null,
              sizeBytes || null,
              mimeType || null,
              thumb_url || null,
              orderIndex
            ]
          );

          const itemId = (result as any).insertId;
          Logger.info(MODULE, 'Portfolio item finalized', { userId: user.id, itemId, key, type });
          return res.status(201).json({ success: true, item: { id: itemId, file_url: url, file_type: type, thumbnail_url: thumb_url || null } });
        } catch (error: any) {
          Logger.error(MODULE, 'Error finalizing portfolio item', { message: error?.message, stack: error?.stack });
          return res.status(500).json({ success: false, error: 'No se pudo registrar el item' });
        }
      }
    );
  }
}

export default new ProviderUploadRoutes().router;

