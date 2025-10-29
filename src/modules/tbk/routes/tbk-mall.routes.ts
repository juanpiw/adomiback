import express, { Router, Request, Response } from 'express';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import axios from 'axios';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'TBK_MALL_ROUTES';
const router = Router();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

function getTbkBase(): string {
  return requireEnv('TBK_BASE_URL');
}

function getTbkHeaders() {
  return {
    'Tbk-Api-Key-Id': requireEnv('TBK_API_KEY_ID'),
    'Tbk-Api-Key-Secret': requireEnv('TBK_API_KEY_SECRET'),
    'Content-Type': 'application/json'
  } as Record<string, string>;
}

// POST /tbk/mall/transactions
router.post('/tbk/mall/transactions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    if (!user?.id) return res.status(401).json({ success: false, error: 'auth_required' });

    const { appointment_id, provider_id, amount_provider, commission_amount, client_reference } = req.body || {} as any;
    const mallCode = requireEnv('TBK_MALL_COMMERCE_CODE');
    const pool = DatabaseConnection.getPool();

    let pid: number;
    let gross: number;
    let providerAmount: number;
    let commissionAmount: number;

    // Modo recomendado: appointment_id → calcular montos e IDs
    if (appointment_id) {
      const apptId = Number(appointment_id);
      if (!Number.isFinite(apptId) || apptId <= 0) return res.status(400).json({ success: false, error: 'appointment_id inválido' });

      const [[appt]]: any = await pool.query(
        `SELECT id, client_id, provider_id, price FROM appointments WHERE id = ? LIMIT 1`,
        [apptId]
      );
      if (!appt) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      if (Number(appt.client_id) !== Number(user.id)) return res.status(403).json({ success: false, error: 'No autorizado para pagar esta cita' });

      pid = Number(appt.provider_id);
      const amount = Math.round(Number(appt.price || 0));
      if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Monto de la cita inválido' });

      // Leer settings de comisión/IVA
      let taxRate = 0.0; // si no hay IVA, se considera 0
      let commissionRate = 15.0;
      try {
        const [setRows]: any = await pool.query(
          `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ('default_tax_rate','default_commission_rate')`
        );
        for (const r of setRows as any[]) {
          if (r.setting_key === 'default_tax_rate') taxRate = Number(r.setting_value) || 0.0;
          if (r.setting_key === 'default_commission_rate') commissionRate = Number(r.setting_value) || 15.0;
        }
      } catch {}

      // Calcular sobre base neta si hay IVA configurado
      const priceBase = taxRate > 0 ? Math.round(amount / (1 + taxRate / 100)) : amount;
      commissionAmount = Math.max(0, Math.round(priceBase * (commissionRate / 100)));
      providerAmount = Math.max(0, amount - commissionAmount);
      gross = amount;
    } else {
      // Modo compatibilidad: payload explícito
      const pidRaw = Number(provider_id);
      const grossRaw = Number(amount_provider) + Number(commission_amount);
      if (!Number.isFinite(pidRaw) || pidRaw <= 0) return res.status(400).json({ success: false, error: 'provider_id inválido' });
      if (!Number.isFinite(grossRaw) || grossRaw <= 0) return res.status(400).json({ success: false, error: 'monto inválido' });
      pid = pidRaw;
      gross = Math.round(grossRaw);
      providerAmount = Math.round(Number(amount_provider));
      commissionAmount = Math.round(Number(commission_amount));
    }

    // Obtener codigo secundario del proveedor
    const [[prov]]: any = await pool.query('SELECT id, tbk_secondary_code FROM users WHERE id = ? AND role = "provider" LIMIT 1', [pid]);
    if (!prov?.tbk_secondary_code) {
      return res.status(400).json({ success: false, error: 'Proveedor sin TBK secundario' });
    }

    // Build payload
    const buyOrder = `ord-mp-${Date.now()}-${pid}`;
    const detailProvOrder = `ord-prov-${Date.now()}-${pid}`;
    const detailMallOrder = `ord-mall-${Date.now()}-${user.id}`;

    const platformChildCode = (process.env.TBK_PLATFORM_CHILD_CODE || '').trim();

    // Armar details: si tenemos comercio hijo de plataforma y hay comisión > 0, dividimos en 2 detalles.
    // Si no, enviamos un solo detail al hijo del proveedor por el monto total (gross).
    const details: any[] = [];
    if (Number(commissionAmount) > 0 && platformChildCode) {
      details.push({ amount: Math.round(providerAmount), commerce_code: String(prov.tbk_secondary_code), buy_order: detailProvOrder });
      details.push({ amount: Math.round(commissionAmount), commerce_code: String(platformChildCode), buy_order: detailMallOrder });
    } else {
      details.push({ amount: Math.round(gross), commerce_code: String(prov.tbk_secondary_code), buy_order: detailProvOrder });
    }

    const payload = {
      buy_order: buyOrder,
      session_id: client_reference || `sess-${user.id}-${Date.now()}`,
      return_url: requireEnv('TBK_RETURN_URL'),
      details
    };

    // Validación suma
    const sum = payload.details.reduce((a: number, d: any) => a + Number(d.amount || 0), 0);
    if (sum <= 0) return res.status(400).json({ success: false, error: 'La suma de detalles debe ser > 0' });

    // Logs de diagnóstico (no incluyen secretos)
    Logger.info(MODULE, `Creating TBK Mall tx | appt=${appointment_id || null} client=${user.id} provider=${pid}`);
    Logger.info(MODULE, `Amounts | gross=${gross} providerAmount=${providerAmount} commissionAmount=${commissionAmount}`);
    Logger.info(MODULE, `Codes | provider_child=${prov.tbk_secondary_code} platform_child=${platformChildCode || '(none)'} mall_parent=${mallCode}`);
    Logger.info(MODULE, `Details | ${JSON.stringify(payload.details)}`);
    Logger.info(MODULE, `Return URL | ${payload.return_url}`);

    const endpoint = `${getTbkBase()}/rswebpaytransaction/api/webpay/v1.2/transactions`;
    Logger.info(MODULE, `POST ${endpoint}`);
    const { data } = await axios.post(endpoint, payload, { headers: getTbkHeaders() });

    // Persistencia mínima de intento
    const usedMallCommerceCode = (Number(commissionAmount) > 0 && platformChildCode) ? platformChildCode : null;
    const usedMallBuyOrder = (Number(commissionAmount) > 0 && platformChildCode) ? detailMallOrder : null;

    await pool.execute(
      `INSERT INTO payments (appointment_id, client_id, provider_id, amount, commission_amount, provider_amount, currency, payment_method, status, gateway, mall_commerce_code, secondary_commerce_code, tbk_buy_order_mall, tbk_buy_order_secondary, tbk_token)
       VALUES (?, ?, ?, ?, ?, ?, 'CLP', 'card', 'pending', 'tbk', ?, ?, ?, ?, ?)`,
      [appointment_id || null, user.id, pid, sum, Math.round(commissionAmount), Math.round(providerAmount), usedMallCommerceCode, prov.tbk_secondary_code, usedMallBuyOrder, detailProvOrder, data?.token || null]
    );

    return res.status(201).json({ success: true, token: data?.token, url: data?.url, buy_order: buyOrder });
  } catch (err: any) {
    const tbkStatus = err?.response?.status;
    const tbkData = err?.response?.data;
    const tbkHeaders = err?.response?.headers;
    Logger.error(MODULE, 'Create mall tx error', {
      message: err?.message,
      tbkStatus,
      tbkData,
      // headers pueden ser grandes; no incluyen secretos pero truncamos
      tbkHeaderKeys: tbkHeaders ? Object.keys(tbkHeaders) : undefined
    });
    const msg = tbkData || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error creando transacción TBK', details: msg });
  }
});

