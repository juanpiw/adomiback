/**
 * Payments Module
 * Handles appointment checkout flow (separate from subscriptions)
 */
import { Express } from 'express';
import { buildAppointmentCheckoutRoutes } from './routes/appointment-checkout.routes';
import { setupPaymentsWebhooks } from './webhooks';

export function setupPaymentsModule(app: Express) {
  // Webhooks de pagos de citas: requieren raw body antes de express.json.
  // Ya que el app.ts monta subscriptions webhook antes de json,
  // si necesitamos raw aquí, habría que moverlo. Por ahora Stripe CLI puede apuntar a /webhooks/stripe-appointments directamente.
  setupPaymentsWebhooks(app);
  app.use('/', buildAppointmentCheckoutRoutes());
}

