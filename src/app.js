require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const database = require('./config/database');
const bot = require('./bot');
const scheduleService = require('./services/scheduler');
const notificationService = require('./services/notifications');
const settings = require('./config/settings');

// Import models to initialize associations
require('./models');

// Import services
const calendarService = require('./services/calendar');
const TeacherAvailability = require('./models/TeacherAvailability');

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
      
      // Initialize teacher availability
      await this.initializeTeacherAvailability();
      
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
      
      // Run any pending migrations
      try {
        const { migrateDatabase } = require('../scripts/migrate-database');
        await migrateDatabase();
        logger.info('Database migrations completed');
      } catch (migrationError) {
        logger.warn('Migration failed (this may be expected if columns already exist):', migrationError.message);
      }
      
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
    
    // Start calendar sync every 5 minutes
    this.startCalendarSync();
    
    logger.info('Background services started');
  }

  startCalendarSync() {
    try {
      // Initial sync
      setImmediate(async () => {
        try {
          await calendarService.syncCalendarEvents();
          logger.info('Initial calendar sync completed');
        } catch (error) {
          logger.error('Initial calendar sync failed:', error);
        }
      });

      // Set up periodic sync every 5 minutes
      this.calendarSyncInterval = setInterval(async () => {
        try {
          await calendarService.syncCalendarEvents();
          logger.info('Periodic calendar sync completed');
        } catch (error) {
          logger.error('Periodic calendar sync failed:', error);
        }
      }, 5 * 60 * 1000); // 5 minutes

      logger.info('Calendar sync service started (running every 5 minutes)');
    } catch (error) {
      logger.error('Failed to start calendar sync service:', error);
    }
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
        
        // Stop calendar sync
        if (this.calendarSyncInterval) {
          clearInterval(this.calendarSyncInterval);
          logger.info('Calendar sync service stopped');
        }
        
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

  /**
   * Initialize teacher availability if not exists
   */
  async initializeTeacherAvailability() {
    try {
      // Check if we have any teacher availability records
      const existingRecords = await TeacherAvailability.count();
      
      if (existingRecords === 0) {
        logger.info('Creating default teacher availability records...');
        
        // Create availability for business days (Sunday to Thursday)
        const businessDays = [
          { name: 'sunday', hebrew: 'ראשון' },
          { name: 'monday', hebrew: 'שני' },
          { name: 'tuesday', hebrew: 'שלישי' },
          { name: 'wednesday', hebrew: 'רביעי' },
          { name: 'thursday', hebrew: 'חמישי' }
        ];
        
        for (const day of businessDays) {
          await TeacherAvailability.create({
            schedule_type: 'recurring',
            day_of_week: day.name,
            start_time: settings.businessHours.start + ':00',
            end_time: settings.businessHours.end + ':00',
            is_available: true,
            status: 'active',
            min_lesson_duration: 30,
            max_lesson_duration: 120,
            buffer_after: 15,
            price_per_hour: settings.lessons.defaultPrice,
            description: `זמינות רגילה ליום ${day.hebrew}`,
            priority: 1
          });
        }
        
        logger.info(`Created availability records for ${businessDays.length} business days`);
      }
    } catch (error) {
      logger.error('Error initializing teacher availability:', error);
    }
  }
}

// Start the application
const app = new Application();
app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

module.exports = app; 