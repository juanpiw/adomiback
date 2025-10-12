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
import { setupProviderModule } from './modules/provider';
import { setupSubscriptionsModule } from './modules/subscriptions';

export function createApp(): Express {
  const app = express();

  // Middleware básicos
  app.use(cors());
  
  // ✅ Middleware específico para webhooks de Stripe (necesita body raw)
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
  
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
  setupProviderModule(app);
  setupSubscriptionsModule(app);
  
  Logger.info('APP', 'All modules loaded successfully');

  return app;
}

