const moment = require('moment-timezone');
const { Markup } = require('telegraf');
const schedulerService = require('../../services/scheduler');
const { Lesson, Waitlist, Student } = require('../../models');
const logger = require('../../utils/logger');
const settings = require('../../config/settings');
const { Op } = require('sequelize');

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
        
      case 'my_lessons':
        await handleMyLessons(ctx, student);
        break;
        
      case 'my_schedule':
        await handleMyLessons(ctx, student);
        break;
        
      case 'my_status':
        await handleMyStatus(ctx, student);
        break;
        
      case 'teacher_details':
        await handleTeacherDetails(ctx, student);
        break;
        
      case 'lesson_details':
        await handleLessonDetails(ctx, callbackData, student);
        break;
        
      case 'help':
        await handleHelp(ctx, student);
        break;
        
      case 'settings':
        await handleSettings(ctx, student);
        break;
        
      case 'waitlist_join':
      case 'join_waitlist':
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
        
      case 'update_profile':
        await handleUpdateProfile(ctx, student);
        break;
        
      case 'contact_teacher':
        await handleContactTeacher(ctx, student);
        break;
        
      case 'reschedule_lesson':
        await handleRescheduleLesson(ctx, student);
        break;
        
      case 'cancel_lesson':
        await handleCancelLessonMenu(ctx, student);
        break;
        
      case 'update_personal_details':
        await handleUpdatePersonalDetails(ctx, student);
        break;
        
      default:
        // Handle complex callback data (with parameters)
        if (callbackData.startsWith('book_slot_')) {
          await handleBookSlot(ctx, callbackData, student);
        } else if (callbackData.startsWith('lesson_details_')) {
          await handleLessonDetails(ctx, callbackData, student);
        } else if (callbackData.startsWith('cancel_lesson_')) {
          await handleCancelLesson(ctx, callbackData, student);
        } else if (callbackData.startsWith('confirm_cancel_')) {
          await handleConfirmCancel(ctx, callbackData, student);
        } else if (callbackData.startsWith('reschedule_lesson_')) {
          await handleRescheduleSpecificLesson(ctx, callbackData, student);
        } else if (callbackData.startsWith('reschedule_confirm_')) {
          await handleRescheduleConfirm(ctx, callbackData, student);
        } else if (callbackData.startsWith('reschedule_custom_')) {
          await handleRescheduleCustom(ctx, callbackData, student);
        } else if (callbackData.startsWith('confirm_')) {
          await handleConfirm(ctx, callbackData, student);
        } else if (callbackData === 'back_to_menu') {
          await handleBackToMenu(ctx, student);
        } else if (callbackData === 'book_alternative' || callbackData.startsWith('book_slot_')) {
          await handleBookAlternative(ctx, callbackData, student);
        } else if (callbackData.startsWith('waitlist_day_')) {
          await handleWaitlistDay(ctx, student);
        } else if (callbackData.startsWith('waitlist_time_')) {
          await handleWaitlistTime(ctx, student);
        } else if (callbackData.startsWith('select_day_')) {
          await handleSelectDay(ctx, callbackData, student);
        } else if (callbackData.startsWith('select_time_')) {
          await handleSelectTime(ctx, callbackData, student);
        } else if (callbackData.startsWith('update_detail_')) {
          await handleUpdateDetailField(ctx, callbackData, student);
        } else if (callbackData === 'update_parent_details') {
          await handleUpdateParentDetails(ctx, student);
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
        [Markup.button.callback('📅 הצג את כל הזמנים הזמינים', 'show_available_times')],
        [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
      ]).reply_markup
    }
  );
  ctx.session.step = 'booking_request';
}



/**
 * Handle my status callback
 */
async function handleMyStatus(ctx, student) {
  try {
    const { Op } = require('sequelize');
    // Remove duplicate settings import - already imported globally
    const { Lesson, Waitlist } = require('../../models');
    
    // Get accurate lesson counts from database
    const [bookedCount, completedCount, cancelledCount] = await Promise.all([
      Lesson.count({
        where: {
          student_id: student.id,
          status: {
            [Op.notIn]: ['cancelled_by_student', 'cancelled_by_teacher', 'no_show']
          }
        }
      }),
      Lesson.count({
        where: {
          student_id: student.id,
          status: 'completed'
        }
      }),
      Lesson.count({
        where: {
          student_id: student.id,
          status: {
            [Op.in]: ['cancelled_by_student', 'cancelled_by_teacher', 'no_show']
          }
        }
      })
    ]);

    // Get upcoming lessons
    const upcomingLessons = await Lesson.findAll({
      where: {
        student_id: student.id,
        status: {
          [Op.in]: ['scheduled', 'confirmed', 'in_progress']
        },
        start_time: {
          [Op.gte]: new Date()
        }
      },
      order: [['start_time', 'ASC']],
      limit: 3
    });

    let statusMessage = `📊 <b>סטטוס - ${student.getDisplayName()}</b>\n\n`;

    // Personal information
    statusMessage += `👤 <b>פרטים אישיים:</b>\n`;
    statusMessage += `📧 אימייל: ${student.email || 'לא מוגדר'}\n`;
    statusMessage += `📱 טלפון: ${student.phone_number || 'לא מוגדר'}\n`;
    if (student.parent_name) {
      statusMessage += `👨‍👩‍👧‍👦 הורה: ${student.parent_name}`;
      if (student.parent_phone) {
        statusMessage += ` (${student.parent_phone})`;
      }
      statusMessage += `\n`;
    }
    statusMessage += `📅 חבר מתאריך: ${moment(student.registration_date || student.createdAt).format('DD/MM/YYYY')}\n\n`;

    // Lesson statistics
    statusMessage += `📊 <b>סטטיסטיקות שיעורים:</b>\n`;
    statusMessage += `• שיעורים מתוכננים: ${bookedCount}\n`;
    statusMessage += `• שיעורים שהושלמו: ${completedCount}\n`;
    statusMessage += `• שיעורים שבוטלו: ${cancelledCount}\n\n`;

    // Payment information
    statusMessage += `💰 <b>מידע כספי:</b>\n`;
    const debtAmount = parseFloat(student.payment_debt || 0);
    statusMessage += `• חוב נוכחי: ${debtAmount > 0 ? `${debtAmount.toFixed(2)} ${student.currency || 'ILS'}` : 'אין חוב'}\n`;
    statusMessage += `• מטבע: ${student.currency || 'ILS'}\n\n`;

    // Lesson preferences
    statusMessage += `⚙️ <b>העדפות שיעור:</b>\n`;
    statusMessage += `• אורך מועדף: ${student.preferred_lesson_duration || settings.lessons.defaultDuration} דקות\n`;
    statusMessage += `• שעות מועדפות: ${student.preferred_time_start || '16:00'} - ${student.preferred_time_end || '19:00'}\n\n`;

    // Upcoming lessons
    if (upcomingLessons.length > 0) {
      statusMessage += `📅 <b>השיעורים הקרובים שלך:</b>\n`;
      upcomingLessons.forEach((lesson, index) => {
        const lessonTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
        const dayName = lessonTime.format('dddd');
        const hebrewDay = getHebrewDayName(dayName);
        const dateStr = lessonTime.format('DD/MM/YYYY');
        const timeStr = lessonTime.format('HH:mm');
        const statusIcon = lesson.status === 'confirmed' ? '✅' : lesson.status === 'scheduled' ? '🕐' : '📝';
        
        statusMessage += `${statusIcon} ${hebrewDay}, ${dateStr} בשעה ${timeStr}\n`;
        if (lesson.topic) {
          statusMessage += `   📚 ${lesson.topic}\n`;
        }
      });
      statusMessage += '\n';
    } else {
      statusMessage += `📅 <b>אין שיעורים מתוכננים</b>\n\n`;
    }

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 תאם שיעור חדש', 'book_lesson')],
      [
        Markup.button.callback('📋 השיעורים שלי', 'my_lessons'),
        Markup.button.callback('⚙️ הגדרות', 'settings')
      ],
      [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
    ]);

    await ctx.reply(statusMessage, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

  } catch (error) {
    logger.error('Error in handleMyStatus:', error);
    await ctx.reply('❌ סליחה, הייתה שגיאה בהצגת המצב שלך. אנא נסה שוב.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
      ]).reply_markup
    });
  }
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
  try {
    const message = `
⏰ <b>הצטרפות לרשימת המתנה</b>

בחר עבור איזה יום תפוס אתה רוצה להיות ברשימת המתנה:
(מוצגים רק ימים עם שיעורים קיימים)
    `;

    const nextTwoWeeks = [];
    const Lesson = require('../../models/Lesson');
    
    // Get all booked lessons in the next 2 weeks
    const startDate = moment().startOf('day');
    const endDate = moment().add(14, 'days').endOf('day');
    
    const bookedLessons = await Lesson.findAll({
      where: {
        start_time: {
          [require('sequelize').Op.between]: [startDate.toDate(), endDate.toDate()]
        },
        status: ['confirmed', 'scheduled']
      },
      attributes: ['start_time'],
      order: [['start_time', 'ASC']]
    });
    
    // Extract unique dates from booked lessons
    const bookedDates = new Set();
    bookedLessons.forEach(lesson => {
      const lessonDate = moment(lesson.start_time).format('YYYY-MM-DD');
      bookedDates.add(lessonDate);
    });
    
    // If no booked lessons, show message
    if (bookedDates.size === 0) {
      await ctx.editMessageText(
        '⏰ <b>אין ימים תפוסים</b>\n\nכרגע אין שיעורים תפוסים בשבועיים הקרובים.\nתוכל לנסות לתאם שיעור בזמן פנוי או לחזור מאוחר יותר.',
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📅 הצג זמנים זמינים', 'show_available_times')],
            [Markup.button.callback('🔙 חזור', 'book_lesson')]
          ]).reply_markup
        }
      );
      return;
    }
    
    // Convert to array and sort
    const sortedDates = Array.from(bookedDates).sort();
    
    // Create display format
    sortedDates.forEach(dateStr => {
      const date = moment(dateStr);
      nextTwoWeeks.push({
        date: dateStr,
        displayName: getHebrewDayName(date.day()) + ' ' + date.format('D/M')
      });
    });

    // Group by pairs for buttons
    const buttons = [];
    for (let i = 0; i < nextTwoWeeks.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(
        nextTwoWeeks[i].displayName,
        `waitlist_day_${nextTwoWeeks[i].date}`
      ));
      
      if (nextTwoWeeks[i + 1]) {
        row.push(Markup.button.callback(
          nextTwoWeeks[i + 1].displayName,
          `waitlist_day_${nextTwoWeeks[i + 1].date}`
        ));
      }
      
      buttons.push(row);
    }

    buttons.push([Markup.button.callback('🔙 חזור', 'book_lesson')]);

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });

  } catch (error) {
    logger.error('Error in handleWaitlistJoin:', error);
    await ctx.reply('❌ שגיאה בהצגת רשימת המתנה. אנא נסה שוב.');
  }
}

