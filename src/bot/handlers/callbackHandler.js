const moment = require('moment-timezone');
const { Markup } = require('telegraf');
const schedulerService = require('../../services/scheduler');
const { Lesson, Waitlist } = require('../../models');
const logger = require('../../utils/logger');
const settings = require('../../config/settings');

/**
 * Main callback query handler
 */
async function handle(ctx) {
  try {
    const callbackData = ctx.callbackQuery.data;
    const student = ctx.student;
    
    if (!student) {
      await ctx.answerCbQuery('❌ User not found. Please start the bot again.');
      return;
    }

    logger.info('Callback query received', { 
      studentId: student.id, 
      callbackData 
    });

    // Answer the callback query to remove loading state
    await ctx.answerCbQuery();

    // Route to appropriate handler based on callback data
    switch (callbackData) {
      case 'book_lesson':
        await handleBookLesson(ctx, student);
        break;
        
      case 'my_schedule':
        await handleMySchedule(ctx, student);
        break;
        
      case 'my_status':
        await handleMyStatus(ctx, student);
        break;
        
      case 'help':
        await handleHelp(ctx, student);
        break;
        
      case 'settings':
        await handleSettings(ctx, student);
        break;
        
      case 'waitlist_join':
        await handleWaitlistJoin(ctx, student);
        break;
        
      case 'show_available_times':
        await handleShowAvailableTimes(ctx, student);
        break;
        
      case 'back_to_menu':
        await handleBackToMenu(ctx, student);
        break;
        
      default:
        // Handle complex callback data (with parameters)
        if (callbackData.startsWith('book_slot_')) {
          await handleBookSlot(ctx, callbackData, student);
        } else if (callbackData.startsWith('cancel_lesson_')) {
          await handleCancelLesson(ctx, callbackData, student);
        } else if (callbackData.startsWith('confirm_')) {
          await handleConfirm(ctx, callbackData, student);
        } else {
          logger.warn('Unknown callback data:', callbackData);
          await ctx.reply('❓ Unknown action. Please try again.');
        }
    }

  } catch (error) {
    logger.error('Callback handler error:', error);
    
    try {
      await ctx.answerCbQuery('❌ Something went wrong');
      await ctx.reply('❌ Sorry, something went wrong. Please try again or use /help for assistance.');
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
}

/**
 * Handle book lesson callback
 */
async function handleBookLesson(ctx, student) {
  await ctx.reply(
    `📚 <b>Book a Math Lesson</b>\n\nPlease tell me when you'd like to schedule your lesson. You can say things like:\n\n• "I want a lesson tomorrow at 3 PM"\n• "I'm free next Tuesday afternoon"\n• "Book me something this Friday after 4"\n\nJust type your preferred time naturally! 🕐`,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📅 Show Available Times', 'show_available_times')],
        [Markup.button.callback('⏰ Join Waitlist', 'waitlist_join')]
      ]).reply_markup
    }
  );
  ctx.session.step = 'booking_request';
}

/**
 * Handle my schedule callback
 */
async function handleMySchedule(ctx, student) {
  const commandHandlers = require('../commands');
  await commandHandlers.schedule(ctx);
}

/**
 * Handle my status callback
 */
async function handleMyStatus(ctx, student) {
  const commandHandlers = require('../commands');
  await commandHandlers.status(ctx);
}

/**
 * Handle help callback
 */
async function handleHelp(ctx, student) {
  const commandHandlers = require('../commands');
  await commandHandlers.help(ctx);
}

/**
 * Handle settings callback
 */
async function handleSettings(ctx, student) {
  const commandHandlers = require('../commands');
  await commandHandlers.settings(ctx);
}

/**
 * Handle waitlist join callback
 */
async function handleWaitlistJoin(ctx, student) {
  await ctx.reply(
    `⏰ <b>Join Waitlist</b>\n\nTell me your preferred time and I'll add you to the waitlist. When a slot becomes available, I'll notify you immediately!\n\nExample: "I want to be on the waitlist for Monday afternoons"`,
    { parse_mode: 'HTML' }
  );
  ctx.session.step = 'waitlist_request';
}

/**
 * Handle show available times callback
 */
