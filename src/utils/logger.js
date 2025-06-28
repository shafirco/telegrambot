const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = './logs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}] ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'telegram-scheduler-bot' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true
    }),
    
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true
    })
  ],
  exitOnError: false
});

// Add specialized bot logging
logger.botLog = (level, userId, username, message, metadata = {}) => {
  // Convert 'text_message' to 'info' since it's not a valid winston level
  const logLevel = level === 'text_message' ? 'info' : level;
  
  logger.log(logLevel, `BOT [${userId}@${username || 'unknown'}]: ${message}`, {
    type: 'bot_interaction',
    userId,
    username,
    originalLevel: level,
    ...metadata
  });
};

// Add AI-specific logging
logger.aiLog = (action, prompt, response, metadata = {}) => {
  logger.info(`AI ${action}`, {
    type: 'ai_interaction',
    prompt: prompt?.substring(0, 100) + (prompt?.length > 100 ? '...' : ''),
    response: response?.substring(0, 100) + (response?.length > 100 ? '...' : ''),
    ...metadata
  });
};

// Log start-up info
logger.info('Logger initialized', {
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development'
});

// Add method for logging scheduling events
logger.scheduleLog = (event, details, metadata = {}) => {
  logger.info(`Schedule ${event}`, {
    ...details,
    ...metadata,
    type: 'schedule_event'
  });
};

// Add method for logging calendar events
logger.calendarLog = (action, details, metadata = {}) => {
  logger.info(`Calendar ${action}`, {
    ...details,
    ...metadata,
    type: 'calendar_event'
  });
};

// Add method for logging messages
logger.messageLog = (action, details, metadata = {}) => {
  logger.info(`Message ${action}`, {
    ...details,
    ...metadata,
    type: 'message_event'
  });
};

// Development logging helpers
if (process.env.NODE_ENV === 'development') {
  logger.debug = (message, meta) => {
    logger.log('debug', message, meta);
  };
}

module.exports = logger; 