const schedulerService = require('../../services/scheduler');
const aiScheduler = require('../../ai/scheduler');
const { Markup } = require('telegraf');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');
const settings = require('../../config/settings');
const Student = require('../../models/Student');

// Input validation and sanitization
const validateAndSanitizeInput = (message) => {
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Empty message');
  }
  
  // Basic length validation
  if (message.length > 1000) {
    throw new Error('Message too long');
  }
  
  // Remove potentially harmful characters while preserving Hebrew
  const sanitized = message
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .trim();
  
  if (sanitized.length === 0) {
    throw new Error('Empty message');
  }
  
  return sanitized;
};

// Rate limiting check (simple in-memory implementation)
const rateLimitMap = new Map();

// Check if message is relevant to current conversation state
const isStateRelevantMessage = (message, state) => {
  const lowerMessage = message.toLowerCase();
  
  switch (state) {
    case 'updating_name':
      // Name should contain Hebrew or English letters, possibly with spaces
      return /^[a-zA-Zא-ת\s]{2,50}$/.test(message.trim());
    
    case 'updating_phone':
      // Phone should contain digits, possibly with dashes, spaces, or plus
      return /^[\d\s\-\+\(\)]{7,20}$/.test(message.trim());
    
    case 'updating_email':
      // Basic email validation
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.trim());
    
    case 'updating_parent_name':
      // Same as name validation
      return /^[a-zA-Zא-ת\s]{2,50}$/.test(message.trim());
    
    case 'updating_parent_phone':
      // Same as phone validation
      return /^[\d\s\-\+\(\)]{7,20}$/.test(message.trim());
    
    case 'updating_parent_email':
      // Same as email validation
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.trim());
    
    case 'booking_request':
      // Booking messages should contain time/date related keywords
      const bookingKeywords = ['שיעור', 'זמן', 'תאריך', 'מחר', 'אחרי', 'לפני', 'בשעה', 'יום', 'שבוע', 'חודש'];
      return bookingKeywords.some(keyword => lowerMessage.includes(keyword)) || /\d/.test(message);
    
    case 'waitlist_request':
      // Waitlist messages should contain time preferences
      const waitlistKeywords = ['רשימת המתנה', 'להמתין', 'כשיתפנה', 'יום', 'זמן', 'שעה'];
      return waitlistKeywords.some(keyword => lowerMessage.includes(keyword));
    
    default:
      return true; // Allow any message for unknown states
  }
};

