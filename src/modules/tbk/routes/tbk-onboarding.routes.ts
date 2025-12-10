import { Router, Request, Response } from 'express';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import axios from 'axios';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'TBK_ONBOARDING_ROUTES';

const router = Router();

type TbkStatus = 'none' | 'pending' | 'active' | 'restricted';

function getTbkBase(): string {
  const base = normalizeBase(process.env.TBK_BASE_URL);
  return base || 'https://webpay3gint.transbank.cl';
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

function normalizeBase(value: string | undefined | null): string {
  const trimmed = (value || '').trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function getSecApiBase(): string {
  const explicit = normalizeBase(process.env.TBK_SEC_API_BASE);
  if (explicit) {
    return explicit;
  }

  const legacy = normalizeBase(process.env.TBK_BASE_URL);
  if (legacy) {
    const fallback = `${legacy}/api-marketplace/v1`;
    Logger.warn(MODULE, 'Usando fallback TBK_BASE_URL para TBK_SEC_API_BASE', { fallback });
    return fallback;
  }

  return '';
}

function getSecHeaders() {
  // Preferir credenciales del portal de Onboarding (X-Client-*)
  const clientId = (process.env.TBK_SEC_CLIENT_ID || process.env.TBK_SEC_API_KEY_ID || '').trim();
  const clientSecret = (process.env.TBK_SEC_CLIENT_SECRET || process.env.TBK_SEC_API_KEY_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error('Missing env TBK_SEC_CLIENT_ID/TBK_SEC_CLIENT_SECRET');
  }

  return {
    'X-Client-Id': clientId,
    'X-Client-Secret': clientSecret,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  } as Record<string, string>;
}

function getOneclickHeaders() {
  // Prefer variables específicas para Oneclick para no chocar con Webpay Plus Mall
  const apiKeyId =
    (process.env.TBK_ONECLICK_API_KEY_ID ||
      process.env.TBK_ONECLICK_MALL_COMMERCE_CODE ||
      process.env.TBK_API_KEY_ID ||
      process.env.TBK_MALL_COMMERCE_CODE ||
      '').trim();
  const apiKeySecret =
    (process.env.TBK_ONECLICK_API_KEY_SECRET || process.env.TBK_API_KEY_SECRET || '').trim();
  if (!apiKeyId || !apiKeySecret) {
    throw new Error('Missing env TBK_ONECLICK_API_KEY_ID/TBK_ONECLICK_API_KEY_SECRET');
  }
  return {
    'Tbk-Api-Key-Id': apiKeyId,
    'Tbk-Api-Key-Secret': apiKeySecret,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

const BANK_CODE_MAP: Record<string, string> = {
  'banco de chile': '001',
  'banco chile': '001',
  'bancoestado': '012',
  'banco estado': '012',
  'banco santander': '037',
  'santander': '037',
  'banco bci': '016',
  'bci': '016',
  'banco scotiabank': '027',
  'scotiabank': '027',
  'itau': '039',
  'banco itau': '039',
  'banco security': '049',
  'security': '049',
  'banco falabella': '051',
  'falabella': '051',
  'banco ripley': '053',
  'ripley': '053',
  'banco consorcio': '055',
  'consorcio': '055',
  'banco bbva': '028',
  'bbva': '028'
};

const ACCOUNT_TYPE_MAP: Record<string, string> = {
  'corriente': 'CUENTA_CORRIENTE',
  'cuenta corriente': 'CUENTA_CORRIENTE',
  'cuenta vista': 'CUENTA_VISTA',
  'vista': 'CUENTA_VISTA',
  'chequera electronica': 'CUENTA_VISTA',
  'chequera electrónica': 'CUENTA_VISTA',
  'electronica': 'CUENTA_VISTA',
  'cuenta rut': 'CUENTA_RUT',
  'rut': 'CUENTA_RUT',
  'ahorro': 'CUENTA_AHORRO',
  'cuenta de ahorro': 'CUENTA_AHORRO'
};

function normalizeLower(value: string | null | undefined): string {
  return (value || '').toString().trim().toLowerCase();
}

function parseRut(raw: string | null | undefined): { body: string; dv: string; formatted: string } | null {
  if (!raw) return null;
  const sanitized = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (!sanitized || sanitized.length < 2) return null;
  const body = sanitized.slice(0, -1);
  const dv = sanitized.slice(-1);
  if (!body) return null;
  return { body: String(Number(body)), dv, formatted: `${String(Number(body))}-${dv}` };
}

function mapBankName(bankName: string | null | undefined) {
  const normalized = normalizeLower(bankName);
  return {
    code: normalized ? BANK_CODE_MAP[normalized] || null : null,
    name: bankName?.trim() || null
  };
}

function mapAccountType(accountType: string | null | undefined) {
  const normalized = normalizeLower(accountType);
  return {
    code: normalized ? ACCOUNT_TYPE_MAP[normalized] || null : null,
    label: accountType?.trim() || null
  };
}

function cleanPayload(value: any): any {
  if (Array.isArray(value)) {
    return value
      .map(cleanPayload)
      .filter((item) => item !== undefined && item !== null && (typeof item !== 'object' || Object.keys(item).length > 0));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, val]) => {
      const cleaned = cleanPayload(val);
      if (cleaned !== undefined && cleaned !== null && !(typeof cleaned === 'string' && cleaned.trim() === '')) {
        acc[key] = cleaned;
      }
      return acc;
    }, {} as Record<string, any>);
  }
  return value;
}

function normalizeRemoteStatus(remote: any): TbkStatus {
  const raw = normalizeLower(
    remote?.estado || remote?.status || remote?.state || remote?.comercio?.estado || remote?.comercioSecundario?.estado
  );
  if (raw.includes('activo') || raw.includes('active') || raw.includes('autoriz')) return 'active';
  if (raw.includes('restr') || raw.includes('bloq') || raw.includes('susp') || raw.includes('inacti')) return 'restricted';
  if (!raw || raw.length === 0) return 'pending';
  return 'pending';
}

function ensureArray(value: unknown): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

// POST /providers/:id/tbk/secondary/create
router.post('/providers/:id/tbk/secondary/create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const pool = DatabaseConnection.getPool();

    const [prow] = await pool.query(
      'SELECT id, email, name, phone, tbk_secondary_code, tbk_status FROM users WHERE id = ? LIMIT 1',
      [providerId]
    );
    const provider = (prow as any[])[0];
    console.log('[TBK_SECONDARY] Provider row', provider);
    if (!provider) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });

    if (provider.tbk_secondary_code) {
      return res.status(409).json({ success: false, error: 'Proveedor ya cuenta con comercio secundario registrado', code: provider.tbk_secondary_code });
    }

    const [profileRows] = await pool.query('SELECT * FROM provider_profiles WHERE provider_id = ? LIMIT 1', [providerId]);
    const profile = (profileRows as any[])[0] || null;
    console.log('[TBK_SECONDARY] Provider profile', profile);

    const rutInfo = parseRut(profile?.account_rut || null);
    const razonSocial = (profile?.full_name || provider.name || '').trim();
    const nombreFantasia = (provider.name || profile?.full_name || '').trim();
    const mainCommune = (profile?.main_commune || '').trim();
    const mainRegion = (profile?.main_region || '').trim();
    const accountHolder = (profile?.account_holder || razonSocial || '').trim();
    const bankAccount = (profile?.bank_account || '').trim();
    const bankInfo = mapBankName(profile?.bank_name || null);
    const accountTypeInfo = mapAccountType(profile?.account_type || null);
    const contactEmail = (provider.email || '').trim();
    const contactPhone = (profile as any)?.billing_phone || provider.phone || null;
    const giro = ((profile as any)?.business_activity || profile?.professional_title || 'Servicios profesionales').trim();
    const direccionBase = (profile as any)?.billing_address || mainCommune || null;
    const ciudadBase = (profile as any)?.billing_city || mainRegion || mainCommune || null;
    const metadataNotas = ensureArray((profile as any)?.tbk_notes || []);

    const missingFields: string[] = [];
    if (!rutInfo) missingFields.push('RUT del titular de la cuenta');
    if (!razonSocial) missingFields.push('Nombre o razón social');
    if (!contactEmail) missingFields.push('Correo de contacto');
    if (!accountHolder) missingFields.push('Titular de la cuenta bancaria');
    if (!bankAccount) missingFields.push('Número de cuenta bancaria');
    if (!bankInfo.name) missingFields.push('Banco');
    if (!accountTypeInfo.code && !accountTypeInfo.label) missingFields.push('Tipo de cuenta bancaria');
    if (!mainCommune) missingFields.push('Comuna principal');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos incompletos para crear el comercio secundario',
        missing_fields: missingFields
      });
    }

    const base = getSecApiBase();
    if (!base) {
      Logger.error(MODULE, 'TBK comercios secundarios sin configuración de base URL', {
        tbkSecBase: process.env.TBK_SEC_API_BASE,
        tbkBaseUrl: process.env.TBK_BASE_URL
      });
      return res.status(500).json({
        success: false,
        error: 'TBK comercios secundarios no configurado',
        details: 'Define TBK_SEC_API_BASE o TBK_BASE_URL para continuar'
      });
    }

    const payload = cleanPayload({
      rut: rutInfo?.body,
      dv: rutInfo?.dv,
      razonSocial,
      nombreFantasia: nombreFantasia || razonSocial,
      giro,
      direccion: direccionBase,
      comuna: mainCommune,
      ciudad: ciudadBase,
      region: mainRegion || null,
      telefono: contactPhone || null,
      email: contactEmail,
      datosBancarios: {
        codigoBanco: bankInfo.code,
        nombreBanco: bankInfo.name,
        tipoCuenta: accountTypeInfo.code,
        descripcionTipoCuenta: accountTypeInfo.label,
        numeroCuenta: bankAccount,
        titular: accountHolder,
        rutTitular: rutInfo?.body,
        dvTitular: rutInfo?.dv
      },
      metadata: {
        providerId,
        notas: metadataNotas,
        fuente: 'adomi-backend'
      }
    });

    const maskedPayload = (() => {
      const clone = JSON.parse(JSON.stringify(payload));
      if (clone?.datosBancarios?.numeroCuenta) {
        const acc: string = clone.datosBancarios.numeroCuenta;
        clone.datosBancarios.numeroCuenta = acc.length > 4 ? `${'*'.repeat(Math.max(acc.length - 4, 0))}${acc.slice(-4)}` : acc;
      }
      if (clone?.datosBancarios?.rutTitular) {
        const rut: string = clone.datosBancarios.rutTitular;
        clone.datosBancarios.rutTitular = rut.length > 4 ? `${rut.slice(0, 2)}****` : rut;
      }
      return clone;
    })();

    const secHeaders = getSecHeaders();
    const maskedHeaders = {
      ...secHeaders,
      'X-Client-Secret': (secHeaders as any)['X-Client-Secret'] ? `${(secHeaders as any)['X-Client-Secret'].slice(0, 4)}****` : undefined
    };

    Logger.info(MODULE, 'Creando comercio secundario TBK', { providerId, base, payload: maskedPayload, headers: maskedHeaders });
    console.log('[TBK_SECONDARY] Payload', maskedPayload);
    console.log('[TBK_SECONDARY] Headers', maskedHeaders);

    const requestUrl = `${base}/comercios-secundarios`;
    console.log('[TBK_SECONDARY] URL', requestUrl);

    const { data, status, headers: respHeaders } = await axios.post(requestUrl, payload, { headers: secHeaders });
    try {
      Logger.info(MODULE, 'Respuesta TBK crear secundario', {
        status,
        contentType: respHeaders?.['content-type'] || respHeaders?.['Content-Type'],
        // Evitar logs enormes: mostrar sólo un preview
        bodyPreview: typeof data === 'string' ? (data as string).slice(0, 600) : JSON.stringify(data).slice(0, 600)
      });
    } catch {}
    const codigo = String(data?.codigoComercioSecundario || '').trim();
    if (!codigo) return res.status(502).json({ success: false, error: 'Respuesta TBK inválida' });

    const normalizedStatus = normalizeRemoteStatus(data);

    await pool.execute('UPDATE users SET tbk_secondary_code = ?, tbk_status = ? WHERE id = ?', [codigo, normalizedStatus, providerId]);
    await pool.execute(
      `INSERT INTO tbk_secondary_shops (provider_id, codigo_comercio_secundario, status, raw)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), raw = VALUES(raw), updated_at = CURRENT_TIMESTAMP(6)`,
      [providerId, codigo, normalizedStatus, JSON.stringify(data)]
    );

    return res.status(201).json({ success: true, codigo, status: normalizedStatus, remote: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Create secondary error', err);
    console.log('[TBK_SECONDARY] Error', {
      message: err?.message,
      config: err?.config,
      responseStatus: err?.response?.status,
      responseData: err?.response?.data,
      responseHeaders: err?.response?.headers
    });
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error creando comercio secundario', details: msg });
  }
});

