import { Express } from 'express';
import { buildDeviceTokensRoutes } from './routes/device-tokens.routes';

export function setupNotificationsModule(app: Express) {
  app.use('/', buildDeviceTokensRoutes());
}