const checkRateLimit = (telegramId) => {
  const now = Date.now();
  const key = telegramId.toString();
  const limit = rateLimitMap.get(key) || { count: 0, resetTime: now + 60000 }; // 1 minute window
  
  if (now > limit.resetTime) {
    // Reset the limit
    rateLimitMap.set(key, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (limit.count >= 20) { // Max 20 messages per minute
    return false;
  }
  
  limit.count++;
  rateLimitMap.set(key, limit);
  return true;
};

const handleText = async (ctx) => {
  try {
    logger.messageLog('incoming_message', {
      telegramId: ctx.from.id,
      messageText: ctx.message.text || 'contact/media'
    });

    // Get or create student
    let student = await Student.findOne({
      where: { telegram_id: ctx.from.id }
    });

    if (!student) {
      student = await Student.create({
        telegram_id: ctx.from.id,
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || 'User',
        last_name: ctx.from.last_name || null,
        preferred_language: 'he'
      });
      
      logger.info(`New student created: ${student.id}`);
    }

    // Update last activity
    await student.update({ last_activity: new Date() });
    ctx.student = student; // Make student available in context

    // Handle student registration for new students
    const isInRegistration = await handleStudentRegistration(ctx, student);
    if (isInRegistration) {
      return;
    }

    if (!student) {
      await ctx.reply('❌ שגיאה: לא הצליח לזהות את המשתמש. אנא התחל שוב עם /start');
      return;
    }
    
    // Rate limiting check
    if (!checkRateLimit(student.telegram_id)) {
      await ctx.reply('⚠️ אתה שולח הודעות מהר מדי. אנא המתן רגע ונסה שוב.');
      return;
    }
    
    // Handle contact messages (phone number sharing)
    if (ctx.message.contact) {
      return await handleContact(ctx);
    }
    
    // Handle location messages
    if (ctx.message.location) {
      return await handleLocation(ctx);
    }

    let message;
    try {
      message = validateAndSanitizeInput(ctx.message.text);
    } catch (validationError) {
      logger.warn('Input validation failed:', validationError.message, { telegramId: student.telegram_id });
      await ctx.reply('❌ שגיאה בפורמט ההודעה. אנא כתוב הודעה תקנית ונסה שוב.');
      return;
    }

    // Skip if message starts with / (commands are handled elsewhere)
    if (message.startsWith('/')) {
      return;
    }
    
    // Handle special text responses from custom keyboards
    if (message === '🔙 חזור להגדרות') {
      const callbackHandlers = require('./callbackHandler');
      await callbackHandlers.handleSettings(ctx, student);
      return;
    }

    logger.botLog('text_message', student.telegram_id, student.username, message);

    // Show typing indicator with timeout
    const typingPromise = ctx.sendChatAction('typing');
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000));
    await Promise.race([typingPromise, timeoutPromise]);

    // Check conversation state with timeout protection
    const conversationState = ctx.session?.step;
    const sessionTimeout = 10 * 60 * 1000; // 10 minutes (reduced from 30)
    
    if (ctx.session?.lastActivity && (Date.now() - ctx.session.lastActivity) > sessionTimeout) {
      logger.info(`Session timeout for student ${student.id}, clearing conversation state`);
      ctx.session.step = null;
      ctx.session.data = {};
      ctx.session.reschedule_lesson_id = null;
      await ctx.reply('⏰ פג תוקף השיחה. בואו נתחיל מחדש - איך אוכל לעזור?');
      return; // Exit early after timeout
    }
    
    // Initialize session if not exists
    if (!ctx.session) {
      ctx.session = {};
    }
    
    // Update session activity
    ctx.session.lastActivity = Date.now();
    
    // If conversation state exists but message seems unrelated, offer to reset
    if (conversationState && !isStateRelevantMessage(message, conversationState)) {
      const stateNames = {
        'updating_name': 'עדכון שם',
        'updating_phone': 'עדכון טלפון',
        'updating_email': 'עדכון אימייל',
        'updating_parent_name': 'עדכון שם הורה',
        'updating_parent_phone': 'עדכון טלפון הורה',
        'updating_parent_email': 'עדכון אימייל הורה',
        'booking_request': 'תיאום שיעור',
        'waitlist_request': 'רשימת המתנה'
      };
      
      const stateName = stateNames[conversationState] || conversationState;
      
      // Only ask for reset if it's a details update state
      if (conversationState.startsWith('updating_')) {
        await ctx.reply(
          `🤔 <b>נראה שההודעה לא קשורה ל${stateName}</b>\n\nהאם תרצה לבטל את העדכון ולחזור לתפריט הראשי?`,
          {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('✅ כן, בטל ועבור לתפריט', 'back_to_menu')],
              [Markup.button.callback('❌ לא, המשך עם העדכון', `update_personal_details`)]
            ]).reply_markup
          }
        );
        return;
      }
    }

    switch (conversationState) {
      case 'booking_request':
      case 'natural_conversation':
        await handleBookingRequest(ctx, message, student);
        break;
      
      case 'waitlist_request':
        await handleWaitlistRequest(ctx, message, student);
        break;
      
      case 'feedback':
        await handleFeedback(ctx, message, student);
        break;
      
      case 'setting_duration':
        await handleDurationSetting(ctx, message, student);
        break;
      
      case 'setting_time_range':
        await handleTimeRangeSetting(ctx, message, student);
        break;

      case 'updating_name':
        await handleDetailsUpdate(ctx, message, student, 'name');
        break;

      case 'updating_phone':
        await handleDetailsUpdate(ctx, message, student, 'phone');
        break;

      case 'updating_email':
        await handleDetailsUpdate(ctx, message, student, 'email');
        break;

      case 'updating_address':
        await handleDetailsUpdate(ctx, message, student, 'address');
        break;

      case 'updating_parent_name':
        await handleDetailsUpdate(ctx, message, student, 'parent_name');
        break;

      case 'updating_parent_phone':
        await handleDetailsUpdate(ctx, message, student, 'parent_phone');
        break;

      case 'updating_parent_email':
        await handleDetailsUpdate(ctx, message, student, 'parent_email');
        break;
      
      default:
        // General natural language processing with AI
        await handleGeneralMessage(ctx, message, student);
        break;
    }

  } catch (error) {
    logger.error('Error handling text message:', error);
    
    // Enhanced error response
    const errorMessages = [
      '❌ מצטער, נתקלתי בבעיה זמנית. בואו ננסה שוב!',
      '🔧 יש בעיה קטנה במערכת. אתה יכול לנסות שוב או לכתוב /start',
      '⚠️ משהו השתבש. אנא נסה לשלוח את ההודעה שוב.'
    ];
    
    const randomMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    
    try {
      await ctx.reply(randomMessage);
    } catch (replyError) {
      logger.error('Failed to send error reply:', replyError);
    }
  }
};

