/**
 * JWT Utility
 * Handles JWT token generation and verification
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Configuración JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Tipos para JWT
export interface JWTPayload {
  userId: number;
  email: string;
  role: 'client' | 'provider';
  jti: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  userId: number;
  jti: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class JWTUtil {
  /**
   * Generar par de tokens (access + refresh)
   */
  static generateTokenPair(userId: number, email: string, role: 'client' | 'provider'): TokenPair {
    const jti = uuidv4();
    
    const accessPayload = { userId, email, role, jti };
    const refreshPayload = { userId, jti };

    const accessToken = jwt.sign(accessPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'adomi-app',
      audience: 'adomi-users'
    });

    const refreshToken = jwt.sign(refreshPayload, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'adomi-app',
      audience: 'adomi-users'
    });

    const expiresIn = this.parseExpirationTime(JWT_EXPIRES_IN);

    return { accessToken, refreshToken, expiresIn };
  }

  /**
   * Verificar access token
   */
  static verifyAccessToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'adomi-app',
        audience: 'adomi-users'
      }) as JWTPayload;
      return decoded;
    } catch (error) {
      console.error('[JWT] Error verifying access token:', error);
      return null;
    }
  }

  /**
   * Verificar refresh token
   */
  static verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
        issuer: 'adomi-app',
        audience: 'adomi-users'
      }) as RefreshTokenPayload;
      return decoded;
    } catch (error) {
      console.error('[JWT] Error verifying refresh token:', error);
      return null;
    }
  }

  /**
   * Extraer token del header Authorization
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
    return parts[1];
  }

  /**
   * Parsear tiempo de expiración a segundos
   */
  private static parseExpirationTime(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 900;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return 900;
    }
  }
}

