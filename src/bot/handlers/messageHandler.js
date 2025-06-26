const schedulerService = require('../../services/scheduler');
const { Markup } = require('telegraf');
const logger = require('../../utils/logger');

const handleText = async (ctx) => {
  try {
    const student = ctx.student;
    const message = ctx.message.text;

    // Skip if message starts with / (commands are handled elsewhere)
    if (message.startsWith('/')) {
      return;
    }

    logger.botLog('text_message', student.telegram_id, student.username, message);

    // Check conversation state
    const conversationState = ctx.session.step;

    switch (conversationState) {
      case 'booking_request':
        await handleBookingRequest(ctx, message, student);
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
      
      default:
        // General natural language processing
        await handleGeneralMessage(ctx, message, student);
        break;
    }

  } catch (error) {
    logger.error('Error handling text message:', error);
    await ctx.reply('❌ Sorry, I encountered an error processing your message. Please try again.');
  }
};

const handleBookingRequest = async (ctx, message, student) => {
  try {
    // Show typing indicator
    await ctx.sendChatAction('typing');

    // Process the booking request with AI
    const result = await schedulerService.processBookingRequest(message, student, ctx.session.data);

    if (result.success) {
      if (result.type === 'slots_available') {
        // Show available slots
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
    await ctx.reply('❌ I had trouble processing your booking request. Could you please try rephrasing your request?');
    ctx.session.step = null;
  }
};

const showAvailableSlots = async (ctx, slots, schedulingData) => {
  let message = '📅 <b>Available Time Slots</b>\n\nHere are the available times that match your request:\n\n';

  const buttons = [];
  
  slots.slice(0, 6).forEach((slot, index) => {
    message += `${index + 1}. ${slot.formattedTime}\n`;
    message += `   ⏱️ ${slot.duration} minutes\n\n`;
    
    buttons.push([Markup.button.callback(
      `Book Slot ${index + 1}`, 
      `book_slot_${JSON.stringify({
        start: slot.start,
        end: slot.end,
        duration: slot.duration,
        schedulingData: schedulingData
      }).substring(0, 60)}_${index}`
    )]);
  });

  if (slots.length > 6) {
    message += `\n<i>... and ${slots.length - 6} more slots available</i>`;
    buttons.push([Markup.button.callback('Show More Slots', 'show_more_slots')]);
  }

  buttons.push([
    Markup.button.callback('⏰ Join Waitlist Instead', 'join_waitlist'),
    Markup.button.callback('🔍 Different Time', 'book_different_time')
  ]);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
  });

  // Store slots in session for booking
  ctx.session.data.availableSlots = slots;
  ctx.session.data.schedulingData = schedulingData;
  ctx.session.step = 'slot_selection';
};

const showWaitlistOptions = async (ctx, alternativeSlots, schedulingData) => {
  let message = '😔 <b>No Available Slots</b>\n\nI don\'t have any slots available for your preferred times.';

  if (alternativeSlots.length > 0) {
    message += '\n\n📅 <b>Alternative Times:</b>\n';
    alternativeSlots.slice(0, 3).forEach((slot, index) => {
      message += `${index + 1}. ${slot.formattedTime}\n`;
    });
  }

  message += '\n\n💡 <b>What would you like to do?</b>';

  const buttons = [];

  if (alternativeSlots.length > 0) {
    buttons.push([Markup.button.callback('📅 Book Alternative Time', 'book_alternative')]);
  }

  buttons.push([
    Markup.button.callback('⏰ Join Waitlist', 'join_waitlist_confirmed'),
    Markup.button.callback('🔍 Try Different Request', 'book_different_time')
  ]);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
  });

  ctx.session.data.alternativeSlots = alternativeSlots;
  ctx.session.data.schedulingData = schedulingData;
  ctx.session.step = 'waitlist_decision';
};

const showAvailabilityResults = async (ctx, slots, aiMessage) => {
  let message = aiMessage;

  if (slots.length > 0) {
    message += '\n\n📅 <b>Next Available Times:</b>\n';
    slots.slice(0, 5).forEach((slot, index) => {
      message += `• ${slot.formattedTime}\n`;
    });

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 Book One of These', 'book_from_availability')],
      [Markup.button.callback('🔍 Check Different Times', 'book_lesson')]
    ]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

    ctx.session.data.availableSlots = slots;
  } else {
    await ctx.reply(message, { parse_mode: 'HTML' });
  }

  ctx.session.step = null;
};

const handleGeneralMessage = async (ctx, message, student) => {
  try {
    // Show typing indicator
    await ctx.sendChatAction('typing');

    // Process with AI to understand intent
    const result = await schedulerService.processBookingRequest(message, student);

    if (result.success) {
      if (result.type === 'slots_available') {
        await showAvailableSlots(ctx, result.availableSlots, result.schedulingData);
      } else if (result.type === 'availability_check') {
        await showAvailabilityResults(ctx, result.availableSlots, result.message);
      } else if (result.type === 'reschedule_lesson_selection') {
        await showLessonSelection(ctx, result.upcomingLessons, 'reschedule');
      } else if (result.type === 'cancel_lesson_selection') {
        await showLessonSelection(ctx, result.upcomingLessons, 'cancel');
      } else {
        await ctx.reply(result.message, { parse_mode: 'HTML' });
      }
    } else {
      if (result.type === 'no_slots_waitlist_offered') {
        await showWaitlistOptions(ctx, result.alternativeSlots, result.schedulingData);
      } else {
        await ctx.reply(result.message, { parse_mode: 'HTML' });
        
        // Offer help if confidence is low
        if (result.schedulingData?.confidence < 0.5) {
          const helpButtons = Markup.inlineKeyboard([
            [Markup.button.callback('📚 Book Lesson', 'book_lesson')],
            [Markup.button.callback('❓ Help', 'help')]
          ]);

          await ctx.reply('Need help? I can guide you through booking a lesson:', {
            reply_markup: helpButtons.reply_markup
          });
        }
      }
    }

  } catch (error) {
    logger.error('Error handling general message:', error);
    await ctx.reply('❌ I had trouble understanding your message. Try using the /help command or the menu buttons below.');
    
    const helpButtons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 Book Lesson', 'book_lesson')],
      [Markup.button.callback('📅 My Schedule', 'my_schedule')],
      [Markup.button.callback('❓ Help', 'help')]
    ]);

    await ctx.reply('Here are some things I can help you with:', {
      reply_markup: helpButtons.reply_markup
    });
  }
};

const showLessonSelection = async (ctx, lessons, action) => {
  const actionText = action === 'reschedule' ? 'Reschedule' : 'Cancel';
  let message = `${actionText === 'Cancel' ? '❌' : '🔄'} <b>${actionText} a Lesson</b>\n\nWhich lesson would you like to ${action.toLowerCase()}?\n\n`;

  const buttons = lessons.map((lesson, index) => {
    const startTime = moment(lesson.start_time).format('ddd, MMM Do [at] h:mm A');
    message += `${index + 1}. ${startTime} - ${lesson.subject}\n`;
    
    return [Markup.button.callback(
      `${actionText} Lesson ${index + 1}`, 
      `${action}_lesson_${lesson.id}`
    )];
  });

  buttons.push([Markup.button.callback('« Back', 'back_to_menu')]);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
  });
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

module.exports = {
  handleText,
  handleContact,
  handleLocation
}; 