const handleBookingRequest = async (ctx, message, student) => {
  try {
    // Enhanced AI processing with better student context
    logger.aiLog('processing_enhanced_booking_request', message, null, { studentId: student.id });
    
    const aiResult = await aiScheduler.processSchedulingRequest(message, {
      id: student.id,
      name: student.getDisplayName(),
      timezone: student.timezone || 'Asia/Jerusalem',
      preferredDuration: student.preferred_lesson_duration || 60,
      recentLessons: [] 
    });

    logger.aiLog('enhanced_ai_result', message, JSON.stringify(aiResult), {
      intent: aiResult.intent,
      confidence: aiResult.confidence
    });

    // First, show the AI's natural response for better conversation flow
    if (aiResult.natural_response && aiResult.confidence > 0.7) {
      await ctx.reply(aiResult.natural_response, { parse_mode: 'HTML' });
    }

    // Process the scheduling request
    const result = await schedulerService.processBookingRequest(message, student, { aiResult });

    if (result.success) {
      if (result.type === 'slots_available') {
        // Show available slots with improved messaging
        await showEnhancedAvailableSlots(ctx, result.availableSlots, aiResult);
      } else if (result.type === 'general_response') {
        await ctx.reply(result.message, { parse_mode: 'HTML' });
      } else if (result.type === 'availability_check') {
        await showAvailabilityResults(ctx, result.availableSlots, result.message);
      } else if (result.type === 'ai_response' || result.type === 'general_help' || 
                 result.type === 'greeting' || result.type === 'pricing_info' || 
                 result.type === 'subjects_info' || result.type === 'help_scheduling' ||
                 result.type === 'error_recovery' || result.type === 'discount_info' ||
                 result.type === 'explanation' || result.type === 'appreciation') {
        // Handle all types of helpful responses from scheduler service
        await ctx.reply(result.message, { 
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
            [Markup.button.callback('📅 זמנים זמינים', 'show_available_times')],
            [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
          ]).reply_markup
        });
        // Clear conversation state for these general responses
        ctx.session.step = null;
      }
    } else {
      if (result.type === 'no_slots_waitlist_offered') {
        await showWaitlistOptions(ctx, result.alternativeSlots, aiResult);
      } else if (result.needsMoreInfo) {
        // Use AI suggestions if available
        let responseMessage = result.message;
        if (aiResult.suggested_responses && aiResult.suggested_responses.length > 0) {
          responseMessage += '\n\n💡 ' + aiResult.suggested_responses[0];
        }
        await ctx.reply(responseMessage, { parse_mode: 'HTML' });
        // Keep in booking state for follow-up
      } else {
        await ctx.reply(result.message, { parse_mode: 'HTML' });
        ctx.session.step = null;
      }
    }

  } catch (error) {
    logger.error('Error handling enhanced booking request:', error);
    const studentName = student.getDisplayName();
    await ctx.reply(
      `שלום ${studentName}! 😊\n\nיש לי קצת בעיה להבין את הבקשה. אתה יכול לנסח שוב?\n\nדוגמאות:\n• "אני רוצה שיעור ביום רביעי בצהריים"\n• "מתי יש זמנים פנויים השבוע?"\n• "אני פנוי מחר אחרי 3"\n\nבברכה,\nשפיר.`,
      { parse_mode: 'HTML' }
    );
    ctx.session.step = null;
  }
};

const showEnhancedAvailableSlots = async (ctx, slots, aiResult) => {
  const studentRequest = aiResult.original_message || '';
  let message = '📅 <b>מצאתי זמנים מתאימים!</b>\n\n';
  
  if (aiResult.datetime_preferences && aiResult.datetime_preferences.length > 0) {
    message += `בהתבסס על הבקשה שלך:\n<i>"${studentRequest}"</i>\n\n`;
  }

  message += 'הזמנים הזמינים:\n\n';

  const buttons = [];
  
  slots.slice(0, 6).forEach((slot, index) => {
    message += `${index + 1}. ${slot.formattedTime}\n`;
    message += `   ⏱️ ${slot.duration} דקות • 💰 ${slot.pricePerHour || 180}₪\n\n`;
    
    buttons.push([Markup.button.callback(
      `✅ ${slot.formattedTime}`, 
      `book_slot_${index}`
    )]);
  });

  if (slots.length > 6) {
    message += `\n<i>... ועוד ${slots.length - 6} זמנים זמינים</i>`;
    buttons.push([Markup.button.callback('📅 הצג עוד זמנים', 'show_more_slots')]);
  }

  buttons.push([
    Markup.button.callback('🗣️ שיחה טבעית עם שפיר', 'book_different_time'),
    Markup.button.callback('📋 כל הזמנים', 'show_available_times')
  ]);
  buttons.push([Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
  });

  // Store enhanced data in session (ensure compatibility with callback handler)
  if (!ctx.session) {
    ctx.session = {};
  }
  ctx.session.availableSlots = slots; // Direct access for callback handler
  ctx.session.data = ctx.session.data || {};
  ctx.session.data.availableSlots = slots; // Backup location
  ctx.session.data.aiResult = aiResult;
  ctx.session.step = 'enhanced_slot_selection';
  ctx.session.lastActivity = Date.now(); // Update session activity
};

