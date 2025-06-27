#!/usr/bin/env node

/**
 * Health check script for verifying deployment
 * Can be used by monitoring systems or CI/CD
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Basic validation function
function validateEnvironment() {
    const required = [
        'TELEGRAM_BOT_TOKEN',
        'OPENAI_API_KEY'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
        console.log(`❌ Missing required environment variables: ${missing.join(', ')}`);
        return false;
    }
    
    console.log('✅ Environment validation passed');
    return true;
}

// Health check function
async function healthCheck(url = 'http://localhost:3000/health') {
    return new Promise((resolve) => {
        try {
            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            
            const req = client.get(url, { timeout: 5000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        console.log('✅ Health check passed');
                        console.log(`📊 Response: ${data}`);
                        resolve(true);
                    } else {
                        console.log(`❌ Health check failed with status: ${res.statusCode}`);
                        resolve(false);
                    }
                });
            });
            
            req.on('timeout', () => {
                console.log('❌ Health check timeout');
                req.destroy();
                resolve(false);
            });
            
            req.on('error', (err) => {
                console.log(`❌ Health check error: ${err.message}`);
                resolve(false);
            });
            
        } catch (err) {
            console.log(`❌ Health check failed: ${err.message}`);
            resolve(false);
        }
    });
}

async function main() {
    console.log('🔍 Running validation and health check...');
    
    // Load environment variables
    require('dotenv').config();
    
    // Validate environment
    const envValid = validateEnvironment();
    
    // If URL provided as argument, do health check
    const url = process.argv[2];
    if (url) {
        console.log(`🌐 Checking health at: ${url}`);
        const healthValid = await healthCheck(url);
        process.exit(envValid && healthValid ? 0 : 1);
    } else {
        // Just validation
        process.exit(envValid ? 0 : 1);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('❌ Script failed:', err.message);
        process.exit(1);
    });
}

module.exports = { validateEnvironment, healthCheck }; 