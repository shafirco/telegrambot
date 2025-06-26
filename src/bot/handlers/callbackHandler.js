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
      await ctx.answerCbQuery('❌ המשתמש לא נמצא. אנא הפעל את הבוט מחדש.');
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
        
      case 'settings_done':
        await handleSettingsDone(ctx, student);
        break;
        
      case 'set_language':
        await handleSetLanguage(ctx, student);
        break;
        
      case 'view_waitlist':
        await handleViewWaitlist(ctx, student);
        break;
        
      case 'book_different_time':
        await handleBookDifferentTime(ctx, student);
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
          await ctx.reply('❓ פעולה לא מוכרת. אנא נסה שוב.');
        }
    }

  } catch (error) {
    logger.error('Callback handler error:', error);
    
    try {
      await ctx.answerCbQuery('❌ משהו השתבש');
      await ctx.reply('❌ סליחה, משהו השתבש. אנא נסה שוב או השתמש ב-/help לעזרה.');
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
    `📚 <b>תיאום שיעור מתמטיקה</b>\n\nאנא ספר לי מתי תרצה לתאם את השיעור. אתה יכול לומר דברים כמו:\n\n• "אני רוצה שיעור מחר בשעה 3 אחר הצהריים"\n• "אני פנוי ביום שלישי הבא אחר הצהריים"\n• "תתאם לי משהו ביום שישי אחרי 4"\n\nפשוט כתוב את הזמן המועדף עליך באופן טבעי! 🕐`,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📅 הצג זמנים זמינים', 'show_available_times')],
        [Markup.button.callback('⏰ הצטרף לרשימת המתנה', 'waitlist_join')]
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
    `⏰ <b>הצטרפות לרשימת המתנה</b>\n\nספר לי את הזמן המועדף עליך ואני אוסיף אותך לרשימת המתנה. כשיתפנה מקום, אני אודיע לך מיד!\n\nדוגמה: "אני רוצה להיות ברשימת המתנה לימי שני אחר הצהריים"`,
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
        `📅 <b>אין זמנים זמינים</b>\n\nאין זמנים פנויים בשבוע הקרוב. האם תרצה להצטרף לרשימת המתנה?`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('⏰ הצטרף לרשימת המתנה', 'waitlist_join')],
            [Markup.button.callback('« חזור', 'back_to_menu')]
          ]).reply_markup
        }
      );
      return;
    }
    
    let message = `📅 <b>זמנים זמינים</b>\n\nהנה הזמנים הזמינים הבאים:\n\n`;
    const buttons = [];
    
    availableSlots.slice(0, 6).forEach((slot, index) => {
      const slotTime = moment(slot.start).tz(student.timezone || settings.teacher.timezone);
      message += `${index + 1}. ${slotTime.format('dddd, D בMMMM בשעה HH:mm')}\n`;
      buttons.push([Markup.button.callback(`📚 תאם זמן ${index + 1}`, `book_slot_${index}`)]);
    });
    
    buttons.push([Markup.button.callback('« חזור', 'back_to_menu')]);
    
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
    
  } catch (error) {
    logger.error('Error showing available times:', error);
    await ctx.reply('❌ סליחה, הייתה שגיאה בטעינת הזמנים הזמינים. אנא נסה שוב.');
  }
}

/**
 * Handle book slot callback
 */
