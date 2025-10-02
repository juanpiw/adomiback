import helmet from 'helmet';

// Configuración de seguridad con Helmet para desarrollo
export const developmentSecurityConfig = helmet({
  contentSecurityPolicy: false, // Deshabilitar CSP en desarrollo
  crossOriginEmbedderPolicy: false,
  dnsPrefetchControl: false,
  hidePoweredBy: true,
  hsts: false, // Deshabilitar HSTS en desarrollo
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: false,
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  xssFilter: true
});

// Configuración para APIs
export const apiSecurityConfig = helmet({
  contentSecurityPolicy: false, // Deshabilitar CSP para APIs
  crossOriginEmbedderPolicy: false,
  dnsPrefetchControl: false,
  hidePoweredBy: true,
  hsts: false, // Deshabilitar HSTS para desarrollo
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: false,
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  xssFilter: true
});

// Configuración para producción
export const productionSecurityConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      childSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  dnsPrefetchControl: {
    allow: false
  },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  xssFilter: true
});

console.log('[SECURITY] Configuraciones de seguridad cargadas');