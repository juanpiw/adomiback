/**
 * Auth Service
 * Business logic for authentication
 */

import bcrypt from 'bcryptjs';
import { UsersRepository } from '../repositories/users.repository';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';
import { PasswordResetRepository } from '../repositories/password-reset.repository';
import { JWTUtil } from '../../../shared/utils/jwt.util';
import { Logger } from '../../../shared/utils/logger.util';
import { EmailService } from '../../../shared/services/email.service';
import DatabaseConnection from '../../../shared/database/connection';

const MODULE = 'AuthService';

export interface RegisterDTO {
  email: string;
  password: string;
  role?: 'client' | 'provider';
  name?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: number;
    email: string;
    name: string | null;
    role: 'client' | 'provider';
    is_verified?: boolean;
    verification_status?: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private usersRepo = new UsersRepository();
  private refreshTokensRepo = new RefreshTokensRepository();
  private passwordResetRepo = new PasswordResetRepository();
  private pool = DatabaseConnection.getPool();

  private async getProviderVerificationState(userId: number): Promise<{ is_verified: boolean; verification_status: string }> {
    try {
      const [[row]]: any = await this.pool.query(
        `SELECT is_verified, verification_status FROM provider_profiles WHERE provider_id = ? LIMIT 1`,
        [userId]
      );
      return {
        is_verified: !!row?.is_verified,
        verification_status: row?.verification_status || 'none'
      };
    } catch (error: any) {
      Logger.warn(MODULE, 'Error fetching provider verification state', { userId, error: error?.message });
      return { is_verified: false, verification_status: 'none' };
    }
  }

  /**
   * Register new user
   */
  async register(data: RegisterDTO): Promise<AuthResponse> {
    Logger.info(MODULE, 'Starting registration', { email: data.email, role: data.role });

    // Validaciones
    if (!data.email || !data.password) {
      throw new Error('Email y contraseña son requeridos');
    }

    if (data.password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres');
    }

    // Verificar si el email ya existe
    const existing = await this.usersRepo.findByEmail(data.email);
    if (existing) {
      throw new Error(`Ya tienes una cuenta como ${existing.role === 'client' ? 'Cliente' : 'Profesional'}. ¿Deseas iniciar sesión?`);
    }

    // Hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(data.password, salt);

    // Crear usuario
    const role = data.role === 'provider' ? 'provider' : 'client';
    const userId = await this.usersRepo.create(data.email, hash, role, data.name ?? null);
    Logger.info(MODULE, 'User created', { userId, email: data.email });

    // Generar tokens JWT
    const tokens = JWTUtil.generateTokenPair(userId, data.email, role);
    Logger.info(MODULE, 'Tokens generated (register)', { hasAccessToken: !!tokens.accessToken, hasRefreshToken: !!tokens.refreshToken });

    // Crear refresh token en la base de datos (usar jti del payload, no la firma JWT)
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 días
    const decodedRt = JWTUtil.verifyRefreshToken(tokens.refreshToken);
    const jti = decodedRt?.jti || tokens.refreshToken.split('.')[2];
    await this.refreshTokensRepo.create(userId, jti, refreshTokenExpiry);

    const verification = role === 'provider'
      ? await this.getProviderVerificationState(userId)
      : { is_verified: false, verification_status: 'none' };

    const response: AuthResponse = {
      user: {
        id: userId,
        email: data.email,
        name: data.name ?? null,
        role,
        is_verified: verification.is_verified,
        verification_status: verification.verification_status
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };

    Logger.info(MODULE, 'Registration response built', {
      userId: response.user.id,
      email: response.user.email,
      role: response.user.role,
      hasAccessToken: !!response.accessToken,
      hasRefreshToken: !!response.refreshToken
    });

    return response;
  }

  /**
   * Login user
   */
  async login(data: LoginDTO): Promise<AuthResponse> {
    Logger.info(MODULE, 'Login attempt', { email: data.email });

    if (!data.email || !data.password) {
      throw new Error('Email y contraseña son requeridos');
    }

    // Buscar usuario
    const user = await this.usersRepo.findByEmail(data.email);
    if (!user || !user.password) {
      throw new Error('Credenciales inválidas');
    }

    // Verificar contraseña
    const match = await bcrypt.compare(data.password, user.password);
    if (!match) {
      throw new Error('Credenciales inválidas');
    }

    // Generar tokens JWT
    const tokens = JWTUtil.generateTokenPair(user.id, user.email, user.role);
    Logger.info(MODULE, 'Tokens generated (login)', { hasAccessToken: !!tokens.accessToken, hasRefreshToken: !!tokens.refreshToken });

    const verification = user.role === 'provider'
      ? await this.getProviderVerificationState(user.id)
      : { is_verified: false, verification_status: 'none' };

    // Crear refresh token en la base de datos (usar jti del payload, no la firma JWT)
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);
    const decodedRt = JWTUtil.verifyRefreshToken(tokens.refreshToken);
    const jti = decodedRt?.jti || tokens.refreshToken.split('.')[2];
    await this.refreshTokensRepo.create(user.id, jti, refreshTokenExpiry);

    Logger.info(MODULE, 'Login successful', { userId: user.id });

    const response: AuthResponse = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_verified: verification.is_verified,
        verification_status: verification.verification_status
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };

