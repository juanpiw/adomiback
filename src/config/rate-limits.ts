import rateLimit from 'express-rate-limit';

// Configuración general de rate limiting
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP por ventana
  message: {
    success: false,
    error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo en 15 minutos',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting estricto para autenticación
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos de login por IP por ventana
  message: {
    success: false,
    error: 'Demasiados intentos de login, intenta de nuevo en 15 minutos',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para registro
export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 registros por IP por hora
  message: {
    success: false,
    error: 'Demasiados intentos de registro, intenta de nuevo en 1 hora',
    code: 'REGISTER_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para recuperación de contraseña
export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 solicitudes de recuperación por IP por hora
  message: {
    success: false,
    error: 'Demasiadas solicitudes de recuperación de contraseña, intenta de nuevo en 1 hora',
    code: 'FORGOT_PASSWORD_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para suscripciones y pagos
export const subscriptionRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // máximo 10 requests por IP por minuto
  message: {
    success: false,
    error: 'Demasiadas solicitudes de suscripción, intenta de nuevo en 1 minuto',
    code: 'SUBSCRIPTION_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para APIs sensibles
export const sensitiveApiRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 20, // máximo 20 requests por IP por 5 minutos
  message: {
    success: false,
    error: 'Demasiadas solicitudes a APIs sensibles, intenta de nuevo en 5 minutos',
    code: 'SENSITIVE_API_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para webhooks
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // máximo 100 webhooks por IP por minuto
  message: {
    success: false,
    error: 'Demasiados webhooks, intenta de nuevo en 1 minuto',
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

console.log('[RATE_LIMIT] Configuraciones de rate limiting cargadas');