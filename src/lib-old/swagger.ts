import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const spec = {
  openapi: '3.0.0',
      info: {
        title: 'AdomiApp API',
        version: '1.0.0',
        description: 'API completa para la plataforma AdomiApp - Conectando profesionales con clientes. Incluye autenticación, recuperación de contraseña, gestión de usuarios y sistema de emails elegantes.'
      },
  servers: [
    { url: 'http://localhost:3000', description: 'Servidor de desarrollo' },
    { url: 'https://adomiapp.cl', description: 'Servidor de producción' }
  ],
  paths: {
    // ===== AUTENTICACIÓN =====
    '/auth/register': {
      post: {
        summary: 'Registrar nuevo usuario',
        description: 'Crea un nuevo usuario y envía email de bienvenida automáticamente',
        tags: ['Autenticación'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { 
                type: 'object', 
                required: ['email','password'], 
                properties: { 
                  email: { type: 'string', format: 'email', example: 'usuario@ejemplo.com' }, 
                  password: { type: 'string', minLength: 6, example: 'miPassword123' }, 
                  role: { type: 'string', enum: ['client','provider'], default: 'client', example: 'client' }, 
                  name: { type: 'string', example: 'Juan Pérez' } 
                } 
              }
            }
          }
        },
        responses: {
          '201': { 
            description: 'Usuario creado exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'number', example: 1 },
                        email: { type: 'string', example: 'usuario@ejemplo.com' },
                        role: { type: 'string', example: 'client' },
                        name: { type: 'string', example: 'Juan Pérez' }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': { description: 'Datos requeridos faltantes' },
          '409': { description: 'Email ya registrado' },
          '500': { description: 'Error del servidor' }
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Iniciar sesión',
        description: 'Autentica un usuario existente',
        tags: ['Autenticación'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { 
                type: 'object', 
                required: ['email','password'], 
                properties: { 
                  email: { type: 'string', format: 'email', example: 'usuario@ejemplo.com' }, 
                  password: { type: 'string', example: 'miPassword123' } 
                } 
              }
            }
          }
        },
        responses: {
          '200': { 
            description: 'Login exitoso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'number', example: 1 },
                        email: { type: 'string', example: 'usuario@ejemplo.com' },
                        role: { type: 'string', example: 'client' },
                        name: { type: 'string', example: 'Juan Pérez' }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': { description: 'Datos requeridos faltantes' },
          '401': { description: 'Credenciales inválidas' },
          '500': { description: 'Error del servidor' }
        }
      }
    },
        '/auth/test-email': {
          post: {
            summary: 'Probar envío de email',
            description: 'Envía un email de prueba para verificar la configuración SMTP',
            tags: ['Email'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['email'],
                    properties: {
                      email: { type: 'string', format: 'email', example: 'test@ejemplo.com' },
                      name: { type: 'string', example: 'Usuario de Prueba' },
                      role: { type: 'string', enum: ['client','provider'], example: 'client' }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Email enviado exitosamente',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        ok: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'Test email sent successfully' },
                        messageId: { type: 'string', example: '<abc123@example.com>' }
                      }
                    }
                  }
                }
              },
              '400': { description: 'Email requerido' },
              '500': { description: 'Error SMTP o del servidor' }
            }
          }
        },
        '/auth/forgot-password': {
          post: {
            summary: 'Solicitar recuperación de contraseña',
            description: 'Envía un email con enlace para restablecer la contraseña',
            tags: ['Autenticación'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['email'],
                    properties: {
                      email: { type: 'string', format: 'email', example: 'usuario@ejemplo.com' }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Email de recuperación enviado (si el email existe)',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        ok: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'Si el email existe, recibirás un enlace de recuperación' }
                      }
                    }
                  }
                }
              },
              '400': { description: 'Email requerido' },
              '500': { description: 'Error del servidor' }
            }
          }
        },
        '/auth/reset-password': {
          post: {
            summary: 'Restablecer contraseña',
            description: 'Restablece la contraseña usando el token del email',
            tags: ['Autenticación'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['token', 'password'],
                    properties: {
                      token: { type: 'string', example: 'abc123def456...' },
                      password: { type: 'string', minLength: 6, example: 'nuevaPassword123' }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Contraseña restablecida exitosamente',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        ok: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'Password reset successfully' }
                      }
                    }
                  }
                }
              },
              '400': { description: 'Token inválido, expirado o contraseña muy corta' },
              '500': { description: 'Error del servidor' }
            }
          }
        },
    '/health': { 
      get: { 
        summary: 'Estado de la API', 
        description: 'Verifica que la API esté funcionando',
        tags: ['Sistema'],
        responses: { 
          '200': { 
            description: 'API funcionando correctamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    status: { type: 'string', example: 'API is running' }
                  }
                }
              }
            }
          } 
        } 
      } 
    },
    '/db/health': { 
      get: { 
        summary: 'Estado de la base de datos', 
        description: 'Verifica la conexión a la base de datos',
        tags: ['Sistema'],
        responses: { 
          '200': { 
            description: 'Base de datos conectada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    db: { type: 'string', example: 'up' }
                  }
                }
              }
            }
          },
          '500': { description: 'Error de conexión a la base de datos' }
        }
      }
    },
    // ===== VERIFICACIONES =====
    '/verifications/upload-documents': {
      post: {
        tags: ['Verificaciones'],
        summary: 'Subir documentos de verificación',
        description: 'Sube documentos de identidad y antecedentes penales para verificación',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['document_type', 'front_document', 'back_document'],
                properties: {
                  document_type: { 
                    type: 'string', 
                    enum: ['id_card', 'background_check'],
                    example: 'id_card',
                    description: 'Tipo de documento a verificar'
                  },
                  front_document: {
                    type: 'string',
                    format: 'binary',
                    description: 'Imagen frontal del documento'
                  },
                  back_document: {
                    type: 'string',
                    format: 'binary',
                    description: 'Imagen trasera del documento'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Documentos subidos exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Documentos subidos exitosamente' },
                    verification: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 1 },
                        document_type: { type: 'string', example: 'id_card' },
                        status: { type: 'string', example: 'pending' },
                        file_url: { type: 'string', example: '/uploads/verifications/doc_123.jpg' }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Datos inválidos o archivos faltantes' },
          401: { description: 'No autorizado' },
          500: { description: 'Error del servidor' }
        }
      }
    },
    '/verifications/status': {
      get: {
        tags: ['Verificaciones'],
        summary: 'Obtener estado de verificaciones',
        description: 'Obtiene el estado de todas las verificaciones del usuario',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Estado de verificaciones obtenido exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    verifications: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer', example: 1 },
                          document_type: { type: 'string', example: 'id_card' },
                          status: { type: 'string', enum: ['pending', 'approved', 'rejected'], example: 'pending' },
                          file_url: { type: 'string', example: '/uploads/verifications/doc_123.jpg' },
                          created_at: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' }
        }
      }
    },
    // ===== CONTABILIDAD =====
    '/accounting/revenue': {
      get: {
        tags: ['Contabilidad'],
        summary: 'Obtener reportes de ingresos',
        description: 'Obtiene reportes detallados de ingresos de la plataforma',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'start_date',
            in: 'query',
            schema: { type: 'string', format: 'date' },
            description: 'Fecha de inicio (YYYY-MM-DD)'
          },
          {
            name: 'end_date',
            in: 'query',
            schema: { type: 'string', format: 'date' },
            description: 'Fecha de fin (YYYY-MM-DD)'
          }
        ],
        responses: {
          200: {
            description: 'Reportes de ingresos obtenidos exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    revenue: {
                      type: 'object',
                      properties: {
                        total_revenue: { type: 'number', example: 1500000 },
                        platform_fees: { type: 'number', example: 150000 },
                        net_revenue: { type: 'number', example: 1350000 },
                        currency: { type: 'string', example: 'CLP' },
                        period: { type: 'string', example: '2024-01-01 to 2024-01-31' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado - Solo administradores' }
        }
      }
    },
    '/accounting/settings': {
      get: {
        tags: ['Contabilidad'],
        summary: 'Obtener configuración de la plataforma',
        description: 'Obtiene la configuración actual de la plataforma',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Configuración obtenida exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    settings: {
                      type: 'object',
                      properties: {
                        platform_fee_percentage: { type: 'number', example: 10 },
                        minimum_withdrawal: { type: 'number', example: 10000 },
                        currency: { type: 'string', example: 'CLP' },
                        tax_rate: { type: 'number', example: 19 }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' }
        }
      },
      put: {
        tags: ['Contabilidad'],
        summary: 'Actualizar configuración de la plataforma',
        description: 'Actualiza la configuración de la plataforma',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  platform_fee_percentage: { type: 'number', example: 10 },
                  minimum_withdrawal: { type: 'number', example: 10000 },
                  currency: { type: 'string', example: 'CLP' },
                  tax_rate: { type: 'number', example: 19 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Configuración actualizada exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Configuración actualizada exitosamente' },
                    settings: {
                      type: 'object',
                      properties: {
                        platform_fee_percentage: { type: 'number', example: 10 },
                        minimum_withdrawal: { type: 'number', example: 10000 },
                        currency: { type: 'string', example: 'CLP' },
                        tax_rate: { type: 'number', example: 19 }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado - Solo administradores' }
        }
      }
    },
    // ===== WEBHOOKS =====
    '/webhooks/stripe': {
      post: {
        tags: ['Webhooks'],
        summary: 'Webhook de Stripe',
        description: 'Endpoint para recibir eventos de Stripe (pagos, suscripciones, etc.)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Evento de Stripe'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Webhook procesado exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Webhook processed successfully' }
                  }
                }
              }
            }
          },
          400: { description: 'Evento inválido' },
          500: { description: 'Error procesando webhook' }
        }
      }
    },
    // ===== FUNDADORES =====
    '/founders/benefits': {
      get: {
        tags: ['Fundadores'],
        summary: 'Obtener beneficios de fundador',
        description: 'Obtiene los beneficios especiales de fundador del usuario',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Beneficios obtenidos exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    benefits: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 1 },
                        benefits: { type: 'array', items: { type: 'string' }, example: ['50% discount', 'Priority support'] },
                        discount_percentage: { type: 'number', example: 50 },
                        is_active: { type: 'boolean', example: true },
                        expires_at: { type: 'string', format: 'date-time', example: '2024-12-31T23:59:59Z' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' },
          404: { description: 'Usuario no es fundador' }
        }
      }
    },
    '/founders/assign': {
      post: {
        tags: ['Fundadores'],
        summary: 'Asignar beneficios de fundador',
        description: 'Asigna beneficios especiales de fundador a un usuario',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_id', 'benefits', 'discount_percentage'],
                properties: {
                  user_id: { type: 'integer', example: 123, description: 'ID del usuario a asignar beneficios' },
                  benefits: { 
                    type: 'array', 
                    items: { type: 'string' },
                    example: ['50% discount', 'Priority support'],
                    description: 'Lista de beneficios'
                  },
                  discount_percentage: { type: 'number', example: 50, description: 'Porcentaje de descuento' },
                  notes: { type: 'string', example: 'Usuario fundador desde el inicio' },
                  expires_at: { type: 'string', format: 'date-time', example: '2024-12-31T23:59:59Z' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Beneficios asignados exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Beneficios de fundador asignados exitosamente' },
                    founder_benefits: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 1 },
                        user_id: { type: 'integer', example: 123 },
                        benefits: { type: 'array', items: { type: 'string' } },
                        discount_percentage: { type: 'number', example: 50 },
                        is_active: { type: 'boolean', example: true }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Datos inválidos' },
          401: { description: 'No autorizado' },
          403: { description: 'Acceso denegado - Solo administradores' }
        }
      }
    }
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 1 },
          email: { type: 'string', format: 'email', example: 'usuario@ejemplo.com' },
          role: { type: 'string', enum: ['client', 'provider'], example: 'client' },
          name: { type: 'string', example: 'Juan Pérez' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Error message' }
        }
      }
    },
    '/plan-expirations/user/{userId}/current': {
      get: {
        tags: ['Plan Expirations'],
        summary: 'Obtener plan actual del usuario',
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'ID del usuario'
          }
        ],
        responses: {
          200: {
            description: 'Plan actual obtenido exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    currentPlan: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 1 },
                        name: { type: 'string', example: 'Plan Básico' },
                        expires_at: { type: 'string', format: 'date-time', example: '2024-12-31T23:59:59Z' },
                        is_expired: { type: 'boolean', example: false },
                        days_remaining: { type: 'integer', example: 15 }
                      }
                    }
                  }
                }
              }
            }
          },
          404: {
            description: 'Usuario no encontrado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: false },
                    error: { type: 'string', example: 'Usuario no encontrado' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/plan-expirations/expiring-soon': {
      get: {
        tags: ['Plan Expirations'],
        summary: 'Obtener planes que están por vencer',
        parameters: [
          {
            name: 'days',
            in: 'query',
            schema: { type: 'integer', default: 7 },
            description: 'Número de días para considerar "por vencer"'
          }
        ],
        responses: {
          200: {
            description: 'Planes por vencer obtenidos exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    expirations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer', example: 1 },
                          user_id: { type: 'integer', example: 1 },
                          plan_id: { type: 'integer', example: 2 },
                          expires_at: { type: 'string', format: 'date-time' },
                          email: { type: 'string', example: 'user@example.com' },
                          name: { type: 'string', example: 'Juan Pérez' },
                          plan_name: { type: 'string', example: 'Plan Premium' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/plan-expirations/stats': {
      get: {
        tags: ['Plan Expirations'],
        summary: 'Obtener estadísticas de expiraciones',
        responses: {
          200: {
            description: 'Estadísticas obtenidas exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    stats: {
                      type: 'object',
                      properties: {
                        total_active: { type: 'integer', example: 150 },
                        expiring_soon: { type: 'integer', example: 12 },
                        expired: { type: 'integer', example: 5 },
                        downgraded: { type: 'integer', example: 3 }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/plans': {
      get: {
        tags: ['Plans'],
        summary: 'Obtener todos los planes disponibles',
        responses: {
          200: {
            description: 'Planes obtenidos exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    plans: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer', example: 1 },
                          name: { type: 'string', example: 'Plan Básico' },
                          description: { type: 'string', example: 'Plan básico para empezar' },
                          price: { type: 'number', example: 0 },
                          currency: { type: 'string', example: 'CLP' },
                          stripe_price_id: { type: 'string', example: 'price_1234567890' },
                          features: { type: 'array', items: { type: 'string' } },
                          is_active: { type: 'boolean', example: true }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/subscriptions/create-checkout': {
      post: {
        tags: ['Subscriptions'],
        summary: 'Crear sesión de checkout de Stripe',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['planId', 'userEmail', 'userName'],
                properties: {
                  planId: { type: 'integer', example: 1, description: 'ID del plan seleccionado' },
                  userEmail: { type: 'string', format: 'email', example: 'user@example.com' },
                  userName: { type: 'string', example: 'Juan Pérez' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Sesión de checkout creada exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    checkoutUrl: { type: 'string', example: 'https://checkout.stripe.com/pay/cs_test_...' },
                    sessionId: { type: 'string', example: 'cs_test_1234567890' },
                    message: { type: 'string', example: 'Modo de prueba - Stripe no configurado' }
                  }
                }
              }
            }
          },
          400: {
            description: 'Datos de entrada inválidos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: false },
                    error: { type: 'string', example: 'Faltan campos requeridos' }
                  }
                }
              }
            }
          }
        }
      }
    },
    // ===== PROMOCIONES =====
    '/promo/signup': {
      post: {
        tags: ['Promociones'],
        summary: 'Registrar para prueba gratis',
        description: 'Registra un usuario para la promoción de prueba gratis de 3 meses',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre', 'correo', 'profesion'],
                properties: {
                  nombre: { 
                    type: 'string', 
                    example: 'Juan Pérez',
                    description: 'Nombre completo del usuario'
                  },
                  correo: { 
                    type: 'string', 
                    format: 'email',
                    example: 'juan@ejemplo.com',
                    description: 'Correo electrónico del usuario'
                  },
                  profesion: { 
                    type: 'string', 
                    enum: ['estilista', 'chef', 'masajista', 'profesor', 'tecnico', 'entrenador', 'limpieza', 'cuidado', 'otro'],
                    example: 'estilista',
                    description: 'Profesión o servicio que ofrece el usuario'
                  },
                  notas: { 
                    type: 'string', 
                    example: 'Tengo 5 años de experiencia en peluquería',
                    description: 'Notas adicionales (opcional)'
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Registro exitoso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: '¡Registro exitoso! Te contactaremos pronto para activar tu prueba gratis.' },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 1 },
                        nombre: { type: 'string', example: 'Juan Pérez' },
                        correo: { type: 'string', example: 'juan@ejemplo.com' },
                        profesion: { type: 'string', example: 'estilista' },
                        status: { type: 'string', example: 'pending' },
                        created_at: { type: 'string', format: 'date-time' }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Datos requeridos faltantes o formato inválido' },
          409: { description: 'Este correo ya está registrado para la promoción' },
          429: { description: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
          500: { description: 'Error interno del servidor' }
        }
      }
    },
    '/promo/signups': {
      get: {
        tags: ['Promociones'],
        summary: 'Obtener todos los registros de promoción',
        description: 'Obtiene todos los registros de promoción (solo administradores)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Registros obtenidos exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Registros obtenidos exitosamente' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer', example: 1 },
                          nombre: { type: 'string', example: 'Juan Pérez' },
                          correo: { type: 'string', example: 'juan@ejemplo.com' },
                          profesion: { type: 'string', example: 'estilista' },
                          notas: { type: 'string', example: 'Tengo 5 años de experiencia' },
                          status: { type: 'string', enum: ['pending', 'contacted', 'converted', 'cancelled'], example: 'pending' },
                          created_at: { type: 'string', format: 'date-time' },
                          updated_at: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' },
          403: { description: 'No tienes permisos para acceder a esta información' }
        }
      }
    },
    '/promo/stats': {
      get: {
        tags: ['Promociones'],
        summary: 'Obtener estadísticas de promociones',
        description: 'Obtiene estadísticas detalladas de los registros de promoción (solo administradores)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Estadísticas obtenidas exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Estadísticas obtenidas exitosamente' },
                    data: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer', example: 150, description: 'Total de registros' },
                        pending: { type: 'integer', example: 45, description: 'Registros pendientes' },
                        contacted: { type: 'integer', example: 80, description: 'Registros contactados' },
                        converted: { type: 'integer', example: 20, description: 'Registros convertidos' },
                        cancelled: { type: 'integer', example: 5, description: 'Registros cancelados' },
                        by_profesion: {
                          type: 'object',
                          example: {
                            'estilista': 50,
                            'chef': 30,
                            'masajista': 25,
                            'profesor': 20,
                            'otro': 25
                          },
                          description: 'Conteo por profesión'
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' },
          403: { description: 'No tienes permisos para acceder a esta información' }
        }
      }
    },
    '/promo/signups/{id}/status': {
      patch: {
        tags: ['Promociones'],
        summary: 'Actualizar estado de registro',
        description: 'Actualiza el estado de seguimiento de un registro de promoción (solo administradores)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'ID del registro de promoción'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { 
                    type: 'string', 
                    enum: ['pending', 'contacted', 'converted', 'cancelled'],
                    example: 'contacted',
                    description: 'Nuevo estado del registro'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Estado actualizado exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Estado actualizado exitosamente' }
                  }
                }
              }
            }
          },
          400: { description: 'Estado inválido' },
          401: { description: 'No autorizado' },
          403: { description: 'No tienes permisos para realizar esta acción' }
        }
      }
    },
    '/auth/google': {
      post: {
        tags: ['Google OAuth'],
        summary: 'Iniciar autenticación con Google',
        description: 'Genera URL de autorización de Google para iniciar el proceso de OAuth',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    enum: ['client', 'provider'],
                    default: 'client',
                    description: 'Rol del usuario (cliente o proveedor)'
                  }
                }
              },
              example: {
                role: 'client'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'URL de autorización generada exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    authUrl: { type: 'string', example: 'https://accounts.google.com/oauth/authorize?...' },
                    message: { type: 'string', example: 'URL de autorización generada exitosamente' }
                  }
                }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          429: { $ref: '#/components/responses/TooManyRequests' },
          500: { $ref: '#/components/responses/InternalServerError' }
        }
      }
    },
    '/auth/google/callback': {
      get: {
        tags: ['Google OAuth'],
        summary: 'Callback de Google OAuth',
        description: 'Procesa el código de autorización de Google y completa el login',
        parameters: [
          {
            name: 'code',
            in: 'query',
            required: true,
            description: 'Código de autorización de Google',
            schema: { type: 'string' }
          },
          {
            name: 'state',
            in: 'query',
            description: 'Estado que contiene información del usuario',
            schema: { type: 'string' }
          }
        ],
        responses: {
          302: {
            description: 'Redirección al frontend con tokens de autenticación',
            headers: {
              Location: {
                description: 'URL de redirección con tokens',
                schema: { type: 'string' }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          500: { $ref: '#/components/responses/InternalServerError' }
        }
      }
    },
    '/auth/google/verify': {
      post: {
        tags: ['Google OAuth'],
        summary: 'Verificar token de Google',
        description: 'Verifica un token de ID de Google y autentica al usuario',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idToken'],
                properties: {
                  idToken: {
                    type: 'string',
                    description: 'Token de ID de Google'
                  },
                  role: {
                    type: 'string',
                    enum: ['client', 'provider'],
                    default: 'client',
                    description: 'Rol del usuario'
                  }
                }
              },
              example: {
                idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
                role: 'client'
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Autenticación exitosa',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 123 },
                        email: { type: 'string', example: 'user@gmail.com' },
                        name: { type: 'string', example: 'Usuario' },
                        role: { type: 'string', example: 'client' }
                      }
                    },
                    accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                    refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                    message: { type: 'string', example: 'Autenticación con Google exitosa' }
                  }
                }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          429: { $ref: '#/components/responses/TooManyRequests' },
          500: { $ref: '#/components/responses/InternalServerError' }
        }
      }
    },
    '/auth/google/unlink': {
      post: {
        tags: ['Google OAuth'],
        summary: 'Desvincular cuenta de Google',
        description: 'Desvincula la cuenta de Google del usuario autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Cuenta desvinculada exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Cuenta de Google desvinculada exitosamente' }
                  }
                }
              }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          429: { $ref: '#/components/responses/TooManyRequests' },
          500: { $ref: '#/components/responses/InternalServerError' }
        }
      }
    },
    '/promo/signups/{id}': {
      get: {
        tags: ['Promociones'],
        summary: 'Obtener registro específico',
        description: 'Obtiene un registro específico de promoción por ID (solo administradores)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'ID del registro de promoción'
          }
        ],
        responses: {
          200: {
            description: 'Registro obtenido exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Registro obtenido exitosamente' },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 1 },
                        nombre: { type: 'string', example: 'Juan Pérez' },
                        correo: { type: 'string', example: 'juan@ejemplo.com' },
                        profesion: { type: 'string', example: 'estilista' },
                        notas: { type: 'string', example: 'Tengo 5 años de experiencia' },
                        status: { type: 'string', example: 'pending' },
                        created_at: { type: 'string', format: 'date-time' },
                        updated_at: { type: 'string', format: 'date-time' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' },
          403: { description: 'No tienes permisos para acceder a esta información' },
          404: { description: 'Registro no encontrado' }
        }
      },
      delete: {
        tags: ['Promociones'],
        summary: 'Eliminar registro',
        description: 'Elimina un registro de promoción (solo administradores)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'ID del registro de promoción'
          }
        ],
        responses: {
          200: {
            description: 'Registro eliminado exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Registro eliminado exitosamente' }
                  }
                }
              }
            }
          },
          401: { description: 'No autorizado' },
          403: { description: 'No tienes permisos para realizar esta acción' },
          404: { description: 'Registro no encontrado' }
        }
      }
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtenido del endpoint de login'
      }
    }
  }
};

