import { Express, Router } from 'express';
import { adminAuth } from '../../shared/middleware/admin-auth';
import { Logger } from '../../shared/utils/logger.util';
import DatabaseConnection from '../../shared/database/connection';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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

  router.get('/health', adminAuth, (req, res) => {
    res.json({ success: true, message: 'admin ok', ts: new Date().toISOString() });
  });

  // Placeholder endpoint to validate protection
  router.get('/whoami', adminAuth, (req: any, res) => {
    res.json({ success: true, user: req.user });
  });

  // Ejecutar ciclo de cobro de comisiones cash (card fallback)
  router.post('/cash-commissions/run-collection', adminAuth, async (_req, res) => {
    try {
      const pool = DatabaseConnection.getPool();
      // Seleccionar deudas pendientes/atrasadas y perfiles de billing
      const [debts]: any = await pool.query(
        `SELECT d.id, d.provider_id, d.commission_amount, d.settled_amount, d.currency,
                pbp.stripe_customer_id, pbp.default_payment_method_id
         FROM provider_commission_debts d
         LEFT JOIN provider_billing_profiles pbp ON pbp.provider_id = d.provider_id
         WHERE d.status IN ('pending','overdue')`);
      let queued = 0;
      for (const d of debts as any[]) {
        // Placeholder: aquí solo reportamos elegibles; la ejecución del cobro se implementará en el servicio de pagos
        if (Number(d.commission_amount) > Number(d.settled_amount || 0)) queued += 1;
      }
      return res.json({ success: true, queued });
    } catch (e: any) {
      Logger.error('ADMIN_MODULE', 'Error running cash commission collection', e);
      return res.status(500).json({ success: false, error: 'run_collection_error' });
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
               p.amount, p.commission_amount, p.provider_amount,
               p.currency, p.payment_method, p.status, p.paid_at,
               p.release_status,
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

