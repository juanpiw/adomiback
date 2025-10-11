/**
 * Auth Routes
 * Defines HTTP routes for authentication
 */

import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { JWTUtil } from '../../../shared/utils/jwt.util';

export class AuthRoutes {
  private router = Router();
  private controller = new AuthController();

  constructor() {
    this.setupRoutes();
  }

  private setupRoutes() {
    const authenticateToken = (req: any, res: any, next: any) => {
      const token = JWTUtil.extractTokenFromHeader(req.headers?.authorization);
      if (!token) return res.status(401).json({ success: false, error: 'Autenticación requerida' });
      const payload = JWTUtil.verifyAccessToken(token);
      if (!payload) return res.status(401).json({ success: false, error: 'Token inválido' });
      req.user = { id: payload.userId, email: payload.email, role: payload.role };
      next();
    };
    // POST /auth/register - Registro de usuario
    this.router.post('/register', this.controller.register);

    // POST /auth/login - Inicio de sesión
    this.router.post('/login', this.controller.login);

    // POST /auth/refresh - Renovar access token
    this.router.post('/refresh', this.controller.refreshToken);

    // POST /auth/logout - Cerrar sesión
    this.router.post('/logout', this.controller.logout);

    // POST /auth/logout-all - Cerrar todas las sesiones
    this.router.post('/logout-all', authenticateToken, this.controller.logoutAll);

    // GET /auth/me - Obtener información del usuario actual
    this.router.get('/me', authenticateToken, this.controller.me);

    // POST /auth/forgot-password - Solicitar reset de contraseña
    this.router.post('/forgot-password', this.controller.forgotPassword);

    // POST /auth/reset-password - Restablecer contraseña
    this.router.post('/reset-password', this.controller.resetPassword);

    // POST /auth/change-password - Cambiar/crear contraseña (requiere login)
    this.router.post('/change-password', authenticateToken, this.controller.changePassword);
  }

  getRouter(): Router {
    return this.router;
  }
}

