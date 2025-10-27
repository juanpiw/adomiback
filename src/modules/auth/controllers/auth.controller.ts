/**
 * Auth Controller
 * Handles HTTP requests for authentication
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import DatabaseConnection from '../../../shared/database/connection';
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
      
      if (error.message.includes('Ya tienes una cuenta como') || error.message.includes('ya está registrado')) {
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
      // Enriquecer con foto de perfil desde la tabla correspondiente
      try {
        const pool = DatabaseConnection.getPool();
        // Adjuntar campos de Stripe Connect al usuario
        try {
          const [urows] = await pool.query(
            'SELECT stripe_account_id, stripe_payouts_enabled, stripe_onboarding_status FROM users WHERE id = ? LIMIT 1',
            [user.id]
          );
          const u = (urows as any[])[0] || {};
          (user as any).stripe_account_id = u?.stripe_account_id || null;
          (user as any).stripe_payouts_enabled = u?.stripe_payouts_enabled ?? null;
          (user as any).stripe_onboarding_status = u?.stripe_onboarding_status || null;
        } catch {}
        if (user.role === 'client') {
          const [rows] = await pool.query('SELECT profile_photo_url FROM client_profiles WHERE client_id = ? LIMIT 1', [user.id]);
          const avatar = (rows as any[])[0]?.profile_photo_url || null;
          (user as any).profile_photo_url = avatar;
        } else if (user.role === 'provider') {
          const [rows] = await pool.query('SELECT profile_photo_url FROM provider_profiles WHERE provider_id = ? LIMIT 1', [user.id]);
          const avatar = (rows as any[])[0]?.profile_photo_url || null;
          (user as any).profile_photo_url = avatar;
        }
      } catch {}
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

  /**
   * Change password for logged-in user
   * If user was created via Google (password null), this sets an initial password
   */
  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json(ResponseUtil.error('Autenticación requerida'));
      }

      const { currentPassword, newPassword } = (req.body || {}) as { currentPassword?: string; newPassword?: string };
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json(ResponseUtil.error('La contraseña debe tener al menos 6 caracteres'));
      }

      // Delegar en service usando el flujo de reset token interno
      try {
        // Generar un token de reset interno y reutilizar lógica de reset
        const token = await this.authService.requestPasswordReset(user.email);
        await this.authService.resetPassword(token, newPassword);
        return res.json(ResponseUtil.success(undefined, 'Contraseña actualizada correctamente'));
      } catch (e: any) {
        Logger.error(MODULE, 'Change password failed', e);
        return res.status(500).json(ResponseUtil.error('Error al actualizar contraseña'));
      }
    } catch (error: any) {
      Logger.error(MODULE, 'Change password failed (outer)', error);
      res.status(500).json(ResponseUtil.error('Error interno del servidor'));
    }
  };

  /**
   * Check if email exists and return user information
   */
  checkEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = req.query.email as string;
      
      if (!email) {
        return res.status(400).json(ResponseUtil.error('Email es requerido'));
      }

      const result = await this.authService.checkEmailExists(email);
      
      Logger.info(MODULE, 'Email check', { email, exists: !!result });
      
      return res.status(200).json(ResponseUtil.success({
        email,
        exists: !!result,
        available: !result,
        user: result ? {
          id: result.id,
          role: result.role,
          name: result.name,
          email: result.email
        } : null,
        message: result 
          ? `Ya tienes una cuenta como ${result.role === 'client' ? 'Cliente' : 'Profesional'}. ¿Quieres iniciar sesión?`
          : 'Email disponible'
      }));
      
    } catch (error: any) {
      Logger.error(MODULE, 'Email check failed', error);
      res.status(500).json(ResponseUtil.error('Error al verificar email'));
    }
  };
}

