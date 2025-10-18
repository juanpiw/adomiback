import { Express } from 'express';
import { buildDeviceTokensRoutes } from './routes/device-tokens.routes';

export function setupNotificationsModule(app: Express) {
  app.use('/', buildDeviceTokensRoutes());
}

/**
 * Notifications Module
 * Handles system notifications and push notifications
 */

// TODO: Import and export routes when implemented

/**
 * Setup function to mount notifications routes
 * @param app Express application
 */
export function setupNotificationsModule(app: any) {
  // TODO: Implement when routes are ready
  console.log('[NOTIFICATIONS MODULE] Module structure ready - awaiting implementation');
}

