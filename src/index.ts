console.log('🚀 Adomi Backend - Starting application...');

import dotenv from 'dotenv';
console.log('📋 Loading environment variables...');
dotenv.config();
console.log('✅ Environment variables loaded');

import express from 'express';
console.log('📦 Express imported successfully');
import https from 'https';
import http from 'http';
import fs from 'fs';

// Memory monitoring
function logMemoryUsage() {
  const used = process.memoryUsage();
  const formatBytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
  
  console.log('🧠 Memory Usage:', {
    rss: `${formatBytes(used.rss)} MB`,
    heapTotal: `${formatBytes(used.heapTotal)} MB`,
    heapUsed: `${formatBytes(used.heapUsed)} MB`,
    external: `${formatBytes(used.external)} MB`,
    arrayBuffers: `${formatBytes(used.arrayBuffers)} MB`
  });
}

// Aggressive memory cleanup
function forceMemoryCleanup() {
  if (global.gc) {
    console.log('🗑️ Forcing aggressive garbage collection...');
    global.gc();
    console.log('✅ Garbage collection completed');
    logMemoryUsage();
  } else {
    console.log('⚠️ Garbage collection not available');
  }
}
import cors from 'cors';
import morgan from 'morgan';
import { createRouter } from './lib/router';
import { mountSwagger } from './lib/swagger';
import { testConnection } from './lib/db';
import { testEmailConnection } from './lib/email';
import { generalRateLimit } from './config/rate-limits';
import { developmentSecurityConfig } from './config/security';
import { developmentCorsConfig, corsLogger } from './config/cors';

const app = express();

// Security headers
app.use(developmentSecurityConfig);

// Rate limiting global
app.use(generalRateLimit);

// CORS
app.use(developmentCorsConfig);
app.use(corsLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('dev'));

// Usar el router principal que incluye todos los endpoints
const api = createRouter();
mountSwagger(app);
app.use('/', api);

// Leer variables de entorno para HTTPS
const BIND_IP = process.env.IP || '0.0.0.0';
const HTTP_PORT = process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : null;
const HTTPS_PORT = process.env.HTTPS_PORT ? Number(process.env.HTTPS_PORT) : null;
const KEY_PATH = process.env.KEY_PATH;
const CERT_PATH = process.env.CERT_PATH;
const PORT = Number(process.env.PORT) || 3000; // Puerto por defecto para desarrollo

// Función para mostrar endpoints disponibles
function logEndpoints(proto: string, port: number) {
  const host = process.env.IP || 'localhost';
  const base = `${proto}://${host}:${port}`;
  console.log(`📡 ${proto.toUpperCase()} server listening on ${base}`);
  console.log(`📊 Health check: ${base}/health`);
  console.log(`📚 API Docs: ${base}/docs`);
  console.log(`🏠 Main page: ${base}/`);
}

