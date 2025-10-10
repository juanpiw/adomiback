/**
 * Auth Module
 * Handles authentication, authorization, and user management
 */

import { Express } from 'express';
import { AuthRoutes } from './routes/auth.routes';
import { Logger } from '../../shared/utils/logger.util';

// Export services
export * from './services/auth.service';

// Export repositories
export * from './repositories/users.repository';
export * from './repositories/refresh-tokens.repository';
export * from './repositories/password-reset.repository';

/**
 * Setup function to mount auth routes
 * @param app Express application
 */
export function setupAuthModule(app: Express) {
  const authRoutes = new AuthRoutes();
  app.use('/auth', authRoutes.getRouter());
  
  Logger.info('AUTH_MODULE', 'Auth module loaded and routes mounted on /auth');
}

