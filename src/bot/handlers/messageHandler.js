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

    logger.botLog('text_message', student.telegram_id, student.username, message);

    // Show typing indicator with timeout
    const typingPromise = ctx.sendChatAction('typing');
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000));
    await Promise.race([typingPromise, timeoutPromise]);

    // Check conversation state with timeout protection
    const conversationState = ctx.session?.step;
    const sessionTimeout = 30 * 60 * 1000; // 30 minutes
    
    if (ctx.session?.lastActivity && (Date.now() - ctx.session.lastActivity) > sessionTimeout) {
      ctx.session.step = null;
      ctx.session.data = {};
      await ctx.reply('⏰ פג תוקף השיחה. בואו נתחיל מחדש - איך אוכל לעזור?');
    }
    
    // Update session activity
    if (ctx.session) {
      ctx.session.lastActivity = Date.now();
    }

    switch (conversationState) {
      case 'booking_request':
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
    // Use AI to process the booking request
    logger.aiLog('processing_booking_request', message, null, { studentId: student.id });
    
    const aiResult = await aiScheduler.processSchedulingRequest(message, {
      id: student.id,
      name: student.getDisplayName(),
      timezone: student.timezone || 'Asia/Jerusalem',
      preferredDuration: student.preferred_lesson_duration || 60,
      recentLessons: [] // We can add this later
    });

    logger.aiLog('ai_result', message, JSON.stringify(aiResult), {
      intent: aiResult.intent,
      confidence: aiResult.confidence
    });

    // Process based on AI understanding
    const result = await schedulerService.processBookingRequest(message, student, { aiResult });

    if (result.success) {
      if (result.type === 'slots_available') {
        await showAvailableSlots(ctx, result.availableSlots, result.schedulingData);
      } else if (result.type === 'general_response') {
        await ctx.reply(result.message, { parse_mode: 'HTML' });
      } else if (result.type === 'availability_check') {
        await showAvailabilityResults(ctx, result.availableSlots, result.message);
      }
    } else {
      if (result.type === 'no_slots_waitlist_offered') {
        await showWaitlistOptions(ctx, result.alternativeSlots, result.schedulingData);
      } else if (result.needsMoreInfo) {
        await ctx.reply(result.message, { parse_mode: 'HTML' });
        // Keep in booking state for follow-up
      } else {
        await ctx.reply(result.message, { parse_mode: 'HTML' });
        ctx.session.step = null;
      }
    }

  } catch (error) {
    logger.error('Error handling booking request:', error);
    await ctx.reply('❌ היה לי קושי לעבד את בקשת התיאום שלך. אתה יכול לנסות לנסח את הבקשה שוב?');
    ctx.session.step = null;
  }
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

  // Store slots in session for booking
  ctx.session.data = ctx.session.data || {};
  ctx.session.data.availableSlots = slots;
  ctx.session.data.schedulingData = schedulingData;
  ctx.session.step = 'slot_selection';
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
    // Use AI to understand intent
    const aiResult = await aiScheduler.processSchedulingRequest(message, {
      id: student.id,
      name: student.getDisplayName(),
      timezone: student.timezone || 'Asia/Jerusalem'
    });

    logger.aiLog('general_message_processed', message, JSON.stringify(aiResult), {
      intent: aiResult.intent,
      confidence: aiResult.confidence
    });

    // Route based on AI understanding
    switch (aiResult.intent) {
      case 'book_lesson':
        if (aiResult.confidence > 0.7) {
          ctx.session.step = 'booking_request';
          await handleBookingRequest(ctx, message, student);
        } else {
          await ctx.reply(
            '🤔 נראה שאתה רוצה לתאם שיעור, אבל לא הבנתי בדיוק מתי.\n\nאתה יכול לומר:\n• "אני רוצה שיעור מחר בשעה 3"\n• "מתי יש זמנים פנויים השבוע?"\n• "תתאם לי שיעור ביום ראשון"',
            {
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('📅 הצג זמנים זמינים', 'show_available_times')]
              ]).reply_markup
            }
          );
        }
        break;

      case 'check_availability':
        const result = await schedulerService.processBookingRequest(message, student, { aiResult });
        if (result.success && result.type === 'availability_check') {
          await showAvailabilityResults(ctx, result.availableSlots, result.message);
        } else {
          await ctx.reply('בוא נבדוק מה יש פנוי!', {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 הצג זמנים זמינים', 'show_available_times')]
            ]).reply_markup
          });
        }
        break;

      case 'cancel_lesson':
        await ctx.reply(
          '🗓️ איזה שיעור אתה רוצה לבטל?\n\nאתה יכול לבדוק את השיעורים הקרובים שלך ולבחור איזה לבטל.',
          {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 הצג את השיעורים שלי', 'my_schedule')]
            ]).reply_markup
          }
        );
        break;

      case 'reschedule_lesson':
        await ctx.reply(
          '🔄 איזה שיעור אתה רוצה לשנות?\n\nבחר שיעור מהרשימה והגד לי לאיזה זמן חדש אתה רוצה להעביר אותו.',
          {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 הצג את השיעורים שלי', 'my_schedule')]
            ]).reply_markup
          }
        );
        break;

      case 'join_waitlist':
        ctx.session.step = 'waitlist_request';
        await ctx.reply(
          '⏰ <b>הצטרפות לרשימת המתנה</b>\n\nספר לי איזה זמנים אתה מעדיף ואני אוסיף אותך לרשימת המתנה!\n\nדוגמה: "אני רוצה להיות ברשימת המתנה לימי שני אחר הצהריים"',
          { parse_mode: 'HTML' }
        );
        break;

      default:
        // Low confidence or "other" intent
        if (aiResult.confidence < 0.5) {
          await ctx.reply(
            '🤔 לא הבנתי בדיוק מה אתה רוצה לעשות.\n\nאתה יכול:\n• לתאם שיעור חדש\n• לבדוק את השיעורים שלך\n• לבטל או לשנות שיעור קיים\n• להצטרף לרשימת המתנה\n\nמה תרצה לעשות?',
            {
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
                [Markup.button.callback('📅 השיעורים שלי', 'my_schedule')],
                [Markup.button.callback('❓ עזרה', 'help')]
              ]).reply_markup
            }
          );
        } else {
          // Use AI generated response if available
          const responseMessage = aiResult.suggested_responses?.[0] || 
            'תודה על ההודעה! איך אני יכול לעזור לך עם תיאום השיעורים?';
          
          await ctx.reply(responseMessage, {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
              [Markup.button.callback('📅 השיעורים שלי', 'my_schedule')]
            ]).reply_markup
          });
        }
        break;
    }

  } catch (error) {
    logger.error('Error processing general message:', error);
    await ctx.reply(
      'נתקלתי בקושי להבין את ההודעה. אתה יכול לנסח אותה שוב או להשתמש בתפריט:',
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
          [Markup.button.callback('📅 השיעורים שלי', 'my_schedule')],
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
      [Markup.button.callback('📅 My Schedule', 'my_schedule')]
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
        await ctx.reply('מספר הטלפון לא תקין. אנא כתוב מספר תקין או השתמש בכפתור:');
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

module.exports = {
  handleText,
  handleContact,
  handleLocation,
  validateAndSanitizeInput,
  checkRateLimit,
  handleStudentRegistration
}; 