import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractTokenFromHeader } from '../lib/jwt';
import { getUserById } from '../queries/users';
import { verifyRefreshToken } from '../lib/refresh-tokens';
import { AuthUser, TokenValidationResult } from '../types/auth';

// Extender el tipo Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      token?: string;
    }
  }
}

/**
 * Middleware de autenticación JWT
 * Verifica el token de acceso y carga la información del usuario
 */
export async function authenticateToken(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Token de acceso requerido',
        code: 'MISSING_TOKEN'
      });
      return;
    }

    // Verificar token
    const payload = verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Token inválido o expirado',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    // Obtener información del usuario desde la base de datos
    const user = await getUserById(payload.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Crear objeto de usuario autenticado
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    // Agregar información del usuario y token a la request
    req.user = authUser;
    req.token = token;

    // Log de acceso exitoso
    console.log(`[AUTH] Usuario autenticado: ${authUser.email} (ID: ${authUser.id})`);

    next();
  } catch (error) {
    console.error('[AUTH][MIDDLEWARE][ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Error interno de autenticación',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Middleware de autenticación opcional
 * No falla si no hay token, pero carga la información del usuario si existe
 */
export async function optionalAuth(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      const payload = verifyAccessToken(token);
      if (payload) {
        const user = await getUserById(payload.userId);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          };
          req.token = token;
        }
      }
    }

    next();
  } catch (error) {
    console.error('[AUTH][OPTIONAL][ERROR]', error);
    // En autenticación opcional, continuamos aunque haya error
    next();
  }
}

/**
 * Middleware de autorización por rol
 */
export function requireRole(allowedRoles: ('client' | 'provider')[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Autenticación requerida',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Acceso denegado. Rol insuficiente',
        code: 'INSUFFICIENT_ROLE',
        required: allowedRoles,
        current: req.user.role
      });
      return;
    }

    next();
  };
}

/**
 * Middleware para verificar que el usuario es el propietario del recurso
 */
export function requireOwnership(paramName: string = 'userId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Autenticación requerida',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const resourceUserId = parseInt(req.params[paramName]);
    if (isNaN(resourceUserId) || req.user.id !== resourceUserId) {
      res.status(403).json({
        success: false,
        error: 'Acceso denegado. Solo puedes acceder a tus propios recursos',
        code: 'OWNERSHIP_REQUIRED'
      });
      return;
    }

    next();
  };
}

/**
 * Middleware para verificar refresh token
 */
export async function authenticateRefreshToken(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: 'Refresh token requerido',
        code: 'MISSING_REFRESH_TOKEN'
      });
      return;
    }

    // Verificar refresh token en la base de datos
    const tokenResult = await verifyRefreshToken(refreshToken);
    if (!tokenResult.success || !tokenResult.tokenData) {
      res.status(401).json({
        success: false,
        error: 'Refresh token inválido o expirado',
        code: 'INVALID_REFRESH_TOKEN'
      });
      return;
    }

    // Obtener información del usuario
    const user = await getUserById(tokenResult.tokenData.user_id);
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Crear objeto de usuario autenticado
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    req.user = authUser;
    req.token = refreshToken;

    next();
  } catch (error) {
    console.error('[AUTH][REFRESH][ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Error interno de autenticación',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Validar token y retornar resultado detallado
 */
export function validateToken(token: string): TokenValidationResult {
  try {
    const payload = verifyAccessToken(token);
    
    if (!payload) {
      return {
        valid: false,
        error: 'Token inválido o expirado',
        expired: true
      };
    }

    return {
      valid: true,
      user: {
        id: payload.userId,
        email: payload.email,
        name: null, // Se carga desde la DB si es necesario
        role: payload.role
      }
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Error validando token',
      malformed: true
    };
  }
}

/**
 * Middleware para logging de seguridad
 */
export function securityLogger(eventType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    
    // Interceptar la respuesta
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      // Log del evento de seguridad
      console.log(`[SECURITY] ${eventType}:`, {
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });

      return originalSend.call(this, data);
    };

    next();
  };
}

