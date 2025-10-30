/**
 * Provider Module
 * Handles all provider-related functionality
 */

import { Express } from 'express';
import { ProviderRoutes } from './routes/provider.routes';
import providerServicesRoutes from './routes/provider-services.routes';
import providerPortfolioRoutes from './routes/provider-portfolio.routes';
import providerLocationsRoutes from './routes/provider-locations.routes';
import providerAvailabilityRoutes from './routes/provider-availability.routes';
import providerUploadRoutes from './routes/provider-upload.routes';
import providerStripeConnectRoutes from './routes/provider-stripe-connect.routes';
import providerBillingRoutes from './routes/provider-billing.routes';
import providerIncomeGoalsRoutes from './routes/provider-income-goals.routes';
import providerAnalyticsRoutes from './routes/provider-analytics.routes';

/**
 * Setup function to mount provider routes
 * @param app Express application
 */
export function setupProviderModule(app: Express) {
  // Rutas principales de provider (profile)
  const providerRoutes = new ProviderRoutes();
  app.use('/', providerRoutes.getRouter());
  console.log('[PROVIDER MODULE] Provider profile routes mounted');

  // Rutas de servicios
  app.use('/', providerServicesRoutes);
  console.log('[PROVIDER MODULE] Provider services routes mounted');

  // Rutas de portafolio
  app.use('/', providerPortfolioRoutes);
  console.log('[PROVIDER MODULE] Provider portfolio routes mounted');

  // Rutas de ubicaciones y disponibilidad
  app.use('/', providerLocationsRoutes);
  console.log('[PROVIDER MODULE] Provider locations & availability routes mounted');

  // Rutas de disponibilidad (bloques y excepciones)
  app.use('/', providerAvailabilityRoutes);
  console.log('[PROVIDER MODULE] Provider weekly availability & exceptions routes mounted');

  // Rutas de upload de archivos
  app.use('/', providerUploadRoutes);
  console.log('[PROVIDER MODULE] Provider upload routes mounted');

  // Rutas de Stripe Connect (onboarding, dashboard)
  try {
    app.use('/', providerStripeConnectRoutes);
    console.log('[PROVIDER MODULE] Provider Stripe Connect routes mounted');
  } catch (e) {
    console.warn('[PROVIDER MODULE] Stripe Connect routes not mounted', e);
  }

  // Rutas de billing del proveedor (setup intent, deudas)
  try {
    app.use('/', providerBillingRoutes);
    console.log('[PROVIDER MODULE] Provider billing routes mounted');
  } catch (e) {
    console.warn('[PROVIDER MODULE] Provider billing routes not mounted', e);
  }

  // Rutas de metas de ingresos
  try {
    app.use('/', providerIncomeGoalsRoutes);
    console.log('[PROVIDER MODULE] Provider income goals routes mounted');
  } catch (e) {
    console.warn('[PROVIDER MODULE] Provider income goals routes not mounted', e);
  }

  try {
    app.use('/', providerAnalyticsRoutes);
    console.log('[PROVIDER MODULE] Provider analytics routes mounted');
  } catch (e) {
    console.warn('[PROVIDER MODULE] Provider analytics routes not mounted', e);
  }
}

