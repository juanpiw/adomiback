import Joi from 'joi';

// Esquemas de validación para suscripciones
export const createCheckoutSchema = Joi.object({
  planId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.base': 'El ID del plan debe ser un número',
      'number.integer': 'El ID del plan debe ser un número entero',
      'number.positive': 'El ID del plan debe ser positivo',
      'any.required': 'El ID del plan es requerido'
    }),
  
  userEmail: Joi.string()
    .email()
    .max(255)
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email': 'Debe ser un email válido',
      'string.max': 'El email no puede exceder 255 caracteres',
      'any.required': 'El email del usuario es requerido'
    }),
  
  userName: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .pattern(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .required()
    .messages({
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder 100 caracteres',
      'string.pattern.base': 'El nombre solo puede contener letras y espacios',
      'any.required': 'El nombre del usuario es requerido'
    })
});

export const subscriptionIdSchema = Joi.number()
  .integer()
  .positive()
  .required()
  .messages({
    'number.base': 'El ID de suscripción debe ser un número',
    'number.integer': 'El ID de suscripción debe ser un número entero',
    'number.positive': 'El ID de suscripción debe ser positivo',
    'any.required': 'El ID de suscripción es requerido'
  });

export const updateSubscriptionSchema = Joi.object({
  status: Joi.string()
    .valid('active', 'inactive', 'cancelled', 'past_due', 'unpaid')
    .required()
    .messages({
      'any.only': 'El estado debe ser uno de: active, inactive, cancelled, past_due, unpaid',
      'any.required': 'El estado es requerido'
    }),
  
  stripeSubscriptionId: Joi.string()
    .min(1)
    .max(255)
    .optional()
    .messages({
      'string.min': 'El ID de suscripción de Stripe debe tener al menos 1 carácter',
      'string.max': 'El ID de suscripción de Stripe no puede exceder 255 caracteres'
    }),
  
  currentPeriodStart: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.format': 'La fecha de inicio del período debe estar en formato ISO',
    }),
  
  currentPeriodEnd: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.format': 'La fecha de fin del período debe estar en formato ISO',
    })
});

export const cancelSubscriptionSchema = Joi.object({
  reason: Joi.string()
    .min(1)
    .max(500)
    .optional()
    .messages({
      'string.min': 'La razón debe tener al menos 1 carácter',
      'string.max': 'La razón no puede exceder 500 caracteres'
    }),
  
  immediate: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'El campo immediate debe ser verdadero o falso'
    })
});

export const planIdSchema = Joi.number()
  .integer()
  .positive()
  .required()
  .messages({
    'number.base': 'El ID del plan debe ser un número',
    'number.integer': 'El ID del plan debe ser un número entero',
    'number.positive': 'El ID del plan debe ser positivo',
    'any.required': 'El ID del plan es requerido'
  });

export const stripeCustomerIdSchema = Joi.string()
  .min(1)
  .max(255)
  .pattern(/^cus_[a-zA-Z0-9]+$/)
  .required()
  .messages({
    'string.min': 'El ID del customer de Stripe es requerido',
    'string.max': 'El ID del customer de Stripe no puede exceder 255 caracteres',
    'string.pattern.base': 'El ID del customer de Stripe debe tener el formato correcto',
    'any.required': 'El ID del customer de Stripe es requerido'
  });

export const stripeSubscriptionIdSchema = Joi.string()
  .min(1)
  .max(255)
  .pattern(/^sub_[a-zA-Z0-9]+$/)
  .required()
  .messages({
    'string.min': 'El ID de suscripción de Stripe es requerido',
    'string.max': 'El ID de suscripción de Stripe no puede exceder 255 caracteres',
    'string.pattern.base': 'El ID de suscripción de Stripe debe tener el formato correcto',
    'any.required': 'El ID de suscripción de Stripe es requerido'
  });

export const webhookEventSchema = Joi.object({
  id: Joi.string()
    .min(1)
    .max(255)
    .required()
    .messages({
      'string.min': 'El ID del evento es requerido',
      'string.max': 'El ID del evento no puede exceder 255 caracteres',
      'any.required': 'El ID del evento es requerido'
    }),
  
  type: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'El tipo de evento es requerido',
      'string.max': 'El tipo de evento no puede exceder 100 caracteres',
      'any.required': 'El tipo de evento es requerido'
    }),
  
  data: Joi.object()
    .required()
    .messages({
      'object.base': 'Los datos del evento deben ser un objeto',
      'any.required': 'Los datos del evento son requeridos'
    }),
  
  created: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.base': 'El timestamp de creación debe ser un número',
      'number.integer': 'El timestamp de creación debe ser un número entero',
      'number.positive': 'El timestamp de creación debe ser positivo',
      'any.required': 'El timestamp de creación es requerido'
    })
});

console.log('[VALIDATORS] Esquemas de validación de suscripciones cargados');

