import { Express } from 'express';
import { buildDeviceTokensRoutes } from './routes/device-tokens.routes';
import { buildNotificationsRoutes } from './routes/notifications.routes';

export function setupNotificationsModule(app: Express) {
  app.use('/', buildDeviceTokensRoutes());
  app.use('/', buildNotificationsRoutes());
}