const handleWaitlistRequest = async (ctx, message, student) => {
  try {
    // Use AI to understand waitlist preferences
    const aiResult = await aiScheduler.processSchedulingRequest(message, {
      id: student.id,
      name: student.getDisplayName(),
      timezone: student.timezone || 'Asia/Jerusalem'
    });

    if (aiResult.intent === 'join_waitlist' && aiResult.confidence > 0.6) {
      // Process waitlist addition
      const result = await schedulerService.addToWaitlist(aiResult, student);
      
      if (result.success) {
        await ctx.reply(
          `✅ <b>נוספת לרשימת המתנה!</b>\n\nמיקום ברשימה: #${result.waitlistEntry.position}\n\nאני אודיע לך מיד כשיתפנה זמן מתאים! 🔔`,
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.reply('❌ לא הצלחתי להוסיף אותך לרשימת המתנה. אנא נסה שוב.');
      }
    } else {
      await ctx.reply(
        '🤔 לא הבנתי בדיוק איזה זמנים אתה מעדיף.\n\nאתה יכול לומר משהו כמו:\n• "אני רוצה להיות ברשימת המתנה לימי שני אחר הצהריים"\n• "תוסיף אותי לרשימת המתנה לכל זמן פנוי השבוע הבא"'
      );
    }
    
    ctx.session.step = null;

  } catch (error) {
    logger.error('Error handling waitlist request:', error);
    await ctx.reply('❌ הייתה שגיאה בעיבוד בקשת רשימת המתנה. אנא נסה שוב.');
    ctx.session.step = null;
  }
};

const showAvailableSlots = async (ctx, slots, schedulingData) => {
  let message = '📅 <b>זמנים זמינים</b>\n\nהנה הזמנים הזמינים שמתאימים לבקשה שלך:\n\n';

  const buttons = [];
  
  slots.slice(0, 6).forEach((slot, index) => {
    message += `${index + 1}. ${slot.formattedTime}\n`;
    message += `   ⏱️ ${slot.duration} דקות\n\n`;
    
    buttons.push([Markup.button.callback(
      `תאם זמן ${index + 1}`, 
      `book_slot_${index}`
    )]);
  });

  if (slots.length > 6) {
    message += `\n<i>... ועוד ${slots.length - 6} זמנים זמינים</i>`;
    buttons.push([Markup.button.callback('הצג עוד זמנים', 'show_more_slots')]);
  }

  buttons.push([
    Markup.button.callback('🔍 זמן אחר', 'book_different_time')
  ]);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
  });

  // Store slots in session for booking (ensure compatibility with callback handler)
  if (!ctx.session) {
    ctx.session = {};
  }
  ctx.session.availableSlots = slots; // Direct access for callback handler
  ctx.session.data = ctx.session.data || {};
  ctx.session.data.availableSlots = slots; // Backup location
  ctx.session.data.schedulingData = schedulingData;
  ctx.session.step = 'slot_selection';
  ctx.session.lastActivity = Date.now(); // Update session activity
};

const showWaitlistOptions = async (ctx, alternativeSlots, schedulingData) => {
  let message = '😔 <b>אין זמנים זמינים</b>\n\nאין לי זמנים פנויים עבור הזמנים המועדפים עליך.';

  if (alternativeSlots.length > 0) {
    message += '\n\n📅 <b>זמנים חלופיים:</b>\n';
    alternativeSlots.slice(0, 3).forEach((slot, index) => {
      message += `${index + 1}. ${slot.formattedTime}\n`;
    });
  }

  message += '\n\n💡 <b>מה תרצה לעשות?</b>';

  const buttons = [];

  if (alternativeSlots.length > 0) {
    buttons.push([Markup.button.callback('📅 תאם זמן חלופי', 'book_alternative')]);
  }

  buttons.push([
    Markup.button.callback('🔍 נסה בקשה אחרת', 'book_different_time')
  ]);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
  });

  // Store data for follow-up
  ctx.session.data = ctx.session.data || {};
  ctx.session.data.alternativeSlots = alternativeSlots;
  ctx.session.data.schedulingData = schedulingData;
  ctx.session.step = 'waitlist_options';
};

const showAvailabilityResults = async (ctx, slots, aiMessage) => {
  let message = aiMessage;

  if (slots.length > 0) {
    message += '\n\n📅 <b>הזמנים הזמינים הבאים:</b>\n';
    slots.slice(0, 5).forEach((slot, index) => {
      message += `• ${slot.formattedTime}\n`;
    });

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 תאם אחד מהזמנים האלה', 'book_from_availability')],
      [Markup.button.callback('🔍 בדוק זמנים אחרים', 'book_lesson')]
    ]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

    ctx.session.data = ctx.session.data || {};
    ctx.session.data.availableSlots = slots;
  } else {
    await ctx.reply(message, { parse_mode: 'HTML' });
  }

  ctx.session.step = null;
};

