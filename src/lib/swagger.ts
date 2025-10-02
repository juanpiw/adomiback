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

export function mountSwagger(app: Express) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
