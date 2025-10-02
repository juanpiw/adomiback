import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createUser, getUserByEmail, getUserById, updateUserPassword } from '../queries/users';
import { createPasswordResetToken, getPasswordResetToken, markTokenAsUsed } from '../queries/password-reset';
import { sendWelcomeEmail, testEmailConnection, sendPasswordResetEmail, sendPasswordResetSuccessEmail } from '../lib/email';
import { generateTokenPair, verifyAccessToken, extractTokenFromHeader } from '../lib/jwt';
import { createRefreshToken, revokeRefreshToken, revokeAllUserTokens, verifyRefreshToken } from '../lib/refresh-tokens';
import { authenticateToken, authenticateRefreshToken, securityLogger } from '../middleware/auth';
import { authRateLimit, registerRateLimit, forgotPasswordRateLimit } from '../config/rate-limits';
import { validateBody, sanitizeInput, validatePayloadSize, validateContentType } from '../middleware/validation';
import { registerSchema, loginSchema, refreshTokenSchema, logoutSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/auth.validator';
import { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, RefreshTokenRequest, RefreshTokenResponse, LogoutRequest, LogoutResponse } from '../types/auth';

export function mountAuth(router: Router) {
  // Middleware de logging de seguridad para endpoints de auth
  const authLogger = securityLogger('AUTH_EVENT');

  // POST /auth/register - Registro de usuario
  router.post('/auth/register', 
    validateContentType(),
    validatePayloadSize(),
    sanitizeInput,
    validateBody(registerSchema),
    registerRateLimit, 
    authLogger, 
    async (req, res) => {
    try {
      const { email, password, role, name }: RegisterRequest = req.body || {};
      console.log('[AUTH][REGISTER] payload:', { email, role, name });
      
      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email y contraseña son requeridos' 
        });
      }

      if (password.length < 6) {
        return res.status(400).json({ 
          success: false, 
          error: 'La contraseña debe tener al menos 6 caracteres' 
        });
      }

      // Verificar si el email ya existe
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ 
          success: false, 
          error: 'El email ya está registrado' 
        });
      }

      // Hash de la contraseña
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      
      // Crear usuario
      const userId = await createUser(email, hash, role === 'provider' ? 'provider' : 'client', name ?? null);
      console.log('[AUTH][REGISTER] created userId:', userId);
      
      // Generar tokens JWT
      const tokens = generateTokenPair(userId, email, role === 'provider' ? 'provider' : 'client');
      
      // Crear refresh token en la base de datos
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 días
      
      await createRefreshToken(userId, tokens.refreshToken.split('.')[2], refreshTokenExpiry);
      
      // Enviar email de bienvenida (no bloquea la respuesta)
      const safeName = (name && name.trim().length > 0) ? name : (email.split('@')[0] || 'Usuario');
      sendWelcomeEmail(email, safeName, role ?? 'client').then(result => {
        if (result.success) {
          console.log('[AUTH][REGISTER] Welcome email sent successfully');
        } else {
          console.error('[AUTH][REGISTER] Failed to send welcome email:', result.error);
        }
      }).catch(err => {
        console.error('[AUTH][REGISTER] Error sending welcome email:', err);
      });
      
      const response: RegisterResponse = {
        success: true,
        user: { 
          id: userId, 
          email, 
          name: name ?? null,
          role: role ?? 'client' 
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn
      };

      return res.status(201).json(response);
    } catch (e: any) {
      const code = e?.code || e?.errno;
      const msg = e?.sqlMessage || e?.message || 'server error';
      console.error('[AUTH][REGISTER][ERROR]', { code, msg, stack: e?.stack });
      
      if (code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ 
          success: false, 
          error: 'El email ya está registrado' 
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });

  // POST /auth/login - Inicio de sesión
  router.post('/auth/login', 
    validateContentType(),
    validatePayloadSize(),
    sanitizeInput,
    validateBody(loginSchema),
    authRateLimit, 
    authLogger, 
    async (req, res) => {
    try {
      const { email, password }: LoginRequest = req.body || {};
      console.log('[AUTH][LOGIN] payload:', { email });
      
      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email y contraseña son requeridos' 
        });
      }

      // Buscar usuario
      const user = await getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ 
          success: false, 
          error: 'Credenciales inválidas' 
        });
      }

      // Verificar contraseña
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ 
          success: false, 
          error: 'Credenciales inválidas' 
        });
      }

      // Generar tokens JWT
      const tokens = generateTokenPair(user.id, user.email, user.role);
      
      // Crear refresh token en la base de datos
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 días
      
      await createRefreshToken(user.id, tokens.refreshToken.split('.')[2], refreshTokenExpiry);

      console.log('[AUTH][LOGIN] success:', { id: user.id, role: user.role });
      
      const response: LoginResponse = {
        success: true,
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name,
          role: user.role 
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn
      };

      return res.json(response);
    } catch (e: any) {
      console.error('[AUTH][LOGIN][ERROR]', { error: e?.message, stack: e?.stack });
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });

  // POST /auth/refresh - Renovar access token
  router.post('/auth/refresh', 
    validateContentType(),
    validatePayloadSize(),
    sanitizeInput,
    validateBody(refreshTokenSchema),
    authLogger, 
    async (req, res) => {
    try {
      const { refreshToken }: RefreshTokenRequest = req.body || {};
      
      if (!refreshToken) {
        return res.status(400).json({ 
          success: false, 
          error: 'Refresh token requerido' 
        });
      }

      // Verificar refresh token
      const tokenResult = await verifyRefreshToken(refreshToken);
      if (!tokenResult.success || !tokenResult.tokenData) {
        return res.status(401).json({ 
          success: false, 
          error: 'Refresh token inválido o expirado' 
        });
      }

      // Obtener información del usuario
      const user = await getUserById(tokenResult.tokenData.user_id);
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Usuario no encontrado' 
        });
      }

      // Generar nuevos tokens
      const tokens = generateTokenPair(user.id, user.email, user.role);
      
      // Crear nuevo refresh token en la base de datos
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 días
      
      await createRefreshToken(user.id, tokens.refreshToken.split('.')[2], refreshTokenExpiry);

      const response: RefreshTokenResponse = {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn
      };

      return res.json(response);
    } catch (e: any) {
      console.error('[AUTH][REFRESH][ERROR]', { error: e?.message, stack: e?.stack });
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });

  // POST /auth/logout - Cerrar sesión
  router.post('/auth/logout', 
    validateContentType(),
    validatePayloadSize(),
    sanitizeInput,
    validateBody(logoutSchema),
    authLogger, 
    async (req, res) => {
    try {
      const { refreshToken }: LogoutRequest = req.body || {};
      
      if (refreshToken) {
        // Revocar refresh token específico
        await revokeRefreshToken(refreshToken);
      }

      const response: LogoutResponse = {
        success: true,
        message: 'Sesión cerrada correctamente'
      };

      return res.json(response);
    } catch (e: any) {
      console.error('[AUTH][LOGOUT][ERROR]', { error: e?.message, stack: e?.stack });
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });

  // POST /auth/logout-all - Cerrar todas las sesiones
  router.post('/auth/logout-all', authLogger, authenticateToken, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Autenticación requerida' 
        });
      }

      // Revocar todos los refresh tokens del usuario
      const result = await revokeAllUserTokens(req.user.id);
      
      const response: LogoutResponse = {
        success: true,
        message: `Todas las sesiones cerradas correctamente (${result.revokedCount || 0} tokens revocados)`
      };

      return res.json(response);
    } catch (e: any) {
      console.error('[AUTH][LOGOUT-ALL][ERROR]', { error: e?.message, stack: e?.stack });
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });

  // GET /auth/me - Obtener información del usuario actual
  router.get('/auth/me', authLogger, authenticateToken, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Autenticación requerida' 
        });
      }

      return res.json({
        success: true,
        user: req.user
      });
    } catch (e: any) {
      console.error('[AUTH][ME][ERROR]', { error: e?.message, stack: e?.stack });
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });

  // Endpoint para probar el envío de emails
  router.post('/auth/test-email', authLogger, async (req, res) => {
    try {
      const { email, name, role } = req.body || {};
      
      if (!email) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email es requerido' 
        });
      }
      
      // Probar conexión SMTP
      const connectionOk = await testEmailConnection();
      if (!connectionOk) {
        return res.status(500).json({ 
          success: false, 
          error: 'Conexión SMTP falló' 
        });
      }
      
      // Enviar email de prueba
      const result = await sendWelcomeEmail(email, name || 'Usuario de Prueba', role || 'client');
      
      if (result.success) {
        return res.json({ 
          success: true, 
          message: 'Email de prueba enviado correctamente', 
          messageId: result.messageId 
        });
      } else {
        return res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (e: any) {
      console.error('[AUTH][TEST-EMAIL][ERROR]', e);
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });

  // Endpoint para solicitar recuperación de contraseña
  router.post('/auth/forgot-password', 
    validateContentType(),
    validatePayloadSize(),
    sanitizeInput,
    validateBody(forgotPasswordSchema),
    forgotPasswordRateLimit, 
    authLogger, 
    async (req, res) => {
    try {
      const { email } = req.body || {};

      if (!email) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email es requerido' 
        });
      }

      // Buscar usuario por email
      const user = await getUserByEmail(email);
      if (!user) {
        // Por seguridad, devolvemos éxito aunque el email no exista
        return res.json({ 
          success: true, 
          message: 'Si el email existe, recibirás un enlace de recuperación' 
        });
      }

      // Crear token de recuperación
      const token = await createPasswordResetToken(user.id);
      
      // Crear enlace de recuperación
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/auth/reset-password?token=${token}`;
      
      // Enviar email de recuperación
      const emailResult = await sendPasswordResetEmail(
        user.email, 
        user.name || user.email.split('@')[0], 
        resetLink
      );

      if (emailResult.success) {
        console.log('[AUTH][FORGOT-PASSWORD] Reset email sent successfully to:', user.email);
        return res.json({ 
          success: true, 
          message: 'Si el email existe, recibirás un enlace de recuperación' 
        });
      } else {
        console.error('[AUTH][FORGOT-PASSWORD] Failed to send reset email:', emailResult.error);
        return res.status(500).json({ 
          success: false, 
          error: 'Error enviando email de recuperación' 
        });
      }
    } catch (e: any) {
      console.error('[AUTH][FORGOT-PASSWORD][ERROR]', e);
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });

  // Endpoint para restablecer contraseña con token
  router.post('/auth/reset-password', 
    validateContentType(),
    validatePayloadSize(),
    sanitizeInput,
    validateBody(resetPasswordSchema),
    authLogger, 
    async (req, res) => {
    try {
      const { token, password } = req.body || {};

      if (!token || !password) {
        return res.status(400).json({ 
          success: false, 
          error: 'Token y contraseña son requeridos' 
        });
      }

      if (password.length < 6) {
        return res.status(400).json({ 
          success: false, 
          error: 'La contraseña debe tener al menos 6 caracteres' 
        });
      }

      // Verificar token
      const resetToken = await getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ 
          success: false, 
          error: 'Token inválido o expirado' 
        });
      }

      // Obtener usuario
      const user = await getUserById(resetToken.user_id);
      if (!user) {
        return res.status(400).json({ 
          success: false, 
          error: 'Usuario no encontrado' 
        });
      }

      // Hash de la nueva contraseña
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Actualizar contraseña
      await updateUserPassword(user.id, passwordHash);

      // Marcar token como usado
      await markTokenAsUsed(token);

      // Revocar todos los refresh tokens del usuario (forzar logout)
      await revokeAllUserTokens(user.id);

      // Enviar email de confirmación
      sendPasswordResetSuccessEmail(
        user.email, 
        user.name || user.email.split('@')[0]
      ).then(result => {
        if (result.success) {
          console.log('[AUTH][RESET-PASSWORD] Success email sent to:', user.email);
        } else {
          console.error('[AUTH][RESET-PASSWORD] Failed to send success email:', result.error);
        }
      }).catch(err => {
        console.error('[AUTH][RESET-PASSWORD] Error sending success email:', err);
      });

      console.log('[AUTH][RESET-PASSWORD] Password reset successfully for user:', user.email);
      return res.json({ 
        success: true, 
        message: 'Contraseña restablecida correctamente' 
      });
    } catch (e: any) {
      console.error('[AUTH][RESET-PASSWORD][ERROR]', e);
      return res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  });
}