/**
 * Handle show available times callback
 */
async function handleShowAvailableTimes(ctx, student) {
  try {
    // Show loading message first
    await ctx.editMessageText(
      '⏳ <b>טוען זמנים זמינים...</b>\n\nאנא המתן, מחפש עבורך את כל הזמנים הפנויים.',
      { parse_mode: 'HTML' }
    );

    // Get next 7 days only
    const availableDays = [];
    const startDate = moment().tz(settings.teacher.timezone);
    
    // Check each of the next 7 days for availability
    for (let i = 0; i < 7; i++) {
      const checkDate = startDate.clone().add(i, 'days');
      
      // Skip non-business days
      if (!settings.isBusinessDay(checkDate.toDate())) {
        continue;
      }
      
      // Quick check if this day has any availability
      const testSlots = await schedulerService.findAvailableSlots(
        { date: checkDate.format('YYYY-MM-DD') },
        student.preferred_lesson_duration || settings.lessons.defaultDuration
      );
      
      if (testSlots.length > 0) {
        const dayName = schedulerService.constructor.getHebrewDayName(checkDate.day());
        const monthName = schedulerService.constructor.getHebrewMonthName(checkDate.month());
        
        availableDays.push({
          date: checkDate.format('YYYY-MM-DD'),
          dayName,
          monthName,
          dayNumber: checkDate.date(),
          slotsCount: testSlots.length
        });
      }
    }
    
    if (availableDays.length === 0) {
      await ctx.editMessageText(
        `📅 <b>אין זמנים זמינים</b>\n\nמצטער, אין זמנים פנויים השבוע הקרוב.\n\nתוכל לכתוב לי מתי תרצה לתאם והצטרף לרשימת המתנה.\n\nבברכה,\nשפיר.`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
          ]).reply_markup
        }
      );
      return;
    }
    
    // Create day selection buttons
    let message = `📅 <b>בחר יום לשיעור</b>\n\nימים זמינים השבוע הקרוב:\n\n`;
    const dayButtons = [];
    
    availableDays.forEach((day, index) => {
      message += `📆 ${day.dayName}, ${day.dayNumber} ב${day.monthName} - ${day.slotsCount} זמנים\n`;
      dayButtons.push([Markup.button.callback(
        `📅 ${day.dayName}, ${day.dayNumber} ב${day.monthName}`,
        `select_day_${day.date}`
      )]);
    });
    
    message += `\n💰 מחיר שיעור: ${settings.lessons.defaultPrice || 180}₪\n⏱️ אורך שיעור: ${student.preferred_lesson_duration || settings.lessons.defaultDuration} דקות\n\nבחר יום והמשך לבחירת שעה! 😊\n\nבברכה,\nשפיר.`;
    
    // Add navigation buttons
    dayButtons.push([Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(dayButtons).reply_markup
    });
    
  } catch (error) {
    logger.error('Error showing available times:', error);
    
    try {
      await ctx.editMessageText(
        '❌ <b>שגיאה בטעינת זמנים</b>\n\nמצטער, הייתה שגיאה בטעינת הזמנים הזמינים.\nתוכל לכתוב לי ישירות מתי תרצה לתאם.\n\nבברכה,\nשפיר.',
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔄 נסה שוב', 'show_available_times')],
            [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
          ]).reply_markup
        }
      );
    } catch (editError) {
      await ctx.reply(
        '❌ מצטער, הייתה שגיאה בטעינת הזמנים. תוכל לכתוב לי ישירות מתי תרצה לתאם.\n\nבברכה,\nשפיר.'
      );
    }
  }
}

/**
 * Handle book slot callback
 */
