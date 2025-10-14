/**
 * Client Module
 * Handles all client-related functionality
 */

import { Express } from 'express';
import { ClientRoutes } from './routes/client.routes';
import { ClientPhotoRoutes } from './routes/client-photo.routes';
import { ClientSearchRoutes } from './routes/client-search.routes';
import { ClientProviderRoutes } from './routes/client-provider.routes';
import { ClientAvailabilitySearchRoutes } from './routes/client-availability-search.routes';
import clientNearbyRoutes from './routes/client-nearby.routes';

/**
 * Setup function to mount client routes
 * @param app Express application
 */
export function setupClientModule(app: Express) {
  const routes = new ClientRoutes();
  app.use('/', routes.getRouter());
  const photoRoutes = new ClientPhotoRoutes();
  app.use('/', photoRoutes.getRouter());
  const searchRoutes = new ClientSearchRoutes();
  app.use('/', searchRoutes.getRouter());
  const providerRoutes = new ClientProviderRoutes();
  app.use('/', providerRoutes.getRouter());
  const availabilitySearchRoutes = new ClientAvailabilitySearchRoutes();
  app.use('/', availabilitySearchRoutes.getRouter());
  // Nearby routes
  app.use('/', clientNearbyRoutes);
  console.log('[CLIENT MODULE] Client routes mounted');
}

