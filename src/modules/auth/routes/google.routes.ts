import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { UsersRepository } from '../repositories/users.repository';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';
import { JWTUtil } from '../../../shared/utils/jwt.util';

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
        const role: Role = (req.body?.role === 'provider' ? 'provider' : 'client');
        const mode: Mode = (req.body?.mode === 'register' ? 'register' : 'login');

        const scopes = [
          'openid',
          'email',
          'profile'
        ];

        const state = encodeURIComponent(JSON.stringify({ role, mode }));
        const url = this.oauth.generateAuthUrl({
          access_type: 'offline',
          scope: scopes,
          prompt: 'consent',
          include_granted_scopes: true,
          state
        });

        return res.status(200).json({ success: true, authUrl: url });
      } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /auth/google/callback
    this.router.get('/google/callback', async (req: Request, res: Response) => {
      try {
        const { code, state } = req.query as { code?: string; state?: string };
        if (!code) return res.status(400).send('Missing code');

        const tokenResponse = await this.oauth.getToken(code);
        const idToken = tokenResponse.tokens.id_token;
        if (!idToken) return res.status(400).send('Missing id_token');

        const ticket = await this.oauth.verifyIdToken({ idToken, audience: getEnv('GOOGLE_CLIENT_ID') });
        const payload = ticket.getPayload();
        if (!payload || !payload.email || !payload.sub) return res.status(400).send('Invalid Google payload');

        const parsedState: { role: Role; mode: Mode } = state ? JSON.parse(decodeURIComponent(state)) : { role: 'client', mode: 'login' };

        // Buscar usuario por google_id o email
        let user = await this.usersRepo.findByGoogleId(payload.sub);
        if (!user) {
          const byEmail = await this.usersRepo.findByEmail(payload.email);
          if (byEmail) user = byEmail as any;
        }

        if (!user) {
          if (parsedState.mode === 'login') {
            const loginUrl = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com') + '/auth/login?error=no_account';
            return res.redirect(302, loginUrl);
          }
          // crear usuario en modo registro
          const newId = await this.usersRepo.createGoogleUser(payload.sub, payload.email, payload.name || payload.email.split('@')[0], parsedState.role);
          user = await this.usersRepo.findById(newId);
        } else if (!user.google_id) {
          // vincular si falta google_id
          await this.usersRepo.linkGoogleAccount(user.id, payload.sub);
          user = await this.usersRepo.findById(user.id);
        }

        // Emitir tokens propios
        const tokens = JWTUtil.generateTokenPair(user!.id, user!.email, user!.role);
        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 7);
        const jti = tokens.refreshToken.split('.')[2];
        await this.refreshTokensRepo.create(user!.id, jti, refreshExpiry);

        // Redirigir a front success con tokens
        const base = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com');
        const successUrl = `${base}/auth/google/success?token=${encodeURIComponent(tokens.accessToken)}&refresh=${encodeURIComponent(tokens.refreshToken)}&user=${encodeURIComponent(JSON.stringify({ id: user!.id, email: user!.email, name: user!.name, role: user!.role }))}`;
        return res.redirect(302, successUrl);
      } catch (error: any) {
        const base = getEnv('FRONTEND_BASE_URL', 'https://adomiapp.com');
        return res.redirect(302, `${base}/auth/login?error=google_auth_failed`);
      }
    });
  }
}


