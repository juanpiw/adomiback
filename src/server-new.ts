/**
 * Server Entry Point (NEW ARCHITECTURE)
 * Starts the Express server with new modular architecture
 */

import dotenv from 'dotenv';
dotenv.config();

import https from 'https';
import http from 'http';
import fs from 'fs';
import { createApp } from './app';
import { Server as SocketIOServer } from 'socket.io';
import DatabaseConnection from './shared/database/connection';
import { Logger } from './shared/utils/logger.util';

// Configuration
const BIND_IP = process.env.IP || '0.0.0.0';
const HTTP_PORT = process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : null;
let HTTPS_PORT = process.env.HTTPS_PORT ? Number(process.env.HTTPS_PORT) : null;
const KEY_PATH = process.env.KEY_PATH;
const CERT_PATH = process.env.CERT_PATH;
const PORT = Number(process.env.PORT) || 3001;

function logEndpoints(proto: string, port: number) {
  const host = BIND_IP === '0.0.0.0' ? 'localhost' : BIND_IP;
  const base = `${proto}://${host}:${port}`;
  Logger.info('SERVER', `${proto.toUpperCase()} server listening on ${base}`);
  Logger.info('SERVER', `Health check: ${base}/health`);
  Logger.info('SERVER', `Auth endpoint: ${base}/auth/login`);
}

