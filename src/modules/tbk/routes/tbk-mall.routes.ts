import { Router, Request, Response } from 'express';
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

    const { provider_id, amount_provider, commission_amount, client_reference } = req.body || {};
    const mallCode = requireEnv('TBK_MALL_COMMERCE_CODE');
    const pool = DatabaseConnection.getPool();

    // Validaciones mínimas
    const pid = Number(provider_id);
    const gross = Number(amount_provider) + Number(commission_amount);
    if (!Number.isFinite(pid) || pid <= 0) {
      return res.status(400).json({ success: false, error: 'provider_id inválido' });
    }
    if (!Number.isFinite(gross) || gross <= 0) {
      return res.status(400).json({ success: false, error: 'monto inválido' });
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

    const payload = {
      buy_order: buyOrder,
      session_id: client_reference || `sess-${user.id}-${Date.now()}`,
      return_url: requireEnv('TBK_RETURN_URL'),
      details: [
        { amount: Math.round(Number(amount_provider)), commerce_code: String(prov.tbk_secondary_code), buy_order: detailProvOrder },
        { amount: Math.round(Number(commission_amount)), commerce_code: String(mallCode), buy_order: detailMallOrder }
      ]
    };

    // Validación suma
    const sum = payload.details.reduce((a: number, d: any) => a + Number(d.amount || 0), 0);
    if (sum <= 0) return res.status(400).json({ success: false, error: 'La suma de detalles debe ser > 0' });

    const { data } = await axios.post(`${getTbkBase()}/rswebpaytransaction/api/webpay/v1.2/transactions`, payload, { headers: getTbkHeaders() });

    // Persistencia mínima de intento
    await pool.execute(
      `INSERT INTO payments (client_id, provider_id, amount, commission_amount, provider_amount, currency, payment_method, status, gateway, mall_commerce_code, secondary_commerce_code, tbk_buy_order_mall, tbk_buy_order_secondary, tbk_token)
       VALUES (?, ?, ?, ?, ?, 'CLP', 'card', 'pending', 'tbk', ?, ?, ?, ?, ?)`,
      [user.id, pid, sum, Math.round(Number(commission_amount)), Math.round(Number(amount_provider)), mallCode, prov.tbk_secondary_code, detailMallOrder, detailProvOrder, data?.token || null]
    );

    return res.status(201).json({ success: true, token: data?.token, url: data?.url, buy_order: buyOrder });
  } catch (err: any) {
    Logger.error(MODULE, 'Create mall tx error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error creando transacción TBK', details: msg });
  }
});

// POST /tbk/mall/commit
router.post('/tbk/mall/commit', async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token_ws || req.query?.token_ws || '').trim();
    if (!token) return res.status(400).json({ success: false, error: 'token_ws requerido' });

    const { data } = await axios.put(`${getTbkBase()}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`, {}, { headers: getTbkHeaders() });

    // Persistir autorizaciones por detail
    const pool = DatabaseConnection.getPool();
    const status = String(data?.status || '').toLowerCase().includes('authorized') ? 'completed' : 'failed';
    await pool.execute('UPDATE payments SET status = ?, tbk_authorization_code = ?, updated_at = CURRENT_TIMESTAMP WHERE tbk_token = ?', [status, String(data?.authorization_code || ''), token]);

    return res.json({ success: true, commit: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Commit mall tx error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error confirmando transacción TBK', details: msg });
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


