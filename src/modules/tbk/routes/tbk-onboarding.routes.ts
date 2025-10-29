import { Router, Request, Response } from 'express';
import { authenticateToken, AuthUser } from '../../../shared/middleware/auth.middleware';
import DatabaseConnection from '../../../shared/database/connection';
import axios from 'axios';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'TBK_ONBOARDING_ROUTES';

const router = Router();

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

// POST /providers/:id/tbk/secondary/create
router.post('/providers/:id/tbk/secondary/create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const providerId = Number(req.params.id);
    if (!providerId || user.id !== providerId || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const pool = DatabaseConnection.getPool();

    // Datos mínimos (ejemplo): en producción, validar RUT/razón social/giro/banco del provider
    const [prow] = await pool.query('SELECT id, email, name FROM users WHERE id = ? LIMIT 1', [providerId]);
    const provider = (prow as any[])[0];
    if (!provider) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });

    const base = getSecApiBase();
    if (!base) return res.status(500).json({ success: false, error: 'TBK_SEC_API_BASE no configurado' });

    const payload = {
      email: provider.email,
      nombre: provider.name || 'Proveedor',
      // TODO: agregar campos reales requeridos por TBK (RUT, razonSocial, giro, banco)
    } as any;

    const { data } = await axios.post(`${base}/comercios-secundarios`, payload, { headers: getSecHeaders() });
    const codigo = String(data?.codigoComercioSecundario || '').trim();
    if (!codigo) return res.status(502).json({ success: false, error: 'Respuesta TBK inválida' });

    await pool.execute('UPDATE users SET tbk_secondary_code = ?, tbk_status = ? WHERE id = ?', [codigo, 'active', providerId]);
    await pool.execute(
      `INSERT INTO tbk_secondary_shops (provider_id, codigo_comercio_secundario, status, raw)
       VALUES (?, ?, 'active', ?)`,
      [providerId, codigo, JSON.stringify(data)]
    );

    return res.status(201).json({ success: true, codigo });
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
      return res.json({ success: true, tbk: { status: u?.tbk_status || 'none', code: u?.tbk_secondary_code || null } });
    }

    try {
      const { data } = await axios.get(`${base}/comercios-secundarios/${u.tbk_secondary_code}`, { headers: getSecHeaders() });
      return res.json({ success: true, tbk: { status: u.tbk_status, code: u.tbk_secondary_code, remote: data } });
    } catch (e: any) {
      return res.json({ success: true, tbk: { status: u.tbk_status, code: u.tbk_secondary_code, remote: null } });
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

    return res.json({ success: true });
  } catch (err: any) {
    Logger.error(MODULE, 'Delete secondary error', err);
    const msg = err?.response?.data || err?.message || 'error';
    return res.status(500).json({ success: false, error: 'Error dando de baja comercio secundario', details: msg });
  }
});

export default router;




