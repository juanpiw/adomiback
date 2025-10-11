/**
 * Provider Module
 * Handles all provider-related functionality
 */

import { Express } from 'express';
import { ProviderRoutes } from './routes/provider.routes';

// TODO: Import more routes when implemented
// import { ServicesRoutes } from './routes/services.routes';
// import { PortfolioRoutes } from './routes/portfolio.routes';
// import { AvailabilityRoutes } from './routes/availability.routes';
// import { LocationsRoutes } from './routes/locations.routes';

// TODO: Export services
// export * from './services/profile.service';
// export * from './services/services-management.service';

// TODO: Export types
// export * from './types/provider.types';

/**
 * Setup function to mount provider routes
 * @param app Express application
 */
export function setupProviderModule(app: Express) {
  const providerRoutes = new ProviderRoutes();
  app.use('/', providerRoutes.getRouter());
  console.log('[PROVIDER MODULE] Provider routes mounted');
}

