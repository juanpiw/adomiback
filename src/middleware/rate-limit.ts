import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Configuración de rate limiting personalizada
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

/**
 * Crear rate limiter personalizado
 */
export function createRateLimit(config: RateLimitConfig) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: {
      success: false,
      error: config.message || 'Demasiadas solicitudes, intenta de nuevo más tarde',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: config.skipSuccessfulRequests || false,
    skipFailedRequests: config.skipFailedRequests || false,
    keyGenerator: config.keyGenerator || ((req: Request) => req.ip || 'anonymous')
  });
}

/**
 * Rate limiter por usuario autenticado
 */
export function userRateLimit(maxRequests: number, windowMs: number = 15 * 60 * 1000) {
  return createRateLimit({
    windowMs,
    max: maxRequests,
    keyGenerator: (req: Request) => {
      // Usar user ID si está autenticado, sino usar IP
      return req.user?.id?.toString() || req.ip || 'anonymous';
    },
    message: 'Demasiadas solicitudes para tu cuenta, intenta de nuevo más tarde'
  });
}

/**
 * Rate limiter por IP
 */
export function ipRateLimit(maxRequests: number, windowMs: number = 15 * 60 * 1000) {
  return createRateLimit({
    windowMs,
    max: maxRequests,
    keyGenerator: (req: Request) => req.ip || 'anonymous',
    message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde'
  });
}

/**
 * Rate limiter para endpoints de autenticación
 */
export function authRateLimit() {
  return createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 intentos por IP
    message: 'Demasiados intentos de autenticación, intenta de nuevo en 15 minutos',
    skipSuccessfulRequests: true, // No contar requests exitosos
    skipFailedRequests: false // Contar requests fallidos
  });
}

/**
 * Rate limiter para endpoints de registro
 */
export function registerRateLimit() {
  return createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // máximo 3 registros por IP por hora
    message: 'Demasiados intentos de registro, intenta de nuevo en 1 hora'
  });
}

/**
 * Rate limiter para endpoints de recuperación de contraseña
 */
export function forgotPasswordRateLimit() {
  return createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // máximo 3 solicitudes por IP por hora
    message: 'Demasiadas solicitudes de recuperación de contraseña, intenta de nuevo en 1 hora'
  });
}

/**
 * Rate limiter para APIs sensibles
 */
export function sensitiveApiRateLimit() {
  return createRateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 20, // máximo 20 requests por IP por 5 minutos
    message: 'Demasiadas solicitudes a APIs sensibles, intenta de nuevo en 5 minutos'
  });
}

/**
 * Rate limiter para suscripciones y pagos
 */
export function subscriptionRateLimit() {
  return createRateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // máximo 10 requests por IP por minuto
    message: 'Demasiadas solicitudes de suscripción, intenta de nuevo en 1 minuto'
  });
}

/**
 * Rate limiter para webhooks
 */
export function webhookRateLimit() {
  return createRateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 100, // máximo 100 webhooks por IP por minuto
    message: 'Demasiados webhooks, intenta de nuevo en 1 minuto'
  });
}

/**
 * Middleware para logging de rate limiting
 */
export function rateLimitLogger(req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (res.statusCode === 429) {
      console.log(`[RATE_LIMIT_LOG] IP: ${req.ip}, User: ${req.user?.id || 'anonymous'}, Path: ${req.path}, Status: ${res.statusCode}`);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

console.log('[RATE_LIMIT] Middleware de rate limiting cargado');