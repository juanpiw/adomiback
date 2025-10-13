console.log('🔍 Memory Debug - Analyzing what consumes memory');

import dotenv from 'dotenv';
dotenv.config();

// Memory monitoring
function logMemory(label: string) {
  const used = process.memoryUsage();
  console.log(`🧠 ${label}:`, {
    heapUsed: `${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(used.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    external: `${(used.external / 1024 / 1024).toFixed(2)} MB`,
    rss: `${(used.rss / 1024 / 1024).toFixed(2)} MB`
  });
}

// Force GC
function forceGC() {
  if (global.gc) {
    global.gc();
    console.log('🗑️ GC forced');
  }
}

async function debugMemory() {
  try {
    console.log('🔍 Starting memory debug...');
    logMemory('Initial');
    forceGC();
    
    console.log('📦 Testing imports one by one...');
    
    // Test dotenv
    logMemory('After dotenv');
    
    // Test express
    console.log('Importing express...');
    const express = await import('express');
    logMemory('After express import');
    forceGC();
    
    // Test cors
    console.log('Importing cors...');
    const cors = await import('cors');
    logMemory('After cors import');
    forceGC();
    
    // Test morgan
    console.log('Importing morgan...');
    const morgan = await import('morgan');
    logMemory('After morgan import');
    forceGC();
    
    // Test mysql2
    console.log('Importing mysql2...');
    const mysql = await import('mysql2/promise');
    logMemory('After mysql2 import');
    forceGC();
    
    // Test sharp (this is likely the culprit)
    console.log('Importing sharp...');
    const sharp = await import('sharp');
    logMemory('After sharp import');
    forceGC();
    
    // Test swagger
    console.log('Importing swagger...');
    const swagger = await import('swagger-ui-express');
    logMemory('After swagger import');
    forceGC();
    
    // Test nodemailer
    console.log('Importing nodemailer...');
    const nodemailer = await import('nodemailer');
    logMemory('After nodemailer import');
    forceGC();
    
    // Test stripe
    console.log('Importing stripe...');
    const stripe = await import('stripe');
    logMemory('After stripe import');
    forceGC();
    
    console.log('🔍 Memory debug completed');
    logMemory('Final');
    
  } catch (error: any) {
    console.error('💥 Error during debug:', error.message);
    logMemory('At error');
    process.exit(1);
  }
}

debugMemory();