async function handleBookSlot(ctx, callbackData, student) {
  try {
    const slotIndex = callbackData.split('_')[2];
    
    await ctx.reply(
      `✅ <b>זמן נבחר!</b>\n\nהזמן ${parseInt(slotIndex) + 1} נבחר. אשמח לעבור על ההזמן ולשלוח לך אימייל מחולל.\n\n⏳ עבור...`,
      { parse_mode: 'HTML' }
    );
    
    // Here you would implement the actual booking logic
    setTimeout(async () => {
      try {
        await ctx.reply(
          `🎉 <b>השיעור נתאם בהצלחה!</b>\n\nהשיעור של מתמטיקה שלך נתאם בהצלחה. אתה תקבל אימייל מפרט מלא והזמנה לשלוח לך מידי.\n\n📧 בדוק את ההתראות שלך לפרטים נוספים.`,
          { 
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 הצג את המערכת שלי', 'my_schedule')],
              [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
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
    await ctx.reply('❌ סליחה, משהו השתבש. אנא נסה שוב.');
  }
}

/**
 * Handle cancel lesson callback
 */
async function handleCancelLesson(ctx, callbackData, student) {
  try {
    const lessonId = callbackData.split('_')[2];
    
    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('✅ כן, בטל', `confirm_cancel_${lessonId}`)],
      [Markup.button.callback('❌ לא, שמור את השיעור', 'back_to_menu')]
    ]);
    
    await ctx.reply(
      `❓ <b>אימת בטלות</b>\n\nהאם אתה בטול שיעור זה?`,
      {
        parse_mode: 'HTML',
        reply_markup: buttons.reply_markup
      }
    );
    
  } catch (error) {
    logger.error('Error in lesson cancellation:', error);
    await ctx.reply('❌ סליחה, משהו השתבש. אנא נסה שוב.');
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
        `✅ <b>השיעור בוטל</b>\n\nהשיעור שלך נבוטל בהצלחה. כל מזיון מקולקטי יועבר לפי יועמת המדינה.`,
        { parse_mode: 'HTML' }
      );
      
      logger.info('Lesson cancelled via callback', { 
        studentId: student.id, 
        lessonId: id 
      });
    }
    
  } catch (error) {
    logger.error('Error in confirmation:', error);
    await ctx.reply('❌ סליחה, משהו השתבש. אנא נסה שוב.');
  }
}

/**
 * Handle back to menu callback
 */
async function handleBackToMenu(ctx, student) {
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('📚 הזמן שיעור', 'book_lesson')],
    [
      Markup.button.callback('📅 את המערכת שלי', 'my_schedule'),
      Markup.button.callback('📊 מצב', 'my_status')
    ],
    [
      Markup.button.callback('⚙️ הגדרות', 'settings'),
      Markup.button.callback('❓ עזרה', 'help')
    ]
  ]);

  await ctx.reply(
    `🎓 <b>בוט מתמטיקה</b>\n\nהיי ${student.getDisplayName()}! מה תרצה לעשות?`,
    {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    }
  );
}

/**
 * Handle settings done callback
 */
async function handleSettingsDone(ctx, student) {
  await ctx.reply(
    `✅ <b>הגדרות נשמרו</b>\n\nההגדרות שלך נשמרו בהצלחה!`,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📚 תאם שיעור', 'book_lesson')],
        [Markup.button.callback('📅 הלוח שלי', 'my_schedule'), Markup.button.callback('📊 סטטוס', 'my_status')],
        [Markup.button.callback('❓ עזרה', 'help')]
      ]).reply_markup
    }
  );
}

/**
 * Handle set language callback
 */
async function handleSetLanguage(ctx, student) {
  await ctx.reply(
    `🌐 <b>בחירת שפה</b>\n\nהבוט פועל כרגע בעברית. תכונת שינוי שפה תהיה זמינה בקרוב.`,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('« חזור להגדרות', 'settings')]
      ]).reply_markup
    }
  );
}

/**
 * Handle view waitlist callback
 */
async function handleViewWaitlist(ctx, student) {
  try {
    const waitlistEntries = await Waitlist.findAll({
      where: { student_id: student.id, status: 'active' },
      order: [['created_at', 'DESC']]
    });

    if (waitlistEntries.length === 0) {
      await ctx.reply(
        `⏰ <b>רשימת המתנה</b>\n\nאינך ברשימת המתנה כרגע.`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('⏰ הצטרף לרשימת המתנה', 'waitlist_join')],
            [Markup.button.callback('« חזור', 'back_to_menu')]
          ]).reply_markup
        }
      );
      return;
    }

    let message = `⏰ <b>רשימת המתנה שלך</b>\n\n`;
    waitlistEntries.forEach((entry, index) => {
      const preferredTime = entry.preferred_start_time 
        ? moment(entry.preferred_start_time).format('dddd, D בMMMM בשעה HH:mm')
        : 'זמן גמיש';
      message += `${index + 1}. ${preferredTime}\n   מיקום ברשימה: ${entry.position || 'טרם נקבע'}\n\n`;
    });

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('« חזור', 'back_to_menu')]
      ]).reply_markup
    });

  } catch (error) {
    logger.error('Error viewing waitlist:', error);
    await ctx.reply('❌ שגיאה בטעינת רשימת המתנה. אנא נסה שוב.');
  }
}

/**
 * Handle book different time callback
 */
async function handleBookDifferentTime(ctx, student) {
  await ctx.reply(
    `🔍 <b>בחירת זמן אחר</b>\n\nאנא ספר לי את הזמן המועדף עליך. אתה יכול לומר דברים כמו:\n\n• "אני רוצה שיעור ביום רביעי הבא בשעה 5"\n• "איזה זמנים פנויים יש בסוף השבוע?"\n• "תתאם לי משהו השבוע הבא אחר הצהריים"\n\nפשוט כתוב את בקשתך באופן טבעי! 🕐`,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📅 הצג זמנים זמינים', 'show_available_times')],
        [Markup.button.callback('⏰ הצטרף לרשימת המתנה', 'waitlist_join')],
        [Markup.button.callback('« חזור', 'back_to_menu')]
      ]).reply_markup
    }
  );
  ctx.session.step = 'booking_request';
}

module.exports = {
  handle
}; 