async function handleBookSlot(ctx, callbackData, student) {
  try {
    const slotIndex = parseInt(callbackData.split('_')[2]);
    
    // Get the slot from session
    if (!ctx.session?.availableSlots || !ctx.session.availableSlots[slotIndex]) {
      await ctx.reply('❌ מצטער, המידע על הזמן נמחק. אנא בחר זמן שוב.');
      return;
    }
    
    const selectedSlot = ctx.session.availableSlots[slotIndex];
    
    await ctx.editMessageText(
      `⏳ <b>מתאם את השיעור...</b>\n\nמתאם עבורך את השיעור, אנא המתן.`,
      { parse_mode: 'HTML' }
    );
    
    try {
      // Book the actual lesson
      const bookingResult = await schedulerService.bookTimeSlot(
        selectedSlot,
        student,
        {
          subject: 'מתמטיקה',
          lesson_type: 'regular',
          difficulty_level: 'intermediate'
        }
      );
      
      if (bookingResult.success) {
        // CRITICAL: Use teacher timezone for consistency with display
        const slotTime = moment(selectedSlot.start).tz(settings.teacher.timezone);
        const dayName = schedulerService.constructor.getHebrewDayName(slotTime.day());
        const monthName = schedulerService.constructor.getHebrewMonthName(slotTime.month());
        
        await ctx.editMessageText(
          `🎉 <b>השיעור נתאם בהצלחה!</b>\n\n📅 תאריך: ${dayName}, ${slotTime.date()} ב${monthName}\n⏰ שעה: ${slotTime.format('HH:mm')}\n⏱️ אורך: ${selectedSlot.duration} דקות\n💰 מחיר: ${settings.lessons.defaultPrice || 180}₪\n\n📧 תקבל תזכורת לפני השיעור!\n🗓️ השיעור נוסף ליומן Google שלי.\n\nמצפה לראותך! 📚\n\nבברכה,\nשפיר.`,
          { 
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 השיעורים שלי', 'my_lessons')],
              [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
            ]).reply_markup
          }
        );
        
        // Clear the session data
        if (ctx.session) {
          delete ctx.session.availableSlots;
        }
        
      } else {
        throw new Error(bookingResult.message || 'Booking failed');
      }
      
    } catch (bookingError) {
      logger.error('Error booking lesson:', bookingError);
      
      await ctx.editMessageText(
        `❌ <b>שגיאה בתיאום השיעור</b>\n\nמצטער, הייתה בעיה בתיאום השיעור.\nייתכן שהזמן נתפס בינתיים.\n\nאנא נסה לבחור זמן אחר או צור קשר ישירות.\n\nבברכה,\nשפיר.`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📅 בחר זמן אחר', 'show_available_times')],
            [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
          ]).reply_markup
        }
      );
    }
    
  } catch (error) {
    logger.error('Error in slot booking:', error);
    await ctx.reply('❌ מצטער, משהו השתבש. אנא נסה שוב.\n\nבברכה,\nשפיר.');
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
      // Actually cancel the lesson using the scheduler service
      const schedulerService = require('../../services/scheduler');
      
      try {
        const result = await schedulerService.cancelLesson(id, student, 'Student cancellation via bot');
        
        if (result.success) {
          await ctx.reply(
            `✅ <b>השיעור בוטל בהצלחה</b>\n\n${result.message}\n\nתודה שהודעת מראש! 🙏`,
            { 
              parse_mode: 'HTML',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
              ]).reply_markup
            }
          );
        } else {
          throw new Error(result.message || 'Failed to cancel lesson');
        }
      } catch (cancelError) {
        logger.error('Failed to cancel lesson:', cancelError);
        await ctx.reply(
          `❌ <b>שגיאה בביטול השיעור</b>\n\n${cancelError.message}\n\nאנא נסה שוב או צור קשר עם המורה.`,
          { 
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
            ]).reply_markup
          }
        );
      }
      
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
  // Clear all conversation state
  if (ctx.session) {
    ctx.session.step = null;
    ctx.session.data = {};
    ctx.session.reschedule_lesson_id = null;
    ctx.session.lastActivity = Date.now();
  }
  
      const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 תיאום שיעור', 'book_lesson')],
      [Markup.button.callback('📋 השיעורים שלי', 'my_lessons')],
      [
        Markup.button.callback('🔄 החלף שיעור', 'reschedule_lesson'),
        Markup.button.callback('❌ בטל שיעור', 'cancel_lesson')
      ],
      [
        Markup.button.callback('📊 המצב שלי', 'my_status'),
        Markup.button.callback('👨‍🏫 פרטי המורה', 'teacher_details')
      ],
      [
        Markup.button.callback('⚙️ הגדרות', 'settings'),
        Markup.button.callback('❓ עזרה', 'help')
      ]
    ]);

  try {
    await ctx.editMessageText(
      `🏠 <b>תפריט ראשי</b>\n\nשלום ${student.getDisplayName()}! 👋\n\nמה תרצה לעשות?\n\nבברכה,\nשפיר.`,
      {
        parse_mode: 'HTML',
        reply_markup: buttons.reply_markup
      }
    );
  } catch (error) {
    // If edit fails, send new message
    await ctx.reply(
      `🏠 <b>תפריט ראשי</b>\n\nשלום ${student.getDisplayName()}! 👋\n\nמה תרצה לעשות?\n\nבברכה,\nשפיר.`,
      {
        parse_mode: 'HTML',
        reply_markup: buttons.reply_markup
      }
    );
  }
  
  logger.info(`Main menu displayed for student ${student.id}`);
}

/**
 * Handle settings done callback
 */
async function handleSettingsDone(ctx, student) {
  // Just go back to main menu
  await handleBackToMenu(ctx, student);
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
    `💬 <b>שיחה טבעית עם שפיר</b>\n\nשלום ${student.getDisplayName()}! 😊\n\nאני כאן לעזור לך לתאם שיעור מתמטיקה בצורה הכי נוחה.\n\n🗣️ <b>פשוט כתוב לי מה שאתה רוצה:</b>\n\n💡 <b>דוגמאות:</b>\n• "אני רוצה שיעור ביום רביעי בצהריים"\n• "מתי יש זמנים פנויים השבוע הבא?"\n• "אני פנוי מחר אחרי 3"\n• "תתאם לי משהו השבוע בערב"\n• "איזה זמנים יש ביום שישי?"\n\n📱 <b>כתוב את הבקשה שלך כאן למטה!</b> אני אבין ואעזור לך ↓`,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📅 או הצג זמנים זמינים', 'show_available_times')],
        [Markup.button.callback('⏰ רשימת המתנה', 'join_waitlist')],
        [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
      ]).reply_markup
    }
  );
  ctx.session.step = 'natural_conversation';
}

// Handle join waitlist - specific time based
const handleJoinWaitlist = async (ctx) => {
  try {
    const student = ctx.student;
    
    const message = `
⏰ <b>הצטרפות לרשימת המתנה</b>

בחר עבור איזה יום אתה רוצה להיות ברשימת המתנה:
    `;

    // Show available days for next 2 weeks
    const buttons = [];
    const nextTwoWeeks = [];
    
    for (let i = 1; i <= 14; i++) {
      const date = moment().add(i, 'days');
      if (date.day() !== 6) { // Skip Saturday
        nextTwoWeeks.push({
          date: date.format('YYYY-MM-DD'),
          displayName: `${date.format('dddd')} ${date.format('D/M')}`
        });
      }
    }

    // Group by pairs for buttons
    for (let i = 0; i < nextTwoWeeks.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(
        nextTwoWeeks[i].displayName,
        `waitlist_day_${nextTwoWeeks[i].date}`
      ));
      
      if (nextTwoWeeks[i + 1]) {
        row.push(Markup.button.callback(
          nextTwoWeeks[i + 1].displayName,
          `waitlist_day_${nextTwoWeeks[i + 1].date}`
        ));
      }
      
      buttons.push(row);
    }

    buttons.push([Markup.button.callback('🔙 חזור', 'book_lesson')]);

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });

  } catch (error) {
    logger.error('Error in handleJoinWaitlist:', error);
    await ctx.reply('❌ שגיאה בהצגת רשימת המתנה. אנא נסה שוב.');
  }
};

// Handle waitlist for specific day
const handleWaitlistDay = async (ctx, student) => {
  try {
    const callbackData = ctx.callbackQuery.data;
    const selectedDate = callbackData.replace('waitlist_day_', ''); // Extract date from callback data
    
    const displayDate = moment(selectedDate).format('dddd, D בMMMM');
    
    const message = `
⏰ <b>רשימת המתנה ליום ${displayDate}</b>

בחר את זמן העדיפות שלך:
    `;

    const buttons = [
      [
        Markup.button.callback('🌅 בוקר (9:00-12:00)', `waitlist_time_${selectedDate}_morning`),
        Markup.button.callback('🌤️ צהריים (12:00-16:00)', `waitlist_time_${selectedDate}_afternoon`)
      ],
      [
        Markup.button.callback('🌆 ערב (16:00-18:00)', `waitlist_time_${selectedDate}_evening`),
        Markup.button.callback('⚡ כל זמן', `waitlist_time_${selectedDate}_anytime`)
      ],
      [Markup.button.callback('🔙 חזור', 'join_waitlist')]
    ];

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });

  } catch (error) {
    logger.error('Error in handleWaitlistDay:', error);
    await ctx.reply('❌ שגיאה בעיבוד היום. אנא נסה שוב.');
  }
};

// Handle waitlist time preference
const handleWaitlistTime = async (ctx, student) => {
  try {
    const callbackData = ctx.callbackQuery.data;
    const parts = callbackData.replace('waitlist_time_', '').split('_');
    const selectedDate = parts[0];
    const timePreference = parts[1];
    
    const timeRanges = {
      morning: { start: '09:00', end: '12:00', display: 'בוקר (9:00-12:00)' },
      afternoon: { start: '12:00', end: '16:00', display: 'צהריים (12:00-16:00)' },
      evening: { start: '16:00', end: '18:00', display: 'ערב (16:00-18:00)' },
      anytime: { start: '09:00', end: '18:00', display: 'כל זמן' }
    };

    const selectedRange = timeRanges[timePreference];
    const displayDate = moment(selectedDate).format('dddd, D בMMMM');

    // Add to waitlist
    const startTime = moment(`${selectedDate} ${selectedRange.start}`, 'YYYY-MM-DD HH:mm').toDate();
    
    const waitlistEntry = await Waitlist.create({
      student_id: student.id,
      preferred_start_time: startTime,
      preferred_duration: student.preferred_lesson_duration || 60,
      time_preference: timePreference,
      preferred_date: selectedDate,
      urgency_level: 'normal',
      status: 'active'
    });

    // Calculate position in waitlist
    const position = await Waitlist.count({
      where: {
        preferred_date: selectedDate,
        time_preference: timePreference,
        status: 'active',
        created_at: {
          [Op.lte]: waitlistEntry.created_at
        }
      }
    });

    const message = `
✅ <b>נוספת לרשימת המתנה!</b>

📅 <b>יום:</b> ${displayDate}
🕐 <b>זמן מועדף:</b> ${selectedRange.display}
📍 <b>מיקום ברשימה:</b> #${position}

אני אודיע לך מיד כשיתפנה זמן מתאים באותו יום! 🔔

<i>הודעה מאת שפיר</i>
    `;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 תאם שיעור אחר', 'book_lesson')],
      [Markup.button.callback('📅 השיעורים שלי', 'my_lessons')],
      [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
    ]);

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

    logger.botLog('waitlist_joined', student.telegram_id, student.username, 
      `Joined waitlist for ${selectedDate} ${timePreference}`);

  } catch (error) {
    logger.error('Error in handleWaitlistTime:', error);
    await ctx.reply('❌ שגיאה בהוספה לרשימת המתנה. אנא נסה שוב.');
  }
};