// POST /providers/:id/tbk/secondary/manual
// Permite registrar manualmente un código de comercio secundario entregado por Transbank.
router.post('/providers/:id/tbk/secondary/manual', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const code = String(req.body?.code || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!code || code.length < 5) {
      return res.status(400).json({ success: false, error: 'Código de comercio secundario inválido' });
    }
    if (!email) {
      return res.status(400).json({ success: false, error: 'Correo requerido para validar' });
    }

    const pool = DatabaseConnection.getPool();
    const [[prov]]: any = await pool.query('SELECT id, email, tbk_secondary_code FROM users WHERE id = ? AND role = "provider" LIMIT 1', [providerId]);
    if (!prov) {
      return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    }

    const normalizedDbEmail = String(prov.email || '').trim().toLowerCase();
    if (normalizedDbEmail && normalizedDbEmail !== email) {
      return res.status(400).json({ success: false, error: 'El correo no coincide con el registrado en la cuenta' });
    }

    // Evitar sobre-escritura inadvertida si ya existe
    if (prov.tbk_secondary_code && prov.tbk_secondary_code === code) {
      return res.json({ success: true, tbk: { status: 'active', code } });
    }

    await pool.execute('UPDATE users SET tbk_secondary_code = ?, tbk_status = ? WHERE id = ?', [code, 'active', providerId]);
    await pool.execute(
      `INSERT INTO tbk_secondary_shops (provider_id, codigo_comercio_secundario, status, raw)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), raw = VALUES(raw), updated_at = CURRENT_TIMESTAMP(6)`,
      [providerId, code, 'active', JSON.stringify({ source: 'manual', savedAt: new Date().toISOString() })]
    );

    return res.status(201).json({ success: true, tbk: { status: 'active', code } });
  } catch (err: any) {
    Logger.error(MODULE, 'Manual secondary error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error guardando comercio secundario', details: msg });
  }
});

