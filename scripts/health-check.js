#!/usr/bin/env node

/**
 * Health check script for verifying deployment
 * Can be used by monitoring systems or CI/CD
 */

const http = require('http');
const https = require('https');

const APP_URL = process.env.HEALTH_CHECK_URL || process.env.WEBHOOK_URL || 'http://localhost:3000';
const TIMEOUT = 10000; // 10 seconds

console.log('🔍 Running health check...');
console.log(`Target URL: ${APP_URL}`);

async function checkHealth() {
  try {
    // Parse URL
    const url = new URL(APP_URL.endsWith('/health') ? APP_URL : `${APP_URL}/health`);
    const client = url.protocol === 'https:' ? https : http;
    
    return new Promise((resolve, reject) => {
      const request = client.get(url, { timeout: TIMEOUT }, (response) => {
        let data = '';
        
        response.on('data', chunk => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              status: response.statusCode,
              data: result,
              success: response.statusCode === 200
            });
          } catch (parseError) {
            resolve({
              status: response.statusCode,
              data: data,
              success: false,
              error: 'Invalid JSON response'
            });
          }
        });
      });
      
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
      
      request.on('error', reject);
    });
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function runHealthCheck() {
  const startTime = Date.now();
  
  try {
    const result = await checkHealth();
    const duration = Date.now() - startTime;
    
    console.log(`⏱️  Response time: ${duration}ms`);
    
    if (result.success) {
      console.log('✅ Health check passed!');
      console.log('📊 Server status:', result.data);
      
      // Additional checks
      if (result.data.uptime) {
        console.log(`⏰ Server uptime: ${Math.round(result.data.uptime)}s`);
      }
      
      process.exit(0);
    } else {
      console.log('❌ Health check failed!');
      console.log('📄 Response:', result);
      process.exit(1);
    }
    
  } catch (error) {
    console.log('💥 Health check error:', error.message);
    process.exit(1);
  }
}

// Run the health check
runHealthCheck(); 