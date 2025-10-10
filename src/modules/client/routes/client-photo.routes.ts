import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import DatabaseConnection from '../../../shared/database/connection';
import { JWTUtil } from '../../../shared/utils/jwt.util';

interface AuthUser { id: number; email: string; role: 'client' | 'provider'; }

function authenticateToken(req: Request, res: Response, next: () => void) {
  const token = JWTUtil.extractTokenFromHeader(req.headers.authorization);
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const payload = JWTUtil.verifyAccessToken(token);
  if (!payload) return res.status(401).json({ success: false, error: 'Invalid token' });
  (req as any).user = { id: payload.userId, email: payload.email, role: payload.role } as AuthUser;
  next();
}

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'profiles', 'clients');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbnails');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes permitidas'));
  }
});

export class ClientPhotoRoutes {
  private router = Router();

  constructor() {
    this.setupRoutes();
  }

  getRouter() { return this.router; }

  private setupRoutes() {
    // POST /client/profile/photo
    this.router.post('/client/profile/photo', authenticateToken, upload.single('profile_photo'), async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        console.log('[CLIENT_PHOTO][UPLOAD] user:', user);
        if (user.role !== 'client') return res.status(403).json({ success: false, error: 'Acceso denegado' });
        if (!req.file) {
          console.warn('[CLIENT_PHOTO][UPLOAD] No file received. fieldName=profile_photo');
          return res.status(400).json({ success: false, error: 'Archivo requerido' });
        }
        console.log('[CLIENT_PHOTO][UPLOAD] file:', { name: (req.file as any).originalname, size: req.file.size, mimetype: req.file.mimetype });

        const id = uuidv4();
        const baseName = `${id}.webp`;
        const outPath = path.join(UPLOAD_DIR, `compressed-${baseName}`);
        const thumbPath = path.join(THUMB_DIR, `thumb-${baseName}`);
        console.log('[CLIENT_PHOTO][UPLOAD] paths:', { outPath, thumbPath });

        // Imagen principal
        await sharp(req.file.buffer)
          .resize({ width: 800, height: 800, fit: 'inside' })
          .webp({ quality: 85 })
          .toFile(outPath);

        // Thumbnail
        await sharp(req.file.buffer)
          .resize({ width: 200, height: 200, fit: 'cover' })
          .webp({ quality: 80 })
          .toFile(thumbPath);

        const relPhoto = `/uploads/profiles/clients/${path.basename(outPath)}`;
        const relThumb = `/uploads/profiles/clients/thumbnails/${path.basename(thumbPath)}`;
        console.log('[CLIENT_PHOTO][UPLOAD] urls:', { relPhoto, relThumb });

        const pool = DatabaseConnection.getPool();
        // Obtener nombre seguro para cumplir NOT NULL en full_name
        const [userRows] = await pool.query('SELECT name, email FROM users WHERE id = ? LIMIT 1', [user.id]);
        const urow = (userRows as any[])[0] || {};
        const nameFromDb = typeof urow.name === 'string' ? String(urow.name).trim() : '';
        const emailFromDb = typeof urow.email === 'string' ? String(urow.email) : '';
        const safeFullName = nameFromDb || (emailFromDb ? emailFromDb.split('@')[0] : '') || 'Usuario';

        // UPSERT: inserta si no existe, actualiza solo la foto si existe
        await pool.query(
          `INSERT INTO client_profiles (
             client_id, full_name, phone, profile_photo_url, address, commune, region, preferred_language
           ) VALUES (?, ?, '', ?, '', '', '', 'es')
           ON DUPLICATE KEY UPDATE
             profile_photo_url = VALUES(profile_photo_url),
             updated_at = CURRENT_TIMESTAMP`,
          [user.id, safeFullName, relPhoto]
        );
        console.log('[CLIENT_PHOTO][UPLOAD] DB upserted for user', user.id);

        return res.status(200).json({ success: true, photoUrl: relPhoto, thumbnailUrl: relThumb });
      } catch (error: any) {
        console.error('[CLIENT_PHOTO][UPLOAD][ERROR]', { message: error?.message, stack: error?.stack });
        return res.status(500).json({ success: false, error: 'Error al subir foto', details: error?.message || 'unknown' });
      }
    });

    // DELETE /client/profile/photo
    this.router.delete('/client/profile/photo', authenticateToken, async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as AuthUser;
        if (user.role !== 'client') return res.status(403).json({ success: false, error: 'Acceso denegado' });

        const pool = DatabaseConnection.getPool();
        const [rows] = await pool.query('SELECT profile_photo_url FROM client_profiles WHERE client_id = ?', [user.id]);
        const current = (rows as any[])[0]?.profile_photo_url as string | undefined;
        if (current) {
          const abs = path.join(process.cwd(), current);
          const thumb = abs.replace(path.sep + 'clients' + path.sep, path.sep + 'clients' + path.sep + 'thumbnails' + path.sep).replace('compressed-', 'thumb-');
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
          if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
        }
        await pool.query('UPDATE client_profiles SET profile_photo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE client_id = ?', [user.id]);
        return res.status(200).json({ success: true, message: 'Foto eliminada' });
      } catch (error: any) {
        return res.status(500).json({ success: false, error: 'Error al eliminar foto', details: error.message });
      }
    });
  }
}


