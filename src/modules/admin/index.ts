import { Express, Router } from 'express';
import { adminAuth } from '../../shared/middleware/admin-auth';
import { Logger } from '../../shared/utils/logger.util';
import DatabaseConnection from '../../shared/database/connection';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { EmailService } from '../../shared/services/email.service';
import { PushService } from '../notifications/services/push.service';
import { getPresignedGetUrl, requireEnv } from '../../shared/utils/s3.util';

export function setupAdminModule(app: Express) {
  const router = Router();
  // Multer para vouchers
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join('uploads', 'admin', 'vouchers');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `voucher-${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`);
    }
  });
  const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

let adminUserVerificationSyncDisabled = false;

async function syncUserVerificationStatus(providerId: number, status: 'none' | 'pending' | 'approved' | 'rejected', isVerified: boolean) {
  if (adminUserVerificationSyncDisabled) return;

  try {
    const pool = DatabaseConnection.getPool();
    await pool.execute(
      `UPDATE users
          SET verification_status = ?, is_verified = ?
        WHERE id = ?`,
      [status, isVerified ? 1 : 0, providerId]
    );
  } catch (error: any) {
    const code = error?.code;
    if (code === 'ER_BAD_FIELD_ERROR') {
      adminUserVerificationSyncDisabled = true;
      Logger.warn('ADMIN_MODULE', 'users.verification_status no disponible; se desactiva sincronización', { providerId, code });
    } else {
      Logger.warn('ADMIN_MODULE', 'No se pudo sincronizar users.verification_status', {
        providerId,
        status,
        error: error?.message,
        code
      });
    }
  }
}

  router.get('/health', adminAuth, (req, res) => {
    res.json({ success: true, message: 'admin ok', ts: new Date().toISOString() });
  });

  // Placeholder endpoint to validate protection
  router.get('/whoami', adminAuth, (req: any, res) => {
    res.json({ success: true, user: req.user });
  });

  router.get('/verification/requests', adminAuth, async (req, res) => {
    try {
      const statusParam = String(req.query.status || '').toLowerCase();
      const searchParam = String(req.query.q || req.query.search || '').trim();
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();

      const pool = DatabaseConnection.getPool();
      const whereClauses: string[] = [];
      const params: any[] = [];

      if (['pending', 'approved', 'rejected', 'expired', 'draft'].includes(statusParam)) {
        whereClauses.push('pv.status = ?');
        params.push(statusParam);
      }

      if (searchParam) {
        const like = `%${searchParam}%`;
        whereClauses.push('(u.email LIKE ? OR u.name LIKE ? OR pp.full_name LIKE ? OR pv.document_number LIKE ? )');
        params.push(like, like, like, like);
      }

      if (from) {
        whereClauses.push('pv.updated_at >= ?');
        params.push(from);
      }

      if (to) {
        whereClauses.push('pv.updated_at <= ?');
        params.push(to);
      }

      const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const query = `
        SELECT pv.id,
               pv.provider_id,
               pv.document_type,
               pv.document_number,
               pv.status,
               pv.rejection_reason,
               pv.review_notes,
               pv.submitted_at,
               pv.reviewed_at,
               pv.created_at,
               pv.updated_at,
               u.email AS provider_email,
               u.name AS provider_name,
               pp.full_name,
               pp.professional_title,
               pp.verification_status,
               pp.is_verified,
               (SELECT COUNT(*) FROM provider_verification_files pvf WHERE pvf.verification_id = pv.id) AS files_count,
               (SELECT GROUP_CONCAT(DISTINCT pvf.file_type) FROM provider_verification_files pvf WHERE pvf.verification_id = pv.id) AS file_types
          FROM provider_verifications pv
          LEFT JOIN users u ON u.id = pv.provider_id
          LEFT JOIN provider_profiles pp ON pp.provider_id = pv.provider_id
          ${whereSql}
          ORDER BY
            CASE WHEN pv.status = 'pending' THEN 0 ELSE 1 END,
            pv.updated_at DESC
          LIMIT ? OFFSET ?`;

      const [rows] = await pool.query(query, [...params, limit, offset]);

      const data = (rows as any[]).map(row => ({
        id: row.id,
        provider_id: row.provider_id,
        document_type: row.document_type,
        document_number: row.document_number,
        status: row.status,
        rejection_reason: row.rejection_reason,
        review_notes: row.review_notes,
        submitted_at: row.submitted_at,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        provider_email: row.provider_email,
        provider_name: row.provider_name,
        full_name: row.full_name,
        professional_title: row.professional_title,
        verification_status: row.verification_status,
        is_verified: !!row.is_verified,
        files_count: Number(row.files_count || 0),
        file_types: row.file_types ? String(row.file_types).split(',') : []
      }));

      return res.json({ success: true, data, pagination: { limit, offset, returned: data.length } });
    } catch (error) {
      Logger.error('ADMIN_MODULE', 'Error fetching verification requests', error as any);
      return res.status(500).json({ success: false, error: 'verification_requests_error' });
    }
  });

  router.get('/verification/requests/:id', adminAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'invalid_id' });
      }

      const pool = DatabaseConnection.getPool();
      const [[verification]]: any = await pool.query(
        `SELECT pv.*, u.email AS provider_email, u.name AS provider_name,
                pp.full_name, pp.professional_title, pp.verification_status, pp.is_verified
           FROM provider_verifications pv
           LEFT JOIN users u ON u.id = pv.provider_id
           LEFT JOIN provider_profiles pp ON pp.provider_id = pv.provider_id
          WHERE pv.id = ?
          LIMIT 1`,
        [id]
      );

      if (!verification) {
        return res.status(404).json({ success: false, error: 'verification_not_found' });
      }

      const [fileRows]: any = await pool.query(
        `SELECT id, file_type, s3_bucket, s3_key, mime_type, size_bytes, checksum_sha256,
                uploaded_at, updated_at
           FROM provider_verification_files
          WHERE verification_id = ?
          ORDER BY FIELD(file_type, 'front', 'back', 'selfie', 'extra'), uploaded_at ASC`,
        [id]
      );

      const defaultBucket = requireEnv('AWS_S3_BUCKET');
      const files = await Promise.all((fileRows || []).map(async (row: any) => {
        const bucket = row.s3_bucket || defaultBucket;
        let signedUrl: string | null = null;
        try {
          signedUrl = await getPresignedGetUrl({ bucket, key: row.s3_key, expiresSeconds: 300 });
        } catch (err) {
          Logger.warn('ADMIN_MODULE', 'No se pudo generar URL firmada para verificación', {
            verificationId: id,
            fileId: row.id,
            error: (err as any)?.message
          });
        }
        return {
          id: row.id,
          type: row.file_type,
          bucket,
          key: row.s3_key,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          checksum: row.checksum_sha256,
          uploadedAt: row.uploaded_at,
          updatedAt: row.updated_at,
          url: signedUrl
        };
      }));

      return res.json({
        success: true,
        data: {
          ...verification,
          is_verified: !!verification.is_verified,
          files
        }
      });
    } catch (error) {
      Logger.error('ADMIN_MODULE', 'Error fetching verification detail', error as any);
      return res.status(500).json({ success: false, error: 'verification_detail_error' });
    }
  });

  router.post('/verification/requests/:id/approve', adminAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'invalid_id' });
      }

      const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : null;
      const pool = DatabaseConnection.getPool();

      const [[verification]]: any = await pool.query(
        `SELECT pv.*, u.email AS provider_email, u.name AS provider_name
           FROM provider_verifications pv
           LEFT JOIN users u ON u.id = pv.provider_id
          WHERE pv.id = ?
          LIMIT 1`,
        [id]
      );

      if (!verification) {
        return res.status(404).json({ success: false, error: 'verification_not_found' });
      }

      await pool.execute(
        `UPDATE provider_verifications
            SET status = 'approved', rejection_reason = NULL,
                review_notes = ?, reviewed_at = NOW(), reviewed_by_admin_id = ?, updated_at = NOW()
          WHERE id = ?`,
        [notes || null, req.user?.id || null, id]
      );

      await pool.execute(
        `UPDATE provider_profiles
            SET verification_status = 'approved', is_verified = TRUE, updated_at = NOW()
          WHERE provider_id = ?`,
        [verification.provider_id]
      );

      await syncUserVerificationStatus(verification.provider_id, 'approved', true);

      const appName = process.env.APP_NAME || 'Adomi';
      if (verification.provider_email) {
        try {
          await EmailService.sendVerificationStatus(verification.provider_email, {
            appName,
            providerName: verification.provider_name || null,
            status: 'approved'
          });
        } catch (emailErr) {
          Logger.warn('ADMIN_MODULE', 'No se pudo enviar correo de verificación aprobada', emailErr as any);
        }
      }

      try {
        await PushService.notifyUser(verification.provider_id, '✅ Identidad verificada', 'Tu cuenta ya muestra la insignia de identidad verificada.', {
          type: 'verification',
          status: 'approved'
        });
      } catch (pushErr) {
        Logger.warn('ADMIN_MODULE', 'No se pudo enviar notificación de verificación aprobada', pushErr as any);
      }

      Logger.info('ADMIN_MODULE', 'Verificación aprobada', { verificationId: id, adminId: req.user?.id });

      return res.json({ success: true });
    } catch (error) {
      Logger.error('ADMIN_MODULE', 'Error approving verification', error as any);
      return res.status(500).json({ success: false, error: 'verification_approve_error' });
    }
  });

  router.post('/verification/requests/:id/reject', adminAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'invalid_id' });
      }

      const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!reasonRaw) {
        return res.status(400).json({ success: false, error: 'reason_required' });
      }
      const reason = reasonRaw.slice(0, 255);
      const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : null;
      const pool = DatabaseConnection.getPool();

      const [[verification]]: any = await pool.query(
        `SELECT pv.*, u.email AS provider_email, u.name AS provider_name
           FROM provider_verifications pv
           LEFT JOIN users u ON u.id = pv.provider_id
          WHERE pv.id = ?
          LIMIT 1`,
        [id]
      );

      if (!verification) {
        return res.status(404).json({ success: false, error: 'verification_not_found' });
      }

      await pool.execute(
        `UPDATE provider_verifications
            SET status = 'rejected', rejection_reason = ?,
                review_notes = ?, reviewed_at = NOW(), reviewed_by_admin_id = ?, updated_at = NOW()
          WHERE id = ?`,
        [reason, notes || null, req.user?.id || null, id]
      );

      await pool.execute(
        `UPDATE provider_profiles
            SET verification_status = 'rejected', is_verified = FALSE, updated_at = NOW()
          WHERE provider_id = ?`,
        [verification.provider_id]
      );

      await syncUserVerificationStatus(verification.provider_id, 'rejected', false);

      const appName = process.env.APP_NAME || 'Adomi';
      if (verification.provider_email) {
        try {
          await EmailService.sendVerificationStatus(verification.provider_email, {
            appName,
            providerName: verification.provider_name || null,
            status: 'rejected',
            rejectionReason: reason
          });
        } catch (emailErr) {
          Logger.warn('ADMIN_MODULE', 'No se pudo enviar correo de verificación rechazada', emailErr as any);
        }
      }

      try {
        await PushService.notifyUser(verification.provider_id, '⚠️ Verificación rechazada', 'Necesitamos nuevos documentos para verificar tu identidad.', {
          type: 'verification',
          status: 'rejected'
        });
      } catch (pushErr) {
        Logger.warn('ADMIN_MODULE', 'No se pudo enviar notificación de verificación rechazada', pushErr as any);
      }

      Logger.info('ADMIN_MODULE', 'Verificación rechazada', { verificationId: id, adminId: req.user?.id });

      return res.json({ success: true });
    } catch (error) {
      Logger.error('ADMIN_MODULE', 'Error rejecting verification', error as any);
      return res.status(500).json({ success: false, error: 'verification_reject_error' });
    }
  });

  // Ejecutar ciclo de cobro de comisiones cash (card fallback)
  router.post('/cash-commissions/run-collection', adminAuth, async (_req, res) => {
    try {
      const { runCommissionCollectionCycle } = require('../payments/services/commission-collection.service');
      const result = await runCommissionCollectionCycle();
      return res.json({ success: true, result });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error running cash commission collection', e);
      return res.status(500).json({ success: false, error: 'run_collection_error' });
    }
  });

  router.get('/cash/summary', adminAuth, async (_req, res) => {
    try {
      const pool = DatabaseConnection.getPool();
      const [[row]]: any = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN status IN ('pending','overdue') THEN commission_amount ELSE 0 END), 0) AS total_due,
           COALESCE(SUM(CASE WHEN status = 'overdue' THEN commission_amount ELSE 0 END), 0) AS overdue_due,
           COUNT(*) AS total_count,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
           SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count
         FROM provider_commission_debts`
      );
      return res.json({
        success: true,
        summary: {
          total_due: Number(row?.total_due || 0),
          overdue_due: Number(row?.overdue_due || 0),
          total_count: Number(row?.total_count || 0),
          pending_count: Number(row?.pending_count || 0),
          overdue_count: Number(row?.overdue_count || 0),
          paid_count: Number(row?.paid_count || 0)
        }
      });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error fetching admin cash summary', e);
      return res.status(500).json({ success: false, error: 'cash_summary_error' });
    }
  });

  router.get('/cash/commissions', adminAuth, async (req, res) => {
    try {
      const status = String(req.query.status || '').trim().toLowerCase();
      const provider = Number(req.query.provider || 0);
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const pool = DatabaseConnection.getPool();
      const params: any[] = [];
      const where: string[] = [];
      if (['pending','overdue','paid','cancelled'].includes(status)) {
        where.push('d.status = ?');
        params.push(status);
      }
      if (provider) {
        where.push('d.provider_id = ?');
        params.push(provider);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `SELECT d.id,
                d.provider_id,
                up.email AS provider_email,
                pr.full_name AS provider_name,
                d.appointment_id,
                a.date,
                a.start_time,
                a.end_time,
                d.commission_amount,
                d.currency,
                d.status,
                d.due_date,
                d.settlement_reference,
                d.voucher_url,
                uc.email AS client_email,
                cp.full_name AS client_name
         FROM provider_commission_debts d
         LEFT JOIN appointments a ON a.id = d.appointment_id
         LEFT JOIN users uc ON uc.id = a.client_id
         LEFT JOIN client_profiles cp ON cp.client_id = a.client_id
         LEFT JOIN users up ON up.id = d.provider_id
         LEFT JOIN provider_profiles pr ON pr.provider_id = d.provider_id
         ${whereSql}
         ORDER BY d.due_date ASC, d.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return res.json({ success: true, data: rows });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error fetching admin cash commissions', e);
      return res.status(500).json({ success: false, error: 'cash_commissions_error' });
    }
  });

  router.get('/payments', adminAuth, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(500, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const pool = DatabaseConnection.getPool();
      const where: string[] = [];
      const params: any[] = [];
      if (start && end) {
        where.push('p.paid_at BETWEEN ? AND ?');
        params.push(start, end);
      }
      const gateway = req.query.gateway as string | undefined;
      if (gateway && ['tbk','stripe','cash'].includes(gateway)) {
        where.push('p.gateway = ?');
        params.push(gateway);
      }
      const releaseStatus = req.query.release_status as string | undefined;
      if (releaseStatus && ['pending','eligible','completed','failed'].includes(releaseStatus)) {
        where.push('p.release_status = ?');
        params.push(releaseStatus);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const sql = `
        SELECT p.id,
               p.appointment_id,
               a.date AS appointment_date,
               a.start_time,
               a.end_time,
               s.name AS service_name,
               p.client_id,
               uc.email AS client_email,
               c.full_name AS client_name,
               p.provider_id,
               up.email AS provider_email,
               pr.full_name AS provider_name,
               pr.bank_name,
               pr.bank_account,
               RIGHT(COALESCE(pr.bank_account,''), 4) AS bank_last4,
               pr.account_holder,
               pr.account_rut,
               pr.account_type,
               p.amount, p.tax_amount, p.commission_amount, p.provider_amount,
               p.currency, p.payment_method, p.status, p.paid_at,
               p.release_status,
               p.gateway,
               p.mall_commerce_code,
               p.secondary_commerce_code,
               p.tbk_buy_order_mall,
               p.tbk_buy_order_secondary,
               p.tbk_token,
               p.tbk_authorization_code,
               p.stripe_payment_intent_id
        FROM payments p
        LEFT JOIN users uc ON uc.id = p.client_id
        LEFT JOIN users up ON up.id = p.provider_id
        LEFT JOIN client_profiles c ON c.client_id = p.client_id
        LEFT JOIN provider_profiles pr ON pr.provider_id = p.provider_id
        LEFT JOIN appointments a ON a.id = p.appointment_id
        LEFT JOIN provider_services s ON s.id = a.service_id
        ${whereSql}
        ORDER BY p.paid_at DESC, p.id DESC
        LIMIT ? OFFSET ?`;
      params.push(limit, offset);
      const [rows] = await pool.query(sql, params);
      // Agregar columna derivada: settlement_status
      const enriched = (rows as any[]).map((r: any) => {
        let settlement_status = r.release_status || 'pending';
        return { ...r, settlement_status };
      });
      res.json({ success: true, data: enriched, pagination: { limit, offset } });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error fetching payments', e);
      res.status(500).json({ success: false, error: 'query_error' });
    }
  });

  // Listar solicitudes de devolución
  router.get('/refunds', adminAuth, async (_req, res) => {
    try {
      const pool = DatabaseConnection.getPool();
      const [rows] = await pool.query(`
        SELECT rr.id, rr.appointment_id, rr.payment_id, rr.client_id, rr.provider_id,
               rr.amount, rr.currency, rr.reason, rr.status, rr.requested_at, rr.decided_at,
               rr.decided_by_admin_email, rr.decision_notes,
               a.date AS appointment_date, a.start_time, a.end_time,
               uc.email AS client_email, up.email AS provider_email,
               cp.phone AS client_phone,
               s.name AS service_name,
               p.payment_method, p.stripe_payment_intent_id,
               COALESCE(rr.amount, p.amount) AS original_amount,
               ROUND(COALESCE(rr.amount, p.amount) * 0.65, 2) AS refund_proposed_amount
        FROM refund_requests rr
        LEFT JOIN appointments a ON a.id = rr.appointment_id
        LEFT JOIN users uc ON uc.id = rr.client_id
        LEFT JOIN users up ON up.id = rr.provider_id
        LEFT JOIN client_profiles cp ON cp.client_id = rr.client_id
        LEFT JOIN payments p ON p.id = rr.payment_id
        LEFT JOIN provider_services s ON s.id = a.service_id
        ORDER BY rr.requested_at DESC, rr.id DESC
      `);
      res.json({ success: true, data: rows });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error fetching refunds', e);
      res.status(500).json({ success: false, error: 'refunds_query_error' });
    }
  });

  // Resolver solicitud de devolución
  router.post('/refunds/:id/decision', adminAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { decision, notes } = (req.body || {}) as { decision?: 'approved'|'denied'|'cancelled'; notes?: string };
      if (!Number.isFinite(id) || !decision || !['approved','denied','cancelled'].includes(decision)) {
        return res.status(400).json({ success: false, error: 'parámetros inválidos' });
      }
      const pool = DatabaseConnection.getPool();
      await pool.execute(
        `UPDATE refund_requests SET status = ?, decided_at = NOW(), decided_by_admin_email = ?, decision_notes = ? WHERE id = ?`,
        [decision, req.user?.email || null, notes || null, id]
      );
      // Enviar email al cliente
      const [[row]]: any = await pool.query(
        `SELECT rr.*, uc.email AS client_email, cp.full_name AS client_name, s.name AS service_name
         FROM refund_requests rr
         LEFT JOIN users uc ON uc.id = rr.client_id
         LEFT JOIN client_profiles cp ON cp.client_id = rr.client_id
         LEFT JOIN appointments a ON a.id = rr.appointment_id
         LEFT JOIN provider_services s ON s.id = a.service_id
         WHERE rr.id = ? LIMIT 1`,
        [id]
      );
      if (row?.client_email) {
        const refundAmount = decision === 'approved' ? Number((row.amount || 0) * 0.65) : undefined;
        try {
          await (require('../../shared/services/email.service') as typeof import('../../shared/services/email.service')).EmailService.sendRefundDecision(row.client_email, {
            appName: process.env.APP_NAME || 'Adomi',
            clientName: row.client_name || null,
            serviceName: row.service_name || null,
            appointmentId: row.appointment_id || null,
            originalAmount: Number(row.amount || 0),
            refundAmount,
            currency: row.currency || 'CLP',
            decision: decision === 'approved' ? 'approved' : 'denied',
            decisionNotes: notes || null
          } as any);
        } catch (e) {
          // No bloquear por error de email
        }
      }
      res.json({ success: true });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error deciding refund', e);
      res.status(500).json({ success: false, error: 'refund_decision_error' });
    }
  });

  // Marcar devolución como pagada (transferencia realizada)
  router.post('/refunds/:id/mark-paid', adminAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { reference, notes } = (req.body || {}) as { reference?: string; notes?: string };
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'id invalido' });
      const pool = DatabaseConnection.getPool();
      const [[row]]: any = await pool.query('SELECT status, decision_notes FROM refund_requests WHERE id = ? LIMIT 1', [id]);
      if (!row) return res.status(404).json({ success: false, error: 'refund_not_found' });
      // Solo permitir marcar pagado si está aprobado
      if (row.status !== 'approved') {
        return res.status(400).json({ success: false, error: 'refund_not_approved' });
      }
      const mergedNotes: any = {};
      try { if (row.decision_notes) Object.assign(mergedNotes, JSON.parse(row.decision_notes)); } catch {}
      mergedNotes.reference = reference || mergedNotes.reference || null;
      mergedNotes.notes = notes || mergedNotes.notes || null;
      await pool.execute(
        `UPDATE refund_requests SET status = 'refunded', decision_notes = ?, updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(mergedNotes), id]
      );
      return res.json({ success: true });
    } catch (e) {
      Logger.error('ADMIN_MODULE', 'Error mark refund paid', e as any);
      return res.status(500).json({ success: false, error: 'mark_refund_paid_error' });
    }
  });

  // Subir voucher de devolución
  const refundVoucherStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join('uploads', 'admin', 'refunds');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `refund-${req.params.id}-${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`);
    }
  });
  const uploadRefundVoucher = multer({ storage: refundVoucherStorage, limits: { fileSize: 5 * 1024 * 1024 } });

  router.post('/refunds/:id/upload-voucher', adminAuth, uploadRefundVoucher.single('voucher'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'id invalido' });
      if (!file) return res.status(400).json({ success: false, error: 'Archivo requerido' });

      const pool = DatabaseConnection.getPool();
      const [[row]]: any = await pool.query('SELECT decision_notes FROM refund_requests WHERE id = ? LIMIT 1', [id]);
      if (!row) return res.status(404).json({ success: false, error: 'refund_not_found' });
      const url = `/uploads/admin/refunds/${file.filename}`;
      let notes: any = {};
      try { if (row.decision_notes) notes = JSON.parse(row.decision_notes); } catch {}
      notes.voucher = url;
      await pool.execute('UPDATE refund_requests SET decision_notes = ? WHERE id = ?', [JSON.stringify(notes), id]);
      res.json({ success: true, url });
    } catch (e) {
      Logger.error('ADMIN_MODULE', 'Error upload refund voucher', e as any);
      res.status(500).json({ success: false, error: 'upload_refund_voucher_error' });
    }
  });

  // Totales por rango
  router.get('/payments/summary', adminAuth, async (req, res) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const pool = DatabaseConnection.getPool();
      const where: string[] = [];
      const params: any[] = [];
      if (start && end) { where.push('p.paid_at BETWEEN ? AND ?'); params.push(start, end); }
      const gateway = req.query.gateway as string | undefined;
      if (gateway && ['tbk','stripe','cash'].includes(gateway)) { where.push('p.gateway = ?'); params.push(gateway); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [rows]: any = await pool.query(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(p.amount),0) AS total_gross,
                COALESCE(SUM(p.tax_amount),0) AS total_tax,
                COALESCE(SUM(p.commission_amount),0) AS total_commission,
                COALESCE(SUM(p.provider_amount),0) AS total_provider,
                SUM(CASE WHEN p.release_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN p.release_status = 'eligible' THEN 1 ELSE 0 END) AS eligible_count,
                SUM(CASE WHEN p.release_status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                COALESCE(SUM(CASE WHEN p.release_status = 'pending' THEN p.provider_amount ELSE 0 END),0) AS pending_total_provider,
                COALESCE(SUM(CASE WHEN p.release_status = 'eligible' THEN p.provider_amount ELSE 0 END),0) AS eligible_total_provider,
                COALESCE(SUM(CASE WHEN p.release_status = 'completed' THEN p.provider_amount ELSE 0 END),0) AS completed_total_provider
         FROM payments p ${whereSql}`,
        params
      );
      res.json({ success: true, summary: rows[0] });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error summary payments', e);
      res.status(500).json({ success: false, error: 'summary_error' });
    }
  });

  // Export CSV
  router.get('/payments/export.csv', adminAuth, async (req, res) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const pool = DatabaseConnection.getPool();
      const where: string[] = [];
      const params: any[] = [];
      if (start && end) { where.push('p.paid_at BETWEEN ? AND ?'); params.push(start, end); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [rows]: any = await pool.query(
        `SELECT p.id, p.appointment_id, p.client_id, p.provider_id, p.amount, p.tax_amount, p.commission_amount, p.provider_amount, p.currency, p.status, p.paid_at,
                s.name AS service_name, uc.email AS client_email, up.email AS provider_email
         FROM payments p
         LEFT JOIN appointments a ON a.id = p.appointment_id
         LEFT JOIN provider_services s ON s.id = a.service_id
         LEFT JOIN users uc ON uc.id = p.client_id
         LEFT JOIN users up ON up.id = p.provider_id
         ${whereSql}
         ORDER BY p.paid_at DESC, p.id DESC`,
        params
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
      const header = ['id','appointment_id','client_id','provider_id','service_name','client_email','provider_email','amount','tax_amount','commission_amount','provider_amount','currency','status','paid_at'];
      res.write(header.join(',') + '\n');
      for (const r of rows) {
        const line = [r.id,r.appointment_id,r.client_id,r.provider_id,`"${r.service_name||''}"`,r.client_email,r.provider_email,r.amount,r.tax_amount,r.commission_amount,r.provider_amount,r.currency,r.status,r.paid_at?new Date(r.paid_at).toISOString():'' ].join(',');
        res.write(line + '\n');
      }
      res.end();
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error export csv', e);
      res.status(500).json({ success: false, error: 'export_error' });
    }
  });

  // Export PDF simple (tabla) - versión básica (CSV suele ser preferible)
  router.get('/payments/export.pdf', adminAuth, async (req, res) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const pool = DatabaseConnection.getPool();
      const where: string[] = [];
      const params: any[] = [];
      if (start && end) { where.push('p.paid_at BETWEEN ? AND ?'); params.push(start, end); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [rows]: any = await pool.query(
        `SELECT p.id, p.appointment_id, p.amount, p.commission_amount, p.provider_amount, p.currency, p.status, p.paid_at,
                s.name AS service_name, uc.email AS client_email, up.email AS provider_email
         FROM payments p
         LEFT JOIN appointments a ON a.id = p.appointment_id
         LEFT JOIN provider_services s ON s.id = a.service_id
         LEFT JOIN users uc ON uc.id = p.client_id
         LEFT JOIN users up ON up.id = p.provider_id
         ${whereSql}
         ORDER BY p.paid_at DESC, p.id DESC`,
        params
      );
      // PDF simple como texto preformateado (placeholder); idealmente usar una lib PDF server-side
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="payments.pdf"');
      // Para mantener simple, devolvemos un PDF mínimo usando PDFKit si estuviera disponible; aquí devolvemos texto.
      res.end(Buffer.from('PDF export not fully implemented. Use CSV for now.'));
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error export pdf', e);
      res.status(500).json({ success: false, error: 'export_pdf_error' });
    }
  });

  // Conteo rápido para badge
  router.get('/payments/pending-count', adminAuth, async (req, res) => {
    try {
      const pool = DatabaseConnection.getPool();
      const [[row]]: any = await pool.query(
        `SELECT 
           SUM(CASE WHEN release_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN release_status = 'eligible' THEN 1 ELSE 0 END) AS eligible_count
         FROM payments`
      );
      res.json({ success: true, pending: Number(row?.pending_count || 0), eligible: Number(row?.eligible_count || 0) });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error pending count', e);
      res.status(500).json({ success: false, error: 'count_error' });
    }
  });

  // Marcar pago como liberado manualmente (transferencia realizada)
  router.post('/payments/:id/mark-released', adminAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { reference, notes } = (req.body || {}) as { reference?: string; notes?: string };
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'id invalido' });
      const pool = DatabaseConnection.getPool();
      const payload = JSON.stringify({ reference: reference || null, notes: notes || null });
      await pool.execute(
        `UPDATE payments SET release_status = 'completed', released_at = NOW(), release_notes = ? WHERE id = ?`,
        [payload, id]
      );
      return res.json({ success: true });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error mark released', e);
      res.status(500).json({ success: false, error: 'mark_released_error' });
    }
  });

  // Subir voucher
  router.post('/payments/:id/upload-voucher', adminAuth, upload.single('voucher'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'id invalido' });
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ success: false, error: 'Archivo requerido' });
      const url = `/uploads/admin/vouchers/${file.filename}`;
      // Guardar URL en release_notes (merge JSON si existe)
      const pool = DatabaseConnection.getPool();
      const [[row]]: any = await pool.query('SELECT release_notes FROM payments WHERE id = ? LIMIT 1', [id]);
      let notes: any = {};
      try { if (row?.release_notes) notes = JSON.parse(row.release_notes); } catch {}
      notes.voucher = url;
      await pool.execute('UPDATE payments SET release_notes = ? WHERE id = ?', [JSON.stringify(notes), id]);
      return res.json({ success: true, url });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error uploading voucher', e);
      res.status(500).json({ success: false, error: 'upload_voucher_error' });
    }
  });

  app.use('/admin', router);
  Logger.info('ADMIN_MODULE', 'Admin module mounted on /admin');
}

/**
 * Admin Module
 * Handles admin panel functionality, verifications, and platform settings
 */

// TODO: Import and export routes when implemented

/**
 * Setup function to mount admin routes
 * @param app Express application
 */
// (definición única de setupAdminModule al inicio del archivo)

