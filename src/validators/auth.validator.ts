import Joi from 'joi';

// Esquemas de validación para autenticación
export const registerSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .pattern(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .required()
    .messages({
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder 100 caracteres',
      'string.pattern.base': 'El nombre solo puede contener letras y espacios',
      'any.required': 'El nombre es requerido'
    }),
  
  email: Joi.string()
    .email()
    .max(255)
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Debe ser un email válido',
      'string.max': 'El email no puede exceder 255 caracteres',
      'any.required': 'El email es requerido'
    }),
  
  password: Joi.string()
    .min(6)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'La contraseña debe tener al menos 6 caracteres',
      'string.max': 'La contraseña no puede exceder 128 caracteres',
      'string.pattern.base': 'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número',
      'any.required': 'La contraseña es requerida'
    }),
  
  role: Joi.string()
    .valid('client', 'provider')
    .required()
    .messages({
      'any.only': 'El rol debe ser "client" o "provider"',
      'any.required': 'El rol es requerido'
    })
});

export const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .max(255)
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Debe ser un email válido',
      'string.max': 'El email no puede exceder 255 caracteres',
      'any.required': 'El email es requerido'
    }),
  
  password: Joi.string()
    .min(1)
    .max(128)
    .required()
    .messages({
      'string.min': 'La contraseña es requerida',
      'string.max': 'La contraseña no puede exceder 128 caracteres',
      'any.required': 'La contraseña es requerida'
    })
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .min(1)
    .max(500)
    .required()
    .messages({
      'string.min': 'El refresh token es requerido',
      'string.max': 'El refresh token no puede exceder 500 caracteres',
      'any.required': 'El refresh token es requerido'
    })
});

export const logoutSchema = Joi.object({
  refreshToken: Joi.string()
    .min(1)
    .max(500)
    .optional()
    .messages({
      'string.min': 'El refresh token debe tener al menos 1 carácter',
      'string.max': 'El refresh token no puede exceder 500 caracteres'
    })
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .max(255)
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Debe ser un email válido',
      'string.max': 'El email no puede exceder 255 caracteres',
      'any.required': 'El email es requerido'
    })
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .min(1)
    .max(255)
    .required()
    .messages({
      'string.min': 'El token es requerido',
      'string.max': 'El token no puede exceder 255 caracteres',
      'any.required': 'El token es requerido'
    }),
  
  password: Joi.string()
    .min(6)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'La contraseña debe tener al menos 6 caracteres',
      'string.max': 'La contraseña no puede exceder 128 caracteres',
      'string.pattern.base': 'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número',
      'any.required': 'La contraseña es requerida'
    })
});

// Esquema para validar tokens JWT
export const jwtTokenSchema = Joi.string()
  .pattern(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/)
  .required()
  .messages({
    'string.pattern.base': 'Formato de token JWT inválido',
    'any.required': 'Token JWT requerido'
  });

// Esquema para validar IDs de usuario
export const userIdSchema = Joi.number()
  .integer()
  .positive()
  .required()
  .messages({
    'number.base': 'El ID de usuario debe ser un número',
    'number.integer': 'El ID de usuario debe ser un número entero',
    'number.positive': 'El ID de usuario debe ser positivo',
    'any.required': 'El ID de usuario es requerido'
  });

// Esquema para validar emails en parámetros
export const emailParamSchema = Joi.string()
  .email()
  .max(255)
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.email': 'Debe ser un email válido',
    'string.max': 'El email no puede exceder 255 caracteres',
    'any.required': 'El email es requerido'
  });

console.log('[VALIDATORS] Esquemas de validación de autenticación cargados');

