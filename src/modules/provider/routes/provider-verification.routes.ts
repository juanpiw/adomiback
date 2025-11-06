import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import DatabaseConnection from '../../../shared/database/connection';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import { Logger } from '../../../shared/utils/logger.util';
import { getPresignedPutUrl, requireEnv } from '../../../shared/utils/s3.util';

const MODULE = 'ProviderVerificationRoutes';
const MAX_FILE_SIZE_MB = Number(process.env.PROVIDER_VERIFICATION_MAX_MB || 8);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = ['cedula', 'pasaporte', 'licencia'];
const ALLOWED_FILE_TYPES = ['front', 'back', 'selfie', 'extra'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/heic', 'image/heif'];
let userVerificationSyncDisabled = false;

export class ProviderVerificationRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initialize();
  }

  private initialize() {
    this.router.get('/provider/verification/status', authenticateToken, this.getStatus.bind(this));
    this.router.post('/provider/verification/request', authenticateToken, this.createOrUpdateRequest.bind(this));
    this.router.post('/provider/verification/files/sign', authenticateToken, this.signUpload.bind(this));
    this.router.post('/provider/verification/files/finalize', authenticateToken, this.finalizeUpload.bind(this));
    this.router.post('/provider/verification/submit', authenticateToken, this.submit.bind(this));
  }

  private async getStatus(req: Request, res: Response) {
    try {
      const user = (req as any).user as AuthUser;
      if (!user || user.role !== 'provider') {
        return res.status(403).json({ success: false, error: 'Solo proveedores pueden consultar este recurso' });
      }

      const pool = DatabaseConnection.getPool();
      const verification = await this.getLatestVerification(pool, user.id);
      const files = verification
        ? await this.getVerificationFiles(pool, verification.id)
        : [];

      const [[profile]]: any = await pool.query(
        `SELECT verification_status, is_verified
           FROM provider_profiles
          WHERE provider_id = ?
          LIMIT 1`,
        [user.id]
      );

      return res.json({
        success: true,
        verification: verification ? {
          ...verification,
          files
        } : null,
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

  private async createOrUpdateRequest(req: Request, res: Response) {
    const pool = DatabaseConnection.getPool();
    const user = (req as any).user as AuthUser;

    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Solo proveedores pueden solicitar verificación' });
    }

    try {
      const rawDocumentNumber = String(req.body?.documentNumber || req.body?.document_number || '').trim();
      const rawDocType = String(req.body?.documentType || req.body?.document_type || 'cedula').toLowerCase();
      const document_number = rawDocumentNumber.slice(0, 64);
      const document_type = ALLOWED_DOCUMENT_TYPES.includes(rawDocType) ? rawDocType : 'cedula';

      if (!document_number) {
        return res.status(400).json({ success: false, error: 'Ingresa el número de tu documento' });
      }

      const existing = await this.getLatestVerification(pool, user.id);
      let verificationId: number;

      if (!existing || existing.status === 'approved') {
        const [insertResult]: any = await pool.execute(
          `INSERT INTO provider_verifications
             (provider_id, document_type, document_number, status, created_at, updated_at)
           VALUES (?, ?, ?, 'draft', NOW(), NOW())`,
          [user.id, document_type, document_number]
        );
        verificationId = insertResult.insertId;
        Logger.info(MODULE, 'Nueva verificación creada', { providerId: user.id, verificationId });
      } else {
        verificationId = existing.id;
        await pool.execute(
          `UPDATE provider_verifications
              SET document_type = ?, document_number = ?, status = 'draft',
                  rejection_reason = NULL, review_notes = NULL,
                  submitted_at = NULL, reviewed_at = NULL, reviewed_by_admin_id = NULL,
                  updated_at = NOW()
            WHERE id = ?`,
          [document_type, document_number, verificationId]
        );
        Logger.info(MODULE, 'Verificación actualizada a draft', { providerId: user.id, verificationId });
      }

      const updated = await this.getVerificationById(pool, verificationId, user.id);

      return res.json({ success: true, verification: updated });
    } catch (error: any) {
      Logger.error(MODULE, 'Error creando solicitud de verificación', { error: error?.message, stack: error?.stack });
      return res.status(500).json({ success: false, error: 'No se pudo iniciar la verificación' });
    }
  }

  private async signUpload(req: Request, res: Response) {
    try {
      const user = (req as any).user as AuthUser;
      if (!user || user.role !== 'provider') {
        return res.status(403).json({ success: false, error: 'Acceso denegado' });
      }

      const verificationId = Number(req.body?.verificationId || req.body?.verification_id);
      const fileTypeRaw = String(req.body?.type || '').toLowerCase();
      const contentTypeRaw = String(req.body?.contentType || req.body?.mimeType || '').toLowerCase();
      const sizeBytes = Number(req.body?.sizeBytes || req.body?.size || 0);

      if (!verificationId || !Number.isFinite(verificationId)) {
        return res.status(400).json({ success: false, error: 'verificationId inválido' });
      }

      if (!ALLOWED_FILE_TYPES.includes(fileTypeRaw)) {
        return res.status(400).json({ success: false, error: 'Tipo de archivo inválido' });
      }

      if (!ALLOWED_MIME_TYPES.includes(contentTypeRaw)) {
        return res.status(400).json({ success: false, error: 'Formato de archivo no permitido' });
      }

      if (!sizeBytes || sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE_BYTES) {
        return res.status(400).json({ success: false, error: `El archivo excede ${MAX_FILE_SIZE_MB}MB` });
      }

      const pool = DatabaseConnection.getPool();
      const verification = await this.getVerificationById(pool, verificationId, user.id);
      if (!verification) {
        return res.status(404).json({ success: false, error: 'Verificación no encontrada' });
      }

      if (verification.status === 'pending') {
        return res.status(409).json({ success: false, error: 'La verificación ya fue enviada. Espera la revisión.' });
      }

      const ext = mime.extension(contentTypeRaw) || 'bin';
      const bucket = requireEnv('AWS_S3_BUCKET');
      const acl = (process.env.S3_OBJECT_ACL || 'private') as 'private' | 'public-read';
      const key = `providers/${user.id}/verification/${verificationId}/${fileTypeRaw}-${uuidv4()}.${ext}`;

      const { url, headers } = await getPresignedPutUrl({
        bucket,
        key,
        contentType: contentTypeRaw,
        expiresSeconds: 300,
        acl
      });

      Logger.info(MODULE, 'Presign generado', { providerId: user.id, verificationId, fileType: fileTypeRaw, key });

      return res.json({
        success: true,
        uploadUrl: url,
        headers,
        key,
        bucket
      });
    } catch (error) {
      Logger.error(MODULE, 'Error firmando archivo de verificación', error as any);
      return res.status(500).json({ success: false, error: 'No se pudo firmar la subida' });
    }
  }

  private async finalizeUpload(req: Request, res: Response) {
    try {
      const user = (req as any).user as AuthUser;
      if (!user || user.role !== 'provider') {
        return res.status(403).json({ success: false, error: 'Acceso denegado' });
      }

      const verificationId = Number(req.body?.verificationId || req.body?.verification_id);
      const fileTypeRaw = String(req.body?.type || '').toLowerCase();
      const key = String(req.body?.key || '').trim();
      const mimeType = String(req.body?.mimeType || req.body?.contentType || '').toLowerCase() || null;
      const sizeBytes = Number(req.body?.sizeBytes || req.body?.size || 0) || null;
      const checksum = String(req.body?.checksum || req.body?.checksumSha256 || req.body?.checksum_sha256 || '').trim() || null;

      if (!verificationId || !Number.isFinite(verificationId)) {
        return res.status(400).json({ success: false, error: 'verificationId inválido' });
      }

      if (!ALLOWED_FILE_TYPES.includes(fileTypeRaw)) {
        return res.status(400).json({ success: false, error: 'Tipo de archivo inválido' });
      }

      if (!key || !key.startsWith(`providers/${user.id}/verification/${verificationId}/`)) {
        return res.status(400).json({ success: false, error: 'Clave S3 inválida' });
      }

      const pool = DatabaseConnection.getPool();
      const verification = await this.getVerificationById(pool, verificationId, user.id);
      if (!verification) {
        return res.status(404).json({ success: false, error: 'Verificación no encontrada' });
      }

      if (verification.status === 'pending') {
        return res.status(409).json({ success: false, error: 'La verificación ya fue enviada. Espera la revisión.' });
      }

      const bucket = requireEnv('AWS_S3_BUCKET');

      await pool.execute(
        `INSERT INTO provider_verification_files
           (verification_id, provider_id, file_type, s3_bucket, s3_key, mime_type, size_bytes, checksum_sha256, uploaded_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           s3_bucket = VALUES(s3_bucket),
           s3_key = VALUES(s3_key),
           mime_type = VALUES(mime_type),
           size_bytes = VALUES(size_bytes),
           checksum_sha256 = VALUES(checksum_sha256),
           uploaded_at = NOW(),
           updated_at = NOW()`,
        [verificationId, user.id, fileTypeRaw, bucket, key, mimeType, sizeBytes, checksum]
      );

      Logger.info(MODULE, 'Archivo de verificación registrado', { providerId: user.id, verificationId, fileType: fileTypeRaw });

      return res.json({ success: true });
    } catch (error) {
      Logger.error(MODULE, 'Error finalizando archivo de verificación', error as any);
      return res.status(500).json({ success: false, error: 'No se pudo registrar el archivo' });
    }
  }

  private async submit(req: Request, res: Response) {
    try {
      const user = (req as any).user as AuthUser;
      if (!user || user.role !== 'provider') {
        return res.status(403).json({ success: false, error: 'Solo proveedores pueden enviar verificación' });
      }

      const verificationId = Number(req.body?.verificationId || req.body?.verification_id);
      if (!verificationId || !Number.isFinite(verificationId)) {
        return res.status(400).json({ success: false, error: 'verificationId inválido' });
      }

      const pool = DatabaseConnection.getPool();
      const verification = await this.getVerificationById(pool, verificationId, user.id);
      if (!verification) {
        return res.status(404).json({ success: false, error: 'Verificación no encontrada' });
      }

      const files = await this.getVerificationFiles(pool, verificationId);
      const hasFront = files.some(f => f.type === 'front');
      const hasBack = files.some(f => f.type === 'back');

      if (!hasFront || !hasBack) {
        return res.status(400).json({ success: false, error: 'Debes subir el anverso y reverso de tu documento' });
      }

      await pool.execute(
        `UPDATE provider_verifications
            SET status = 'pending', submitted_at = NOW(), updated_at = NOW(),
                rejection_reason = NULL, review_notes = NULL, reviewed_at = NULL,
                reviewed_by_admin_id = NULL
          WHERE id = ? AND provider_id = ?`,
        [verificationId, user.id]
      );

      await pool.execute(
        `UPDATE provider_profiles
            SET verification_status = 'pending', is_verified = FALSE, updated_at = NOW()
          WHERE provider_id = ?`,
        [user.id]
      );

      await this.syncUserVerificationStatus(pool, user.id, 'pending', false);

      Logger.info(MODULE, 'Verificación enviada para revisión', { providerId: user.id, verificationId });

      return res.json({ success: true, status: 'pending' });
    } catch (error) {
      Logger.error(MODULE, 'Error enviando verificación', error as any);
      return res.status(500).json({ success: false, error: 'No se pudo enviar la verificación' });
    }
  }

  private async getLatestVerification(pool: ReturnType<typeof DatabaseConnection.getPool>, providerId: number) {
    const [[row]]: any = await pool.query(
      `SELECT id, provider_id, document_type, document_number, status,
              rejection_reason, review_notes, reviewed_by_admin_id,
              submitted_at, reviewed_at, metadata, created_at, updated_at
         FROM provider_verifications
        WHERE provider_id = ?
        ORDER BY updated_at DESC
        LIMIT 1`,
      [providerId]
    );
    return row || null;
  }

  private async getVerificationById(pool: ReturnType<typeof DatabaseConnection.getPool>, verificationId: number, providerId: number) {
    const [[row]]: any = await pool.query(
      `SELECT id, provider_id, document_type, document_number, status,
              rejection_reason, review_notes, reviewed_by_admin_id,
              submitted_at, reviewed_at, metadata, created_at, updated_at
         FROM provider_verifications
        WHERE id = ? AND provider_id = ?
        LIMIT 1`,
      [verificationId, providerId]
    );
    return row || null;
  }

  private async getVerificationFiles(pool: ReturnType<typeof DatabaseConnection.getPool>, verificationId: number) {
    const [rows]: any = await pool.query(
      `SELECT file_type, s3_bucket, s3_key, mime_type, size_bytes, checksum_sha256,
              uploaded_at, updated_at
         FROM provider_verification_files
        WHERE verification_id = ?
        ORDER BY FIELD(file_type, 'front', 'back', 'selfie', 'extra'), uploaded_at ASC`,
      [verificationId]
    );

    return (rows || []).map((row: any) => ({
      type: row.file_type,
      key: row.s3_key,
      bucket: row.s3_bucket,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      checksum: row.checksum_sha256,
      uploadedAt: row.uploaded_at,
      updatedAt: row.updated_at
    }));
  }

  private async syncUserVerificationStatus(
    pool: ReturnType<typeof DatabaseConnection.getPool>,
    providerId: number,
    status: 'none' | 'pending' | 'approved' | 'rejected',
    isVerified: boolean
  ) {
    if (userVerificationSyncDisabled) return;

    try {
      await pool.execute(
        `UPDATE users
            SET verification_status = ?, is_verified = ?
          WHERE id = ?`,
        [status, isVerified ? 1 : 0, providerId]
      );
    } catch (error: any) {
      const code = error?.code;
      if (code === 'ER_BAD_FIELD_ERROR') {
        userVerificationSyncDisabled = true;
        Logger.warn(MODULE, 'La tabla users no soporta verification_status/is_verified. Se omite sincronización futura.', {
          providerId,
          code
        });
      } else {
        Logger.warn(MODULE, 'No se pudo sincronizar users.verification_status', {
          providerId,
          status,
          error: error?.message,
          code
        });
      }
    }
  }
}

export default new ProviderVerificationRoutes().router;

