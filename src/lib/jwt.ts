import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Configuración JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // 15 minutos
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'; // 7 días

// Tipos para JWT
export interface JWTPayload {
  userId: number;
  email: string;
  role: 'client' | 'provider';
  jti: string; // JWT ID único
  iat: number; // Issued at
  exp: number; // Expires at
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

/**
 * Generar par de tokens (access + refresh)
 */
export function generateTokenPair(userId: number, email: string, role: 'client' | 'provider'): TokenPair {
  const jti = uuidv4();
  
  // Payload para access token
  const accessPayload = {
    userId,
    email,
    role,
    jti
  };

  // Payload para refresh token
  const refreshPayload = {
    userId,
    jti
  };

  // Generar tokens
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

  // Calcular tiempo de expiración en segundos
  const expiresIn = parseExpirationTime(JWT_EXPIRES_IN);

  return {
    accessToken,
    refreshToken,
    expiresIn
  };
}

/**
 * Verificar access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
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
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
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
 * Renovar access token usando refresh token
 */
export function refreshAccessToken(refreshToken: string, userEmail: string, userRole: 'client' | 'provider'): TokenPair | null {
  const refreshPayload = verifyRefreshToken(refreshToken);
  if (!refreshPayload) {
    return null;
  }

  // Generar nuevo par de tokens
  return generateTokenPair(refreshPayload.userId, userEmail, userRole);
}

/**
 * Extraer token del header Authorization
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Decodificar token sin verificar (para debugging)
 */
export function decodeToken(token: string): any {
  try {
    return jwt.decode(token);
  } catch (error) {
    console.error('[JWT] Error decoding token:', error);
    return null;
  }
}

/**
 * Verificar si un token está próximo a expirar (en los próximos 5 minutos)
 */
export function isTokenNearExpiry(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    const fiveMinutes = 5 * 60;

    return timeUntilExpiry <= fiveMinutes;
  } catch (error) {
    return false;
  }
}

/**
 * Parsear tiempo de expiración a segundos
 */
function parseExpirationTime(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 900; // 15 minutos por defecto
  }

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

/**
 * Configuración de JWT para exportar
 */
export const jwtConfig = {
  secret: JWT_SECRET,
  refreshSecret: JWT_REFRESH_SECRET,
  expiresIn: JWT_EXPIRES_IN,
  refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
  issuer: 'adomi-app',
  audience: 'adomi-users'
};

console.log('[JWT] Configuración cargada:', {
  expiresIn: JWT_EXPIRES_IN,
  refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
  issuer: 'adomi-app',
  audience: 'adomi-users'
});