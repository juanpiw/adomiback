console.log('🚀 Adomi Backend - ULTRA MINIMAL MODE (64MB limit)');

import express from 'express';

// Ultra minimal memory monitoring
function logMemory() {
  const used = process.memoryUsage();
  console.log(`🧠 Memory: ${(used.heapUsed / 1024 / 1024).toFixed(1)}MB heap, ${(used.rss / 1024 / 1024).toFixed(1)}MB RSS`);
}

// Force GC
function forceGC() {
  if (global.gc) {
    global.gc();
    console.log('🗑️ GC forced');
  }
}

async function startUltraMinimalServer() {
  try {
    console.log('🧠 Initial Memory:');
    logMemory();
    forceGC();
    
    // Create ultra minimal Express app
    const app = express();
    
    // Only essential middleware
    app.use(express.json({ limit: '100kb' }));
    
    // Single health endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Single test endpoint
    app.get('/api/test', (req, res) => {
      res.json({ message: 'Ultra minimal server running' });
    });
    
    console.log('🧠 Memory after setup:');
    logMemory();
    forceGC();
    
    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Ultra minimal server running on port ${PORT}`);
      console.log('🧠 Final Memory:');
      logMemory();
      
      console.log('📊 Endpoints:');
      console.log(`  - Health: http://0.0.0.0:${PORT}/health`);
      console.log(`  - Test: http://0.0.0.0:${PORT}/api/test`);
    });
    
    // Memory monitoring every 60 seconds
    setInterval(() => {
      logMemory();
      forceGC();
    }, 60000);
    
  } catch (error: any) {
    console.error('💥 Server failed:', error.message);
    logMemory();
    process.exit(1);
  }
}

// Start
startUltraMinimalServer();
