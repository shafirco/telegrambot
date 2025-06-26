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
      // Setup middleware
      this.setupMiddleware();
      
      // Initialize database
      await this.initializeDatabase();
      
      // Setup routes
      this.setupRoutes();
      
      // Initialize bot
      await this.initializeBot();
      
      // Start background services
      this.startBackgroundServices();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
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
      // Set webhook for production, use polling for development
      if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
        await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook`);
        logger.info('Telegram webhook set successfully');
      } else {
        await bot.launch();
        logger.info('Telegram bot started with polling');
      }
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
    await this.initialize();
    
    this.server = this.app.listen(this.port, () => {
      logger.info(`Server is running on port ${this.port}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Process ID: ${process.pid}`);
    });
  }
}

// Start the application
const app = new Application();
app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

module.exports = app; 