async function handleShowAvailableTimes(ctx, student) {
  try {
    // Get next available slots
    const availableSlots = await schedulerService.findNextAvailableSlots(
      student.preferred_lesson_duration || settings.lessons.defaultDuration,
      7 // Next 7 days
    );
    
    if (availableSlots.length === 0) {
      await ctx.reply(
        `📅 <b>No Available Times</b>\n\nThere are no available time slots in the next week. Would you like to join the waitlist?`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('⏰ Join Waitlist', 'waitlist_join')],
            [Markup.button.callback('« Back', 'back_to_menu')]
          ]).reply_markup
        }
      );
      return;
    }
    
    let message = `📅 <b>Available Time Slots</b>\n\nHere are the next available times:\n\n`;
    const buttons = [];
    
    availableSlots.slice(0, 6).forEach((slot, index) => {
      const slotTime = moment(slot.start).tz(student.timezone || settings.teacher.timezone);
      message += `${index + 1}. ${slotTime.format('ddd, MMM Do [at] h:mm A')}\n`;
      buttons.push([Markup.button.callback(`📚 Book Slot ${index + 1}`, `book_slot_${index}`)]);
    });
    
    buttons.push([Markup.button.callback('« Back', 'back_to_menu')]);
    
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
    
  } catch (error) {
    logger.error('Error showing available times:', error);
    await ctx.reply('❌ Sorry, there was an error loading available times. Please try again.');
  }
}

/**
 * Handle book slot callback
 */
async function handleBookSlot(ctx, callbackData, student) {
  try {
    const slotIndex = callbackData.split('_')[2];
    
    await ctx.reply(
      `✅ <b>Slot Selected!</b>\n\nYou've selected slot ${parseInt(slotIndex) + 1}. I'll now process your booking and send you a confirmation.\n\n⏳ Processing...`,
      { parse_mode: 'HTML' }
    );
    
    // Here you would implement the actual booking logic
    setTimeout(async () => {
      try {
        await ctx.reply(
          `🎉 <b>Lesson Booked Successfully!</b>\n\nYour math lesson has been scheduled. You'll receive detailed confirmation and calendar invite shortly.\n\n📧 Check your notifications for more details.`,
          { 
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 View My Schedule', 'my_schedule')],
              [Markup.button.callback('🏠 Main Menu', 'back_to_menu')]
            ]).reply_markup
          }
        );
      } catch (error) {
        logger.error('Error sending booking confirmation:', error);
      }
    }, 2000);
    
    logger.info('Lesson booked via callback', { 
      studentId: student.id, 
      slotIndex 
    });
    
  } catch (error) {
    logger.error('Error in slot booking:', error);
    await ctx.reply('❌ Sorry, there was an error booking your lesson. Please try again.');
  }
}

/**
 * Handle cancel lesson callback
 */
async function handleCancelLesson(ctx, callbackData, student) {
  try {
    const lessonId = callbackData.split('_')[2];
    
    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Yes, Cancel', `confirm_cancel_${lessonId}`)],
      [Markup.button.callback('❌ No, Keep Lesson', 'back_to_menu')]
    ]);
    
    await ctx.reply(
      `❓ <b>Confirm Cancellation</b>\n\nAre you sure you want to cancel this lesson?\n\n⚠️ Cancellation policy applies.`,
      {
        parse_mode: 'HTML',
        reply_markup: buttons.reply_markup
      }
    );
    
  } catch (error) {
    logger.error('Error in lesson cancellation:', error);
    await ctx.reply('❌ Sorry, there was an error. Please try again.');
  }
}

/**
 * Handle confirmation callbacks
 */
async function handleConfirm(ctx, callbackData, student) {
  try {
    const parts = callbackData.split('_');
    const action = parts[1];
    const id = parts[2];
    
    if (action === 'cancel') {
      await ctx.reply(
        `✅ <b>Lesson Cancelled</b>\n\nYour lesson has been successfully cancelled. Any applicable refunds will be processed according to our policy.`,
        { parse_mode: 'HTML' }
      );
      
      logger.info('Lesson cancelled via callback', { 
        studentId: student.id, 
        lessonId: id 
      });
    }
    
  } catch (error) {
    logger.error('Error in confirmation:', error);
    await ctx.reply('❌ Sorry, there was an error. Please try again.');
  }
}

/**
 * Handle back to menu callback
 */
async function handleBackToMenu(ctx, student) {
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('📚 Book a Lesson', 'book_lesson')],
    [
      Markup.button.callback('📅 My Schedule', 'my_schedule'),
      Markup.button.callback('📊 Status', 'my_status')
    ],
    [
      Markup.button.callback('⚙️ Settings', 'settings'),
      Markup.button.callback('❓ Help', 'help')
    ]
  ]);

  await ctx.reply(
    `🎓 <b>Math Tutoring Bot</b>\n\nHi ${student.getDisplayName()}! What would you like to do?`,
    {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    }
  );
}

module.exports = {
  handle
}; 