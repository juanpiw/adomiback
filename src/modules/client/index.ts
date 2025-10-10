/**
 * Client Module
 * Handles all client-related functionality
 */

import { Express } from 'express';
import { ClientRoutes } from './routes/client.routes';

/**
 * Setup function to mount client routes
 * @param app Express application
 */
export function setupClientModule(app: Express) {
  const routes = new ClientRoutes();
  app.use('/', routes.getRouter());
  console.log('[CLIENT MODULE] Client routes mounted');
}