// POST /providers/:id/tbk/oneclick/inscriptions
// Inicia inscripción Oneclick Mall y devuelve token + url_webpay
router.post('/providers/:id/tbk/oneclick/inscriptions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const email = String(req.body?.email || user.email || '').trim();
    const responseUrl = String(req.body?.responseUrl || process.env.TBK_ONECLICK_RETURN_URL || '').trim();
    const base = getTbkBase();

    if (!email) {
      return res.status(400).json({ success: false, error: 'Correo requerido para iniciar la inscripción' });
    }
    if (!responseUrl) {
      return res.status(400).json({ success: false, error: 'Configura TBK_ONECLICK_RETURN_URL o envía responseUrl' });
    }

    const userName = `prov-${providerId}-${Date.now()}`;
    const url = `${base}/rswebpaytransaction/api/oneclick/v1.2/inscriptions`;

    const headers = getOneclickHeaders();
    Logger.info(MODULE, 'Iniciando inscripción Oneclick', { providerId, email, responseUrl, url });

    const { data } = await axios.post(url, { userName, email, responseUrl }, { headers });

    return res.status(201).json({
      success: true,
      token: data?.token || null,
      url_webpay: data?.url_webpay || null,
      userName
    });
  } catch (err: any) {
    Logger.error(MODULE, 'Oneclick start inscription error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error iniciando inscripción Oneclick', details: msg });
  }
});

