/**
 * Server Entry Point (NEW ARCHITECTURE)
 * Starts the Express server with new modular architecture
 */

import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import DatabaseConnection from './shared/database/connection';
import { Logger } from './shared/utils/logger.util';

const PORT = Number(process.env.PORT) || 3001; // Puerto 3001 para no conflicto

async function startServer() {
  try {
    Logger.info('SERVER', 'Starting Adomi Backend (New Architecture)...');

    // Test database connection
    Logger.info('SERVER', 'Testing database connection...');
    const dbConnected = await DatabaseConnection.testConnection();
    
    if (!dbConnected) {
      Logger.warn('SERVER', 'Database connection failed - continuing without DB');
    }

    // Create Express app
    const app = createApp();

    // Start server
    app.listen(PORT, () => {
      Logger.info('SERVER', `Server running on http://localhost:${PORT}`);
      Logger.info('SERVER', `Health check: http://localhost:${PORT}/health`);
      Logger.info('SERVER', `Auth endpoint: http://localhost:${PORT}/auth/login`);
      console.log('\n🚀 Server ready!\n');
    });

  } catch (error: any) {
    Logger.error('SERVER', 'Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  Logger.info('SERVER', 'SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  Logger.info('SERVER', 'SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();