const handleGeneralMessage = async (ctx, message, student) => {
  try {
    // Enhanced keyword detection for better understanding
    const lowerMessage = message.toLowerCase();
    
    // Check for greeting or basic questions
    if (lowerMessage.includes('שלום') || lowerMessage.includes('היי') || lowerMessage.includes('מה שלומך')) {
      await ctx.reply(
        `היי ${student.getDisplayName()}! 👋

אשמח לעזור לך עם תיאום שיעורי מתמטיקה!

💡 <b>מה אני יכול לעשות עבורך:</b>
• 📚 לתאם שיעור חדש
• 📅 לבדוק את השיעורים שלך  
• 🔄 לשנות או לבטל שיעור
• ⏰ להוסיף אותך לרשימת המתנה
• ⚙️ לעדכן את הפרטים שלך

פשוט ספר לי מה אתה צריך!`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
            [Markup.button.callback('📋 השיעורים שלי', 'my_lessons')],
            [Markup.button.callback('❓ עזרה מלאה', 'help')]
          ]).reply_markup
        }
      );
      return;
    }

    // Enhanced intent detection with Hebrew keywords
    const intents = {
      booking: ['תאם', 'שיעור', 'לקבוע', 'פנוי', 'זמין', 'רוצה שיעור', 'אפשר לתאם', 'מחר', 'השבוע', 'בוא נקבע', 'אני רוצה', 'צריך'],
      schedule: ['לוח', 'שיעורים שלי', 'מתוכנן', 'קרוב', 'הבא', 'מה יש לי', 'השיעורים שלי'],
      cancel: ['לבטל', 'ביטול', 'לא יכול', 'לא אגיע', 'לבטל שיעור', 'בטל'],
      reschedule: ['לשנות', 'להעביר', 'זמן אחר', 'לדחות', 'החלפה', 'להחליף'],
      availability: ['זמנים פנויים', 'מה פנוי', 'איזה זמנים', 'מתי יש', 'כשיש מקום', 'זמינים'],
      waitlist: ['רשימת המתנה', 'להמתין', 'כשיתפנה', 'אם יבטלו'],
      contact: ['פרטי המורה', 'טלפון', 'אימייל', 'איך ליצור קשר', 'פרטים'],
      help: ['עזרה', 'לא מבין', 'איך', 'מה אפשר', 'הוראות', 'מבולבל']
    };

    let detectedIntent = null;
    let maxMatches = 0;

    // Find the intent with the most keyword matches
    for (const [intent, keywords] of Object.entries(intents)) {
      const matches = keywords.filter(keyword => lowerMessage.includes(keyword)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedIntent = intent;
      }
    }

    // If we have a clear intent based on keywords, handle directly
    if (maxMatches > 0) {
      switch (detectedIntent) {
        case 'booking':
          // Check if specific time mentioned
          if (lowerMessage.includes('מחר') || lowerMessage.includes('אחרי') || /\d/.test(lowerMessage)) {
            ctx.session.step = 'booking_request';
            await handleBookingRequest(ctx, message, student);
          } else {
            await ctx.reply(
              `${student.getDisplayName()}, בואו נתאם לך שיעור מתמטיקה! 📚

💡 <b>דוגמאות למה שאתה יכול לכתוב:</b>
• "אני רוצה שיעור מחר בשעה 5"
• "אני פנוי ביום רביעי בצהריים"  
• "תתאם לי משהו השבוע הבא"
• "איזה זמנים פנויים יש השבוע?"

פשוט ספר לי מתי אתה פנוי! 🕐`,
              {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                  [Markup.button.callback('📅 הצג זמנים זמינים', 'show_available_times')],
                  [Markup.button.callback('🗣️ שיחה טבעית עם שפיר', 'book_different_time')]
                ]).reply_markup
              }
            );
            ctx.session.step = 'booking_request';
          }
          break;

        case 'schedule':
          await ctx.reply(`${student.getDisplayName()}, בואו נבדוק את השיעורים שלך! 📅`, {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📋 השיעורים שלי', 'my_lessons')]
            ]).reply_markup
          });
          break;

        case 'cancel':
          await ctx.reply(
            `${student.getDisplayName()}, אני אעזור לך לבטל שיעור. ❌

בחר את השיעור מהרשימה:

⚠️ <b>שים לב:</b> ביטול פחות מ-24 שעות מראש יחויב בתשלום 50%`,
            {
              parse_mode: 'HTML',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('❌ בטל שיעור', 'cancel_lesson')],
                [Markup.button.callback('📋 הצג שיעורים', 'my_lessons')]
              ]).reply_markup
            }
          );
          break;

        case 'reschedule':
          await ctx.reply(
            `${student.getDisplayName()}, אני אעזור לך לשנות זמן שיעור! 🔄

בחר את השיעור שתרצה לשנות:`,
            {
              parse_mode: 'HTML',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔄 החלף שיעור', 'reschedule_lesson')],
                [Markup.button.callback('📋 הצג שיעורים', 'my_lessons')]
              ]).reply_markup
            }
          );
          break;

        case 'availability':
          await ctx.reply(`${student.getDisplayName()}, בואו נבדוק מה פנוי השבוע! 📅`, {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 זמנים זמינים', 'show_available_times')]
            ]).reply_markup
          });
          break;

        case 'waitlist':
          await ctx.reply(
            `${student.getDisplayName()}, רוצה להיות ברשימת המתנה? ⏰

ספר לי איזה זמנים מעניינים אותך.

דוגמה: "אני רוצה להיות ברשימת המתנה לימי שני אחר הצהריים"`,
            {
              parse_mode: 'HTML',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('⏰ הצטרף לרשימת המתנה', 'join_waitlist')]
              ]).reply_markup
            }
          );
          ctx.session.step = 'waitlist_request';
          break;

        case 'contact':
          await ctx.reply(`${student.getDisplayName()}, בואו נציג לך את פרטי המורה! 📞`, {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📞 פרטי המורה', 'contact_teacher')]
            ]).reply_markup
          });
          break;

        case 'help':
          await ctx.reply(`${student.getDisplayName()}, בואו נעזור לך להבין איך הכל עובד! ❓`, {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('❓ עזרה מלאה', 'help')]
            ]).reply_markup
          });
          break;
      }
    } else {
      // Try AI processing as fallback - but with better error handling
      try {
        const aiResult = await aiScheduler.processSchedulingRequest(message, {
          id: student.id,
          name: student.getDisplayName(),
          timezone: student.timezone || 'Asia/Jerusalem'
        });

        // Always use the natural response from AI if available
        if (aiResult.natural_response) {
          await ctx.reply(aiResult.natural_response, { parse_mode: 'HTML' });
          
          // If it's a booking intent with good confidence, proceed to booking
          if (aiResult.intent === 'book_lesson' && aiResult.confidence > 0.6) {
            ctx.session.step = 'booking_request';
          }
          return;
        }

        // If no natural response, use intent-based response
        if (aiResult.intent === 'book_lesson' && aiResult.confidence > 0.6) {
          ctx.session.step = 'booking_request';
          await handleBookingRequest(ctx, message, student);
        } else {
          // Provide helpful fallback response in Hebrew
          await ctx.reply(
            `${student.getDisplayName()}, אני כאן לעזור לך! 😊

💡 <b>אתה יכול:</b>
• לתאם שיעור חדש - "אני רוצה שיעור מחר ב5"
• לבדוק את השיעורים שלך - "מה השיעורים שלי?"
• לבטל או לשנות שיעור - "אני רוצה לבטל שיעור"
• לבדוק זמנים זמינים - "איזה זמנים פנויים יש?"

📝 <b>טיפ:</b> תוכל לכתוב בצורה טבעית, למשל "בואו נקבע שיעור לרביעי בצהריים"`,
            {
              parse_mode: 'HTML',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
                [Markup.button.callback('📋 השיעורים שלי', 'my_lessons')],
                [Markup.button.callback('❓ עזרה מלאה', 'help')]
              ]).reply_markup
            }
          );
        }
      } catch (aiError) {
        logger.error('AI processing failed:', aiError);
        // Excellent Hebrew fallback when AI completely fails
        await ctx.reply(
          `${student.getDisplayName()}, אני כאן לעזור לך! 🤖

יש לי קצת בעיה עם המערכת החכמה, אבל אני עדיין יכול לעזור לך עם כל מה שאתה צריך.

בחר מהתפריט למטה מה תרצה לעשות:`,
          {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
              [Markup.button.callback('📋 השיעורים שלי', 'my_lessons')],
              [Markup.button.callback('📅 זמנים זמינים', 'show_available_times')],
              [Markup.button.callback('❓ עזרה', 'help')]
            ]).reply_markup
          }
        );
      }
    }

  } catch (error) {
    logger.error('Error processing general message:', error);
    // Even error messages should be in Hebrew
    await ctx.reply(
      `${student.getDisplayName()}, מצטער! 😅

נתקלתי בקושי קטן. בואו ננסה שוב:`,
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
          [Markup.button.callback('📋 השיעורים שלי', 'my_lessons')],
          [Markup.button.callback('❓ עזרה', 'help')]
        ]).reply_markup
      }
    );
  }
};

