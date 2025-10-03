import cors from 'cors';

// Configuración de CORS para desarrollo
export const developmentCorsConfig = cors({
  origin: [
    'http://localhost:4200', // Angular dev server
    'http://localhost:3000', // Backend dev server
    'http://127.0.0.1:4200',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 horas
});

// Configuración de CORS para producción
export const productionCorsConfig = cors({
  origin: (origin, callback) => {
    // Lista de dominios permitidos en producción
    const allowedOrigins = [
      'https://adomiapp.cl',
      'https://www.adomiapp.cl',
      'https://app.adomiapp.cl',
      'https://admin.adomiapp.cl',
      // Frontend desplegado en AWS Amplify
      'https://main.d274x9hs73bju8.amplifyapp.com'
    ];

    // Permitir requests sin origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Origin no permitida: ${origin}`);
      callback(new Error('No permitido por CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma',
    'X-API-Key'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Total-Count',
    'X-Page-Count'
  ],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 horas
});

// Configuración de CORS para APIs públicas
export const publicApiCorsConfig = cors({
  origin: true, // Permitir cualquier origin para APIs públicas
  credentials: false, // No permitir cookies para APIs públicas
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  optionsSuccessStatus: 200,
  maxAge: 3600 // 1 hora
});

// Configuración de CORS para webhooks
export const webhookCorsConfig = cors({
  origin: [
    'https://hooks.stripe.com',
    'https://api.stripe.com'
  ],
  credentials: false,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Stripe-Signature',
    'User-Agent'
  ],
  optionsSuccessStatus: 200,
  maxAge: 300 // 5 minutos
});

// Middleware de CORS personalizado para logging
export function corsLogger(req: any, res: any, next: any) {
  const origin = req.get('Origin');
  const method = req.method;
  const path = req.path;
  
  console.log(`[CORS] ${method} ${path} from origin: ${origin || 'no-origin'}`);
  
  next();
}

// Middleware para validar origin en desarrollo
export function validateOrigin(req: any, res: any, next: any) {
  const origin = req.get('Origin');
  const allowedOrigins = [
    'http://localhost:4200',
    'http://localhost:3000',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:3000'
  ];

  if (process.env.NODE_ENV === 'development') {
    if (origin && !allowedOrigins.includes(origin)) {
      console.warn(`[CORS] Origin no permitida en desarrollo: ${origin}`);
    }
  }

  next();
}

console.log('[CORS] Configuraciones de CORS cargadas');

