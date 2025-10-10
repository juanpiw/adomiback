import { Router } from 'express';
import { mountAuth } from '../endpoints/auth';
import { mountHealth } from '../endpoints/health';
import { mountDb } from '../endpoints/db';
import { mountPlans } from '../endpoints/plans';
import { mountSubscriptions } from '../endpoints/subscriptions';
import { mountAccounting } from '../endpoints/accounting';
import { mountFounders } from '../endpoints/founders';
import { mountWebhooks } from '../endpoints/webhooks';
import { mountPlanExpirations } from '../endpoints/plan-expirations';
import { mountVerifications } from '../endpoints/verifications';
import promoRoutes from '../endpoints/promo';
import googleAuthRoutes from '../endpoints/google-auth';
import stripeCheckoutRoutes from '../endpoints/stripe-checkout';
import bookingsRoutes from '../endpoints/bookings';

export const createRouter = () => {
  const router = Router();

  console.log('[ROUTER] Inicializando router...');

  // Montar todos los endpoints
  console.log('[ROUTER] Montando endpoints básicos...');
  mountAuth(router);
  mountHealth(router);
  mountDb(router);
  mountPlans(router);
  mountSubscriptions(router);
  mountAccounting(router);
  mountFounders(router);
  mountWebhooks(router);
  mountPlanExpirations(router);
  mountVerifications(router);
  
  // Montar rutas de promoción
  console.log('[ROUTER] Montando rutas de promoción...');
  router.use('/promo', promoRoutes);
  
  // Montar rutas de Google OAuth
  console.log('[ROUTER] Montando rutas de Google OAuth...');
  router.use('/', googleAuthRoutes);
  
  // Montar rutas de Stripe Checkout
  console.log('[ROUTER] Montando rutas de Stripe Checkout...');
  router.use('/stripe', stripeCheckoutRoutes);

  // Bookings (Sistema de Reservas)
  router.use('/bookings', bookingsRoutes);

  console.log('[ROUTER] Router inicializado exitosamente');
  return router;
};