const handleFeedback = async (ctx, message, student) => {
  try {
    // Store feedback (you could save this to database)
    logger.info(`Feedback from ${student.getDisplayName()} (${student.telegram_id}): ${message}`);

    await ctx.reply(`
✅ <b>Thank you for your feedback!</b>

Your message has been received and will be reviewed. I appreciate you taking the time to help improve the service!

${Math.random() > 0.5 ? '🌟' : '💝'} Your input helps make the tutoring experience better for everyone.
    `, { parse_mode: 'HTML' });

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 Book Lesson', 'book_lesson')],
                    [Markup.button.callback('📅 השיעורים שלי', 'my_lessons')]
    ]);

    await ctx.reply('Is there anything else I can help you with?', {
      reply_markup: buttons.reply_markup
    });

    ctx.session.step = null;

  } catch (error) {
    logger.error('Error handling feedback:', error);
    await ctx.reply('❌ Sorry, there was an error saving your feedback. Please try again.');
  }
};

const handleDurationSetting = async (ctx, message, student) => {
  try {
    const duration = parseInt(message);
    
    if (isNaN(duration) || duration < 30 || duration > 180) {
      await ctx.reply('⚠️ Please enter a valid duration between 30 and 180 minutes.');
      return;
    }

    student.preferred_lesson_duration = duration;
    await student.save();

    await ctx.reply(`✅ Your preferred lesson duration has been set to ${duration} minutes.`);
    
    ctx.session.step = null;
    
    // Return to settings
    setTimeout(() => {
      ctx.telegram.sendMessage(ctx.chat.id, '⚙️ Updated! You can continue adjusting your settings:', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('⚙️ Back to Settings', 'settings')]
        ]).reply_markup
      });
    }, 1000);

  } catch (error) {
    logger.error('Error setting duration:', error);
    await ctx.reply('❌ Error updating your preference. Please try again.');
  }
};

