import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import { Logger } from '../../../shared/utils/logger.util';
import { getPresignedPutUrl, getPublicUrlForKey, requireEnv } from '../../../shared/utils/s3.util';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import { EmailService } from '../../../shared/services/email.service';

const MODULE = 'PROVIDER_FINANCES';

export function buildProviderFinancesRoutes(): Router {
  const router = Router();

  // GET /provider/finances/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/provider/finances/summary', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const pool = DatabaseConnection.getPool();

      const params: any[] = [providerId];
      let where = 'WHERE p.provider_id = ? AND p.status IN (\'completed\', \'succeeded\')';
      if (from) { where += ' AND DATE(p.paid_at) >= ?'; params.push(from); }
      if (to) { where += ' AND DATE(p.paid_at) <= ?'; params.push(to); }

      const [rows] = await pool.query(
        `SELECT 
           COALESCE(SUM(p.amount), 0) AS gross_amount,
           COALESCE(SUM(p.commission_amount), 0) AS commission_amount,
           COALESCE(SUM(p.provider_amount), 0) AS provider_net
         FROM payments p
         ${where}`,
        params
      );
      const sum = (rows as any[])[0] || { gross_amount: 0, commission_amount: 0, provider_net: 0 };

      // Métrica adicional: citas pagadas en efectivo últimos 7 días
      let cashPaidCount = 0;
      try {
        const [[cnt]]: any = await pool.query(
          `SELECT COUNT(1) AS c
           FROM payments
           WHERE provider_id = ?
             AND status IN ('completed','succeeded')
             AND payment_method = 'cash'
             AND paid_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
          [providerId]
        );
        cashPaidCount = Number(cnt?.c || 0);
      } catch {}

      // Métrica adicional: deuda de comisiones cash pendiente
      let cashCommissionDebt = 0;
      try {
        const [[d]]: any = await pool.query(
          `SELECT COALESCE(SUM(commission_amount),0) AS due
           FROM provider_commission_debts
           WHERE provider_id = ? AND status IN ('pending','overdue')`,
          [providerId]
        );
        cashCommissionDebt = Number(d?.due || 0);
      } catch {}

      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, summary: { ...sum, cashPaidCount, cashCommissionDebt } });
    } catch (err) {
      Logger.error(MODULE, 'Error getting finances summary', err as any);
      return res.status(500).json({ success: false, error: 'Error al obtener resumen' });
    }
  });

  // GET /provider/finances/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50&offset=0
  router.get('/provider/finances/transactions', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const limit = Math.min(Number(req.query.limit || 50), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const pool = DatabaseConnection.getPool();

      const paramsCount: any[] = [providerId];
      const params: any[] = [providerId];
      let where = 'WHERE p.provider_id = ? AND p.status IN (\'completed\', \'succeeded\')';
      if (from) { where += ' AND DATE(p.paid_at) >= ?'; params.push(from); paramsCount.push(from); }
      if (to) { where += ' AND DATE(p.paid_at) <= ?'; params.push(to); paramsCount.push(to); }

      const [rows] = await pool.query(
        `SELECT p.id, p.paid_at, p.amount, p.commission_amount, p.provider_amount, p.currency,
                a.id AS appointment_id, a.date, a.start_time, a.service_id,
                (SELECT name FROM provider_services WHERE id = a.service_id) AS service_name,
                (SELECT name FROM users WHERE id = a.client_id) AS client_name
         FROM payments p
         JOIN appointments a ON a.id = p.appointment_id
         ${where}
         ORDER BY p.paid_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      const [cnt] = await pool.query(
        `SELECT COUNT(1) AS total
         FROM payments p
         ${where}`,
        paramsCount
      );
      return res.json({ success: true, transactions: rows, total: (cnt as any[])[0]?.total || 0 });
    } catch (err) {
      Logger.error(MODULE, 'Error getting transactions', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar transacciones' });
    }
  });

  // GET /provider/cash/summary
  router.get('/provider/cash/summary', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });

      const pool = DatabaseConnection.getPool();
      const [[sum]]: any = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN status IN ('pending','overdue','under_review','rejected') THEN commission_amount ELSE 0 END), 0) AS total_due,
           COALESCE(SUM(CASE WHEN status = 'overdue' THEN commission_amount ELSE 0 END), 0) AS overdue_due,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
           SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) AS under_review_count,
           SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
           SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
           MIN(CASE WHEN status IN ('pending','overdue','under_review','rejected') THEN due_date END) AS next_due_date
         FROM provider_commission_debts
         WHERE provider_id = ?`,
        [providerId]
      );
      const [[last]]: any = await pool.query(
        `SELECT d.id, d.commission_amount, d.currency, d.status, d.due_date, d.created_at, d.manual_payment_id,
                d.settlement_reference, d.voucher_url,
                mp.status AS manual_payment_status,
                mp.reference AS manual_payment_reference,
                mp.receipt_bucket AS manual_payment_bucket,
                mp.receipt_key AS manual_payment_key,
                mp.receipt_file_name AS manual_payment_filename,
                mp.updated_at AS manual_payment_updated_at
           FROM provider_commission_debts d
           LEFT JOIN provider_cash_payments mp ON mp.id = d.manual_payment_id
          WHERE d.provider_id = ?
          ORDER BY d.updated_at DESC, d.created_at DESC
          LIMIT 1`,
        [providerId]
      );
      const manualReceiptUrl = last?.manual_payment_key ? getPublicUrlForKey(last.manual_payment_key) : null;

      Logger.info(MODULE, '[TRACE][SUMMARY] provider cash summary generado', {
        providerId,
        total_due: Number(sum?.total_due || 0),
        overdue_due: Number(sum?.overdue_due || 0),
        pending_count: Number(sum?.pending_count || 0),
        overdue_count: Number(sum?.overdue_count || 0),
        under_review_count: Number(sum?.under_review_count || 0),
        rejected_count: Number(sum?.rejected_count || 0),
        paid_count: Number(sum?.paid_count || 0),
        last_debt: last ? {
          id: last.id,
          commission_amount: Number(last.commission_amount || 0),
          status: last.status,
          due_date: last.due_date,
          manual_payment_status: last.manual_payment_status,
          manual_payment_reference: last.manual_payment_reference
        } : null
      });
      return res.json({
        success: true,
        summary: {
          total_due: Number(sum?.total_due || 0),
          overdue_due: Number(sum?.overdue_due || 0),
          pending_count: Number(sum?.pending_count || 0),
          overdue_count: Number(sum?.overdue_count || 0),
          under_review_count: Number(sum?.under_review_count || 0),
          rejected_count: Number(sum?.rejected_count || 0),
          paid_count: Number(sum?.paid_count || 0),
          next_due_date: sum?.next_due_date || null,
          last_debt: last ? {
            id: last.id,
            commission_amount: Number(last.commission_amount || 0),
            currency: last.currency || 'CLP',
            status: last.status || null,
            due_date: last.due_date,
            created_at: last.created_at,
            manual_payment_id: last.manual_payment_id || null,
            manual_payment_status: last.manual_payment_status || null,
            manual_payment_reference: last.manual_payment_reference || null,
            manual_payment_receipt_url: manualReceiptUrl,
            manual_payment_bucket: last.manual_payment_bucket || null,
            manual_payment_key: last.manual_payment_key || null,
            manual_payment_filename: last.manual_payment_filename || null,
            manual_payment_updated_at: last.manual_payment_updated_at || null
          } : null
        }
      });
    } catch (err) {
      Logger.error(MODULE, 'Error getting cash summary', err as any);
      return res.status(500).json({ success: false, error: 'Error al obtener resumen de efectivo' });
    }
  });

  // GET /provider/cash/commissions?status=pending|overdue|paid&limit=100&offset=0
  router.get('/provider/cash/commissions', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) return res.status(401).json({ success: false, error: 'No autorizado' });
      const status = String(req.query.status || '').trim();
      const limit = Math.min(Number(req.query.limit || 100), 500);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const pool = DatabaseConnection.getPool();
      const params: any[] = [providerId];
      const where: string[] = ['d.provider_id = ?'];
      if (status && ['pending','overdue','under_review','rejected','paid','cancelled'].includes(status)) {
        where.push('d.status = ?'); params.push(status);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `SELECT d.id, d.commission_amount, d.currency, d.status, d.due_date, d.settlement_reference, d.voucher_url,
                d.manual_payment_id,
                mp.status AS manual_payment_status,
                mp.reference AS manual_payment_reference,
                mp.receipt_bucket AS manual_payment_bucket,
                mp.receipt_key AS manual_payment_key,
                mp.receipt_file_name AS manual_payment_filename,
                mp.updated_at AS manual_payment_updated_at,
                a.id AS appointment_id, a.date, a.start_time, a.end_time,
                (SELECT name FROM users WHERE id = a.client_id) AS client_name
         FROM provider_commission_debts d
         LEFT JOIN provider_cash_payments mp ON mp.id = d.manual_payment_id
         LEFT JOIN appointments a ON a.id = d.appointment_id
         ${whereSql}
         ORDER BY d.due_date ASC, d.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return res.json({ success: true, data: rows });
    } catch (err) {
      Logger.error(MODULE, 'Error listing cash commissions', err as any);
      return res.status(500).json({ success: false, error: 'Error al listar comisiones cash' });
    }
  });

  // POST /provider/cash/manual-payments/sign - obtener URL firmada para comprobante
  router.post('/provider/cash/manual-payments/sign', authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
      }

      const { contentType, sizeBytes, fileName } = req.body || {};
      const ct = String(contentType || '').toLowerCase();
      const size = Number(sizeBytes || 0);
      if (!ct) {
        return res.status(400).json({ success: false, error: 'Debes indicar el tipo de archivo.' });
      }
      if (!Number.isFinite(size) || size <= 0) {
        return res.status(400).json({ success: false, error: 'Tamaño de archivo inválido.' });
      }

      const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
      if (!allowedTypes.has(ct)) {
        return res.status(400).json({ success: false, error: 'Formato no permitido. Usa PDF, JPG o PNG.' });
      }

      const maxBytes = Number(process.env.CASH_PAYMENT_MAX_BYTES || 10 * 1024 * 1024);
      if (size > maxBytes) {
        return res.status(400).json({ success: false, error: `El archivo supera el máximo permitido de ${Math.round(maxBytes / (1024 * 1024))} MB.` });
      }

      const bucket = requireEnv('AWS_S3_BUCKET');
      const ext = mime.extension(ct) || 'bin';
      const key = `providers/${providerId}/cash-payments/${uuidv4()}.${ext}`;
      const acl = (process.env.S3_CASH_RECEIPTS_ACL || process.env.S3_OBJECT_ACL || 'private') as 'private' | 'public-read';

      const { url, headers } = await getPresignedPutUrl({
        bucket,
        key,
        contentType: ct,
        expiresSeconds: 300,
        acl
      });

      const publicUrl = getPublicUrlForKey(key) || null;

      Logger.info(MODULE, 'Manual cash receipt presign issued', {
        providerId,
        bucket,
        key,
        contentType: ct,
        sizeBytes: size
      });

      return res.json({
        success: true,
        uploadUrl: url,
        headers,
        key,
        bucket,
        contentType: ct,
        fileName: fileName || null,
        publicUrl
      });
    } catch (error) {
      Logger.error(MODULE, 'Error signing manual cash receipt', error as any);
      return res.status(500).json({ success: false, error: 'No se pudo firmar el comprobante.' });
    }
  });

  // POST /provider/cash/manual-payments - registrar pago manual con comprobante
  router.post('/provider/cash/manual-payments', authenticateToken, async (req: Request, res: Response) => {
    const conn = await DatabaseConnection.getPool().getConnection();
    try {
      const user = (req as any).user || {};
      const providerId = Number(user.id);
      if (!providerId) {
        conn.release();
        return res.status(401).json({ success: false, error: 'No autorizado' });
      }

      const { amount, currency, key, bucket, reference, notes, fileName } = req.body || {};
      const amountNumber = Number(amount || 0);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        conn.release();
        return res.status(400).json({ success: false, error: 'Monto inválido.' });
      }
      const receiptKey = String(key || '').trim();
      if (!receiptKey) {
        conn.release();
        return res.status(400).json({ success: false, error: 'Falta la referencia del comprobante.' });
      }

      await conn.beginTransaction();

      const [debts]: any = await conn.query(
        `SELECT id, commission_amount, status
           FROM provider_commission_debts
          WHERE provider_id = ?
            AND status IN ('pending','overdue','rejected')
          ORDER BY due_date ASC, id ASC
          FOR UPDATE`,
        [providerId]
      );

      if (!debts.length) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ success: false, error: 'No tienes comisiones pendientes por conciliar.' });
      }

      const totalDue = debts.reduce((sum: number, row: any) => sum + Number(row?.commission_amount || 0), 0);
      const currencyCode = (String(currency || 'CLP') || 'CLP').toUpperCase();
      const resolvedBucket = String(bucket || process.env.AWS_S3_BUCKET || '').trim() || null;
      const receiptUrl = getPublicUrlForKey(receiptKey) || null;
      const metadata = {
        source: 'provider_portal',
        total_due: totalDue,
        submitted_amount: amountNumber,
        currency: currencyCode
      };

      const [insertResult]: any = await conn.execute(
        `INSERT INTO provider_cash_payments (
            provider_id,
            amount,
            currency,
            status,
            reference,
            notes,
            receipt_bucket,
            receipt_key,
            receipt_file_name,
            receipt_uploaded_at,
            metadata
          ) VALUES (?, ?, ?, 'under_review', ?, ?, ?, ?, ?, NOW(), ?)` ,
        [
          providerId,
          amountNumber,
          currencyCode,
          reference ? String(reference).trim() : null,
          notes ? String(notes).trim() : null,
          resolvedBucket,
          receiptKey,
          fileName ? String(fileName).trim() : null,
          JSON.stringify(metadata)
        ]
      );

      const paymentId = Number(insertResult?.insertId || 0);
      if (!paymentId) {
        throw new Error('No se pudo crear el pago manual');
      }

      const debtIds = debts.map((row: any) => Number(row.id));
      if (debtIds.length) {
        const relPlaceholders = debtIds.map(() => '(?, ?)').join(', ');
        const relParams: any[] = [];
        debtIds.forEach((id: number) => {
          relParams.push(paymentId, id);
        });
        await conn.query(
          `INSERT INTO provider_cash_payment_debts (payment_id, debt_id) VALUES ${relPlaceholders}`,
          relParams
        );

        const debtPlaceholders = debtIds.map(() => '?').join(',');
        const updateParams: any[] = [paymentId, receiptUrl, ...debtIds];
        await conn.query(
          `UPDATE provider_commission_debts
              SET status = 'under_review',
                  settlement_method = 'manual',
                  manual_payment_id = ?,
                  voucher_url = ?,
                  updated_at = NOW()
            WHERE id IN (${debtPlaceholders})`,
          updateParams
        );
      }

      await conn.commit();
      conn.release();

      const difference = Number((amountNumber - totalDue).toFixed(2));
      const totalDueRounded = Number(totalDue.toFixed(2));

      Logger.info(MODULE, 'Manual cash payment submitted', {
        providerId,
        paymentId,
        debtIds,
        amount: amountNumber,
        currency: currencyCode
      });

      try {
        const pool = DatabaseConnection.getPool();
        let providerName: string | null = null;
        if (pool) {
          try {
            const [[profile]]: any = await pool.query(
              'SELECT full_name FROM provider_profiles WHERE provider_id = ? LIMIT 1',
              [providerId]
            );
            providerName = profile?.full_name || null;
          } catch (profileErr) {
            Logger.warn(MODULE, 'No se pudo obtener nombre de proveedor para email', {
              providerId,
              error: (profileErr as any)?.message
            });
          }
        }

        const providerEmail = (user.email || '').trim();
        const appName = process.env.APP_NAME || 'AdomiApp';
        const notifyEmail = [
          process.env.CASH_PAYMENT_NOTIFICATION_EMAIL,
          process.env.CASH_BANK_NOTIFICATION_EMAIL,
          process.env.FINANCE_NOTIFICATIONS_EMAIL
        ].map(v => (v || '').trim()).find(Boolean);
        const adminPanelUrl = (process.env.CASH_PAYMENT_ADMIN_URL || process.env.ADMIN_PANEL_URL || '').trim() ||
          'https://adomiapp.com/dash/admin-pagos?panel=cash';

        const emailTasks: Promise<any>[] = [];
        const emailPayload = {
          appName,
          providerName,
          providerEmail,
          amount: amountNumber,
          currency: currencyCode,
          reference: reference ? String(reference).trim() : null,
          difference,
          debtTotal: totalDueRounded,
          uploadDateISO: new Date().toISOString(),
          receiptUrl,
          adminPanelUrl
        };

        if (providerEmail) {
          emailTasks.push(EmailService.sendManualCashReceiptProvider(providerEmail, emailPayload));
        }

        if (notifyEmail) {
          emailTasks.push(EmailService.sendManualCashReceiptAdmin(notifyEmail, {
            ...emailPayload,
            providerId,
            paymentId,
            providerEmail,
            providerName,
            receiptUrl
          }));
        }

        if (emailTasks.length) {
          Promise.allSettled(emailTasks).then(results => {
            results.forEach(result => {
              if (result.status === 'rejected') {
                Logger.warn(MODULE, 'Error enviando email de comprobante manual', {
                  providerId,
                  paymentId,
                  error: (result.reason as any)?.message || result.reason
                });
              }
            });
          }).catch(err => {
            Logger.error(MODULE, 'Fallo global enviando emails de comprobante manual', {
              providerId,
              paymentId,
              error: err?.message || err
            });
          });
        }
      } catch (emailErr: any) {
        Logger.error(MODULE, 'Error inesperado preparando emails de comprobante manual', {
          providerId,
          paymentId,
          error: emailErr?.message || emailErr
        });
      }

      return res.status(201).json({
        success: true,
        payment: {
          id: paymentId,
          amount: amountNumber,
          currency: currencyCode,
          status: 'under_review',
          reference: reference || null,
          notes: notes || null,
          receiptUrl
        },
        appliedDebtIds: debtIds,
        totalDue: totalDueRounded,
        difference
      });
    } catch (error) {
      try {
        await conn.rollback();
      } catch {}
      conn.release();
      Logger.error(MODULE, 'Error registering manual cash payment', error as any);
      return res.status(500).json({ success: false, error: 'No se pudo registrar el pago manual.' });
    }
  });

  return router;
}