// PUT /providers/:id/tbk/oneclick/inscriptions/:token
// Confirma inscripción (finish) con TBK_TOKEN
router.put('/providers/:id/tbk/oneclick/inscriptions/:token', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    const token = String(req.params.token || '').trim();
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    if (!token) {
      return res.status(400).json({ success: false, error: 'TBK_TOKEN requerido' });
    }
    const base = getTbkBase();
    const url = `${base}/rswebpaytransaction/api/oneclick/v1.2/inscriptions/${token}`;
    const headers = getOneclickHeaders();
    Logger.info(MODULE, 'Finalizando inscripción Oneclick', { providerId, token, url });
    const { data } = await axios.put(url, {}, { headers });
    return res.json({ success: true, inscription: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Oneclick finish inscription error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error finalizando inscripción Oneclick', details: msg });
  }
});

// DELETE /providers/:id/tbk/oneclick/inscriptions
// Elimina inscripción (requiere tbk_user y username)
router.delete('/providers/:id/tbk/oneclick/inscriptions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    const tbkUser = String(req.body?.tbk_user || '').trim();
    const username = String(req.body?.username || '').trim();
    if (!tbkUser || !username) {
      return res.status(400).json({ success: false, error: 'tbk_user y username son requeridos' });
    }
    const base = getTbkBase();
    const url = `${base}/rswebpaytransaction/api/oneclick/v1.2/inscriptions`;
    const headers = getOneclickHeaders();
    Logger.info(MODULE, 'Eliminando inscripción Oneclick', { providerId, tbkUser, username, url });
    const { status } = await axios.delete(url, { headers, data: { tbk_user: tbkUser, username } });
    return res.status(status === 204 ? 200 : status).json({ success: true });
  } catch (err: any) {
    Logger.error(MODULE, 'Oneclick delete inscription error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error eliminando inscripción Oneclick', details: msg });
  }
});

