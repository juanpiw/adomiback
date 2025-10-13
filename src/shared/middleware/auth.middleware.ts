/**
 * Authentication Middleware
 * Shared middleware for JWT authentication
 */

import { Request, Response, NextFunction } from 'express';
import { JWTUtil } from '../utils/jwt.util';

export interface AuthUser {
  id: number;
  email: string;
  role: 'client' | 'provider';
}

/**
 * Middleware para autenticar token JWT
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const token = JWTUtil.extractTokenFromHeader(req.headers.authorization);
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized - No token provided' });
  }

  const payload = JWTUtil.verifyAccessToken(token);
  
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // Agregar usuario al request
  (req as any).user = {
    id: payload.userId,
    email: payload.email,
    role: payload.role
  } as AuthUser;

  next();
}

/**
 * Middleware para requerir rol específico
 */
export function requireRole(role: 'client' | 'provider') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthUser;
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (user.role !== role) {
      return res.status(403).json({ 
        success: false, 
        error: `Forbidden - ${role} role required` 
      });
    }

    next();
  };
}

