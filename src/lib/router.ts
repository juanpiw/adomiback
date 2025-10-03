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

export const createRouter = () => {
  const router = Router();

  // Montar todos los endpoints
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
  router.use('/promo', promoRoutes);

  return router;
};