/**
 * Handle update profile callback
 */
async function handleUpdateProfile(ctx, student) {
  await ctx.reply(
    `⚙️ <b>עדכון פרופיל</b>\n\nכרגע אתה יכול לעדכן את הפרטים שלך על ידי שליחת הודעה חדשה עם הפרטים המעודכנים.\n\nהפרטים הנוכחיים שלך:\n📛 שם: ${student.getDisplayName()}\n📱 טלפון: ${student.phone || 'לא צוין'}\n📧 אימייל: ${student.email || 'לא צוין'}\n⏰ אזור זמן: ${student.timezone || 'ישראל'}\n\nבעתיד נוסיף אפשרות לעדכן בקלות דרך הבוט.\n\nבברכה,\nשפיר.`,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('« חזור להגדרות', 'settings')]
      ]).reply_markup
    }
  );
}

/**
 * Handle contact teacher callback
 */
async function handleContactTeacher(ctx, student) {
  await ctx.editMessageText(
    `📞 <b>יצירת קשר עם המורה</b>\n\n👨‍🏫 שפיר - מורה למתמטיקה\n\n📧 <b>אימייל:</b> shafshaf6@gmail.com\n📱 <b>טלפון:</b> 0544271232\n💬 ניתן גם לכתוב כאן בצ'אט הישיר!\n\nאשמח לעזור בכל שאלה! 😊\n\nבברכה,\nשפיר.`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
      ]).reply_markup
    }
  );
}

/**
 * Handle day selection
 */
async function handleSelectDay(ctx, callbackData, student) {
  try {
    const selectedDate = callbackData.replace('select_day_', '');
    
    await ctx.editMessageText(
      '⏳ <b>טוען זמנים זמינים ליום זה...</b>',
      { parse_mode: 'HTML' }
    );
    
    // Get available slots for this specific day
    const availableSlots = await schedulerService.findAvailableSlots(
      { date: selectedDate },
      student.preferred_lesson_duration || settings.lessons.defaultDuration
    );
    
    if (availableSlots.length === 0) {
      await ctx.editMessageText(
        `❌ <b>אין זמנים זמינים ביום זה</b>\n\nמצטער, כל השעות ביום זה תפוסות.\n\nבחר יום אחר או כתוב לי מתי תרצה להצטרף לרשימת המתנה.\n\nבברכה,\nשפיר.`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('« חזור לבחירת יום', 'show_available_times')],
            [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
          ]).reply_markup
        }
      );
      return;
    }
    
    // Format date for display
    const dateMoment = moment(selectedDate).tz(settings.teacher.timezone);
    const dayName = schedulerService.constructor.getHebrewDayName(dateMoment.day());
    const monthName = schedulerService.constructor.getHebrewMonthName(dateMoment.month());
    
    let message = `🕐 <b>בחר שעה ל${dayName}, ${dateMoment.date()} ב${monthName}</b>\n\nזמנים זמינים:\n\n`;
    
    const timeButtons = [];
    
    // Store slots in session and create buttons
    ctx.session = ctx.session || {};
    ctx.session.availableSlots = [];
    
    availableSlots.forEach((slot, index) => {
      // CRITICAL: Always use teacher timezone for display consistency
      const slotTime = moment(slot.start).tz(settings.teacher.timezone);
      message += `🕐 ${slotTime.format('HH:mm')} - ${slotTime.clone().add(slot.duration, 'minutes').format('HH:mm')}\n`;
      
      ctx.session.availableSlots[index] = slot;
      timeButtons.push([Markup.button.callback(
        `🕐 ${slotTime.format('HH:mm')} (${slot.duration} דק׳)`,
        `select_time_${index}`
      )]);
    });
    
    message += `\n💰 מחיר: ${settings.lessons.defaultPrice || 180}₪\n\nבחר את השעה המתאימה לך! ⏰\n\nבברכה,\nשפיר.`;
    
    // Add navigation buttons
    timeButtons.push([Markup.button.callback('« חזור לבחירת יום', 'show_available_times')]);
    timeButtons.push([Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(timeButtons).reply_markup
    });
    
  } catch (error) {
    logger.error('Error in handleSelectDay:', error);
    await ctx.editMessageText(
      '❌ שגיאה בטעינת זמנים ליום זה. אנא נסה שוב.',
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('« חזור לבחירת יום', 'show_available_times')],
          [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
        ]).reply_markup
      }
    );
  }
}

/**
 * Handle time selection
 */
async function handleSelectTime(ctx, callbackData, student) {
  try {
    const slotIndex = parseInt(callbackData.replace('select_time_', ''));
    
    // Get the slot from session with better error handling
    if (!ctx.session) {
      ctx.session = {};
    }
    
    if (!ctx.session.availableSlots || !ctx.session.availableSlots[slotIndex]) {
      logger.warn('Session slot data lost, regenerating...', { 
        slotIndex, 
        hasSession: !!ctx.session,
        hasSlots: !!ctx.session?.availableSlots,
        slotsLength: ctx.session?.availableSlots?.length || 0
      });
      
      await ctx.editMessageText(
        '⏳ <b>רגע, אני מחזיר את הזמנים הזמינים...</b>\n\nהמידע נמחק, אני טוען שוב את האפשרויות.',
        { parse_mode: 'HTML' }
      );
      
      // Try to regenerate available slots for today/tomorrow
      try {
        const schedulerService = require('../../services/scheduler');
        const availableSlots = await schedulerService.findNextAvailableSlots(60, 3);
        
        if (availableSlots.length > 0) {
          ctx.session.availableSlots = availableSlots;
          
          let message = '📅 <b>זמנים זמינים (מחודש)</b>\n\nכאן הזמנים הזמינים:\n\n';
          const timeButtons = [];
          
          availableSlots.slice(0, 8).forEach((slot, index) => {
            message += `${index + 1}. ${slot.formattedTime}\n`;
            timeButtons.push([Markup.button.callback(
              `🕐 ${slot.formattedTime}`,
              `select_time_${index}`
            )]);
          });
          
          timeButtons.push([Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]);
          
          await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard(timeButtons).reply_markup
          });
          return;
        }
      } catch (regenerateError) {
        logger.error('Failed to regenerate slots:', regenerateError);
      }
      
      await ctx.editMessageText(
        '❌ <b>אופס! משהו השתבש</b>\n\nבואו ננסה שוב מההתחלה:',
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📅 זמנים זמינים', 'show_available_times')],
            [Markup.button.callback('🗣️ שיחה עם שפיר', 'book_different_time')],
            [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
          ]).reply_markup
        }
      );
      return;
    }
    
    const selectedSlot = ctx.session.availableSlots[slotIndex];
    
    await ctx.editMessageText(
      `⏳ <b>מתאם את השיעור...</b>\n\nמתאם עבורך את השיעור, אנא המתן.`,
      { parse_mode: 'HTML' }
    );
    
    try {
      // Book the actual lesson
      const bookingResult = await schedulerService.bookTimeSlot(
        selectedSlot,
        student,
        {
          subject: 'מתמטיקה',
          lesson_type: 'regular',
          difficulty_level: 'intermediate'
        }
      );
      
      if (bookingResult.success) {
        await ctx.editMessageText(
          bookingResult.message,
          { 
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 השיעורים שלי', 'my_lessons')],
              [Markup.button.callback('📚 תאם שיעור נוסף', 'book_lesson')],
              [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
            ]).reply_markup
          }
        );
        
        // Clear the session data
        if (ctx.session) {
          delete ctx.session.availableSlots;
        }
        
      } else {
        await ctx.editMessageText(
          bookingResult.message,
          {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('« חזור לבחירת יום', 'show_available_times')],
              [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
            ]).reply_markup
          }
        );
      }
      
    } catch (bookingError) {
      logger.error('Error booking lesson:', bookingError);
      
      await ctx.editMessageText(
        `❌ <b>שגיאה בתיאום השיעור</b>\n\nמצטער, הייתה בעיה בתיאום השיעור.\nייתכן שהזמן נתפס בינתיים.\n\nאנא נסה לבחור זמן אחר או צור קשר ישירות.\n\nבברכה,\nשפיר.`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('« חזור לבחירת יום', 'show_available_times')],
            [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
          ]).reply_markup
        }
      );
    }
    
  } catch (error) {
    logger.error('Error in handleSelectTime:', error);
    await ctx.reply('❌ מצטער, משהו השתבש. אנא נסה שוב.\n\nבברכה,\nשפיר.');
  }
}

