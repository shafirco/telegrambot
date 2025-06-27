require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const database = require('./config/database');
const bot = require('./bot');
const scheduleService = require('./services/scheduler');
const notificationService = require('./services/notifications');

class Application {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      logger.info('Starting application initialization...');
      
      // Run system validations
      logger.info('Running system validations...');
      const validation = require('./utils/validation');
      const validationResult = await validation.runAllValidations();
      
      if (!validationResult.valid) {
        logger.error('Critical validation issues found:', validationResult.criticalIssues);
        throw new Error(`Validation failed: ${validationResult.criticalIssues.join(', ')}`);
      }
      
      if (validationResult.warnings.length > 0) {
        logger.warn('Validation warnings:', validationResult.warnings);
      }
      
      // Setup middleware
      logger.info('Setting up middleware...');
      this.setupMiddleware();
      logger.info('Middleware setup complete');
      
      // Initialize database
      logger.info('Initializing database...');
      await this.initializeDatabase();
      logger.info('Database initialization complete');
      
      // Setup routes
      logger.info('Setting up routes...');
      this.setupRoutes();
      logger.info('Routes setup complete');
      
      // Initialize bot
      logger.info('Initializing Telegram bot...');
      await this.initializeBot();
      logger.info('Bot initialization complete');
      
      // Start background services
      logger.info('Starting background services...');
      this.startBackgroundServices();
      logger.info('Background services started');
      
      // Setup graceful shutdown
      logger.info('Setting up graceful shutdown handlers...');
      this.setupGracefulShutdown();
      logger.info('Graceful shutdown setup complete');
      
      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  async initializeDatabase() {
    try {
      await database.authenticate();
      await database.sync();
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Unable to connect to the database:', error);
      throw error;
    }
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Webhook endpoint for Telegram
    this.app.use('/webhook', bot.webhookCallback('/webhook'));

    // API routes
    this.app.use('/api', require('./routes/api'));

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      logger.error('Express error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    });
  }

  async initializeBot() {
    try {
      logger.info('Initializing Telegram bot...');
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Webhook URL: ${process.env.WEBHOOK_URL || 'Not set'}`);
      
      // Initialize notification service with bot instance
      notificationService.initialize(bot);
      
      // Always clear webhook first to prevent conflicts
      logger.info('Clearing any existing webhook...');
      try {
        await bot.telegram.deleteWebhook();
        logger.info('Previous webhook cleared');
      } catch (error) {
        logger.warn('Could not clear webhook (might not exist):', error.message);
      }
      
      // Force webhook mode if we're in production or have WEBHOOK_URL
      const useWebhook = process.env.NODE_ENV === 'production' || process.env.WEBHOOK_URL;
      
      if (useWebhook && process.env.WEBHOOK_URL) {
        logger.info('Setting up webhook (production mode)...');
        const webhookUrl = `${process.env.WEBHOOK_URL}/webhook`;
        logger.info(`Setting webhook to: ${webhookUrl}`);
        
        await bot.telegram.setWebhook(webhookUrl, {
          allowed_updates: ['message', 'callback_query', 'inline_query']
        });
        logger.info('Telegram webhook set successfully');
        
        // Verify webhook was set
        try {
          const webhookInfo = await bot.telegram.getWebhookInfo();
          logger.info('Webhook verification:', {
            url: webhookInfo.url,
            has_custom_certificate: webhookInfo.has_custom_certificate,
            pending_update_count: webhookInfo.pending_update_count,
            last_error_date: webhookInfo.last_error_date,
            last_error_message: webhookInfo.last_error_message
          });
        } catch (error) {
          logger.warn('Could not verify webhook:', error.message);
        }
      } else {
        logger.info('Starting bot with polling (development mode)...');
        await bot.launch();
        logger.info('Telegram bot started with polling');
      }
      
      logger.info('Bot initialization method completed');
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
      throw error;
    }
  }

  startBackgroundServices() {
    // Start notification service
    notificationService.start();
    
    // Start scheduler maintenance
    scheduleService.startMaintenance();
    
    logger.info('Background services started');
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop the bot
        bot.stop(signal);
        
        // Stop background services
        notificationService.stop();
        scheduleService.stopMaintenance();
        
        // Close database connection
        await database.close();
        
        // Close the server
        this.server.close(() => {
          logger.info('Server closed');
          process.exit(0);
        });
        
        // Force exit after 10 seconds
        setTimeout(() => {
          logger.error('Forced shutdown after timeout');
          process.exit(1);
        }, 10000);
        
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  async start() {
    logger.info('Starting application...');
    await this.initialize();
    logger.info('Application initialization completed, starting server...');
    
    this.server = this.app.listen(this.port, () => {
      logger.info(`Server is running on port ${this.port}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Process ID: ${process.pid}`);
    });
    
    logger.info('Server listen call completed');
  }
}

// Start the application
const app = new Application();
app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

module.exports = app; 