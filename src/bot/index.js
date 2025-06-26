const { Telegraf, session } = require('telegraf');
const logger = require('../utils/logger');
const { Student } = require('../models');
const settings = require('../config/settings');

// Import handlers
const commandHandlers = require('./commands');
const messageHandlers = require('./handlers/messageHandler');
const callbackHandlers = require('./handlers/callbackHandler');

// Validate bot token
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
}

// Create bot instance
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: {
    apiRoot: 'https://api.telegram.org'
  }
});

// Session configuration
bot.use(session({
  defaultSession: () => ({
    step: null,
    data: {},
    lastActivity: Date.now()
  })
}));

// Global error handler
bot.catch((error, ctx) => {
  logger.error('Bot error occurred:', error);
  logger.botLog('error', ctx.from?.id, ctx.from?.username, error.message, {
    updateType: ctx.updateType,
    chatId: ctx.chat?.id
  });
  
  // Send error message to user
  ctx.reply('❌ Sorry, something went wrong. Please try again later.', {
    parse_mode: 'HTML'
  }).catch(console.error);
});

// Middleware to load user and update activity
bot.use(async (ctx, next) => {
  try {
    if (ctx.from) {
      // Find or create student record
      let student = await Student.findByTelegramId(ctx.from.id);
      
      if (!student) {
        student = await Student.create({
          telegram_id: ctx.from.id,
          username: ctx.from.username,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name,
          preferred_language: ctx.from.language_code || 'en'
        });
        
        logger.botLog('user_registered', ctx.from.id, ctx.from.username, 'New user registered');
      } else {
        // Update user activity
        await student.updateActivity();
      }
      
      // Attach student to context
      ctx.student = student;
      
      // Log user activity
      logger.botLog('activity', ctx.from.id, ctx.from.username, ctx.message?.text || ctx.updateType);
    }
    
    return next();
  } catch (error) {
    logger.error('Middleware error:', error);
    return next();
  }
});

// Rate limiting middleware
const userRequests = new Map();
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  
  const now = Date.now();
  const userKey = `${userId}`;
  
  if (!userRequests.has(userKey)) {
    userRequests.set(userKey, { count: 1, resetTime: now + 60000 }); // 1 minute window
  } else {
    const userLimit = userRequests.get(userKey);
    
    if (now > userLimit.resetTime) {
      userLimit.count = 1;
      userLimit.resetTime = now + 60000;
    } else {
      userLimit.count++;
      
      if (userLimit.count > 30) { // Max 30 requests per minute
        logger.botLog('rate_limited', userId, ctx.from.username, 'Rate limit exceeded');
        await ctx.reply('⏱ You\'re sending messages too quickly. Please wait a moment and try again.');
        return;
      }
    }
  }
  
  return next();
});

// Language middleware
bot.use(async (ctx, next) => {
  // Set language based on student preferences
  if (ctx.student?.preferred_language) {
    ctx.language = ctx.student.preferred_language;
  } else {
    ctx.language = ctx.from?.language_code || settings.languages.default;
  }
  
  return next();
});

// Register command handlers
bot.start(commandHandlers.start);
bot.command('help', commandHandlers.help);
bot.command('book', commandHandlers.book);
bot.command('schedule', commandHandlers.schedule);
bot.command('cancel', commandHandlers.cancel);
bot.command('status', commandHandlers.status);
bot.command('waitlist', commandHandlers.waitlist);
bot.command('settings', commandHandlers.settings);
bot.command('feedback', commandHandlers.feedback);

// Admin commands
bot.command('admin', commandHandlers.admin);
bot.command('stats', commandHandlers.stats);
bot.command('broadcast', commandHandlers.broadcast);

// Register callback handlers
bot.on('callback_query', callbackHandlers.handle);

// Register message handlers
bot.on('text', messageHandlers.handleText);
bot.on('contact', messageHandlers.handleContact);
bot.on('location', messageHandlers.handleLocation);

// Handle inline queries (for scheduling suggestions)
bot.on('inline_query', async (ctx) => {
  try {
    const query = ctx.inlineQuery.query.toLowerCase();
    const results = [];
    
    // Add quick booking options
    if (query.includes('book') || query.includes('lesson')) {
      results.push({
        type: 'article',
        id: 'book_lesson',
        title: '📚 Book a Lesson',
        description: 'Start the lesson booking process',
        input_message_content: {
          message_text: '/book'
        }
      });
    }
    
    if (query.includes('schedule') || query.includes('my')) {
      results.push({
        type: 'article',
        id: 'my_schedule',
        title: '📅 My Schedule',
        description: 'View your upcoming lessons',
        input_message_content: {
          message_text: '/schedule'
        }
      });
    }
    
    await ctx.answerInlineQuery(results, { cache_time: 300 });
  } catch (error) {
    logger.error('Inline query error:', error);
  }
});

// Handle unknown commands
bot.on('message', async (ctx, next) => {
  if (ctx.message.text && ctx.message.text.startsWith('/')) {
    const command = ctx.message.text.split(' ')[0];
    logger.botLog('unknown_command', ctx.from.id, ctx.from.username, command);
    
    await ctx.reply(
      '❓ Unknown command. Type /help to see available commands.',
      { parse_mode: 'HTML' }
    );
    return;
  }
  
  return next();
});

// Cleanup function for graceful shutdown
bot.cleanup = () => {
  userRequests.clear();
  logger.info('Bot cleanup completed');
};

// Export the bot instance
module.exports = bot; 