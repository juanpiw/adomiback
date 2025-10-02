import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
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
const PORT = process.env.PORT || 3000; // Puerto por defecto para desarrollo

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
    // Temporal: Permitir inicio sin base de datos para probar HTTPS
    const SKIP_DB_CHECK = process.env.SKIP_DB_CHECK === 'true';
    
    if (!SKIP_DB_CHECK) {
      const dbConnected = await testConnection();
      if (!dbConnected) {
        console.error('[API] Failed to connect to database. Please check your .env configuration.');
        console.log('💡 Tip: Set SKIP_DB_CHECK=true in .env to skip database validation');
        process.exit(1);
      }
    } else {
      console.log('⚠️ Skipping database connection check (SKIP_DB_CHECK=true)');
    }
    
    // Si está configurado para producción con HTTPS
    if (Number.isFinite(HTTPS_PORT) && KEY_PATH && CERT_PATH) {
      console.log('🚀 Attempting to start HTTPS server for production...');
      
      // VALIDACIÓN OBLIGATORIA DE HTTPS
      try {
        // Leer certificados SSL
        const httpsServerOptions = {
          key: fs.readFileSync(KEY_PATH),   // Clave privada
          cert: fs.readFileSync(CERT_PATH)  // Certificado público
        };
        
        // Crear servidor HTTPS
        const serverHttps = https.createServer(httpsServerOptions, app);
        
        // Escuchar en puerto HTTPS
        serverHttps.listen(HTTPS_PORT, BIND_IP, () => {
          logEndpoints('https', HTTPS_PORT);
          console.log('✅ HTTPS Server started successfully');
        });
        
        // SERVIDOR HTTP OPCIONAL (para redirección)
        if (Number.isFinite(HTTP_PORT)) {
          try {
            const serverHttp = http.createServer(app);
            serverHttp.listen(HTTP_PORT, BIND_IP, () => {
              logEndpoints('http', HTTP_PORT);
              console.log('✅ HTTP Server started successfully');
            });
          } catch (error: any) {
            console.warn('⚠️ Failed to start HTTP server:', error.message);
          }
        }
        
      } catch (error: any) {
        console.error('❌ Failed to start HTTPS server:', error.message);
        console.log('🔄 Falling back to development HTTP mode...');
        
        // FALLBACK: Modo desarrollo - solo HTTP
        console.log('🔧 Starting development server...');
        app.listen(PORT, () => {
          console.log(`[API] Development server listening on http://localhost:${PORT}`);
          console.log(`📊 Health check: http://localhost:${PORT}/health`);
          console.log(`📚 API Docs: http://localhost:${PORT}/docs`);
        });
      }
      
    } else {
      // Modo desarrollo - solo HTTP
      console.log('🔧 Starting development server...');
      app.listen(PORT, () => {
        console.log(`[API] Development server listening on http://localhost:${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`📚 API Docs: http://localhost:${PORT}/docs`);
      });
    }
    
  } catch (error) {
    console.error('[API] Failed to start server:', error);
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
