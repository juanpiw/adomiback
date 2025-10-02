import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createRouter } from './lib/router';
import { mountSwagger } from './lib/swagger';
import { testConnection } from './lib/db';
import { testEmailConnection } from './lib/email';
import { generalRateLimit } from './config/rate-limits';
import { developmentSecurityConfig } from './config/security';
import { developmentCorsConfig, corsLogger } from './config/cors';

const app = express();

// Security headers
app.use(developmentSecurityConfig);

// Rate limiting global
app.use(generalRateLimit);

// CORS
app.use(developmentCorsConfig);
app.use(corsLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('dev'));

// Usar el router principal que incluye todos los endpoints
const api = createRouter();
mountSwagger(app);
app.use('/', api);

const PORT = process.env.PORT || 3000;

// Test database connection and start server
async function startServer() {
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('[API] Failed to connect to database. Please check your .env configuration.');
      process.exit(1);
    }
    
    app.listen(PORT, () => {
      console.log(`[API] listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('[API] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
