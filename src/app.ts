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
import { setupPromotionsModule } from './modules/promotions';
import { setupReviewsModule } from './modules/reviews';
import { setupFavoritesModule } from './modules/favorites';
import { EmailService } from './shared/services/email.service';

export function createApp(): Express {
  const app = express();

  // Middleware básicos
  app.use(cors());
  app.use(morgan('dev'));
  
  // ✅ CRÍTICO: Montar los webhooks de Stripe ANTES de express.json()
  // Unificamos el webhook en el módulo de payments para respuesta 2xx inmediata
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

  // Debug: send test email (secured via token)
  app.get('/debug/send-test-email', async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!process.env.DEBUG_EMAIL_TOKEN || token !== process.env.DEBUG_EMAIL_TOKEN) {
        return res.status(403).json({ success: false, error: 'forbidden' });
      }

      const to = String(req.query.to || process.env.SMTP_USER || process.env.FROM_EMAIL || '');
      if (!to) return res.status(400).json({ success: false, error: 'to is required' });

      const subject = `Adomi SMTP Test ${new Date().toISOString()}`;
      const html = `<div style="font-family:system-ui;padding:16px"><h3>Adomi SMTP Test</h3><p>Fecha: ${new Date().toLocaleString()}</p><p>Este es un correo de prueba para validar la configuración SMTP.</p></div>`;

      await EmailService.sendRaw(to, subject, html);
      return res.json({ success: true, to, subject });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'send error' });
    }
  });

  // Debug: list recent stripe events (secured via token)
  app.get('/debug/stripe-events', async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!process.env.DEBUG_EMAIL_TOKEN || token !== process.env.DEBUG_EMAIL_TOKEN) {
        return res.status(403).json({ success: false, error: 'forbidden' });
      }
      const limit = Math.min(Number(req.query.limit || 50), 200);
      const pool = (await import('./shared/database/connection')).default.getPool();
      const [rows] = await pool.query(
        `SELECT event_id, event_type, status, delivered_at, processed_at, LEFT(payload_hash, 8) as payload_hash_short
         FROM stripe_events ORDER BY delivered_at DESC LIMIT ?`,
        [limit]
      );
      return res.json({ success: true, events: rows });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e?.message || 'query error' });
    }
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
  // 🔗 NUEVO: montar módulos de Reviews y Favorites
  Logger.info('APP', 'Mounting Reviews and Favorites modules...');
  setupReviewsModule(app);
  setupFavoritesModule(app);
  setupPromotionsModule(app);
  setupNotificationsModule(app);
  
  Logger.info('APP', 'All modules loaded successfully');

  // Endpoint de depuración para listar rutas en ejecución
  app.get('/__debug/routes', (_req, res) => {
    try {
      const stack: any[] = (app as any)?._router?.stack || [];
      const routes: Array<{ method: string; path: string }> = [];
      const collect = (layer: any, prefix = '') => {
        if (layer.route && layer.route.path) {
          const methods = Object.keys(layer.route.methods || {}).filter((k) => layer.route.methods[k]);
          routes.push({ method: (methods.join(',') || 'ALL').toUpperCase(), path: prefix + layer.route.path });
        } else if (layer.name === 'router' && layer.handle?.stack) {
          layer.handle.stack.forEach((l: any) => collect(l, prefix));
        }
      };
      stack.forEach((l) => collect(l));
      res.json({ success: true, total: routes.length, routes });
    } catch (err) {
      res.status(500).json({ success: false, error: 'cannot inspect routes' });
    }
  });

  return app;
}

