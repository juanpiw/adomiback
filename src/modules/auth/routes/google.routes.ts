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
        console.log('🔵 [BACKEND] ==================== POST /auth/google ====================');
        console.log('🔵 [BACKEND] Timestamp:', new Date().toISOString());
        console.log('🔵 [BACKEND] Request body completo:', JSON.stringify(req.body));
        console.log('🔵 [BACKEND] Headers:', JSON.stringify(req.headers));
        
        const role: Role = (req.body?.role === 'provider' ? 'provider' : 'client');
        const mode: Mode = (req.body?.mode === 'register' ? 'register' : 'login');
        
        console.log('🔵 [BACKEND] Rol determinado:', role);
        console.log('🔵 [BACKEND] Modo determinado:', mode);

        const scopes = [
          'openid',
          'email',
          'profile'
        ];
        console.log('🔵 [BACKEND] Scopes solicitados:', scopes);

        const state = encodeURIComponent(JSON.stringify({ role, mode }));
        console.log('🔵 [BACKEND] Estado sin codificar:', { role, mode });
        console.log('🔵 [BACKEND] Estado codificado:', state);
        
        console.log('🔵 [BACKEND] Generando URL de autorización de Google...');
        const url = this.oauth.generateAuthUrl({
          access_type: 'offline',
          scope: scopes,
          prompt: 'consent',
          include_granted_scopes: true,
          state
        });
        
        console.log('🔵 [BACKEND] ✅ URL de autorización generada exitosamente');
        console.log('🔵 [BACKEND] URL completa:', url);

        return res.status(200).json({ success: true, authUrl: url });
      } catch (error: any) {
        console.error('🔴 [BACKEND] ❌ Error en POST /auth/google:', error);
        console.error('🔴 [BACKEND] Error message:', error.message);
        console.error('🔴 [BACKEND] Error stack:', error.stack);
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /auth/google/callback
    this.router.get('/google/callback', async (req: Request, res: Response) => {
      try {
        console.log('🟢 [BACKEND] ==================== GET /auth/google/callback ====================');
        console.log('🟢 [BACKEND] Timestamp:', new Date().toISOString());
        console.log('🟢 [BACKEND] URL completa:', req.url);
        console.log('🟢 [BACKEND] Query string completo:', JSON.stringify(req.query));
        
        const { code, state } = req.query as { code?: string; state?: string };
        
        console.log('🟢 [BACKEND] Code:', code ? `${code.substring(0, 20)}...` : 'NULL');
        console.log('🟢 [BACKEND] State:', state || 'NULL');
        
        if (!code) {
          console.error('🔴 [BACKEND] ❌ Code ausente en callback');
          return res.status(400).send('Missing code');
        }

        console.log('🟢 [BACKEND] Intercambiando código por token con Google...');
        const tokenResponse = await this.oauth.getToken(code);
        console.log('🟢 [BACKEND] ✅ Token response recibido');
        console.log('🟢 [BACKEND] Token response keys:', Object.keys(tokenResponse.tokens));
        
        const idToken = tokenResponse.tokens.id_token;
        console.log('🟢 [BACKEND] ID Token:', idToken ? `${idToken.substring(0, 20)}...` : 'NULL');
        
        if (!idToken) {
          console.error('🔴 [BACKEND] ❌ ID Token ausente en respuesta de Google');
          return res.status(400).send('Missing id_token');
        }

        console.log('🟢 [BACKEND] Verificando token de ID con Google...');
        const ticket = await this.oauth.verifyIdToken({ 
          idToken, 
          audience: getEnv('GOOGLE_CLIENT_ID') 
        });
        
        console.log('🟢 [BACKEND] ✅ Token verificado exitosamente');
        const payload = ticket.getPayload();
        
        console.log('🟢 [BACKEND] Payload de Google:', { 
          email: payload?.email, 
          name: payload?.name, 
          sub: payload?.sub,
          picture: payload?.picture ? 'presente' : 'ausente',
          email_verified: payload?.email_verified
        });
        
        if (!payload || !payload.email || !payload.sub) {
          console.error('🔴 [BACKEND] ❌ Payload inválido de Google');
          return res.status(400).send('Invalid Google payload');
        }

        console.log('🟢 [BACKEND] Parseando state...');
        const parsedState: { role: Role; mode: Mode } = state ? JSON.parse(decodeURIComponent(state)) : { role: 'client', mode: 'login' };
        console.log('🟢 [BACKEND] ✅ Estado parseado:', parsedState);

        // Buscar usuario por google_id o email
        console.log('🟢 [BACKEND] ==================== BÚSQUEDA DE USUARIO ====================');
        console.log('🟢 [BACKEND] Buscando usuario por google_id:', payload.sub);
        let user = await this.usersRepo.findByGoogleId(payload.sub);
        
        if (user) {
          console.log('🟢 [BACKEND] ✅ Usuario encontrado por google_id:', {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name
          });
        } else {
          console.log('🟢 [BACKEND] Usuario NO encontrado por google_id');
          console.log('🟢 [BACKEND] Buscando usuario por email:', payload.email);
          
          const byEmail = await this.usersRepo.findByEmail(payload.email);
          
          if (byEmail) {
            console.log('🟢 [BACKEND] ✅ Usuario encontrado por email:', {
              id: byEmail.id,
              email: byEmail.email,
              role: byEmail.role,
              name: byEmail.name,
              google_id: byEmail.google_id || 'NULL'
            });
            user = byEmail as any;
          } else {
            console.log('🟢 [BACKEND] Usuario NO encontrado por email');
          }
        }

        if (!user) {
          console.log('🟡 [BACKEND] ==================== USUARIO NO ENCONTRADO ====================');
          console.log('🟡 [BACKEND] Modo actual:', parsedState.mode);
          
          if (parsedState.mode === 'login') {
            console.log('🔴 [BACKEND] ❌ Modo LOGIN y usuario no existe - Rechazando');
            const loginUrl = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com') + '/auth/login?error=no_account';
            console.log('🔴 [BACKEND] Redirigiendo a:', loginUrl);
            return res.redirect(302, loginUrl);
          }
          
          console.log('🟡 [BACKEND] Modo REGISTER - Verificando si email ya existe...');
          // ✅ VALIDACIÓN CRÍTICA: Verificar si email existe (cualquier rol)
          const existingUser = await this.usersRepo.findByEmail(payload.email);
          
          if (existingUser) {
            console.log('🔴 [BACKEND] ❌ Email ya existe con rol:', existingUser.role);
            console.log('🔴 [BACKEND] Intentando crear con rol:', parsedState.role);
            const errorUrl = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com') + 
              `/auth/register?error=email_already_exists&existing_role=${existingUser.role}&attempted_role=${parsedState.role}&email=${encodeURIComponent(payload.email)}`;
            console.log('🔴 [BACKEND] Redirigiendo a:', errorUrl);
            return res.redirect(302, errorUrl);
          }
          
          // crear usuario en modo registro
          console.log('🟡 [BACKEND] ✅ Email disponible, creando usuario...');
          console.log('🟡 [BACKEND] Datos del nuevo usuario:', {
            google_id: payload.sub,
            email: payload.email,
            name: payload.name || payload.email.split('@')[0],
            role: parsedState.role
          });
          
          const newId = await this.usersRepo.createGoogleUser(
            payload.sub, 
            payload.email, 
            payload.name || payload.email.split('@')[0], 
            parsedState.role
          );
          
          console.log('🟡 [BACKEND] ✅ Usuario creado con ID:', newId);
          
          user = await this.usersRepo.findById(newId);
          console.log('🟡 [BACKEND] Usuario recuperado de BD:', {
            id: user?.id,
            email: user?.email,
            role: user?.role,
            name: user?.name
          });
          
        } else if (!user.google_id) {
          console.log('🟡 [BACKEND] ==================== VINCULANDO CUENTA EXISTENTE ====================');
          console.log('🟡 [BACKEND] Usuario existe pero sin google_id');
          console.log('🟡 [BACKEND] Usuario actual:', { id: user.id, email: user.email, role: user.role });
          console.log('🟡 [BACKEND] Vinculando con Google ID:', payload.sub);
          
          await this.usersRepo.linkGoogleAccount(user.id, payload.sub);
          console.log('🟡 [BACKEND] ✅ Cuenta vinculada');
          
          user = await this.usersRepo.findById(user.id);
          console.log('🟡 [BACKEND] Usuario actualizado:', {
            id: user?.id,
            email: user?.email,
            role: user?.role,
            google_id: user?.google_id
          });
          
        } else {
          console.log('🟢 [BACKEND] ==================== USUARIO EXISTENTE ====================');
          console.log('🟢 [BACKEND] Usuario ya tiene cuenta:', {
            id: user.id,
            email: user.email,
            role: user.role,
            google_id: user.google_id
          });
          
          // ✅ VALIDACIÓN: Si está en modo registro pero el usuario ya existe, bloquear
          if (parsedState.mode === 'register') {
            console.log('🔴 [BACKEND] ❌ Error: Usuario ya existe y está en modo REGISTER');
            console.log('🔴 [BACKEND] Rol existente:', user.role, '- Rol intentado:', parsedState.role);
            const errorUrl = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com') + 
              `/auth/register?error=email_already_exists&existing_role=${user.role}&attempted_role=${parsedState.role}&email=${encodeURIComponent(payload.email)}`;
            console.log('🔴 [BACKEND] Redirigiendo a:', errorUrl);
            return res.redirect(302, errorUrl);
          }
          
          console.log('🟢 [BACKEND] ✅ Modo LOGIN y usuario existe - Continuando...');
        }

        // Emitir tokens propios
        console.log('🟣 [BACKEND] ==================== GENERANDO TOKENS JWT ====================');
        console.log('🟣 [BACKEND] Usuario final:', {
          id: user!.id,
          email: user!.email,
          role: user!.role,
          name: user!.name
        });
        
        console.log('🟣 [BACKEND] Generando par de tokens JWT...');
        const tokens = JWTUtil.generateTokenPair(user!.id, user!.email, user!.role);
        console.log('🟣 [BACKEND] ✅ Tokens generados:', {
          accessToken: tokens.accessToken.substring(0, 20) + '...',
          refreshToken: tokens.refreshToken.substring(0, 20) + '...'
        });
        
        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 7);
        const jti = tokens.refreshToken.split('.')[2];
        
        console.log('🟣 [BACKEND] Guardando refresh token en BD...');
        console.log('🟣 [BACKEND] JTI:', jti);
        console.log('🟣 [BACKEND] Expira:', refreshExpiry.toISOString());
        
        await this.refreshTokensRepo.create(user!.id, jti, refreshExpiry);
        console.log('🟣 [BACKEND] ✅ Refresh token guardado en BD');

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
        console.log('🟣 [BACKEND] ==================== PREPARANDO REDIRECCIÓN AL FRONTEND ====================');
        const base = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com');
        console.log('🟣 [BACKEND] Frontend base URL:', base);
        
        const userData = { 
          id: user!.id, 
          email: user!.email, 
          name: user!.name, 
          role: user!.role 
        };
        console.log('🟣 [BACKEND] User data a enviar:', userData);
        
        const encodedToken = encodeURIComponent(tokens.accessToken);
        const encodedRefresh = encodeURIComponent(tokens.refreshToken);
        const encodedUser = encodeURIComponent(JSON.stringify(userData));
        
        console.log('🟣 [BACKEND] Datos codificados:', {
          token: encodedToken.substring(0, 20) + '...',
          refresh: encodedRefresh.substring(0, 20) + '...',
          user: encodedUser.substring(0, 50) + '...'
        });
        
        const successUrl = `${base}/auth/google/success?token=${encodedToken}&refresh=${encodedRefresh}&user=${encodedUser}`;
        console.log('🟣 [BACKEND] ✅ URL de success construida (truncada):', successUrl.substring(0, 150) + '...');
        console.log('🟣 [BACKEND] Ejecutando redirect 302...');
        
        return res.redirect(302, successUrl);
        
      } catch (error: any) {
        console.error('🔴 [BACKEND] ==================== ERROR CRÍTICO EN CALLBACK ====================');
        console.error('🔴 [BACKEND] Error:', error);
        console.error('🔴 [BACKEND] Error message:', error.message);
        console.error('🔴 [BACKEND] Error stack:', error.stack);
        
        const base = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com');
        const errorUrl = `${base}/auth/login?error=google_auth_failed`;
        console.error('🔴 [BACKEND] Redirigiendo a error URL:', errorUrl);
        
        return res.redirect(302, errorUrl);
      }
    });
  }
}