/**
 * Handle student details update callbacks
 */
const handleStudentDetailsUpdate = async (ctx, action) => {
  try {
    const student = await Student.findOne({
      where: { telegram_id: ctx.from.id }
    });

    if (!student) {
      await ctx.answerCbQuery('❌ שגיאה: פרופיל לא נמצא');
      return;
    }

    switch (action) {
      case 'update_name':
        await student.update({
          current_conversation_state: 'updating_name',
          conversation_context: { updateField: 'name' }
        });
        
        await ctx.editMessageText(
          '👤 <b>עדכון שם מלא</b>\n\nכתוב את השם המלא החדש שלך:',
          { parse_mode: 'HTML' }
        );
        break;

      case 'update_phone':
        await student.update({
          current_conversation_state: 'updating_phone',
          conversation_context: { updateField: 'phone' }
        });
        
        await ctx.editMessageText(
          '📱 <b>עדכון מספר טלפון</b>\n\nכתוב את מספר הטלפון החדש או השתמש בכפתור:',
          {
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: [[{ text: '📱 שלח מספר טלפון', request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
        break;

      case 'update_email':
        await student.update({
          current_conversation_state: 'updating_email',
          conversation_context: { updateField: 'email' }
        });
        
        await ctx.editMessageText(
          '📧 <b>עדכון כתובת אימייל</b>\n\nכתוב את כתובת האימייל החדשה שלך:',
          { parse_mode: 'HTML' }
        );
        break;

      case 'update_address':
        await student.update({
          current_conversation_state: 'updating_address',
          conversation_context: { updateField: 'address' }
        });
        
        await ctx.editMessageText(
          '📍 <b>עדכון כתובת</b>\n\nכתוב את הכתובת החדשה שלך:',
          { parse_mode: 'HTML' }
        );
        break;

      case 'update_duration':
        await ctx.editMessageText(
          '⏰ <b>בחר משך שיעור מועדף:</b>',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '30 דקות', callback_data: 'duration_30' },
                  { text: '45 דקות', callback_data: 'duration_45' }
                ],
                [
                  { text: '60 דקות', callback_data: 'duration_60' },
                  { text: '90 דקות', callback_data: 'duration_90' }
                ],
                [
                  { text: '120 דקות', callback_data: 'duration_120' }
                ],
                [
                  { text: '🔙 חזור', callback_data: 'update_details' }
                ]
              ]
            }
          }
        );
        break;

      case 'duration_30':
      case 'duration_45':
      case 'duration_60':
      case 'duration_90':
      case 'duration_120':
        const duration = parseInt(action.split('_')[1]);
        await student.update({ preferred_lesson_duration: duration });
        
        await ctx.answerCbQuery(`✅ משך שיעור עודכן ל-${duration} דקות`);
        await ctx.editMessageText(
          `✅ <b>עודכן בהצלחה!</b>\n\nמשך השיעור המועדף שלך: ${duration} דקות`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 חזור לעדכון פרטים', callback_data: 'update_details' }]
              ]
            }
          }
        );
        break;

      case 'details_done':
        await ctx.editMessageText(
          '✅ <b>עדכון פרטים הושלם!</b>\n\nאתה יכול להתחיל לתאם שיעורים או לבדוק את הזמנים הפנויים.',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📚 תאם שיעור', callback_data: 'book_lesson' },
                  { text: '📅 זמנים פנויים', callback_data: 'show_available_times' }
                ]
              ]
            }
          }
        );
        break;

      default:
        await ctx.answerCbQuery('❌ פעולה לא מוכרת');
        break;
    }

    await ctx.answerCbQuery();

  } catch (error) {
    logger.error('Error handling student details update:', error);
    await ctx.answerCbQuery('❌ שגיאה בעדכון הפרטים');
  }
};

/**
 * Handle reschedule lesson menu
 */
async function handleRescheduleLesson(ctx, student) {
  try {
    const lessons = await Lesson.findAll({
      where: {
        student_id: student.id,
        status: ['scheduled', 'confirmed'],
        start_time: {
          [Op.gte]: new Date()
        }
      },
      order: [['start_time', 'ASC']],
      limit: 10
    });

    if (lessons.length === 0) {
      await ctx.reply('📅 אין לך שיעורים מתוכננים להחלפה.', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
        ]).reply_markup
      });
      return;
    }

    let message = '🔄 <b>החלפת שיעור</b>\n\nבחר את השיעור שברצונך להחליף:\n\n';
    const keyboard = [];

    lessons.forEach(lesson => {
      const startTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
      const dateStr = startTime.format('DD/MM/YYYY');
      const timeStr = startTime.format('HH:mm');
      
      message += `📚 ${dateStr} בשעה ${timeStr}\n`;
      keyboard.push([
        Markup.button.callback(
          `${dateStr} ${timeStr}`, 
          `reschedule_lesson_${lesson.id}`
        )
      ]);
    });

    keyboard.push([Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
    });

  } catch (error) {
    logger.error('Error in handleRescheduleLesson:', error);
    await ctx.reply('❌ אירעה שגיאה בטעינת השיעורים. אנא נסה שוב.');
  }
}

/**
 * Handle cancel lesson menu
 */
async function handleCancelLessonMenu(ctx, student) {
  try {
    const lessons = await Lesson.findAll({
      where: {
        student_id: student.id,
        status: ['scheduled', 'confirmed'],
        start_time: {
          [Op.gte]: new Date()
        }
      },
      order: [['start_time', 'ASC']],
      limit: 10
    });

    if (lessons.length === 0) {
      await ctx.reply('📅 אין לך שיעורים מתוכננים לביטול.', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
        ]).reply_markup
      });
      return;
    }

    let message = '❌ <b>ביטול שיעור</b>\n\nבחר את השיעור שברצונך לבטל:\n\n';
    const keyboard = [];

    lessons.forEach(lesson => {
      const startTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
      const dateStr = startTime.format('DD/MM/YYYY');
      const timeStr = startTime.format('HH:mm');
      
      // Check if lesson is within 24 hours
      const hoursUntilLesson = startTime.diff(moment(), 'hours');
      const warningText = hoursUntilLesson < 24 ? ' ⚠️' : '';
      
      message += `📚 ${dateStr} בשעה ${timeStr}${warningText}\n`;
      keyboard.push([
        Markup.button.callback(
          `${dateStr} ${timeStr}${warningText}`, 
          `confirm_cancel_${lesson.id}`
        )
      ]);
    });

    message += '\n⚠️ <b>שים לב:</b> ביטול שיעור פחות מ-24 שעות מראש יחויב בתשלום של 50% מעלות השיעור.';

    keyboard.push([Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
    });

  } catch (error) {
    logger.error('Error in handleCancelLessonMenu:', error);
    await ctx.reply('❌ אירעה שגיאה בטעינת השיעורים. אנא נסה שוב.');
  }
}

/**
 * Handle update parent details menu
 */
async function handleUpdateParentDetails(ctx, student) {
  try {
    const message = `👨‍👩‍👧‍👦 <b>עדכון פרטי הורה</b>\n\n🚧 <b>תכונה זו בבנייה</b>\n\nעדכון פרטי ההורים יהיה זמין בקרוב.\nבינתיים, אתה יכול לפנות ישירות למורה:\n\n📞 <b>טלפון:</b> 0544271232\n📧 <b>אימייל:</b> shafshaf6@gmail.com\n\nנשמח לעדכן את הפרטים עבורך! 😊`;
    
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📞 פרטי המורה', 'teacher_details')],
        [Markup.button.callback('🔙 חזור להגדרות', 'settings')]
      ]).reply_markup
    });
    
  } catch (error) {
    logger.error('Error handling update parent details:', error);
    await ctx.reply('❌ סליחה, משהו השתבש. אנא נסה שוב.');
  }
}

