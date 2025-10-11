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
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private usersRepo = new UsersRepository();
  private refreshTokensRepo = new RefreshTokensRepository();
  private passwordResetRepo = new PasswordResetRepository();

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
      throw new Error('El email ya está registrado');
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

    // Crear refresh token en la base de datos
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 días
    const jti = tokens.refreshToken.split('.')[2];
    await this.refreshTokensRepo.create(userId, jti, refreshTokenExpiry);

    return {
      user: {
        id: userId,
        email: data.email,
        name: data.name ?? null,
        role
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };
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

    // Crear refresh token en la base de datos
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);
    const jti = tokens.refreshToken.split('.')[2];
    await this.refreshTokensRepo.create(user.id, jti, refreshTokenExpiry);

    Logger.info(MODULE, 'Login successful', { userId: user.id });

    return {
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

    // Verificar en base de datos
    const tokenData = await this.refreshTokensRepo.findByJti(payload.jti);
    if (!tokenData || tokenData.is_revoked) {
      throw new Error('Refresh token inválido o revocado');
    }

    // Obtener usuario
    const user = await this.usersRepo.findById(payload.userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Generar nuevos tokens
    const tokens = JWTUtil.generateTokenPair(user.id, user.email, user.role);

    // Crear nuevo refresh token
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);
    const jti = tokens.refreshToken.split('.')[2];
    await this.refreshTokensRepo.create(user.id, jti, refreshTokenExpiry);

    return {
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

