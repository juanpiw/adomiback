/**
 * Payments Module
 * Handles appointment checkout flow (separate from subscriptions)
 */
import { Express } from 'express';
import { buildAppointmentCheckoutRoutes } from './routes/appointment-checkout.routes';
import { buildProviderFinancesRoutes } from './routes/provider-finances.routes';
import { buildRefundRoutes } from './routes/refunds.routes';
import { buildClientPaymentMethodsRoutes } from './routes/client-payment-methods.routes';
import { setupPaymentsWebhooks } from './webhooks';

export function setupPaymentsModule(app: Express) {
  // Los webhooks de pagos ya se montaron en app.ts antes de express.json()
  // Solo montar las rutas normales aquí
  app.use('/', buildAppointmentCheckoutRoutes());
  app.use('/', buildProviderFinancesRoutes());
  app.use('/', buildRefundRoutes());
  app.use('/', buildClientPaymentMethodsRoutes());
}