    Logger.info(MODULE, 'Login response built', {
      userId: response.user.id,
      email: response.user.email,
      role: response.user.role,
      hasAccessToken: !!response.accessToken,
      hasRefreshToken: !!response.refreshToken
    });

    return response;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    // Verificar refresh token
    const payload = JWTUtil.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new Error('Refresh token inválido o expirado');
    }

    // Marca de versión para verificar despliegue y compatibilidad JTI
    Logger.info(MODULE, '[REFRESH_V2] Handler activo (payload-jti + legacy-fallback)', {
      jti: payload.jti
    });

    // Verificar en base de datos (primero por jti correcto; fallback por firma histórica)
    let tokenData = await this.refreshTokensRepo.findByJti(payload.jti);
    if (!tokenData) {
      const legacySig = (refreshToken || '').split('.')[2] || '';
      if (legacySig) {
        Logger.info(MODULE, '[REFRESH_V2] Intentando fallback por firma legada', {
          legacySigPrefix: legacySig.substring(0, 8)
        });
        tokenData = await this.refreshTokensRepo.findByJti(legacySig);
      }
    }
    // Modo compatibilidad: si no existe registro pero el token es válido criptográficamente,
    // permitimos el refresh (para transicionar a esquema basado en jti en BD).
    if (tokenData && tokenData.is_revoked) {
      throw new Error('Refresh token inválido o revocado');
    }

    // Obtener usuario
    const user = await this.usersRepo.findById(payload.userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Generar nuevos tokens
    const tokens = JWTUtil.generateTokenPair(user.id, user.email, user.role);

    const verification = user.role === 'provider'
      ? await this.getProviderVerificationState(user.id)
      : { is_verified: false, verification_status: 'none' };

    // Crear nuevo refresh token (usar jti del payload)
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);
    const decodedNew = JWTUtil.verifyRefreshToken(tokens.refreshToken);
    const jti = decodedNew?.jti || tokens.refreshToken.split('.')[2];
    await this.refreshTokensRepo.create(user.id, jti, refreshTokenExpiry);

    Logger.info(MODULE, '[REFRESH_V2] Nuevos tokens emitidos', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_verified: verification.is_verified,
        verification_status: verification.verification_status
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };
  }

  /**
   * Logout (revoke refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    const payload = JWTUtil.verifyRefreshToken(refreshToken);
    if (payload) {
      await this.refreshTokensRepo.revoke(payload.jti);
      Logger.info(MODULE, 'Logout successful', { userId: payload.userId });
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll(userId: number): Promise<number> {
    const count = await this.refreshTokensRepo.revokeAllForUser(userId);
    Logger.info(MODULE, 'Logout all devices', { userId, count });
    return count;
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<string> {
    const user = await this.usersRepo.findByEmail(email);
    if (!user) {
      // Por seguridad, no revelamos si el email existe
      return 'token-fake';
    }

    const token = await this.passwordResetRepo.create(user.id);
    Logger.info(MODULE, 'Password reset requested', { userId: user.id });
    try {
      const frontendUrl = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:4200';
      const appName = process.env.APP_NAME || 'Adomi';
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
      await EmailService.sendPasswordReset(user.email, { appName, resetUrl });
      Logger.info(MODULE, 'Password reset email queued/sent', { userId: user.id, email: user.email });
    } catch (e: any) {
      Logger.error(MODULE, 'Failed to send password reset email', e);
    }
    return token;
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres');
    }

    // Verificar token
    const resetToken = await this.passwordResetRepo.findByToken(token);
    if (!resetToken) {
      throw new Error('Token inválido o expirado');
    }

    // Hash nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Actualizar contraseña
    await this.usersRepo.updatePassword(resetToken.user_id, passwordHash);

    // Marcar token como usado
    await this.passwordResetRepo.markAsUsed(token);

    // Revocar todas las sesiones
    await this.refreshTokensRepo.revokeAllForUser(resetToken.user_id);

    Logger.info(MODULE, 'Password reset successful', { userId: resetToken.user_id });
  }

  /**
   * Check if email exists and return user information
   */
  async checkEmailExists(email: string) {
    Logger.info(MODULE, 'Checking email existence', { email });
    
    const user = await this.usersRepo.findByEmail(email);
    
    if (user) {
      Logger.info(MODULE, 'Email exists', { email, userId: user.id, role: user.role });
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      };
    }
    
    Logger.info(MODULE, 'Email does not exist', { email });
    return null;
  }
}