// POST /providers/:id/tbk/oneclick/transactions
// Autoriza pago Oneclick Mall
router.post('/providers/:id/tbk/oneclick/transactions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    const { username, tbk_user, buy_order, details } = req.body || {};
    if (!username || !tbk_user || !buy_order || !Array.isArray(details) || details.length === 0) {
      return res.status(400).json({ success: false, error: 'username, tbk_user, buy_order y details son requeridos' });
    }
    const base = getTbkBase();
    const url = `${base}/rswebpaytransaction/api/oneclick/v1.2/transactions`;
    const headers = getOneclickHeaders();
    Logger.info(MODULE, 'Autorizando transacción Oneclick', { providerId, buy_order, detailsCount: details.length, url });
    const { data } = await axios.post(url, { username, tbk_user, buy_order, details }, { headers });
    return res.json({ success: true, transaction: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Oneclick authorize error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error autorizando transacción Oneclick', details: msg });
  }
});

// GET /providers/:id/tbk/oneclick/transactions/:buyOrder
// Consulta estado de transacción Oneclick Mall
router.get('/providers/:id/tbk/oneclick/transactions/:buyOrder', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    const buyOrder = String(req.params.buyOrder || '').trim();
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    if (!buyOrder) {
      return res.status(400).json({ success: false, error: 'buyOrder requerido' });
    }
    const base = getTbkBase();
    const url = `${base}/rswebpaytransaction/api/oneclick/v1.2/transactions/${buyOrder}`;
    const headers = getOneclickHeaders();
    const { data } = await axios.get(url, { headers });
    return res.json({ success: true, transaction: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Oneclick status error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error consultando transacción Oneclick', details: msg });
  }
});