// POST /tbk/mall/commit
router.post('/tbk/mall/commit', async (req: Request, res: Response) => {
  try {
    const token = String(
      (req.body as any)?.token_ws || (req.query as any)?.token_ws ||
      (req.body as any)?.token || (req.query as any)?.token ||
      (req.body as any)?.TBK_TOKEN || (req.query as any)?.TBK_TOKEN ||
      ''
    ).trim();
    Logger.info(MODULE, `Commit received | hasToken=${!!token} bodyKeys=${Object.keys((req.body || {}))} queryKeys=${Object.keys((req.query || {}))}`);
    if (!token) return res.status(400).json({ success: false, error: 'token_ws requerido' });

    const endpoint = `${getTbkBase()}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`;
    Logger.info(MODULE, `PUT ${endpoint}`);
    const { data } = await axios.put(endpoint, {}, { headers: getTbkHeaders() });
    const details = Array.isArray((data as any)?.details) ? (data as any).details : [];
    const detailStatuses = details.map((d: any) => ({
      status: d?.status,
      response_code: d?.response_code,
      commerce_code: d?.commerce_code,
      amount: d?.amount,
      authorization_code: d?.authorization_code,
      buy_order: d?.buy_order
    }));
    Logger.info(MODULE, 'TBK commit response', {
      status: (data as any)?.status,
      buy_order: (data as any)?.buy_order,
      details: detailStatuses
    });

    // Determinar status autorizado a partir de details (Mall)
    const isAuthorized = details.length
      ? details.every((d: any) => String(d?.status || '').toUpperCase() === 'AUTHORIZED' && Number(d?.response_code || 0) === 0)
      : String((data as any)?.status || '').toUpperCase() === 'AUTHORIZED';
    const computedStatus = isAuthorized ? 'completed' : 'failed';

    // Persistir autorizaciones por detail + marcar pago en cita
    const pool = DatabaseConnection.getPool();
    const status = computedStatus;

    // Obtener pago para conocer la cita
    const [[paymentRow]]: any = await pool.query('SELECT id, appointment_id FROM payments WHERE tbk_token = ? LIMIT 1', [token]);
    await pool.execute(
      'UPDATE payments SET status = ?, paid_at = CASE WHEN ? = "completed" THEN CURRENT_TIMESTAMP ELSE paid_at END WHERE tbk_token = ?',
      [status, status, token]
    );

    if (paymentRow?.appointment_id && status === 'completed') {
      try {
        await pool.execute('UPDATE appointments SET payment_status = "paid", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [paymentRow.appointment_id]);
      } catch (e) {
        Logger.warn(MODULE, 'Unable to update appointment payment_status', e as any);
      }
    }

    return res.json({ success: true, commit: data });
  } catch (err: any) {
    const tbkStatus = err?.response?.status;
    const tbkData = err?.response?.data;
    Logger.error(MODULE, 'Commit mall tx error', { message: err?.message, tbkStatus, tbkData });
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error confirmando transacción TBK', details: msg });
  }
});

// Bridge de retorno TBK: recibe POST con token_ws y redirige al frontend con query param
router.post('/tbk/return', express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  try {
    const token = String((req as any).body?.token_ws || '').trim();
    const publicBase = process.env.FRONTEND_BASE_URL || process.env.PUBLIC_BASE_URL || '';
    const target = token ? `${publicBase}/tbk/return?token_ws=${encodeURIComponent(token)}` : `${publicBase}/tbk/return`;
    Logger.info(MODULE, `TBK return bridge redirect -> ${target}`);
    return res.redirect(302, target);
  } catch (e) {
    Logger.warn(MODULE, 'TBK return bridge error', e as any);
    return res.redirect(302, (process.env.FRONTEND_BASE_URL || '/') + '/tbk/return');
  }
});

