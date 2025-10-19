console.log('🧪 Testing basic Node.js server without any dependencies');

// Test memory usage
function logMemory() {
  const used = process.memoryUsage();
  console.log(`🧠 Memory: ${(used.heapUsed / 1024 / 1024).toFixed(1)}MB heap, ${(used.rss / 1024 / 1024).toFixed(1)}MB RSS`);
}

console.log('🧠 Initial memory:');
logMemory();

// Force GC if available
if (global.gc) {
  global.gc();
  console.log('🗑️ GC forced');
}

// Test basic HTTP server without Express
const http = require('http');

console.log('🧠 Memory after requiring http:');
logMemory();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Basic server is running');
  }
});

console.log('🧠 Memory after creating server:');
logMemory();

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Basic server running on port ${PORT}`);
  console.log('🧠 Final memory:');
  logMemory();
  
  console.log('📊 Available endpoints:');
  console.log(`  - Health: http://0.0.0.0:${PORT}/health`);
  console.log(`  - Any other URL: http://0.0.0.0:${PORT}/anything`);
});

// Memory monitoring every 60 seconds
setInterval(() => {
  logMemory();
  if (global.gc) {
    global.gc();
    console.log('🗑️ GC forced');
  }
}, 60000);