// Agregar rutas de Bookings al spec
const bookingPaths = {
  '/bookings': {
    get: {
      tags: ['Bookings'],
      summary: 'Obtener reservas del usuario',
      description: 'Obtiene todas las reservas del usuario autenticado (cliente o proveedor)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filtrar por estado' },
        { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha de inicio' },
        { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha de fin' }
      ],
      responses: {
        200: {
          description: 'Lista de reservas obtenida exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  bookings: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 1 },
                        client_id: { type: 'integer', example: 123 },
                        provider_id: { type: 'integer', example: 456 },
                        provider_service_id: { type: 'integer', example: 789 },
                        booking_time: { type: 'string', format: 'date-time', example: '2024-01-15T10:00:00Z' },
                        status: { 
                          type: 'string', 
                          enum: ['pending', 'confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_provider', 'no_show'],
                          example: 'confirmed'
                        },
                        final_price: { type: 'number', example: 25000 },
                        notes_from_client: { type: 'string', example: 'Corte de cabello corto' },
                        notes_from_provider: { type: 'string', example: 'Cliente puntual' },
                        client_name: { type: 'string', example: 'Juan Pérez' },
                        provider_name: { type: 'string', example: 'María Estilista' },
                        service_name: { type: 'string', example: 'Corte de Cabello' },
                        service_description: { type: 'string', example: 'Corte profesional para caballeros' },
                        created_at: { type: 'string', format: 'date-time' },
                        updated_at: { type: 'string', format: 'date-time' }
                      }
                    }
                  },
                  count: { type: 'integer', example: 5 }
                }
              }
            }
          }
        },
        401: {
          description: 'No autorizado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Token JWT inválido' }
                }
              }
            }
          }
        },
        500: {
          description: 'Error interno del servidor',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Error interno del servidor' }
                }
              }
            }
          }
        }
      }
    },
    post: {
      tags: ['Bookings'],
      summary: 'Crear nueva reserva',
      description: 'Crea una nueva reserva (solo clientes)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['provider_id', 'provider_service_id', 'booking_time', 'final_price'],
              properties: {
                provider_id: { type: 'integer', example: 456 },
                provider_service_id: { type: 'integer', example: 789 },
                booking_time: { type: 'string', format: 'date-time' },
                final_price: { type: 'number', example: 25000 },
                notes_from_client: { type: 'string', example: 'Corte de cabello corto' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Reserva creada exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Reserva creada exitosamente.' },
                  booking: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer', example: 1 },
                      client_id: { type: 'integer', example: 123 },
                      provider_id: { type: 'integer', example: 456 },
                      provider_service_id: { type: 'integer', example: 789 },
                      booking_time: { type: 'string', format: 'date-time', example: '2024-01-15T10:00:00Z' },
                      status: { type: 'string', example: 'pending' },
                      final_price: { type: 'number', example: 25000 },
                      notes_from_client: { type: 'string', example: 'Corte de cabello corto' },
                      client_name: { type: 'string', example: 'Juan Pérez' },
                      provider_name: { type: 'string', example: 'María Estilista' },
                      service_name: { type: 'string', example: 'Corte de Cabello' }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Datos de entrada inválidos',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Faltan datos requeridos: provider_id, provider_service_id, booking_time, final_price' }
                }
              }
            }
          }
        },
        403: {
          description: 'Solo clientes pueden crear reservas',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Solo los clientes pueden crear reservas.' }
                }
              }
            }
          }
        },
        409: {
          description: 'Horario no disponible',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'El horario seleccionado no está disponible.' }
                }
              }
            }
          }
        },
        500: {
          description: 'Error interno del servidor',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Error interno del servidor.' }
                }
              }
            }
          }
        }
      }
    }
  },
  '/bookings/{id}': {
    get: {
      tags: ['Bookings'],
      summary: 'Obtener reserva específica',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Reserva encontrada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  booking: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer', example: 1 },
                      client_id: { type: 'integer', example: 123 },
                      provider_id: { type: 'integer', example: 456 },
                      provider_service_id: { type: 'integer', example: 789 },
                      booking_time: { type: 'string', format: 'date-time', example: '2024-01-15T10:00:00Z' },
                      status: { 
                        type: 'string', 
                        enum: ['pending', 'confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_provider', 'no_show'],
                        example: 'confirmed'
                      },
                      final_price: { type: 'number', example: 25000 },
                      notes_from_client: { type: 'string', example: 'Corte de cabello corto' },
                      notes_from_provider: { type: 'string', example: 'Cliente puntual' },
                      client_name: { type: 'string', example: 'Juan Pérez' },
                      client_email: { type: 'string', example: 'juan@email.com' },
                      provider_name: { type: 'string', example: 'María Estilista' },
                      provider_email: { type: 'string', example: 'maria@salon.com' },
                      service_name: { type: 'string', example: 'Corte de Cabello' },
                      service_description: { type: 'string', example: 'Corte profesional para caballeros' },
                      service_price: { type: 'number', example: 25000 },
                      created_at: { type: 'string', format: 'date-time' },
                      updated_at: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        404: {
          description: 'Reserva no encontrada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Reserva no encontrada.' }
                }
              }
            }
          }
        },
        403: {
          description: 'Sin acceso a esta reserva',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'No tienes acceso a esta reserva.' }
                }
              }
            }
          }
        }
      }
    }
  },
  '/bookings/{id}/status': {
    put: {
      tags: ['Bookings'],
      summary: 'Actualizar estado de reserva',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_provider', 'no_show'] },
                notes_from_provider: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Estado actualizado exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Estado de reserva actualizado exitosamente.' },
                  booking: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer', example: 1 },
                      status: { type: 'string', example: 'confirmed' },
                      notes_from_provider: { type: 'string', example: 'Cliente confirmado' },
                      updated_at: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Estado inválido',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Estado inválido. Estados válidos: pending, confirmed, completed, cancelled_by_client, cancelled_by_provider, no_show' }
                }
              }
            }
          }
        },
        403: {
          description: 'Sin permisos para actualizar',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'No tienes permisos para actualizar esta reserva con el estado especificado.' }
                }
              }
            }
          }
        },
        404: {
          description: 'Reserva no encontrada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Reserva no encontrada.' }
                }
              }
            }
          }
        }
      }
    }
  },
  '/bookings/availability/{provider_id}': {
    get: {
      tags: ['Bookings'],
      summary: 'Verificar disponibilidad del proveedor',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'provider_id', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        { name: 'time', in: 'query', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: {
          description: 'Disponibilidad verificada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  available: { type: 'boolean', example: true },
                  provider_id: { type: 'integer', example: 456 },
                  booking_time: { type: 'string', format: 'date-time', example: '2024-01-15T10:00:00Z' }
                }
              }
            }
          }
        },
        400: {
          description: 'Parámetros inválidos',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'Faltan parámetros: date y time son requeridos.' }
                }
              }
            }
          }
        }
      }
    }
  },
  '/bookings/stats': {
    get: {
      tags: ['Bookings'],
      summary: 'Obtener estadísticas de reservas',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'provider_id', in: 'query', schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Estadísticas obtenidas exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  stats: {
                    type: 'object',
                    properties: {
                      total: { type: 'integer', example: 50, description: 'Total de reservas' },
                      pending: { type: 'integer', example: 5, description: 'Reservas pendientes' },
                      confirmed: { type: 'integer', example: 20, description: 'Reservas confirmadas' },
                      completed: { type: 'integer', example: 20, description: 'Servicios completados' },
                      cancelled: { type: 'integer', example: 5, description: 'Reservas canceladas' },
                      revenue: { type: 'number', example: 1250000, description: 'Ingresos totales (CLP)' }
                    }
                  },
                  period: { type: 'string', example: 'provider', description: 'Período de las estadísticas' }
                }
              }
            }
          }
        },
        403: {
          description: 'Sin permisos para ver estadísticas',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: { type: 'string', example: 'No puedes ver estadísticas de otros proveedores.' }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Agregar las rutas de bookings al spec
Object.assign(spec.paths, bookingPaths);

export function mountSwagger(app: Express) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