const handleTimeRangeSetting = async (ctx, message, student) => {
  try {
    // Parse time range like "16:00-19:00" or "4 PM to 7 PM"
    const timeRegex = /(\d{1,2}):?(\d{0,2})\s*(?:AM|PM)?.*?(\d{1,2}):?(\d{0,2})\s*(?:AM|PM)?/i;
    const match = message.match(timeRegex);
    
    if (!match) {
      await ctx.reply('⚠️ Please enter a time range like "16:00-19:00" or "4 PM to 7 PM".');
      return;
    }

    // Simple validation - you'd want more robust time parsing
    student.preferred_time_start = '16:00'; // Default fallback
    student.preferred_time_end = '19:00';
    await student.save();

    await ctx.reply('✅ Your preferred time range has been updated.');
    
    ctx.session.step = null;
    
    // Return to settings
    setTimeout(() => {
      ctx.telegram.sendMessage(ctx.chat.id, '⚙️ Updated! You can continue adjusting your settings:', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('⚙️ Back to Settings', 'settings')]
        ]).reply_markup
      });
    }, 1000);

  } catch (error) {
    logger.error('Error setting time range:', error);
    await ctx.reply('❌ Error updating your preference. Please try again.');
  }
};

const handleContact = async (ctx) => {
  try {
    const contact = ctx.message.contact;
    const student = ctx.student;

    if (contact.user_id === ctx.from.id) {
      // Student shared their own contact
      student.phone_number = contact.phone_number;
      await student.save();

      await ctx.reply('✅ Thank you! Your phone number has been saved for lesson reminders and important updates.');
    } else {
      await ctx.reply('📞 Contact received. If this is for lesson booking, please use the booking commands.');
    }

  } catch (error) {
    logger.error('Error handling contact:', error);
    await ctx.reply('❌ Error processing contact information.');
  }
};

const handleLocation = async (ctx) => {
  try {
    const location = ctx.message.location;
    
    await ctx.reply('📍 Location received. Currently, all lessons are conducted online. If you need in-person lessons, please contact the teacher directly.');

  } catch (error) {
    logger.error('Error handling location:', error);
    await ctx.reply('❌ Error processing location information.');
  }
};

/**
 * Handle student registration process
 */