// Soportar retornos vía GET (algunos navegadores o integraciones envían token_ws por query)
router.get('/tbk/return', async (req: Request, res: Response) => {
  try {
    const token = String(req.query?.token_ws || '').trim();
    const publicBase = process.env.FRONTEND_BASE_URL || process.env.PUBLIC_BASE_URL || '';
    const target = token ? `${publicBase}/tbk/return?token_ws=${encodeURIComponent(token)}` : `${publicBase}/tbk/return`;
    Logger.info(MODULE, `TBK return GET bridge redirect -> ${target}`);
    return res.redirect(302, target);
  } catch (e) {
    Logger.warn(MODULE, 'TBK return GET bridge error', e as any);
    return res.redirect(302, (process.env.FRONTEND_BASE_URL || '/') + '/tbk/return');
  }
});

// GET /tbk/mall/status/:token
router.get('/tbk/mall/status/:token', authenticateToken, async (req: Request, res: Response) => {
  try {
    const token = String(req.params?.token || '').trim();
    if (!token) return res.status(400).json({ success: false, error: 'token requerido' });
    const { data } = await axios.get(`${getTbkBase()}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`, { headers: getTbkHeaders() });
    return res.json({ success: true, status: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Status mall tx error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error consultando estado TBK', details: msg });
  }
});

// POST /tbk/mall/refund
router.post('/tbk/mall/refund', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { token, amount, commerce_code, buy_order } = req.body || {};
    if (!token || !Number.isFinite(Number(amount)) || !commerce_code || !buy_order) {
      return res.status(400).json({ success: false, error: 'token, amount, commerce_code y buy_order son requeridos' });
    }
    const endpoint = `${getTbkBase()}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}/refunds`;
    const { data } = await axios.post(endpoint, { amount: Math.round(Number(amount)), commerce_code, buy_order }, { headers: getTbkHeaders() });
    return res.json({ success: true, refund: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Refund mall tx error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error procesando reembolso TBK', details: msg });
  }
});

export default router;


