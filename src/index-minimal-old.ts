console.log('🚀 Adomi Backend - Minimal Mode Starting...');

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

// Minimal memory monitoring
function logMemoryUsage() {
  const used = process.memoryUsage();
  const formatBytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
  
  console.log('🧠 Memory:', {
    heapUsed: `${formatBytes(used.heapUsed)} MB`,
    heapTotal: `${formatBytes(used.heapTotal)} MB`,
    rss: `${formatBytes(used.rss)} MB`
  });
}

// Force garbage collection
function forceGC() {
  if (global.gc) {
    global.gc();
    console.log('🗑️ GC forced');
  }
}

async function startMinimalServer() {
  try {
    console.log('🧠 Initial Memory:');
    logMemoryUsage();
    
    // Force initial cleanup
    forceGC();
    
    // Create minimal Express app
    const app = express();
    
    // Minimal middleware
    app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));
    
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Basic API endpoint
    app.get('/api/test', (req, res) => {
      res.json({ message: 'Minimal server is running' });
    });
    
    // Memory check after setup
    console.log('🧠 Memory after setup:');
    logMemoryUsage();
    forceGC();
    
    // Get port from environment
    const PORT = Number(process.env.PORT) || 3000;
    const BIND_IP = process.env.IP || '0.0.0.0';
    
    // Start server
    app.listen(PORT, BIND_IP, () => {
      console.log(`✅ Minimal server running on ${BIND_IP}:${PORT}`);
      console.log('🧠 Final Memory:');
      logMemoryUsage();
      
      console.log('📊 Available endpoints:');
      console.log(`  - Health: http://${BIND_IP}:${PORT}/health`);
      console.log(`  - Test API: http://${BIND_IP}:${PORT}/api/test`);
    });
    
    // Memory monitoring every 30 seconds
    setInterval(() => {
      logMemoryUsage();
      forceGC();
    }, 30000);
    
  } catch (error: any) {
    console.error('💥 Server failed to start:', error.message);
    console.error('🧠 Memory at failure:');
    logMemoryUsage();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the minimal server
startMinimalServer();
