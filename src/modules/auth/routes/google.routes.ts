import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { UsersRepository } from '../repositories/users.repository';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';
import { JWTUtil } from '../../../shared/utils/jwt.util';
import axios from 'axios';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import DatabaseConnection from '../../../shared/database/connection';
import { v4 as uuidv4 } from 'uuid';

type Role = 'client' | 'provider';
type Mode = 'login' | 'register';

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export class GoogleAuthRoutes {
  private router = Router();
  private usersRepo = new UsersRepository();
  private refreshTokensRepo = new RefreshTokensRepository();
  private oauth: OAuth2Client;

  constructor() {
    const clientId = getEnv('GOOGLE_CLIENT_ID');
    const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');
    const redirectUri = getEnv('GOOGLE_REDIRECT_URI');
    this.oauth = new OAuth2Client({ clientId, clientSecret, redirectUri });
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private setupRoutes() {
    // POST /auth/google -> devuelve URL de autorización
    this.router.post('/google', async (req: Request, res: Response) => {
      try {
        console.log('[GOOGLE_AUTH] POST /auth/google - Body recibido:', req.body);
        const role: Role = (req.body?.role === 'provider' ? 'provider' : 'client');
        const mode: Mode = (req.body?.mode === 'register' ? 'register' : 'login');
        console.log('[GOOGLE_AUTH] Rol determinado:', role, 'Modo:', mode);

        const scopes = [
          'openid',
          'email',
          'profile'
        ];

        const state = encodeURIComponent(JSON.stringify({ role, mode }));
        console.log('[GOOGLE_AUTH] Estado codificado:', state);
        const url = this.oauth.generateAuthUrl({
          access_type: 'offline',
          scope: scopes,
          prompt: 'consent',
          include_granted_scopes: true,
          state
        });
        console.log('[GOOGLE_AUTH] URL de autorización generada:', url);

        return res.status(200).json({ success: true, authUrl: url });
      } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /auth/google/callback
    this.router.get('/google/callback', async (req: Request, res: Response) => {
      try {
        console.log('[GOOGLE_AUTH] Callback recibido');
        const { code, state } = req.query as { code?: string; state?: string };
        console.log('[GOOGLE_AUTH] Query params:', { code: code ? 'presente' : 'ausente', state });
        if (!code) return res.status(400).send('Missing code');

        console.log('[GOOGLE_AUTH] Intercambiando código por token...');
        const tokenResponse = await this.oauth.getToken(code);
        const idToken = tokenResponse.tokens.id_token;
        console.log('[GOOGLE_AUTH] Token recibido:', idToken ? 'presente' : 'ausente');
        if (!idToken) return res.status(400).send('Missing id_token');

        console.log('[GOOGLE_AUTH] Verificando token de ID...');
        const ticket = await this.oauth.verifyIdToken({ idToken, audience: getEnv('GOOGLE_CLIENT_ID') });
        const payload = ticket.getPayload();
        console.log('[GOOGLE_AUTH] Payload de Google:', { 
          email: payload?.email, 
          name: payload?.name, 
          sub: payload?.sub,
          picture: payload?.picture ? 'presente' : 'ausente'
        });
        if (!payload || !payload.email || !payload.sub) return res.status(400).send('Invalid Google payload');

        const parsedState: { role: Role; mode: Mode } = state ? JSON.parse(decodeURIComponent(state)) : { role: 'client', mode: 'login' };
        console.log('[GOOGLE_AUTH] Callback - Estado parseado:', parsedState);

        // Buscar usuario por google_id o email
        console.log('[GOOGLE_AUTH] Buscando usuario existente...');
        let user = await this.usersRepo.findByGoogleId(payload.sub);
        console.log('[GOOGLE_AUTH] Usuario encontrado por google_id:', user ? 'sí' : 'no');
        if (!user) {
          console.log('[GOOGLE_AUTH] Buscando usuario por email...');
          const byEmail = await this.usersRepo.findByEmail(payload.email);
          console.log('[GOOGLE_AUTH] Usuario encontrado por email:', byEmail ? 'sí' : 'no');
          if (byEmail) user = byEmail as any;
        }

        if (!user) {
          console.log('[GOOGLE_AUTH] Usuario no encontrado, modo:', parsedState.mode);
          if (parsedState.mode === 'login') {
            console.log('[GOOGLE_AUTH] Redirigiendo a login con error no_account');
            const loginUrl = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com') + '/auth/login?error=no_account';
            return res.redirect(302, loginUrl);
          }
          // crear usuario en modo registro
          console.log('[GOOGLE_AUTH] Creando usuario con rol:', parsedState.role, 'email:', payload.email);
          const newId = await this.usersRepo.createGoogleUser(payload.sub, payload.email, payload.name || payload.email.split('@')[0], parsedState.role);
          user = await this.usersRepo.findById(newId);
          console.log('[GOOGLE_AUTH] Usuario creado con ID:', newId, 'rol final:', user?.role);
        } else if (!user.google_id) {
          // vincular si falta google_id
          console.log('[GOOGLE_AUTH] Vinculando cuenta existente con Google ID');
          await this.usersRepo.linkGoogleAccount(user.id, payload.sub);
          user = await this.usersRepo.findById(user.id);
          console.log('[GOOGLE_AUTH] Cuenta vinculada, usuario actualizado:', user?.id, user?.role);
        } else {
          console.log('[GOOGLE_AUTH] Usuario existente encontrado:', user.id, user.role);
        }

        // Emitir tokens propios
        console.log('[GOOGLE_AUTH] Generando tokens para usuario:', user!.id, user!.email, user!.role);
        const tokens = JWTUtil.generateTokenPair(user!.id, user!.email, user!.role);
        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 7);
        const jti = tokens.refreshToken.split('.')[2];
        console.log('[GOOGLE_AUTH] Creando refresh token en BD...');
        await this.refreshTokensRepo.create(user!.id, jti, refreshExpiry);
        console.log('[GOOGLE_AUTH] Tokens generados exitosamente');

        // Intentar importar avatar de Google si está habilitado y no hay foto aún
        try {
          if ((process.env.GOOGLE_IMPORT_AVATAR || 'false').toLowerCase() === 'true' && payload?.picture) {
            const pictureUrl = String(payload.picture);
            const allowed = pictureUrl.startsWith('https://') && /googleusercontent\.com|gstatic\.com/.test(pictureUrl);
            if (allowed) {
              const pool = DatabaseConnection.getPool();
              if (user!.role === 'client') {
                const [rows] = await pool.query('SELECT profile_photo_url FROM client_profiles WHERE client_id = ?', [user!.id]);
                const existing = (rows as any[])[0]?.profile_photo_url;
                if (!existing) {
                  const resp = await axios.get(pictureUrl, { responseType: 'arraybuffer', timeout: 4000 });
                  const buffer = Buffer.from(resp.data);
                  const uploadDir = path.join(process.cwd(), 'uploads', 'profiles', 'clients');
                  const thumbDir = path.join(uploadDir, 'thumbnails');
                  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
                  const id = uuidv4();
                  const outPath = path.join(uploadDir, `compressed-${id}.webp`);
                  const thumbPath = path.join(thumbDir, `thumb-${id}.webp`);
                  await sharp(buffer).resize({ width: 800, height: 800, fit: 'inside' }).webp({ quality: 85 }).toFile(outPath);
                  await sharp(buffer).resize({ width: 200, height: 200, fit: 'cover' }).webp({ quality: 80 }).toFile(thumbPath);
                  const relPhoto = `/uploads/profiles/clients/${path.basename(outPath)}`;
                  await pool.query(
                    `INSERT INTO client_profiles (client_id, profile_photo_url)
                     VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE profile_photo_url = IF(profile_photo_url IS NULL OR profile_photo_url = '', VALUES(profile_photo_url), profile_photo_url), updated_at = CURRENT_TIMESTAMP`,
                    [user!.id, relPhoto]
                  );
                }
              }
              // Nota: para provider se puede replicar lógica en provider_profiles si se requiere
            }
          }
        } catch (e) {
          // No bloquear login si falla la importación de avatar
        }

        // Redirigir a front success con tokens
        const base = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com');
        const userData = { id: user!.id, email: user!.email, name: user!.name, role: user!.role };
        console.log('[GOOGLE_AUTH] Datos de usuario para redirect:', userData);
        const successUrl = `${base}/auth/google/success?token=${encodeURIComponent(tokens.accessToken)}&refresh=${encodeURIComponent(tokens.refreshToken)}&user=${encodeURIComponent(JSON.stringify(userData))}`;
        console.log('[GOOGLE_AUTH] Redirigiendo a:', successUrl);
        return res.redirect(302, successUrl);
      } catch (error: any) {
        const base = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com');
        return res.redirect(302, `${base}/auth/login?error=google_auth_failed`);
      }
    });
  }
}


