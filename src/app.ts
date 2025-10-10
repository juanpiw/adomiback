/**
 * Express Application Setup
 * Configures Express with middleware and modules
 */

import express, { Express } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { setupAuthModule } from './modules/auth';
import { Logger } from './shared/utils/logger.util';
import { setupClientModule } from './modules/client';
import { createRouter } from './lib-old/router';

export function createApp(): Express {
  const app = express();

  // Middleware básicos
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Servir archivos estáticos (uploads de imágenes)
  app.use('/uploads', express.static('uploads'));
  Logger.info('APP', 'Serving static files from /uploads');
  
  app.use(morgan('dev'));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Setup modules
  Logger.info('APP', 'Setting up modules...');
  setupAuthModule(app);
  setupClientModule(app);
  // Montar router legacy (planes, stripe checkout, google old, etc.)
  app.use('/', createRouter());
  
  Logger.info('APP', 'All modules loaded successfully');

  return app;
}