// POST /providers/:id/tbk/oneclick/transactions/:buyOrder/refunds
// Anula/reversa una transacción Oneclick Mall
router.post('/providers/:id/tbk/oneclick/transactions/:buyOrder/refunds', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    const buyOrder = String(req.params.buyOrder || '').trim();
    const { commerce_code, detail_buy_order, amount } = req.body || {};
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    if (!buyOrder || !commerce_code || !detail_buy_order || typeof amount === 'undefined') {
      return res.status(400).json({ success: false, error: 'buyOrder, commerce_code, detail_buy_order y amount son requeridos' });
    }
    const base = getTbkBase();
    const url = `${base}/rswebpaytransaction/api/oneclick/v1.2/transactions/${buyOrder}/refunds`;
    const headers = getOneclickHeaders();
    const { data } = await axios.post(url, { commerce_code, detail_buy_order, amount }, { headers });
    return res.json({ success: true, refund: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Oneclick refund error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error anulando/reversando transacción Oneclick', details: msg });
  }
});

// POST /providers/:id/tbk/oneclick/transactions/capture
// Captura diferida (si aplica)
router.post('/providers/:id/tbk/oneclick/transactions/capture', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    const { commerce_code, buy_order, authorization_code, capture_amount } = req.body || {};
    if (!commerce_code || !buy_order || !authorization_code || typeof capture_amount === 'undefined') {
      return res.status(400).json({ success: false, error: 'commerce_code, buy_order, authorization_code y capture_amount son requeridos' });
    }
    const base = getTbkBase();
    const url = `${base}/rswebpaytransaction/api/oneclick/v1.2/transactions/capture`;
    const headers = getOneclickHeaders();
    const { data } = await axios.post(url, { commerce_code, buy_order, authorization_code, capture_amount }, { headers });
    return res.json({ success: true, capture: data });
  } catch (err: any) {
    Logger.error(MODULE, 'Oneclick capture error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error capturando transacción Oneclick', details: msg });
  }
});

// GET /providers/:id/tbk/secondary/status
router.get('/providers/:id/tbk/secondary/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const pool = DatabaseConnection.getPool();
    const [[u]]: any = await pool.query('SELECT tbk_secondary_code, tbk_status FROM users WHERE id = ? LIMIT 1', [providerId]);
    if (!u) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });

    const base = getSecApiBase();
    if (!base || !u.tbk_secondary_code) {
      return res.json({ success: true, tbk: { status: (u?.tbk_status as TbkStatus) || 'none', code: u?.tbk_secondary_code || null } });
    }

    try {
      const { data } = await axios.get(`${base}/comercios-secundarios/${u.tbk_secondary_code}`, { headers: getSecHeaders() });
      const normalizedStatus = normalizeRemoteStatus(data);

      if (normalizedStatus !== u.tbk_status) {
        await pool.execute('UPDATE users SET tbk_status = ? WHERE id = ?', [normalizedStatus, providerId]);
      }

      await pool.execute(
        `INSERT INTO tbk_secondary_shops (provider_id, codigo_comercio_secundario, status, raw)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), raw = VALUES(raw), updated_at = CURRENT_TIMESTAMP(6)`,
        [providerId, u.tbk_secondary_code, normalizedStatus, JSON.stringify(data)]
      );

      return res.json({ success: true, tbk: { status: normalizedStatus, code: u.tbk_secondary_code, remote: data } });
    } catch (e: any) {
      Logger.warn(MODULE, 'No se pudo consultar estado remoto TBK', { providerId, error: e?.message });
      return res.json({ success: true, tbk: { status: u.tbk_status || 'pending', code: u.tbk_secondary_code, remote: null } });
    }
  } catch (err: any) {
    Logger.error(MODULE, 'Status secondary error', err);
    return res.status(500).json({ success: false, error: 'Error consultando estado TBK' });
  }
});

