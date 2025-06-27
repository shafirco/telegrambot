const logger = require('./logger');

/**
 * Validates required environment variables
 */
const validateEnvironment = () => {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'OPENAI_API_KEY'
  ];
  
  const optional = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET', 
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_CALENDAR_ID',
    'WEBHOOK_URL'
  ];
  
  const missing = [];
  const warnings = [];
  
  // Check required variables
  for (const envVar of required) {
    if (!process.env[envVar] || process.env[envVar] === 'your_key_here') {
      missing.push(envVar);
    }
  }
  
  // Check optional but important variables
  for (const envVar of optional) {
    if (!process.env[envVar] || process.env[envVar].includes('your_')) {
      warnings.push(envVar);
    }
  }
  
  // Validate specific formats
  const validations = [
    {
      key: 'TELEGRAM_BOT_TOKEN',
      test: (val) => val && val.includes(':'),
      message: 'TELEGRAM_BOT_TOKEN should contain a colon (:)'
    },
    {
      key: 'OPENAI_API_KEY', 
      test: (val) => val && (val.startsWith('sk-') || val === 'dummy_key_for_testing'),
      message: 'OPENAI_API_KEY should start with sk- or be dummy_key_for_testing'
    },
    {
      key: 'TEACHER_TIMEZONE',
      test: (val) => !val || val === 'Asia/Jerusalem',
      message: 'TEACHER_TIMEZONE should be Asia/Jerusalem for Hebrew bot'
    }
  ];
  
  for (const validation of validations) {
    const value = process.env[validation.key];
    if (value && !validation.test(value)) {
      warnings.push(`${validation.key}: ${validation.message}`);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    warnings,
    summary: missing.length === 0 ? 
      `✅ Environment validation passed. ${warnings.length} warnings.` :
      `❌ Environment validation failed. Missing: ${missing.join(', ')}`
  };
};

/**
 * Validates system configuration for Hebrew/Israeli setup
 */
const validateHebrewConfig = () => {
  const issues = [];
  const settings = require('../config/settings');
  
  // Check timezone
  if (settings.teacher.timezone !== 'Asia/Jerusalem') {
    issues.push('Teacher timezone should be Asia/Jerusalem');
  }
  
  // Check language
  if (settings.teacher.language !== 'he') {
    issues.push('Teacher language should be Hebrew (he)');
  }
  
  // Check business days (should include Hebrew days)
  const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
  const hasHebrewDays = hebrewDays.some(day => 
    settings.businessHours.days.includes(day)
  );
  
  if (!hasHebrewDays) {
    issues.push('Business days should include Hebrew day names');
  }
  
  // Check currency
  if (settings.lessons.currency !== 'ILS') {
    issues.push('Currency should be ILS for Israeli setup');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    summary: issues.length === 0 ?
      '✅ Hebrew configuration is correct' :
      `⚠️ Hebrew configuration issues: ${issues.join(', ')}`
  };
};

/**
 * Validates database connectivity and models
 */
const validateDatabase = async () => {
  try {
    const database = require('../config/database');
    
    // Test connection
    await database.authenticate();
    
    // Test basic query
    await database.query('SELECT 1');
    
    // Check if tables exist (they'll be created by sync)
    const tables = await database.getQueryInterface().showAllTables();
    
    return {
      valid: true,
      tablesCount: tables.length,
      summary: `✅ Database connected successfully. ${tables.length} tables found.`
    };
    
  } catch (error) {
    logger.error('Database validation failed:', error);
    return {
      valid: false,
      error: error.message,
      summary: `❌ Database validation failed: ${error.message}`
    };
  }
};

/**
 * Validates AI functionality
 */
const validateAI = async () => {
  try {
    const aiScheduler = require('../ai/scheduler');
    
    if (!aiScheduler.initialized) {
      return {
        valid: true,
        mode: 'fallback',
        summary: '⚠️ AI running in fallback mode (no OpenAI API key)'
      };
    }
    
    // Test basic AI functionality
    const testResult = await aiScheduler.processSchedulingRequest(
      'בדיקה',
      { id: 'test', name: 'בדיקה', timezone: 'Asia/Jerusalem' }
    );
    
    return {
      valid: true,
      mode: 'ai',
      confidence: testResult.confidence,
      summary: '✅ AI functionality working correctly'
    };
    
  } catch (error) {
    logger.error('AI validation failed:', error);
    return {
      valid: false,
      error: error.message,
      summary: `❌ AI validation failed: ${error.message}`
    };
  }
};

/**
 * Runs all validations and returns summary
 */
const runAllValidations = async () => {
  logger.info('🔍 Running system validations...');
  
  const results = {
    environment: validateEnvironment(),
    hebrew: validateHebrewConfig(),
    database: await validateDatabase(),
    ai: await validateAI()
  };
  
  const allValid = Object.values(results).every(r => r.valid);
  const criticalIssues = [];
  const warnings = [];
  
  Object.entries(results).forEach(([name, result]) => {
    if (!result.valid) {
      criticalIssues.push(`${name}: ${result.summary}`);
    } else if (result.warnings && result.warnings.length > 0) {
      warnings.push(`${name}: ${result.warnings.length} warnings`);
    }
    
    logger.info(`${name}: ${result.summary}`);
  });
  
  const summary = {
    valid: allValid,
    criticalIssues,
    warnings,
    results,
    overallStatus: allValid ? 
      '✅ All validations passed' : 
      `❌ ${criticalIssues.length} critical issues found`
  };
  
  logger.info(`Validation Summary: ${summary.overallStatus}`);
  
  return summary;
};

/**
 * Input sanitization helper
 */
const sanitizeInput = (input, options = {}) => {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  
  const maxLength = options.maxLength || 1000;
  if (input.length > maxLength) {
    throw new Error(`Input too long (max ${maxLength} characters)`);
  }
  
  // Remove potentially harmful content while preserving Hebrew
  let sanitized = input
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/javascript:/gi, '') // Remove javascript URLs
    .replace(/data:/gi, '') // Remove data URLs
    .trim();
  
  if (options.preserveNewlines !== true) {
    sanitized = sanitized.replace(/\n\n+/g, '\n'); // Collapse multiple newlines
  }
  
  if (sanitized.length === 0) {
    throw new Error('Empty input after sanitization');
  }
  
  return sanitized;
};

/**
 * Rate limiting helper
 */
class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 20) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }
  
  isAllowed(identifier) {
    const now = Date.now();
    const key = identifier.toString();
    
    // Clean old entries
    if (this.requests.size > 1000) {
      this.cleanup(now);
    }
    
    const userRequests = this.requests.get(key) || [];
    const validRequests = userRequests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
  
  cleanup(now) {
    for (const [key, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }
}

module.exports = {
  validateEnvironment,
  validateHebrewConfig,
  validateDatabase,
  validateAI,
  runAllValidations,
  sanitizeInput,
  RateLimiter
}; 