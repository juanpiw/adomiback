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
    }
  }
};

export function mountSwagger(app: Express) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
