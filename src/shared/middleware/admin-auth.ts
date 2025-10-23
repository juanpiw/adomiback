import { Request, Response, NextFunction } from 'express';
import { JWTUtil } from '../utils/jwt.util';
import { Logger } from '../utils/logger.util';

const MODULE = 'ADMIN_AUTH';

function parseAllowlist(): Set<string> {
  const list = (process.env.ADMIN_ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return new Set(list);
}

export function adminAuth(req: Request & { user?: any }, res: Response, next: NextFunction) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const allowIps = (process.env.ADMIN_ALLOW_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowIps.length && !allowIps.includes(ip)) {
      Logger.warn(MODULE, 'IP not allowed', { ip });
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const token = JWTUtil.extractTokenFromHeader(req.headers.authorization);
    if (!token) return res.status(401).json({ success: false, error: 'auth_required' });
    const payload = JWTUtil.verifyAccessToken(token);
    if (!payload) return res.status(401).json({ success: false, error: 'token_invalid' });

    const adminSecret = req.headers['x-admin-secret'] as string | undefined;
    if (!adminSecret || adminSecret !== process.env.ADMIN_PANEL_SECRET) {
      Logger.warn(MODULE, 'Missing/invalid admin secret');
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const allowlist = parseAllowlist();
    if (!allowlist.has(payload.email.toLowerCase())) {
      Logger.warn(MODULE, 'Email not in admin allowlist', { email: payload.email });
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    req.user = { id: payload.userId, email: payload.email, role: payload.role };
    next();
  } catch (e) {
    Logger.error(MODULE, 'Admin auth error', e as any);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
}