async function handleStudentRegistration(ctx, student) {
  try {
    const currentState = student.current_conversation_state;
    const context = student.conversation_context || {};
    
    // Start registration if this is a new student
    if (!student.full_name || !student.phone_number) {
      
      if (!student.full_name) {
        await student.update({
          current_conversation_state: 'awaiting_full_name',
          conversation_context: { registrationStep: 'name' }
        });
        
        await ctx.reply(
          '👋 <b>שלום וברוכים הבאים!</b>\n\n' +
          'אני הבוט של שפיר למתמטיקה! 📐\n\n' +
          'כדי שאוכל לעזור לך לתאם שיעורים, אני צריך כמה פרטים:\n\n' +
          '👤 <b>בואו נתחיל - איך קוראים לך?</b>\n' +
          '<i>כתוב לי את השם המלא שלך</i>',
          { parse_mode: 'HTML' }
        );
        return true;
      }
      
      if (!student.phone_number) {
        await student.update({
          current_conversation_state: 'awaiting_phone',
          conversation_context: { registrationStep: 'phone' }
        });
        
        await ctx.reply(
          `שלום ${student.full_name}! 😊\n\n` +
          '📱 <b>עכשיו אני צריך את מספר הטלפון שלך</b>\n' +
          '<i>כתוב את המספר או לחץ על הכפתור למטה</i>',
          {
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: [[{ text: '📱 שלח מספר טלפון', request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
        return true;
      }
    }
    
    // Handle registration states
    if (currentState === 'awaiting_full_name') {
      const fullName = ctx.message.text.trim();
      if (fullName.length < 2) {
        await ctx.reply('השם קצר מדי. אנא כתוב את השם המלא שלך:');
        return true;
      }
      
      await student.update({
        full_name: fullName,
        current_conversation_state: 'awaiting_phone',
        conversation_context: { registrationStep: 'phone' }
      });
      
      await ctx.reply(
        `נעים להכיר ${fullName}! 😊\n\n` +
        '📱 <b>עכשיו אני צריך את מספר הטלפון שלך</b>\n' +
        '<i>כתוב את המספר או לחץ על הכפתור למטה</i>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [[{ text: '📱 שלח מספר טלפון', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
      return true;
    }
    
    if (currentState === 'awaiting_phone') {
      let phoneNumber = null;
      
      if (ctx.message.contact) {
        phoneNumber = ctx.message.contact.phone_number;
      } else if (ctx.message.text) {
        phoneNumber = ctx.message.text.replace(/[^\d+]/g, '');
      }
      
      if (!phoneNumber || phoneNumber.length < 9) {
        await ctx.reply('מספר הטלפון לא תקין. אנא כתוב מספר תקין או השתמש בכפתור:', {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🚫 בטל רישום', 'back_to_menu')],
            [Markup.button.callback('📞 עזרה', 'help')]
          ]).reply_markup
        });
        return true;
      }
      
      await student.update({
        phone_number: phoneNumber,
        current_conversation_state: 'awaiting_class_grade',
        conversation_context: { registrationStep: 'grade' }
      });
      
      await ctx.reply(
        '✅ מעולה! נשמר מספר הטלפון\n\n' +
        '🎓 <b>באיזה כיתה אתה לומד?</b>\n' +
        '<i>למשל: י"א, י"ב, או תכתוב את השם של הקורס</i>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [
              ['ח\'', 'ט\''],
              ['י\'', 'י"א', 'י"ב'],
              ['בגרות מתמטיקה', 'אחר']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
      return true;
    }
    
    if (currentState === 'awaiting_class_grade') {
      const grade = ctx.message.text.trim();
      
      await student.update({
        notes: `כיתה/קורס: ${grade}`,
        current_conversation_state: 'awaiting_address',
        conversation_context: { 
          registrationStep: 'address',
          grade: grade
        }
      });
      
      await ctx.reply(
        '📚 נרשם!\n\n' +
        '📍 <b>מה הכתובת שלך?</b>\n' +
        '<i>כתוב עיר או אזור מגורים (לצורך תיאום שיעורים)</i>',
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true }
        }
      );
      return true;
    }
    
    if (currentState === 'awaiting_address') {
      const address = ctx.message.text.trim();
      const context = student.conversation_context || {};
      
      await student.update({
        notes: `כיתה/קורס: ${context.grade || 'לא צוין'}\nכתובת: ${address}`,
        current_conversation_state: null,
        conversation_context: null
      });
      
      await ctx.reply(
        '🎉 <b>רישום הושלם בהצלחה!</b>\n\n' +
        `שלום ${student.full_name}!\n` +
        'עכשיו אתה יכול לתאם איתי שיעורים! 📖\n\n' +
        '💡 <b>דוגמאות למה שאתה יכול לכתוב:</b>\n' +
        '• "אני רוצה שיעור מחר בשעה 4"\n' +
        '• "תראה לי זמנים פנויים השבוע"\n' +
        '• "בוא נתאם שיעור ליום רביעי"\n' +
        '• "איזה זמנים יש לך מחר?"\n\n' +
        'בברכה,\n' +
        'שפיר 🤖',
        { parse_mode: 'HTML' }
      );
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Error in student registration:', error);
    await ctx.reply('אירעה שגיאה ברישום. אנא נסה שוב.');
    return true;
  }
}

/**
 * Handle updating personal details
 */
async function handleDetailsUpdate(ctx, message, student, field) {
  try {
    const value = message.trim();
    
    if (!value || value.length < 2) {
      await ctx.reply('הערך שהוזן קצר מדי. אנא נסה שוב:', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🚫 בטל עדכון', 'back_to_menu')],
          [Markup.button.callback('📞 עזרה', 'help')]
        ]).reply_markup
      });
      return;
    }

    const fieldMapping = {
      'name': 'full_name',
      'phone': 'phone_number', 
      'email': 'email',
      'parent_name': 'parent_name',
      'parent_phone': 'parent_phone',
      'parent_email': 'parent_email'
    };

    const fieldNames = {
      'name': 'שם מלא',
      'phone': 'טלפון',
      'email': 'אימייל',
      'parent_name': 'שם הורה',
      'parent_phone': 'טלפון הורה',
      'parent_email': 'אימייל הורה'
    };

    const dbField = fieldMapping[field];
    const fieldName = fieldNames[field];

    if (!dbField) {
      await ctx.reply('❌ שדה לא מוכר. אנא נסה שוב.');
      return;
    }

    // Simple validation for email
    if (field === 'email' || field === 'parent_email') {
      if (!value.includes('@') || !value.includes('.')) {
        await ctx.reply('❌ כתובת האימייל לא תקינה. אנא הזן כתובת אימייל תקינה:', {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🚫 בטל עדכון', 'back_to_menu')],
            [Markup.button.callback('📞 עזרה', 'help')]
          ]).reply_markup
        });
        return;
      }
    }

    // Simple validation for phone
    if (field === 'phone' || field === 'parent_phone') {
      const phoneRegex = /^[\d\s\-\+\(\)]{9,15}$/;
      if (!phoneRegex.test(value)) {
        await ctx.reply('❌ מספר הטלפון לא תקין. אנא הזן מספר טלפון תקין:', {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🚫 בטל עדכון', 'back_to_menu')],
            [Markup.button.callback('📞 עזרה', 'help')]
          ]).reply_markup
        });
        return;
      }
    }

    // Update the student record
    await student.update({
      [dbField]: value
    });

    await ctx.reply(
      `✅ <b>${fieldName} עודכן בהצלחה!</b>\n\nהערך החדש: ${value}`,
      { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('✏️ עדכן פרט נוסף', 'update_personal_details')],
          [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
        ]).reply_markup
      }
    );

    // Clear conversation state
    ctx.session.step = null;

    logger.info(`Student ${student.id} updated ${field} to: ${value}`);

  } catch (error) {
    logger.error('Error updating student details:', error);
    await ctx.reply('❌ אירעה שגיאה בעדכון הפרטים. אנא נסה שוב.');
    ctx.session.step = null;
  }
}

module.exports = {
  handleText,
  handleContact,
  handleLocation,
  validateAndSanitizeInput,
  checkRateLimit,
  handleStudentRegistration,
  handleDetailsUpdate
}; 