/**
 * Handle update personal details
 */
async function handleUpdatePersonalDetails(ctx, student) {
  const currentDetails = `
👤 <b>הפרטים האישיים שלך</b>

📝 <b>שם מלא:</b> ${student.full_name || 'לא הוגדר'}
📧 <b>אימייל:</b> ${student.email || 'לא הוגדר'}
📱 <b>טלפון:</b> ${student.phone_number || 'לא הוגדר'}

איזה פרט תרצה לעדכן?
  `;

  await ctx.reply(currentDetails, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('📝 שם מלא', 'update_detail_name')],
      [Markup.button.callback('📧 אימייל', 'update_detail_email')],
      [Markup.button.callback('📱 טלפון', 'update_detail_phone')],
      [Markup.button.callback('👨‍👩‍👧‍👦 עדכון פרטי הורה', 'update_parent_details')],
      [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
    ]).reply_markup
  });
}

/**
 * Handle reschedule specific lesson
 */
async function handleRescheduleSpecificLesson(ctx, callbackData, student) {
  try {
    const lessonId = callbackData.split('_')[2];
    const lesson = await Lesson.findByPk(lessonId);

    if (!lesson || lesson.student_id !== student.id) {
      await ctx.reply('❌ השיעור לא נמצא או שאינו שייך לך.');
      return;
    }

    const startTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
    const dateStr = startTime.format('DD/MM/YYYY');
    const timeStr = startTime.format('HH:mm');

    // Find available slots for next 7 days
    const schedulerService = require('../../services/scheduler');
    const availableSlots = await schedulerService.findNextAvailableSlots(lesson.duration_minutes, 7);

    if (availableSlots.length === 0) {
      await ctx.reply(
        `🔄 <b>החלפת שיעור</b>\n\nאתה מחליף את השיעור שמתוכנן ל-${dateStr} בשעה ${timeStr}\n\n❌ <b>אין זמנים זמינים השבוע הקרוב</b>\n\nאתה יכול:\n• להצטרף לרשימת המתנה\n• לנסות לכתוב זמן ספציפי ("אני רוצה שיעור ביום רביעי הבא")`,
        { 
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('⏰ הצטרף לרשימת המתנה', 'join_waitlist')],
            [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
          ]).reply_markup
        }
      );
      return;
    }

    let message = `🔄 <b>החלפת שיעור</b>\n\nאתה מחליף את השיעור שמתוכנן ל-${dateStr} בשעה ${timeStr}\n\n📅 <b>זמנים זמינים לשיעור החדש:</b>\n\n`;
    
    const keyboard = [];
    
    availableSlots.slice(0, 8).forEach((slot, index) => {
      // CRITICAL: Always use teacher timezone for display consistency
      const slotStart = moment(slot.start).tz(settings.teacher.timezone);
      const dayName = slotStart.format('dddd');
      const dateStr = slotStart.format('DD/MM');
      const timeStr = slotStart.format('HH:mm');
      
      message += `${index + 1}. ${dayName} ${dateStr} בשעה ${timeStr}\n`;
      
      keyboard.push([
        Markup.button.callback(
          `${dayName} ${dateStr} ${timeStr}`, 
          `reschedule_confirm_${lessonId}_${slot.start.getTime()}`
        )
      ]);
    });

    message += '\nבחר זמן חדש מהרשימה, או כתוב זמן אחר באופן טבעי.';

    keyboard.push([Markup.button.callback('✏️ כתוב זמן אחר', `reschedule_custom_${lessonId}`)]);
    keyboard.push([Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
    });

  } catch (error) {
    logger.error('Error in handleRescheduleSpecificLesson:', error);
    await ctx.reply('❌ אירעה שגיאה. אנא נסה שוב.');
  }
}

/**
 * Handle confirm cancel lesson
 */
async function handleConfirmCancel(ctx, callbackData, student) {
  try {
    const lessonId = callbackData.split('_')[2];
    const lesson = await Lesson.findByPk(lessonId);

    if (!lesson || lesson.student_id !== student.id) {
      await ctx.reply('❌ השיעור לא נמצא או שאינו שייך לך.');
      return;
    }

    const startTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
    const hoursUntilLesson = startTime.diff(moment(), 'hours');
    const isLateCancel = hoursUntilLesson < 24;
    const cancellationFeePercent = isLateCancel ? 50 : 0; // 50% fee for late cancellation
    const cancellationFeeAmount = isLateCancel ? (lesson.price_amount * 0.5) : 0;

    // Cancel the lesson
    await lesson.update({
      status: 'cancelled_by_student',
      cancelled_at: new Date(),
      cancelled_by: 'student',
      cancellation_reason: isLateCancel ? 'Late cancellation with fee' : 'Standard cancellation'
    });

    // Update student debt if late cancellation
    if (isLateCancel && cancellationFeeAmount > 0) {
      const currentDebt = parseFloat(student.payment_debt || 0);
      await student.update({
        payment_debt: currentDebt + cancellationFeeAmount
      });
      logger.info(`Added cancellation fee ${cancellationFeeAmount} to student ${student.id} debt`);
    }

    // Cancel in Google Calendar if sync is enabled
    if (lesson.google_calendar_event_id) {
      try {
        const calendarService = require('../../services/calendar');
        await calendarService.deleteEvent(lesson.google_calendar_event_id);
        logger.info(`Cancelled lesson ${lessonId} in Google Calendar`);
      } catch (calendarError) {
        logger.error('Error cancelling lesson in Google Calendar:', calendarError);
      }
    }

    let message = `✅ <b>השיעור בוטל בהצלחה</b>\n\n`;
    message += `📅 תאריך: ${startTime.format('DD/MM/YYYY')}\n`;
    message += `⏰ שעה: ${startTime.format('HH:mm')}\n\n`;

    if (isLateCancel) {
      message += `💰 <b>חיוב ביטול:</b> ${cancellationFeeAmount} ${lesson.currency || 'ILS'}\n`;
      message += `ℹ️ הביטול התבצע פחות מ-24 שעות מראש, לכן חל חיוב של 50% מעלות השיעור.\n\n`;
      message += `החיוב נוסף לחוב הנוכחי שלך.`;
    } else {
      message += `✅ הביטול התבצע ללא חיוב.`;
    }

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
      ]).reply_markup
    });

    // Log the cancellation
    logger.info(`Lesson ${lessonId} cancelled by student ${student.id}`, {
      lessonId,
      studentId: student.id,
      hoursUntilLesson,
      isLateCancel,
      cancellationFee: cancellationFeeAmount
    });

  } catch (error) {
    logger.error('Error in handleConfirmCancel:', error);
    await ctx.reply('❌ אירעה שגיאה בביטול השיעור. אנא נסה שוב.');
  }
}

/**
 * Handle update detail field
 */
