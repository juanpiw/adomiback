import { Express } from 'express';
import { Logger } from '../../shared/utils/logger.util';
import { QuotesRoutes } from './routes/quotes.routes';

const MODULE = 'QuotesModule';

export function setupQuotesModule(app: Express) {
  Logger.info(MODULE, 'Mounting quotes module');
  const routes = new QuotesRoutes();
  app.use('/', routes.router);
  Logger.info(MODULE, 'Quotes module mounted');
}

