import { Express } from 'express';
import { Logger } from '../../shared/utils/logger.util';
import { QrController } from './qr.controller';

const MODULE = 'QrModule';

export function setupQrModule(app: Express): void {
  Logger.info(MODULE, 'Mounting QR module');
  const controller = new QrController();
  app.use('/', controller.router);
  Logger.info(MODULE, 'QR module mounted');
}