// Test database connection and start server
async function startServer() {
  try {
    console.log('🚀 Starting Adomi Backend Server...');
    console.log('📋 Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      IP: process.env.IP,
      HTTP_PORT: process.env.HTTP_PORT,
      HTTPS_PORT: process.env.HTTPS_PORT,
      KEY_PATH: process.env.KEY_PATH ? 'Set' : 'Not set',
      CERT_PATH: process.env.CERT_PATH ? 'Set' : 'Not set',
      DB_HOST: process.env.DB_HOST,
      SKIP_DB_CHECK: process.env.SKIP_DB_CHECK
    });
    
    // Log initial memory usage
    console.log('🧠 Initial Memory Usage:');
    logMemoryUsage();
    
    // Force initial cleanup
    forceMemoryCleanup();
    
    // Temporal: Permitir inicio sin base de datos para probar HTTPS
    const SKIP_DB_CHECK = process.env.SKIP_DB_CHECK === 'true';
    const SKIP_EMAIL_CHECK = process.env.SKIP_EMAIL_CHECK === 'true';
    
    console.log('🔧 Skip flags:', {
      SKIP_DB_CHECK,
      SKIP_EMAIL_CHECK
    });
    
    if (!SKIP_DB_CHECK) {
      console.log('🔍 Testing database connection...');
      const dbConnected = await testConnection();
      if (!dbConnected) {
        console.error('[API] Failed to connect to database. Please check your .env configuration.');
        console.log('💡 Tip: Set SKIP_DB_CHECK=true in .env to skip database validation');
        console.log('🔄 Attempting to continue without database...');
        // No exit, continue with fallback
      } else {
        console.log('✅ Database connection successful');
      }
      // Force cleanup after DB operations
      forceMemoryCleanup();
    } else {
      console.log('⚠️ Skipping database connection check (SKIP_DB_CHECK=true)');
    }
    
    // Si está configurado para producción con HTTPS
    if (Number.isFinite(HTTPS_PORT) && KEY_PATH && CERT_PATH) {
      console.log('🚀 Attempting to start HTTPS server for production...');
      console.log('🔍 HTTPS Configuration:', {
        HTTPS_PORT,
        KEY_PATH,
        CERT_PATH,
        BIND_IP
      });
      
      // VALIDACIÓN OBLIGATORIA DE HTTPS
      try {
        console.log('📁 Checking SSL certificate files...');
        
        // Verificar si los archivos existen
        if (!fs.existsSync(KEY_PATH)) {
          throw new Error(`SSL Key file not found: ${KEY_PATH}`);
        }
        if (!fs.existsSync(CERT_PATH)) {
          throw new Error(`SSL Certificate file not found: ${CERT_PATH}`);
        }
        
        console.log('✅ SSL certificate files found');
        console.log('📖 Reading SSL certificates...');
        
        // Leer certificados SSL
        const httpsServerOptions = {
          key: fs.readFileSync(KEY_PATH),   // Clave privada
          cert: fs.readFileSync(CERT_PATH)  // Certificado público
        };
        
        console.log('✅ SSL certificates loaded successfully');
        console.log('🔧 Creating HTTPS server...');
        
        // Crear servidor HTTPS
        const serverHttps = https.createServer(httpsServerOptions, app);
        
        console.log(`🌐 Starting HTTPS server on ${BIND_IP}:${HTTPS_PORT}...`);
        
        // Escuchar en puerto HTTPS
        serverHttps.listen(HTTPS_PORT, BIND_IP, () => {
          logEndpoints('https', HTTPS_PORT);
          console.log('✅ HTTPS Server started successfully');
          console.log('🧠 Memory after HTTPS server start:');
          logMemoryUsage();
        });
        
        // SERVIDOR HTTP OPCIONAL (para redirección)
        if (Number.isFinite(HTTP_PORT)) {
          console.log(`🌐 Starting HTTP server on ${BIND_IP}:${HTTP_PORT}...`);
          try {
            const serverHttp = http.createServer(app);
            serverHttp.listen(HTTP_PORT, BIND_IP, () => {
              logEndpoints('http', HTTP_PORT);
              console.log('✅ HTTP Server started successfully');
            });
          } catch (error: any) {
            console.warn('⚠️ Failed to start HTTP server:', error.message);
            console.warn('⚠️ Error details:', error);
          }
        }
        
      } catch (error: any) {
        console.error('❌ Failed to start HTTPS server:', error.message);
        console.error('❌ Error details:', {
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          path: error.path
        });
        console.log('🔄 Falling back to development HTTP mode...');
        
        // FALLBACK: Modo desarrollo - solo HTTP
        console.log('🔧 Starting development server...');
        app.listen(PORT, () => {
          console.log(`[API] Development server listening on http://localhost:${PORT}`);
          console.log(`📊 Health check: http://localhost:${PORT}/health`);
          console.log(`📚 API Docs: http://localhost:${PORT}/docs`);
          console.log('🧠 Memory after HTTP server start:');
          logMemoryUsage();
        });
      }
      
    } else {
      console.log('🔧 Starting development server (no HTTPS config)...');
      console.log('🔍 HTTPS Config Check:', {
        'HTTPS_PORT is finite': Number.isFinite(HTTPS_PORT),
        'KEY_PATH exists': !!KEY_PATH,
        'CERT_PATH exists': !!CERT_PATH,
        HTTPS_PORT,
        KEY_PATH,
        CERT_PATH
      });
      
      app.listen(PORT, () => {
        console.log(`[API] Development server listening on http://localhost:${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`📚 API Docs: http://localhost:${PORT}/docs`);
      });
    }
    
  } catch (error: any) {
    console.error('💥 CRITICAL ERROR - Server failed to start:');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      path: error.path,
      name: error.name
    });
    
    // System information
    console.error('🖥️ System Information:', {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    });
    
    console.error('🔧 Environment Check:', {
      'NODE_ENV': process.env.NODE_ENV,
      'PWD': process.env.PWD,
      'HOME': process.env.HOME,
      'USER': process.env.USER
    });
    
    console.error('📁 Current Directory:', process.cwd());
    console.error('📋 Process Arguments:', process.argv);
    
    process.exit(1);
  }
}

// GRACEFUL SHUTDOWN
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