async function handleUpdateDetailField(ctx, callbackData, student) {
  const field = callbackData.split('_')[2];
  const fieldNames = {
    name: 'שם מלא',
    email: 'אימייל',
    phone: 'טלפון',
    parent_name: 'שם הורה',
    parent_phone: 'טלפון הורה',
    parent_email: 'אימייל הורה'
  };

  const fieldName = fieldNames[field];
  
  // Special handling for phone field - use contact sharing instead of text input
  if (field === 'phone') {
    await ctx.reply(
      `📱 <b>עדכון מספר טלפון</b>\n\nלעדכון מספר הטלפון, אנא השתמש בכפתור "שתף מספר טלפון" למטה או פנה ישירות למורה.\n\n📞 <b>יצירת קשר ישירה:</b>\nטלפון: 0544271232\nאימייל: shafshaf6@gmail.com`,
      { 
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [{ text: '📱 שתף מספר טלפון', request_contact: true }],
            [{ text: '🔙 חזור להגדרות' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
    return;
  }
  
  await ctx.reply(
    `✏️ <b>עדכון ${fieldName}</b>\n\nאנא שלח את ${fieldName} החדש:`,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ ביטול', 'update_personal_details')]
      ]).reply_markup
    }
  );

  ctx.session.step = `updating_${field}`;
}



/**
 * Handle booking alternative time slots
 */
async function handleBookAlternative(ctx, callbackData, student) {
  try {
    logger.info(`Handling book alternative: ${callbackData} for student ${student.id}`);
    
    // Check if this is from available slots or a specific time slot
    if (callbackData === 'book_alternative') {
      // Show available slots
      const schedulerService = require('../../services/scheduler');
      const slots = await schedulerService.findNextAvailableSlots(60, 7); // Next 7 days
      
      if (slots.length === 0) {
        await ctx.reply('😔 אין זמנים זמינים בשבוע הקרוב. האם תרצה להצטרף לרשימת המתנה?', {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📝 הצטרף לרשימת המתנה', 'join_waitlist')],
            [Markup.button.callback('🔙 חזור', 'book_lesson')]
          ]).reply_markup
        });
        return;
      }
      
      // Group slots by date - CRITICAL: Use teacher timezone for consistency
      const slotsByDate = {};
      slots.forEach(slot => {
        const dateStr = moment(slot.start).tz(settings.teacher.timezone).format('YYYY-MM-DD');
        if (!slotsByDate[dateStr]) {
          slotsByDate[dateStr] = [];
        }
        slotsByDate[dateStr].push(slot);
      });
      
      let message = '📅 <b>זמנים זמינים השבוע:</b>\n\n';
      const buttons = [];
      
      Object.keys(slotsByDate).slice(0, 6).forEach(dateStr => {
        const dateSlots = slotsByDate[dateStr];
        // CRITICAL: Always use teacher timezone for display consistency
        const dateMoment = moment(dateStr).tz(settings.teacher.timezone);
        const dayName = dateMoment.format('dddd');
        const hebrewDay = getHebrewDayName(dayName);
        const formattedDate = dateMoment.format('DD/MM');
        
        message += `🗓️ <b>${hebrewDay}, ${formattedDate}</b>\n`;
        
        const dayButtons = [];
        dateSlots.slice(0, 4).forEach(slot => {
          const timeStr = moment(slot.start).tz(settings.teacher.timezone).format('HH:mm');
          const slotId = moment(slot.start).valueOf();
          
          message += `   • ${timeStr}\n`;
          dayButtons.push(Markup.button.callback(timeStr, `book_slot_${slotId}`));
        });
        
        if (dayButtons.length > 0) {
          buttons.push(dayButtons);
        }
        message += '\n';
      });
      
      buttons.push([Markup.button.callback('🔙 חזור לתפריט', 'back_to_menu')]);
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
      });
      
    } else if (callbackData.startsWith('book_slot_')) {
      // Book specific time slot
      const slotId = callbackData.replace('book_slot_', '');
      const startTime = new Date(parseInt(slotId));
      
      const schedulerService = require('../../services/scheduler');
      
      // Verify slot is still available
      const availability = await schedulerService.checkTeacherAvailability(startTime, 60);
      if (!availability.available) {
        await ctx.reply('😔 זמן זה כבר לא זמין. אנא בחר זמן אחר.', {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔄 רענן זמנים', 'book_alternative')],
            [Markup.button.callback('🔙 חזור', 'back_to_menu')]
          ]).reply_markup
        });
        return;
      }
      
      // Book the lesson
      const slotDetails = {
        start: startTime,
        end: new Date(startTime.getTime() + 60 * 60 * 1000),
        duration: 60
      };
      
      const result = await schedulerService.bookTimeSlot(slotDetails, student, {
        booking_method: 'alternative_selection',
        original_request: 'Selected from alternative times'
      });
      
      if (result.success) {
        // CRITICAL: Always use teacher timezone for display consistency
        const lessonTime = moment(startTime).tz(settings.teacher.timezone);
        const dayName = getHebrewDayName(lessonTime.format('dddd'));
        const dateStr = lessonTime.format('DD/MM/YYYY');
        const timeStr = lessonTime.format('HH:mm');
        
        await ctx.reply(`✅ <b>השיעור נקבע בהצלחה!</b>\n\n📅 ${dayName}, ${dateStr}\n🕐 ${timeStr}\n\n💰 מחיר: ${result.lesson.price_amount} ${result.lesson.currency}`, {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📋 השיעורים שלי', 'my_lessons')],
            [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
          ]).reply_markup
        });
        
        // Update student statistics
        await student.incrementLessonCount('booked');
        
      } else {
        await ctx.reply(`❌ <b>שגיאה בקביעת השיעור</b>\n\n${result.error}`, {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔄 נסה שוב', 'book_alternative')],
            [Markup.button.callback('🔙 חזור', 'back_to_menu')]
          ]).reply_markup
        });
      }
    }
    
  } catch (error) {
    logger.error('Error handling book alternative:', error);
    await ctx.reply('❌ סליחה, משהו השתבש. אנא נסה שוב.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔄 נסה שוב', 'book_lesson')],
        [Markup.button.callback('🔙 חזור', 'back_to_menu')]
      ]).reply_markup
    });
  }
}

function getHebrewDayName(englishDay) {
  const daysMap = {
    'Sunday': 'ראשון',
    'Monday': 'שני',
    'Tuesday': 'שלישי', 
    'Wednesday': 'רביעי',
    'Thursday': 'חמישי',
    'Friday': 'שישי',
    'Saturday': 'שבת'
  };
  return daysMap[englishDay] || englishDay;
}

function getHebrewTimePreference(timePreference) {
  const timeMap = {
    'morning': 'בוקר',
    'afternoon': 'אחר הצהריים',
    'evening': 'ערב',
    'anytime': 'גמיש'
  };
  return timeMap[timePreference] || timePreference;
}

/**
 * Handle reschedule confirmation with specific time slot
 */
async function handleRescheduleConfirm(ctx, callbackData, student) {
  try {
    const parts = callbackData.split('_');
    const lessonId = parts[2];
    const newStartTime = new Date(parseInt(parts[3]));

    const lesson = await Lesson.findByPk(lessonId);
    if (!lesson || lesson.student_id !== student.id) {
      await ctx.reply('❌ השיעור לא נמצא או שאינו שייך לך.');
      return;
    }

    const schedulerService = require('../../services/scheduler');
    
    // Book the new time slot
    const newSlotDetails = {
      start: newStartTime,
      end: new Date(newStartTime.getTime() + lesson.duration_minutes * 60000),
      duration: lesson.duration_minutes
    };

    try {
      const result = await schedulerService.bookTimeSlot(newSlotDetails, student, {
        subject: lesson.subject,
        topic: lesson.topic,
        lesson_type: lesson.lesson_type,
        original_request: `Rescheduled from ${lesson.start_time}`
      });

      if (result.success) {
        // Cancel the old lesson (mark as rescheduled)
        await lesson.update({
          status: 'cancelled_by_student',
          cancelled_at: new Date(),
          cancelled_by: 'student',
          cancellation_reason: 'Rescheduled to new time',
          is_rescheduled: true
        });

        // Cancel in Google Calendar if sync is enabled
        if (lesson.google_calendar_event_id) {
          try {
            const calendarService = require('../../services/calendar');
            await calendarService.deleteEvent(lesson.google_calendar_event_id);
            logger.info(`Cancelled original lesson ${lessonId} in Google Calendar for reschedule`);
          } catch (calendarError) {
            logger.error('Error cancelling original lesson in Google Calendar:', calendarError);
          }
        }

        const newStartMoment = moment(newStartTime).tz(student.timezone || 'Asia/Jerusalem');
        const oldStartMoment = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');

        await ctx.reply(
          `✅ <b>השיעור הוחלף בהצלחה!</b>\n\n📅 <b>השיעור הישן:</b> ${oldStartMoment.format('dddd DD/MM בשעה HH:mm')}\n📅 <b>השיעור החדש:</b> ${newStartMoment.format('dddd DD/MM בשעה HH:mm')}\n\n🎉 הזמן החדש נוסף ללוח השנה שלך!`,
          {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 השיעורים שלי', 'my_lessons')],
              [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
            ]).reply_markup
          }
        );

        logger.info(`Lesson ${lessonId} rescheduled successfully`, {
          studentId: student.id,
          oldTime: lesson.start_time,
          newTime: newStartTime,
          newLessonId: result.lesson.id
        });

      } else {
        throw new Error(result.message || 'Failed to book new time slot');
      }

    } catch (bookingError) {
      logger.error('Failed to book new time slot for reschedule:', bookingError);
      await ctx.reply(
        `❌ <b>שגיאה בהחלפת השיעור</b>\n\n${bookingError.message}\n\nהזמן שבחרת אולי כבר תפוס. אנא נסה זמן אחר.`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔄 בחר זמן אחר', `reschedule_lesson_${lessonId}`)],
            [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
          ]).reply_markup
        }
      );
    }

  } catch (error) {
    logger.error('Error in handleRescheduleConfirm:', error);
    await ctx.reply('❌ אירעה שגיאה בהחלפת השיעור. אנא נסה שוב.');
  }
}