// GET /providers/:id/tbk/secondary/info
// Devuelve código de comercio secundario y correo del proveedor.
// - Providers: sólo su propio id.
// - Clients: si envían appointmentId y son dueños de esa cita con ese provider.
router.get('/providers/:id/tbk/secondary/info', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    const appointmentId = req.query.appointmentId ? Number(req.query.appointmentId) : null;
    Logger.info(MODULE, 'Secondary info requested', {
      requester: { id: user.id, role: user.role },
      providerId,
      appointmentId
    });
    if (!providerId) {
      return res.status(400).json({ success: false, error: 'providerId invalid' });
    }

    const pool = DatabaseConnection.getPool();

    // Regla de acceso
    if (user.role === 'provider') {
      if (user.id !== providerId) {
        return res.status(403).json({ success: false, error: 'forbidden' });
      }
    } else if (user.role === 'client') {
      if (!appointmentId) {
        return res.status(403).json({ success: false, error: 'forbidden' });
      }
      const [[appt]]: any = await pool.query(
        'SELECT id FROM appointments WHERE id = ? AND provider_id = ? AND client_id = ? LIMIT 1',
        [appointmentId, providerId, user.id]
      );
      if (!appt) {
        Logger.warn(MODULE, 'Secondary info forbidden for client; appointment mismatch', {
          requester: user.id,
          providerId,
          appointmentId
        });
        return res.status(403).json({ success: false, error: 'forbidden' });
      }
    } else {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const [[u]]: any = await pool.query('SELECT email, tbk_secondary_code, tbk_status FROM users WHERE id = ? LIMIT 1', [providerId]);
    if (!u) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    Logger.info(MODULE, 'Secondary info resolved', {
      providerId,
      code: u.tbk_secondary_code || null,
      status: u.tbk_status
    });
    return res.json({
      success: true,
      tbk: {
        code: u.tbk_secondary_code || null,
        status: (u.tbk_status as TbkStatus) || 'none',
        email: u.email || null
      }
    });
  } catch (err: any) {
    Logger.error(MODULE, 'Info secondary error', err);
    return res.status(500).json({ success: false, error: 'Error consultando info TBK secundario' });
  }
});

// DELETE /providers/:id/tbk/secondary/:code
router.delete('/providers/:id/tbk/secondary/:code', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    const code = String(req.params.code || '').trim();
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    if (!code) return res.status(400).json({ success: false, error: 'code requerido' });

    const base = getSecApiBase();
    if (!base) return res.status(500).json({ success: false, error: 'TBK_SEC_API_BASE no configurado' });

    const motivo = String(req.query?.reason || 'baja_solicitada');
    await axios.delete(`${base}/comercios-secundarios/${code}/${motivo}`, { headers: getSecHeaders() });

    const pool = DatabaseConnection.getPool();
    await pool.execute('UPDATE users SET tbk_status = ? WHERE id = ? AND tbk_secondary_code = ?', ['restricted', providerId, code]);
    await pool.execute(
      `UPDATE tbk_secondary_shops SET status = 'restricted', raw = ?, updated_at = CURRENT_TIMESTAMP(6)
       WHERE provider_id = ? AND codigo_comercio_secundario = ?` ,
      [JSON.stringify({ deletedAt: new Date().toISOString(), motivo }), providerId, code]
    );

    return res.json({ success: true });
  } catch (err: any) {
    Logger.error(MODULE, 'Delete secondary error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error dando de baja comercio secundario', details: msg });
  }
});

export default router;




