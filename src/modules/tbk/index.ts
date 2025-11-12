import { Express } from 'express';
import { Logger } from '../../shared/utils/logger.util';
import tbkOnboardingRoutes from './routes/tbk-onboarding.routes';
import tbkMallRoutes from './routes/tbk-mall.routes';

const MODULE = 'TBK_MODULE';

export function setupTbkModule(app: Express) {
  app.use('/', tbkOnboardingRoutes);
  app.use('/', tbkMallRoutes);
  Logger.info(MODULE, 'TBK routes mounted (onboarding + mall transactions)');
}







