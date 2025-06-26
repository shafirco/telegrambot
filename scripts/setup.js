#!/usr/bin/env node

require('dotenv').config();
const { syncDatabase } = require('../src/models');
const { TeacherAvailability } = require('../src/models');
const logger = require('../src/utils/logger');
const fs = require('fs');
const path = require('path');

async function createDataDirectory() {
  const dataDir = './data';
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info('Created data directory');
  }
}

async function setupDatabase() {
  try {
    logger.info('Setting up database...');
    await syncDatabase();
    logger.info('Database setup completed');
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
}

async function createDefaultAvailability() {
  try {
    logger.info('Creating default teacher availability...');
    
    const existingAvailability = await TeacherAvailability.count();
    if (existingAvailability > 0) {
      logger.info('Teacher availability already exists, skipping...');
      return;
    }

    // Create default weekly schedule (Monday to Friday, 9 AM to 6 PM)
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    
    for (const day of weekdays) {
      await TeacherAvailability.create({
        schedule_type: 'recurring',
        day_of_week: day,
        start_time: '09:00:00',
        end_time: '18:00:00',
        is_available: true,
        status: 'active',
        title: `${day.charAt(0).toUpperCase() + day.slice(1)} Office Hours`,
        description: 'Regular teaching hours',
        min_lesson_duration: 30,
        max_lesson_duration: 120,
        buffer_before: 15,
        buffer_after: 15
      });
    }

    logger.info('Default teacher availability created');
    
  } catch (error) {
    logger.error('Failed to create default availability:', error);
    throw error;
  }
}

async function createEnvFileIfNotExists() {
  const envPath = './.env';
  const envExamplePath = './env.example';
  
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    logger.info('Created .env file from template');
    logger.warn('Please update .env file with your actual API keys and configuration');
  }
}

async function validateEnvironment() {
  const requiredVars = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.warn(`Missing required environment variables: ${missingVars.join(', ')}`);
    logger.warn('Please update your .env file with the required API keys');
  } else {
    logger.info('Environment variables validated');
  }
}

async function main() {
  try {
    console.log('🚀 Setting up Telegram AI Scheduler Bot...\n');
    
    // Step 1: Create necessary directories
    await createDataDirectory();
    
    // Step 2: Create .env file if needed
    await createEnvFileIfNotExists();
    
    // Step 3: Validate environment
    await validateEnvironment();
    
    // Step 4: Setup database
    await setupDatabase();
    
    // Step 5: Create default teacher availability
    await createDefaultAvailability();
    
    console.log('\n✅ Setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Update your .env file with actual API keys');
    console.log('2. Run "npm start" to start the bot');
    console.log('3. Message your bot on Telegram to test it');
    
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.log('\n🤖 To create a Telegram bot:');
      console.log('1. Message @BotFather on Telegram');
      console.log('2. Send /newbot and follow instructions');
      console.log('3. Copy the bot token to TELEGRAM_BOT_TOKEN in .env');
    }
    
    if (!process.env.OPENAI_API_KEY) {
      console.log('\n🧠 To get OpenAI API key:');
      console.log('1. Go to https://platform.openai.com/');
      console.log('2. Create an account and get API key');
      console.log('3. Copy the key to OPENAI_API_KEY in .env');
    }

  } catch (error) {
    logger.error('Setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  main();
}

module.exports = { main }; 