async function startServer() {
  try {
    Logger.info('SERVER', 'Starting Adomi Backend (New Architecture)...');
    Logger.info('SERVER', 'Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      IP: BIND_IP,
      HTTP_PORT: HTTP_PORT || 'Not set',
      HTTPS_PORT: HTTPS_PORT || 'Not set',
      KEY_PATH: KEY_PATH ? 'Set' : 'Not set',
      CERT_PATH: CERT_PATH ? 'Set' : 'Not set',
      DB_HOST: process.env.DB_HOST
    });

    // Test database connection
    const SKIP_DB_CHECK = process.env.SKIP_DB_CHECK === 'true';
    
    if (!SKIP_DB_CHECK) {
      Logger.info('SERVER', 'Testing database connection...');
      const dbConnected = await DatabaseConnection.testConnection();
      
      if (!dbConnected) {
        Logger.warn('SERVER', 'Database connection failed - continuing without DB');
      }
    } else {
      Logger.warn('SERVER', 'Skipping database connection check (SKIP_DB_CHECK=true)');
    }

    // Create Express app
    const app = createApp();

    // Si hay certificados y no se definió HTTPS_PORT, asumir 443
    if (!Number.isFinite(HTTPS_PORT) && KEY_PATH && CERT_PATH) {
      Logger.info('SERVER', 'Certificates present but HTTPS_PORT missing. Defaulting to 443');
      HTTPS_PORT = 443;
    }

    // HTTPS Server (Production)
    if (Number.isFinite(HTTPS_PORT) && KEY_PATH && CERT_PATH) {
      try {
        Logger.info('SERVER', 'Starting HTTPS server for production...');
        Logger.info('SERVER', 'HTTPS Configuration:', {
          HTTPS_PORT,
          KEY_PATH,
          CERT_PATH,
          BIND_IP
        });
        
        // Verificar si los archivos existen
        if (!fs.existsSync(KEY_PATH)) {
          throw new Error(`SSL Key file not found: ${KEY_PATH}`);
        }
        if (!fs.existsSync(CERT_PATH)) {
          throw new Error(`SSL Certificate file not found: ${CERT_PATH}`);
        }
        
        Logger.info('SERVER', 'SSL certificate files found and validated');
        
        // Leer certificados SSL
        const httpsServerOptions = {
          key: fs.readFileSync(KEY_PATH),
          cert: fs.readFileSync(CERT_PATH)
        };
        
        // Crear servidor HTTPS
        const serverHttps = https.createServer(httpsServerOptions, app);
        // Socket.io over HTTPS
        const ioHttps = new SocketIOServer(serverHttps, {
          path: '/socket.io',
          cors: {
            origin: '*',
            methods: ['GET', 'POST']
          }
        });
        ioHttps.on('connection', (socket) => {
          Logger.info('SOCKET', `Client connected (HTTPS): ${socket.id}`);
          socket.on('join', (payload: any) => {
            const room = payload?.conversationId ? `conversation:${payload.conversationId}` : null;
            if (room) socket.join(room);
          });
          socket.on('disconnect', () => {
            Logger.info('SOCKET', `Client disconnected (HTTPS): ${socket.id}`);
          });
        });
        
        // Escuchar en puerto HTTPS
        serverHttps.listen(HTTPS_PORT, BIND_IP, () => {
          logEndpoints('https', HTTPS_PORT!);
          Logger.info('SERVER', '✅ HTTPS Server started successfully');
          console.log('\n🚀 Server ready!\n');
        });
        
        // SERVIDOR HTTP OPCIONAL (para redirección)
        if (Number.isFinite(HTTP_PORT)) {
          Logger.info('SERVER', `Starting HTTP server on port ${HTTP_PORT}...`);
          const serverHttp = http.createServer(app);
          // Socket.io over HTTP (dev/redirect)
          const ioHttp = new SocketIOServer(serverHttp, {
            path: '/socket.io',
            cors: {
              origin: '*',
              methods: ['GET', 'POST']
            }
          });
          ioHttp.on('connection', (socket) => {
            Logger.info('SOCKET', `Client connected (HTTP): ${socket.id}`);
            socket.on('join', (payload: any) => {
              const room = payload?.conversationId ? `conversation:${payload.conversationId}` : null;
              if (room) socket.join(room);
            });
            socket.on('disconnect', () => {
              Logger.info('SOCKET', `Client disconnected (HTTP): ${socket.id}`);
            });
          });
          serverHttp.listen(HTTP_PORT, BIND_IP, () => {
            logEndpoints('http', HTTP_PORT!);
            Logger.info('SERVER', '✅ HTTP Server started successfully');
          });
        }
        
      } catch (error: any) {
        Logger.error('SERVER', 'Failed to start HTTPS server', error);
        Logger.warn('SERVER', 'Falling back to HTTP mode...');
        
        // Fallback: Modo desarrollo - solo HTTP
        app.listen(PORT, () => {
          logEndpoints('http', PORT);
          Logger.warn('SERVER', 'Running in HTTP fallback mode');
          console.log('\n🚀 Server ready (HTTP fallback)!\n');
        });
      }
      
    } else {
      // Development mode - HTTP only
      Logger.info('SERVER', 'Starting development server (HTTP only)...');
      Logger.info('SERVER', 'HTTPS Config Check:', {
        'HTTPS_PORT is set': Number.isFinite(HTTPS_PORT),
        'KEY_PATH exists': !!KEY_PATH,
        'CERT_PATH exists': !!CERT_PATH
      });
      
      const serverHttp = app.listen(PORT, () => {
        logEndpoints('http', PORT);
        console.log('\n🚀 Server ready!\n');
      });
      // Socket.io (dev HTTP only)
      const ioHttp = new SocketIOServer(serverHttp, {
        path: '/socket.io',
        cors: { origin: '*', methods: ['GET', 'POST'] }
      });
      ioHttp.on('connection', (socket) => {
        Logger.info('SOCKET', `Client connected (HTTP-dev): ${socket.id}`);
        socket.on('join', (payload: any) => {
          const room = payload?.conversationId ? `conversation:${payload.conversationId}` : null;
          if (room) socket.join(room);
        });
        socket.on('disconnect', () => {
          Logger.info('SOCKET', `Client disconnected (HTTP-dev): ${socket.id}`);
        });
      });
    }

  } catch (error: any) {
    Logger.error('SERVER', 'Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  Logger.info('SERVER', 'SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  Logger.info('SERVER', 'SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();

