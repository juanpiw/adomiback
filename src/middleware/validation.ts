import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

// Middleware de validación genérico
export function validate(schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[property];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false, // Mostrar todos los errores
      stripUnknown: true, // Eliminar campos no definidos en el esquema
      convert: true // Convertir tipos automáticamente
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      console.log(`[VALIDATION] Error en ${property}:`, errorDetails);

      return res.status(400).json({
        success: false,
        error: 'Datos de entrada inválidos',
        code: 'VALIDATION_ERROR',
        details: errorDetails
      });
    }

    // Reemplazar los datos con los validados y convertidos
    req[property] = value;
    next();
  };
}

// Middleware de validación para el body
export function validateBody(schema: Joi.ObjectSchema) {
  return validate(schema, 'body');
}

// Middleware de validación para query parameters
export function validateQuery(schema: Joi.ObjectSchema) {
  return validate(schema, 'query');
}

// Middleware de validación para parámetros de ruta
export function validateParams(schema: Joi.ObjectSchema) {
  return validate(schema, 'params');
}

// Middleware de validación de headers
export function validateHeaders(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.headers, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      console.log('[VALIDATION] Error en headers:', errorDetails);

      return res.status(400).json({
        success: false,
        error: 'Headers inválidos',
        code: 'HEADER_VALIDATION_ERROR',
        details: errorDetails
      });
    }

    req.headers = value;
    next();
  };
}

// Middleware de sanitización
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  // Sanitizar strings en el body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitizar strings en query
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  next();
}

// Función para sanitizar objetos recursivamente
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return obj
      .trim()
      .replace(/[<>]/g, '') // Remover caracteres HTML básicos
      .replace(/javascript:/gi, '') // Remover javascript: URLs
      .replace(/on\w+=/gi, ''); // Remover event handlers
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

// Middleware de validación de tamaño de payload
export function validatePayloadSize(maxSize: number = 10 * 1024 * 1024) { // 10MB por defecto
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    
    if (contentLength > maxSize) {
      console.log(`[VALIDATION] Payload demasiado grande: ${contentLength} bytes`);
      return res.status(413).json({
        success: false,
        error: 'Payload demasiado grande',
        code: 'PAYLOAD_TOO_LARGE',
        maxSize: maxSize
      });
    }

    next();
  };
}

// Middleware de validación de Content-Type
export function validateContentType(allowedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.get('content-type');
    
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
        console.log(`[VALIDATION] Content-Type no permitido: ${contentType}`);
        return res.status(415).json({
          success: false,
          error: 'Content-Type no soportado',
          code: 'UNSUPPORTED_MEDIA_TYPE',
          allowedTypes: allowedTypes
        });
      }
    }

    next();
  };
}

// Middleware de validación de rate limiting personalizado
export function validateRateLimit(req: Request, res: Response, next: NextFunction) {
  // Aquí se pueden agregar validaciones adicionales de rate limiting
  // Por ejemplo, verificar patrones sospechosos en los datos
  
  const suspiciousPatterns = [
    /script\s*:/i,
    /javascript\s*:/i,
    /on\w+\s*=/i,
    /<script/i,
    /<iframe/i,
    /<object/i,
    /<embed/i
  ];

  const bodyString = JSON.stringify(req.body || {});
  const queryString = JSON.stringify(req.query || {});
  const paramsString = JSON.stringify(req.params || {});

  const allData = bodyString + queryString + paramsString;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(allData)) {
      console.log(`[VALIDATION] Patrón sospechoso detectado: ${pattern}`);
      return res.status(400).json({
        success: false,
        error: 'Datos sospechosos detectados',
        code: 'SUSPICIOUS_DATA'
      });
    }
  }

  next();
}

console.log('[VALIDATION] Middleware de validación cargado');

