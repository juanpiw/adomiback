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
import { setupChatModule } from './modules/chat';
import { setupAppointmentsModule } from './modules/appointments';
import { setupPaymentsModule } from './modules/payments';
import { setupNotificationsModule } from './modules/notifications';

export function createApp(): Express {
  const app = express();

  // Middleware básicos
  app.use(cors());
  app.use(morgan('dev'));
  
  // ✅ CRÍTICO: Montar SOLO los webhooks de Stripe ANTES de express.json()
  // Los webhooks necesitan el body raw para verificar la firma
  // Esto se hace llamando setupSubscriptionsModule con un flag especial
  setupSubscriptionsModule(app, true); // true = solo webhook
  
  // También montar webhook de pagos de citas antes de express.json()
  const { setupPaymentsWebhooks } = require('./modules/payments/webhooks');
  setupPaymentsWebhooks(app);
  
  // Parsear JSON para el resto de rutas
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Servir archivos estáticos (uploads de imágenes)
  app.use('/uploads', express.static('uploads'));
  Logger.info('APP', 'Serving static files from /uploads');

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Setup módulos (ahora sí con JSON parseado)
  Logger.info('APP', 'Setting up modules...');
  setupAuthModule(app);
  setupClientModule(app);
  setupProviderModule(app);
  setupSubscriptionsModule(app, false); // false = rutas normales (sin webhook)
  setupChatModule(app);
  setupAppointmentsModule(app);
  setupPaymentsModule(app);
  setupNotificationsModule(app);
  
  Logger.info('APP', 'All modules loaded successfully');

  return app;
}

