import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'ProviderVerificationRoutes';
const MAX_FILE_SIZE_MB = Number(process.env.PROVIDER_VERIFICATION_MAX_MB || 8);
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const user = (req as any).user as AuthUser;
    const uploadDir = path.join('uploads', 'providers', String(user.id), 'verification');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de archivo no permitido. Usa JPG o PNG.'));
    }
  }
});

export class ProviderVerificationRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initialize();
  }

  private initialize() {
    this.router.get('/provider/verification/status', authenticateToken, this.getStatus.bind(this));

    this.router.post(
      '/provider/verification',
      authenticateToken,
      upload.fields([
        { name: 'document_front', maxCount: 1 },
        { name: 'document_back', maxCount: 1 },
        { name: 'document_selfie', maxCount: 1 }
      ]),
      this.submit.bind(this)
    );
  }

  private async getStatus(req: Request, res: Response) {
    try {
      const user = (req as any).user as AuthUser;
      if (!user || user.role !== 'provider') {
        return res.status(403).json({ success: false, error: 'Solo proveedores pueden consultar este recurso' });
      }

      const pool = DatabaseConnection.getPool();
      const [[verification]]: any = await pool.query(
        `SELECT id, provider_id, document_type, document_number,
                front_document_url, back_document_url, selfie_url,
                status, rejection_reason, verification_notes, verified_at,
                created_at, updated_at
           FROM identity_verifications
          WHERE provider_id = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
        [user.id]
      );

      const [[profile]]: any = await pool.query(
        `SELECT verification_status, is_verified
           FROM provider_profiles
          WHERE provider_id = ?
          LIMIT 1`,
        [user.id]
      );

      const publicBase = process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const normalizeUrl = (url?: string | null) => {
        if (!url) return null;
        if (/^https?:\/\//i.test(url)) return url;
        return `${publicBase}${url.startsWith('/') ? url : `/${url}`}`;
      };

      const response = verification ? {
        ...verification,
        front_document_url: normalizeUrl(verification.front_document_url),
        back_document_url: normalizeUrl(verification.back_document_url),
        selfie_url: normalizeUrl(verification.selfie_url)
      } : null;

      return res.json({
        success: true,
        verification: response,
        profile: profile ? {
          verification_status: profile.verification_status || 'none',
          is_verified: !!profile.is_verified
        } : {
          verification_status: 'none',
          is_verified: false
        }
      });
    } catch (error) {
      Logger.error(MODULE, 'Error obteniendo estado de verificación', error as any);
      return res.status(500).json({ success: false, error: 'No se pudo obtener el estado de verificación' });
    }
  }

  private async submit(req: Request, res: Response) {
    const pool = DatabaseConnection.getPool();
    const user = (req as any).user as AuthUser;

    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Solo proveedores pueden enviar verificación' });
    }

    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const docTypeRaw = String(req.body?.document_type || 'cedula').toLowerCase();
      const allowedTypes = ['cedula', 'pasaporte', 'licencia'];
      const document_type = allowedTypes.includes(docTypeRaw) ? docTypeRaw : 'cedula';
      const document_number = String(req.body?.document_number || '').trim().slice(0, 64);

      if (!document_number) {
        return res.status(400).json({ success: false, error: 'Ingresa el número de documento' });
      }

      const frontFile = files?.document_front?.[0] || null;
      const backFile = files?.document_back?.[0] || null;
      const selfieFile = files?.document_selfie?.[0] || null;

      const existing = await this.getExistingVerification(pool, user.id);

      const frontUrl = frontFile ? this.buildFileUrl(user.id, frontFile.filename) : existing?.front_document_url || null;
      const backUrl = backFile ? this.buildFileUrl(user.id, backFile.filename) : existing?.back_document_url || null;
      const selfieUrl = selfieFile ? this.buildFileUrl(user.id, selfieFile.filename) : existing?.selfie_url || null;

      if (!frontUrl || !backUrl) {
        return res.status(400).json({ success: false, error: 'Debes subir ambos lados de tu documento' });
      }

      if (existing) {
        await pool.execute(
          `UPDATE identity_verifications
              SET document_type = ?, document_number = ?,
                  front_document_url = ?, back_document_url = ?, selfie_url = ?,
                  status = 'pending', rejection_reason = NULL,
                  verification_notes = NULL, verified_at = NULL, verified_by = NULL,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [document_type, document_number, frontUrl, backUrl, selfieUrl, existing.id]
        );
      } else {
        await pool.execute(
          `INSERT INTO identity_verifications
            (provider_id, document_type, document_number,
             front_document_url, back_document_url, selfie_url,
             status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
          [user.id, document_type, document_number, frontUrl, backUrl, selfieUrl]
        );
      }

      await pool.execute(
        `UPDATE provider_profiles
            SET verification_status = 'pending', is_verified = FALSE, updated_at = CURRENT_TIMESTAMP
          WHERE provider_id = ?`,
        [user.id]
      );

      Logger.info(MODULE, 'Proveedor envió verificación', { providerId: user.id, document_type });

      return res.json({
        success: true,
        status: 'pending'
      });
    } catch (error: any) {
      Logger.error(MODULE, 'Error enviando verificación', error);
      return res.status(500).json({ success: false, error: 'No se pudo enviar la verificación' });
    }
  }

  private async getExistingVerification(pool: ReturnType<typeof DatabaseConnection.getPool>, providerId: number) {
    const [[row]]: any = await pool.query(
      `SELECT * FROM identity_verifications WHERE provider_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [providerId]
    );
    return row || null;
  }

  private buildFileUrl(providerId: number, filename: string): string {
    return `/uploads/providers/${providerId}/verification/${filename}`;
  }
}

export default new ProviderVerificationRoutes().router;

