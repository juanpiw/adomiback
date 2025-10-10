/**
 * Auth Controller
 * Handles HTTP requests for authentication
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { ResponseUtil } from '../../../shared/utils/response.util';
import { Logger } from '../../../shared/utils/logger.util';

const MODULE = 'AuthController';

export class AuthController {
  private authService = new AuthService();

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.register(req.body);
      Logger.info(MODULE, 'Registration successful', { userId: result.user.id });
      res.status(201).json(ResponseUtil.success(result));
    } catch (error: any) {
      Logger.error(MODULE, 'Registration failed', error);
      
      if (error.message.includes('ya está registrado')) {
        return res.status(409).json(ResponseUtil.error(error.message));
      }
      
      if (error.message.includes('requeridos') || error.message.includes('menos 6')) {
        return res.status(400).json(ResponseUtil.error(error.message));
      }
      
      res.status(500).json(ResponseUtil.error('Error interno del servidor'));
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.login(req.body);
      Logger.info(MODULE, 'Login successful', { userId: result.user.id });
      res.json(ResponseUtil.success(result));
    } catch (error: any) {
      Logger.error(MODULE, 'Login failed', error);
      
      if (error.message.includes('Credenciales inválidas')) {
        return res.status(401).json(ResponseUtil.error(error.message));
      }
      
      res.status(500).json(ResponseUtil.error('Error interno del servidor'));
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      const result = await this.authService.refreshToken(refreshToken);
      res.json(ResponseUtil.success(result));
    } catch (error: any) {
      Logger.error(MODULE, 'Refresh token failed', error);
      res.status(401).json(ResponseUtil.error(error.message));
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await this.authService.logout(refreshToken);
      }
      res.json(ResponseUtil.success(undefined, 'Sesión cerrada correctamente'));
    } catch (error: any) {
      Logger.error(MODULE, 'Logout failed', error);
      res.status(500).json(ResponseUtil.error('Error interno del servidor'));
    }
  };

  logoutAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json(ResponseUtil.error('Autenticación requerida'));
      }

      const count = await this.authService.logoutAll(user.id);
      res.json(ResponseUtil.success({ revokedCount: count }, 'Todas las sesiones cerradas'));
    } catch (error: any) {
      Logger.error(MODULE, 'Logout all failed', error);
      res.status(500).json(ResponseUtil.error('Error interno del servidor'));
    }
  };

  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json(ResponseUtil.error('Autenticación requerida'));
      }
      res.json(ResponseUtil.success({ user }));
    } catch (error: any) {
      Logger.error(MODULE, 'Get me failed', error);
      res.status(500).json(ResponseUtil.error('Error interno del servidor'));
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      await this.authService.requestPasswordReset(email);
      res.json(ResponseUtil.success(undefined, 'Si el email existe, recibirás un enlace de recuperación'));
    } catch (error: any) {
      Logger.error(MODULE, 'Forgot password failed', error);
      res.status(500).json(ResponseUtil.error('Error interno del servidor'));
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, password } = req.body;
      await this.authService.resetPassword(token, password);
      res.json(ResponseUtil.success(undefined, 'Contraseña restablecida correctamente'));
    } catch (error: any) {
      Logger.error(MODULE, 'Reset password failed', error);
      
      if (error.message.includes('inválido') || error.message.includes('expirado')) {
        return res.status(400).json(ResponseUtil.error(error.message));
      }
      
      res.status(500).json(ResponseUtil.error('Error interno del servidor'));
    }
  };
}