/**
 * Handle reschedule with custom time input
 */
async function handleRescheduleCustom(ctx, callbackData, student) {
  try {
    const lessonId = callbackData.split('_')[2];
    const lesson = await Lesson.findByPk(lessonId);

    if (!lesson || lesson.student_id !== student.id) {
      await ctx.reply('❌ השיעור לא נמצא או שאינו שייך לך.');
      return;
    }

    const startTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
    const dateStr = startTime.format('DD/MM/YYYY');
    const timeStr = startTime.format('HH:mm');

    await ctx.reply(
      `🔄 <b>החלפת שיעור - זמן מותאם אישית</b>\n\nאתה מחליף את השיעור שמתוכנן ל-${dateStr} בשעה ${timeStr}\n\nכתוב את הזמן החדש שתרצה באופן טבעי:\n\n• "אני רוצה להחליף למחר בשעה 3 אחר הצהריים"\n• "אני פנוי ביום שלישי הבא אחר הצהריים"\n• "תתאם לי משהו ביום שישי אחרי 4"\n\nפשוט כתוב את הזמן החדש! 🕐`,
      { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 חזרה לרשימת זמנים', `reschedule_lesson_${lessonId}`)],
          [Markup.button.callback('🔙 חזרה לתפריט הראשי', 'back_to_menu')]
        ]).reply_markup
      }
    );

    ctx.session.step = 'booking_request';
    ctx.session.reschedule_lesson_id = lessonId;

  } catch (error) {
    logger.error('Error in handleRescheduleCustom:', error);
    await ctx.reply('❌ אירעה שגיאה. אנא נסה שוב.');
  }
}

/**
 * Handle my lessons callback - show student's lessons
 */
async function handleMyLessons(ctx, student) {
  try {
    // Get student's lessons 
    const lessons = await Lesson.findAll({
      where: { 
        student_id: student.id,
        status: {
          [Op.notIn]: ['cancelled_by_student', 'cancelled_by_teacher']
        }
      },
      order: [['start_time', 'ASC']]
    });

    if (lessons.length === 0) {
      await ctx.reply('📋 <b>השיעורים שלי</b>\n\n🚫 אין לך שיעורים מתוכננים כרגע.\n\nרוצה לתאם שיעור חדש?', {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📚 תאם שיעור חדש', 'book_lesson')],
          [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
        ]).reply_markup
      });
      return;
    }

    let message = '📋 <b>השיעורים שלי</b>\n\n';
    const keyboard = [];

    for (const lesson of lessons) {
      const startTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
      const dayName = getHebrewDayName(startTime.format('dddd'));
      const dateStr = startTime.format('DD/MM/YYYY');
      const timeStr = startTime.format('HH:mm');
      
      const statusIcon = lesson.status === 'confirmed' ? '✅' : '⏳';
      message += `${statusIcon} <b>${dayName}, ${dateStr}</b>\n`;
      message += `🕐 ${timeStr} (${lesson.duration_minutes} דקות)\n`;
      message += `📖 ${lesson.subject}\n`;
      if (lesson.topic) message += `📚 ${lesson.topic}\n`;
      message += '\n';

      // Add action buttons for each lesson
      keyboard.push([
        Markup.button.callback('📝 פרטים', `lesson_details_${lesson.id}`),
        Markup.button.callback('🔄 החלף', `reschedule_lesson_${lesson.id}`),
        Markup.button.callback('❌ בטל', `cancel_lesson_${lesson.id}`)
      ]);
    }

    // Add general buttons
    keyboard.push([Markup.button.callback('📚 תאם שיעור נוסף', 'book_lesson')]);
    keyboard.push([Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
    });

  } catch (error) {
    logger.error('Error in handleMyLessons:', error);
    await ctx.reply('❌ שגיאה בטעינת השיעורים. אנא נסה שוב.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔄 נסה שוב', 'my_lessons')],
        [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
      ]).reply_markup
    });
  }
}

/**
 * Handle teacher details callback - show teacher contact info
 */
async function handleTeacherDetails(ctx, student) {
  const message = `👨‍🏫 <b>פרטי המורה</b>\n\n` +
    `📧 <b>אימייל:</b> shafshaf6@gmail.com\n` +
    `📱 <b>טלפון:</b> 0544271232\n\n` +
    `ניתן ליצור קשר עם המורה בכל עת לשאלות או בעיות טכניות.\n\n` +
    `💡 <b>טיפ:</b> עדיף לתאם שיעורים דרך הבוט כדי שהכל יהיה מסונכרן!`;

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
    ]).reply_markup
  });
}

/**
 * Handle lesson details callback - show details of a specific lesson
 */
async function handleLessonDetails(ctx, callbackData, student) {
  try {
    const lessonId = callbackData.split('_')[2];
    const lesson = await Lesson.findByPk(lessonId);

    if (!lesson || lesson.student_id !== student.id) {
      await ctx.reply('❌ השיעור לא נמצא או שאינו שייך לך.', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
        ]).reply_markup
      });
      return;
    }

    const startTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
    const dayName = getHebrewDayName(startTime.format('dddd'));
    const dateStr = startTime.format('DD/MM/YYYY');
    const timeStr = startTime.format('HH:mm');
    const endTimeStr = moment(lesson.end_time).tz(student.timezone || 'Asia/Jerusalem').format('HH:mm');
    
    const statusEmoji = {
      'scheduled': '🕐',
      'confirmed': '✅',
      'in_progress': '🎯',
      'completed': '🎓',
      'cancelled_by_student': '❌',
      'cancelled_by_teacher': '🚫',
      'no_show': '🔴'
    };

    const statusText = {
      'scheduled': 'מתוכנן',
      'confirmed': 'מאושר',
      'in_progress': 'בביצוע',
      'completed': 'הושלם',
      'cancelled_by_student': 'בוטל על ידך',
      'cancelled_by_teacher': 'בוטל על ידי המורה',
      'no_show': 'לא הגעת'
    };

    let message = `📝 <b>פרטי השיעור</b>\n\n`;
    message += `📅 <b>תאריך:</b> ${dayName}, ${dateStr}\n`;
    message += `🕐 <b>שעה:</b> ${timeStr} - ${endTimeStr}\n`;
    message += `⏱️ <b>משך:</b> ${lesson.duration_minutes} דקות\n`;
    message += `${statusEmoji[lesson.status] || '📝'} <b>סטטוס:</b> ${statusText[lesson.status] || lesson.status}\n`;
    message += `📚 <b>נושא:</b> ${lesson.subject}\n`;
    
    if (lesson.topic) {
      message += `📖 <b>נושא ספציפי:</b> ${lesson.topic}\n`;
    }
    
    if (lesson.difficulty_level) {
      message += `⭐ <b>רמת קושי:</b> ${lesson.difficulty_level}\n`;
    }
    
    if (lesson.price_amount) {
      message += `💰 <b>מחיר:</b> ${lesson.price_amount} ${lesson.currency || 'ILS'}\n`;
    }
    
    if (lesson.meeting_link) {
      message += `🔗 <b>קישור למפגש:</b> ${lesson.meeting_link}\n`;
    }
    
    if (lesson.teacher_notes) {
      message += `📝 <b>הערות מורה:</b> ${lesson.teacher_notes}\n`;
    }
    
    if (lesson.student_notes) {
      message += `📋 <b>ההערות שלך:</b> ${lesson.student_notes}\n`;
    }
    
    message += `\n📅 <b>נקבע בתאריך:</b> ${moment(lesson.booking_date).format('DD/MM/YYYY')}\n`;

    const buttons = [];
    
    // Add action buttons based on lesson status
    if (lesson.isActive() && lesson.isInFuture()) {
      buttons.push([
        Markup.button.callback('🔄 החלף', `reschedule_lesson_${lesson.id}`),
        Markup.button.callback('❌ בטל', `cancel_lesson_${lesson.id}`)
      ]);
    }
    
    buttons.push([Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });

  } catch (error) {
    logger.error('Error in handleLessonDetails:', error);
    await ctx.reply('❌ שגיאה בטעינת פרטי השיעור. אנא נסה שוב.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🏠 תפריט ראשי', 'back_to_menu')]
      ]).reply_markup
    });
  }
}

module.exports = {
  handle,
  handleJoinWaitlist,
  handleWaitlistDay,
  handleWaitlistTime,
  handleStudentDetailsUpdate,
  handleBackToMenu,
  handleUpdateParentDetails,
  handleMyLessons,
  handleTeacherDetails,
  handleLessonDetails
}; 