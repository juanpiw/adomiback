import { Router, Request, Response } from 'express';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import axios from 'axios';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'TBK_ONBOARDING_ROUTES';

const router = Router();

type TbkStatus = 'none' | 'pending' | 'active' | 'restricted';

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

function getSecApiBase(): string {
  return process.env.TBK_SEC_API_BASE || '';
}

function getSecHeaders() {
  return {
    'Tbk-Api-Key-Id': requireEnv('TBK_SEC_API_KEY_ID'),
    'Tbk-Api-Key-Secret': requireEnv('TBK_SEC_API_KEY_SECRET'),
    'Content-Type': 'application/json'
  } as Record<string, string>;
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
    if (!provider) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });

    if (provider.tbk_secondary_code) {
      return res.status(409).json({ success: false, error: 'Proveedor ya cuenta con comercio secundario registrado', code: provider.tbk_secondary_code });
    }

    const [profileRows] = await pool.query('SELECT * FROM provider_profiles WHERE provider_id = ? LIMIT 1', [providerId]);
    const profile = (profileRows as any[])[0] || null;

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
    if (!base) return res.status(500).json({ success: false, error: 'TBK_SEC_API_BASE no configurado' });

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

    Logger.info(MODULE, 'Creando comercio secundario TBK', { providerId, payload: maskedPayload });

    const { data } = await axios.post(`${base}/comercios-secundarios`, payload, { headers: getSecHeaders() });
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
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error creando comercio secundario', details: msg });
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




