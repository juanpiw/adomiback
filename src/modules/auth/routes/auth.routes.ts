/**
 * Auth Routes
 * Defines HTTP routes for authentication
 */

import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

export class AuthRoutes {
  private router = Router();
  private controller = new AuthController();

  constructor() {
    this.setupRoutes();
  }

  private setupRoutes() {
    // POST /auth/register - Registro de usuario
    this.router.post('/register', this.controller.register);

    // POST /auth/login - Inicio de sesión
    this.router.post('/login', this.controller.login);

    // POST /auth/refresh - Renovar access token
    this.router.post('/refresh', this.controller.refreshToken);

    // POST /auth/logout - Cerrar sesión
    this.router.post('/logout', this.controller.logout);

    // POST /auth/logout-all - Cerrar todas las sesiones
    // TODO: Add authenticateToken middleware when migrated
    this.router.post('/logout-all', this.controller.logoutAll);

    // GET /auth/me - Obtener información del usuario actual
    // TODO: Add authenticateToken middleware when migrated
    this.router.get('/me', this.controller.me);

    // POST /auth/forgot-password - Solicitar reset de contraseña
    this.router.post('/forgot-password', this.controller.forgotPassword);

    // POST /auth/reset-password - Restablecer contraseña
    this.router.post('/reset-password', this.controller.resetPassword);
  }

  getRouter(): Router {
    return this.router;
  }
}

