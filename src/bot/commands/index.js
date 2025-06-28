const moment = require('moment-timezone');
const { Markup } = require('telegraf');
const schedulerService = require('../../services/scheduler');
const { Lesson, Waitlist, Student } = require('../../models');
const logger = require('../../utils/logger');
const config = require('../../config/settings');
const { Op } = require('sequelize');

// Start command - welcome new users
const start = async (ctx) => {
  try {
    const student = ctx.student;
    const isReturningUser = student.total_lessons_booked > 0;
    
    const welcomeMessage = isReturningUser 
      ? `ברוך הבא ${student.getDisplayName()}! 👋`
      : `ברוך הבא לבוט ההוראה של ${config.teacher.name}! 🎓\n\nאני כאן לעזור לך לתאם שיעורי מתמטיקה בקלות באמצעות שפה טבעית.`;

    const description = !isReturningUser ? `
✨ <b>מה אני יכול לעשות:</b>
• 📚 לתאם שיעורים - פשוט תגיד לי מתי אתה פנוי
• 📅 לבדוק את לוח הזמנים והשיעורים הקרובים שלך
• 🔄 לשנות או לבטל שיעורים קיימים
• ⏰ להצטרף לרשימת המתנה כשהזמנים המועדפים תפוסים
• 🔔 לשלוח תזכורות והתראות
• ⚙️ לנהל את ההעדפות וההגדרות שלך

<b>איך להתחיל:</b>
אתה יכול לדבר איתי בצורה טבעית! נסה לומר דברים כמו:
• "אני רוצה לתאם שיעור ביום שישי בשעה 3"
• "איזה זמנים פנויים יש השבוע הבא?"
• "אני צריך לבטל את השיעור ביום שלישי"

<b>שעות פעילות:</b> ${config.businessHours.start} - ${config.businessHours.end}
<b>ימי פעילות:</b> ${config.businessHours.days.join(', ')}
` : ``;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 תיאום שיעור', 'book_lesson')],
      [
        Markup.button.callback('📅 לוח הזמנים שלי', 'my_schedule'),
        Markup.button.callback('📋 השיעורים שלי', 'my_lessons')
      ],
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

    await ctx.reply(welcomeMessage + description, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

    logger.botLog('start_command', student.telegram_id, student.username, 'User started bot');

  } catch (error) {
    logger.error('Error in start command:', error);
    await ctx.reply('❌ סליחה, משהו השתבש. אנא נסה שוב.');
  }
};

// Help command - show available commands and features
const help = async (ctx) => {
  const helpMessage = `
❓ <b>עזרה - בוט תיאום שיעורי מתמטיקה של שפיר</b>

<b>📚 תיאום שיעורים:</b>
אתה יכול לדבר איתי בשפה טבעית! פשוט תגיד מתי אתה רוצה שיעור:
• "אני רוצה שיעור מחר בשעה 3"
• "מתי יש זמנים פנויים השבוע?"
• "תתאם לי שיעור ביום ראשון אחר הצהריים"

<b>🔧 פקודות זמינות:</b>
/start - התחלת השיחה
/help - העזרה הזו
/schedule - הצגת השיעורים שלך
/status - המצב האישי שלך
/settings - הגדרות אישיות

<b>💡 תכונות מתקדמות:</b>
• 🤖 הבנת שפה טבעית עם AI
• 📅 סנכרון עם גוגל קלנדר
• ⏰ רשימת המתנה אוטומטית
• 🔔 תזכורות ממוקדות
• 📊 מעקב התקדמות

<b>📞 יצירת קשר:</b>
אם אתה נתקל בבעיה, פשוט כתוב לי ואני אעזור!

<b>שעות פעילות:</b> ${config.businessHours.start} - ${config.businessHours.end}
<b>ימי פעילות:</b> ראשון, שני, שלישי, רביעי, חמישי
`;

  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('📚 תאם שיעור עכשיו', 'book_lesson')],
    [
      Markup.button.callback('📅 השיעורים שלי', 'my_schedule'),
      Markup.button.callback('⚙️ הגדרות', 'settings')
    ]
  ]);

  await ctx.reply(helpMessage, {
    parse_mode: 'HTML',
    reply_markup: buttons.reply_markup
  });

  logger.botLog('help_command', ctx.from.id, ctx.from.username, 'User requested help');
};

// Book command - start lesson booking
const book = async (ctx) => {
  try {
    const student = ctx.student;
    
    const message = `
📚 <b>תיאום שיעור מתמטיקה</b>

היי ${student.getDisplayName()}! אשמח לעזור לך לתאם שיעור.

<b>אמור לי מתי תרצה את השיעור:</b>
• "אני רוצה שיעור מחר בשעה 3"
• "אני פנוי ביום שלישי אחר הצהריים"  
• "תאם לי משהו ביום שישי אחרי 4"
• "איזה זמנים פנויים יש השבוע?"

<b>ההגדרות הנוכחיות שלך:</b>
• אורך שיעור: ${student.preferred_lesson_duration || config.lessons.defaultDuration} דקות
• איזור הזמן שלך: ${student.timezone || config.teacher.timezone}

פשוט כתוב לי את הזמן המועדף עליך באופן טבעי, ואני אמצא עבורך את הזמנים הזמינים הטובים ביותר! 🕐
    `;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📅 הצג זמנים זמינים', 'show_available_times')],
      [Markup.button.callback('⏰ הצטרף לרשימת המתנה', 'join_waitlist')],
      [Markup.button.callback('⚙️ עדכון העדפות', 'settings')]
    ]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

    // Set conversation state
    ctx.session.step = 'booking_request';
    ctx.session.data = {};

  } catch (error) {
    logger.error('Error in book command:', error);
    await ctx.reply('❌ סליחה, משהו השתבש. אנא נסה שוב.');
  }
};

// Schedule command - show upcoming lessons
const schedule = async (ctx) => {
  try {
    const student = ctx.student;
    const upcomingLessons = await Lesson.findActiveByStudent(student.id);

    if (upcomingLessons.length === 0) {
      const message = `
📅 <b>מערכת השעות שלך</b>

אין לך שיעורים מתוכננים כרגע.

האם תרצה לתאם שיעור?
      `;

      const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('📚 תאם שיעור', 'book_lesson')]
      ]);

      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: buttons.reply_markup
      });
      return;
    }

    let scheduleMessage = `📅 <b>השיעורים הקרובים שלך</b>\n\n`;

    upcomingLessons.forEach((lesson, index) => {
      const startTime = moment(lesson.start_time).tz(student.timezone || config.teacher.timezone);
      const status = lesson.status === 'scheduled' ? '🕐' : lesson.status === 'confirmed' ? '✅' : '📝';
      
      scheduleMessage += `${status} <b>שיעור ${index + 1}</b>\n`;
      scheduleMessage += `📅 ${startTime.format('dddd, D בMMMM YYYY')}\n`;
      scheduleMessage += `🕐 ${startTime.format('HH:mm')} (${lesson.duration_minutes} דקות)\n`;
      scheduleMessage += `📚 ${lesson.subject}${lesson.topic ? ` - ${lesson.topic}` : ''}\n\n`;
    });

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔄 שנה מועד', 'reschedule_lesson'),
        Markup.button.callback('❌ בטל', 'cancel_lesson')
      ],
      [Markup.button.callback('📚 תאם שיעור נוסף', 'book_lesson')]
    ]);

    await ctx.reply(scheduleMessage, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

  } catch (error) {
    logger.error('Error in schedule command:', error);
    await ctx.reply('❌ Sorry, something went wrong. Please try again.');
  }
};

// Status command - show user's current status and statistics
const status = async (ctx) => {
  try {
    const student = ctx.student;

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

    // Get upcoming lessons - only future lessons that are confirmed/scheduled
    const upcomingLessons = await Lesson.findAll({
      where: {
        student_id: student.id,
        status: {
          [Op.in]: ['scheduled', 'confirmed', 'pending']
        },
        start_time: {
          [Op.gte]: new Date()
        }
      },
      order: [['start_time', 'ASC']],
      limit: 3
    });

    // Get waitlist entries
    const waitlistEntries = await Waitlist.findAll({
      where: {
        student_id: student.id,
        status: 'active'
      },
      order: [['created_at', 'DESC']],
      limit: 2
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
    statusMessage += `📅 חבר מתאריך: ${moment(student.registration_date || student.created_at).format('DD/MM/YYYY')}\n\n`;

    // Lesson statistics - with corrected counts
    statusMessage += `📊 <b>סטטיסטיקות שיעורים:</b>\n`;
    statusMessage += `• שיעורים מתוכננים: ${bookedCount}\n`;
    statusMessage += `• שיעורים שהושלמו: ${completedCount}\n`;
    statusMessage += `• שיעורים שבוטלו: ${cancelledCount}\n\n`;

    // Payment information including debt
    statusMessage += `💰 <b>מידע כספי:</b>\n`;
    statusMessage += `• חוב נוכחי: ${student.getFormattedDebt()}\n`;
    statusMessage += `• מטבע: ${student.currency || 'ILS'}\n\n`;

    // Lesson preferences with Hebrew day names
    statusMessage += `⚙️ <b>העדפות שיעור:</b>\n`;
    statusMessage += `• אורך מועדף: ${student.preferred_lesson_duration || config.lessons.defaultDuration} דקות\n`;
    const hebrewDays = student.getPreferredDaysHebrew();
    statusMessage += `• ימים מועדפים: ${hebrewDays.join(', ')}\n`;
    statusMessage += `• שעות מועדפות: ${student.preferred_time_start || '16:00'} - ${student.preferred_time_end || '19:00'}\n\n`;

    // Upcoming lessons - showing actual future lessons
    if (upcomingLessons.length > 0) {
      statusMessage += `📅 <b>השיעורים הקרובים שלך:</b>\n`;
      upcomingLessons.forEach((lesson, index) => {
        const lessonTime = moment(lesson.start_time).tz(student.timezone || 'Asia/Jerusalem');
        const dayName = getHebrewDayName(lessonTime.format('dddd'));
        const dateStr = lessonTime.format('DD/MM/YYYY');
        const timeStr = lessonTime.format('HH:mm');
        const statusIcon = lesson.status === 'confirmed' ? '✅' : lesson.status === 'scheduled' ? '🕐' : '📝';
        
        statusMessage += `${statusIcon} ${dayName}, ${dateStr} בשעה ${timeStr}\n`;
        if (lesson.topic) {
          statusMessage += `   📚 ${lesson.topic}\n`;
        }
      });
      statusMessage += '\n';
    } else {
      statusMessage += `📅 <b>אין שיעורים מתוכננים</b>\n\n`;
    }

    // Waitlist status
    if (waitlistEntries.length > 0) {
      statusMessage += `⏰ <b>רשימות המתנה פעילות:</b>\n`;
      waitlistEntries.forEach((entry, index) => {
        const preferredDate = entry.preferred_date ? moment(entry.preferred_date).format('DD/MM') : 'גמיש';
        const timePreference = getHebrewTimePreference(entry.time_preference || 'anytime');
        statusMessage += `${index + 1}. ${preferredDate} - ${timePreference}\n`;
      });
      statusMessage += '\n';
    } else {
      statusMessage += `⏰ <b>לא ברשימת המתנה כרגע</b>\n\n`;
    }

    // Update student counts if they're different (sync with actual data)
    if (student.total_lessons_booked !== bookedCount || 
        student.total_lessons_completed !== completedCount || 
        student.total_lessons_cancelled !== cancelledCount) {
      
      await student.update({
        total_lessons_booked: bookedCount,
        total_lessons_completed: completedCount,
        total_lessons_cancelled: cancelledCount
      });
      
      logger.info(`Updated lesson counts for student ${student.id}: booked=${bookedCount}, completed=${completedCount}, cancelled=${cancelledCount}`);
    }

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 תאם שיעור חדש', 'book_lesson')],
      [
        Markup.button.callback('📅 כל השיעורים', 'my_schedule'),
        Markup.button.callback('⚙️ הגדרות', 'settings')
      ]
    ]);

    await ctx.reply(statusMessage, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

    logger.botLog('status_command', student.telegram_id, student.username, 'User checked status');

  } catch (error) {
    logger.error('Error in status command:', error);
    await ctx.reply('❌ סליחה, הייתה שגיאה בהצגת המצב שלך. אנא נסה שוב.');
  }
};

// Helper function for Hebrew day names
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

// Waitlist command
const waitlist = async (ctx) => {
  try {
    const student = ctx.student;
    const waitlistEntries = await Waitlist.findByStudent(student.id);
    const activeEntries = waitlistEntries.filter(entry => entry.isActive());

    if (activeEntries.length === 0) {
      const message = `
⏰ <b>Waitlist Status</b>

You're not currently on any waitlist.

When your preferred times aren't available, I can add you to the waitlist and notify you when a slot opens up!
      `;

      const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('📚 Book Lesson', 'book_lesson')]
      ]);

      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: buttons.reply_markup
      });
      return;
    }

    let waitlistMessage = `⏰ <b>Your Waitlist Status</b>\n\n`;

    activeEntries.forEach((entry, index) => {
      const preferredTime = entry.preferred_start_time 
        ? moment(entry.preferred_start_time).format('dddd, MMMM Do [at] h:mm A')
        : 'Flexible timing';

      waitlistMessage += `📋 <b>Entry ${index + 1}</b>\n`;
      waitlistMessage += `📍 Position: #${entry.position}\n`;
      waitlistMessage += `🕐 Preferred: ${preferredTime}\n`;
      waitlistMessage += `⏱️ Duration: ${entry.preferred_duration} minutes\n`;
      waitlistMessage += `📅 Added: ${moment(entry.created_at).fromNow()}\n`;
      waitlistMessage += `🔥 Priority: ${entry.urgency_level}\n\n`;
    });

    waitlistMessage += `💡 <i>I'll notify you immediately when a matching slot becomes available!</i>`;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Remove from Waitlist', 'remove_waitlist')],
      [Markup.button.callback('📚 Book Different Time', 'book_lesson')]
    ]);

    await ctx.reply(waitlistMessage, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

  } catch (error) {
    logger.error('Error in waitlist command:', error);
    await ctx.reply('❌ Sorry, something went wrong. Please try again.');
  }
};

// Settings command
const settings = async (ctx) => {
  const student = ctx.student;
  
  // Get Hebrew day names for preferred days
  const hebrewDays = student.getPreferredDaysHebrew();
  
  const settingsText = `⚙️ <b>הגדרות</b>

📊 <b>הפרופיל שלך:</b>
👤 שם: ${student.getDisplayName()}
📧 אימייל: ${student.email || 'לא הוגדר'}
📱 טלפון: ${student.phone_number || 'לא הוגדר'}
🕐 אזור זמן: ${student.timezone || 'Asia/Jerusalem'}
⏱️ משך שיעור מועדף: ${student.preferred_lesson_duration || 60} דקות

👨‍👩‍👧‍👦 <b>פרטי הורה:</b>
👤 שם הורה: ${student.parent_name || 'לא הוגדר'}
📱 טלפון הורה: ${student.parent_phone || 'לא הוגדר'}
📧 אימייל הורה: ${student.parent_email || 'לא הוגדר'}

📚 <b>העדפות שיעור:</b>
📅 ימים מועדפים: ${hebrewDays.join(', ')}
🕒 שעות מועדפות: ${student.preferred_time_start || '16:00'} - ${student.preferred_time_end || '19:00'}

💳 <b>מידע כספי:</b>
💰 מחיר לשעה: ₪${config.lessons.defaultPrice}
💸 חוב נוכחי: ${student.getFormattedDebt()}
📊 סה"כ שיעורים: ${student.total_lessons_booked || 0}
✅ שיעורים שהושלמו: ${student.total_lessons_completed || 0}`;

  await ctx.reply(settingsText, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('📝 עדכן פרטים אישיים', 'update_personal_details')],
      [Markup.button.callback('👨‍👩‍👧‍👦 עדכן פרטי הורה', 'update_parent_details')],
      [Markup.button.callback('🌐 שפה', 'set_language')],
      [Markup.button.callback('📞 צור קשר', 'contact_teacher')],
      [Markup.button.callback('✅ סיום', 'settings_done')]
    ]).reply_markup
  });
};

// Cancel command
const cancel = async (ctx) => {
  try {
    const student = ctx.student;
    const upcomingLessons = await Lesson.findActiveByStudent(student.id);

    if (upcomingLessons.length === 0) {
      await ctx.reply('You don\'t have any upcoming lessons to cancel.');
      return;
    }

    let cancelMessage = `❌ <b>Cancel a Lesson</b>\n\nWhich lesson would you like to cancel?\n\n`;

    const buttons = upcomingLessons.map((lesson, index) => {
      const startTime = moment(lesson.start_time).format('ddd, MMM Do [at] h:mm A');
      cancelMessage += `${index + 1}. ${startTime} - ${lesson.subject}\n`;
      
      return [Markup.button.callback(`Cancel Lesson ${index + 1}`, `cancel_lesson_${lesson.id}`)];
    });

    buttons.push([Markup.button.callback('« Back', 'back_to_menu')]);

    await ctx.reply(cancelMessage, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });

  } catch (error) {
    logger.error('Error in cancel command:', error);
    await ctx.reply('❌ Sorry, something went wrong. Please try again.');
  }
};

// Feedback command
const feedback = async (ctx) => {
  try {
    const message = `
💬 <b>Feedback & Support</b>

I'd love to hear your thoughts! You can:

📝 <b>Send Feedback:</b>
Just type your feedback or suggestions and I'll make sure ${config.teacher.name} receives it.

🐛 <b>Report Issues:</b>
If something isn't working correctly, describe the problem and I'll help resolve it.

⭐ <b>Rate Your Experience:</b>
Let me know how I'm doing and how I can improve!

Type your message below, or use the buttons for quick actions:
    `;

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('⭐ Great Experience', 'feedback_positive'),
        Markup.button.callback('💡 Suggestion', 'feedback_suggestion')
      ],
      [
        Markup.button.callback('🐛 Report Issue', 'feedback_issue'),
        Markup.button.callback('📞 Contact Teacher', 'contact_teacher')
      ]
    ]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

    ctx.session.step = 'feedback';

  } catch (error) {
    logger.error('Error in feedback command:', error);
    await ctx.reply('❌ Sorry, something went wrong. Please try again.');
  }
};

// Admin commands (restricted)
const admin = async (ctx) => {
  // This would be restricted to admin users only
  await ctx.reply('🔒 Admin access required.');
};

const stats = async (ctx) => {
  // This would show system statistics for admins
  await ctx.reply('📊 Statistics are available for administrators only.');
};

const broadcast = async (ctx) => {
  // This would allow broadcasting messages to all users
  await ctx.reply('📢 Broadcast feature is available for administrators only.');
};

/**
 * View waitlist command - for admin use
 */
async function viewWaitlist(ctx) {
  try {
    // Only allow specific users to view waitlist (you can modify this check)
    const allowedUsers = [ctx.from.id]; // Add your admin ID here
    
    const Waitlist = require('../../models/Waitlist');
    const Student = require('../../models/Student');
    
    const waitlistEntries = await Waitlist.findAll({
      include: [{
        model: Student,
        as: 'student'
      }],
      where: {
        status: 'active'
      },
      order: [['created_at', 'ASC']]
    });
    
    if (waitlistEntries.length === 0) {
      await ctx.reply('📋 רשימת המתנה ריקה כרגע.');
      return;
    }
    
    let message = `📋 <b>רשימת המתנה הנוכחית</b>\n\n`;
    
    waitlistEntries.forEach((entry, index) => {
      const student = entry.student || { first_name: 'לא ידוע' };
      const createdAt = moment(entry.created_at).format('DD/MM בשעה HH:mm');
      const preferredDate = entry.preferred_date ? moment(entry.preferred_date).format('DD/MM') : 'לא צוין';
      const timePreference = getHebrewTimePreference(entry.time_preference);
      
      message += `${index + 1}. <b>${student.first_name}</b>\n`;
      message += `   📅 תאריך מועדף: ${preferredDate}\n`;
      message += `   ⏰ זמן מועדף: ${timePreference}\n`;
      message += `   📝 נוצר: ${createdAt}\n\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error viewing waitlist:', error);
    await ctx.reply('❌ שגיאה בטעינת רשימת המתנה.');
  }
}

function getHebrewTimePreference(timePreference) {
  const timeMap = {
    'morning': 'בוקר (9:00-12:00)',
    'afternoon': 'אחר הצהריים (12:00-17:00)', 
    'evening': 'ערב (17:00-21:00)',
    'anytime': 'כל שעה'
  };
  return timeMap[timePreference] || timePreference;
}

/**
 * Update student details command
 */
const updateDetailsCommand = async (ctx) => {
  try {
    const student = await Student.findOne({
      where: { telegram_id: ctx.from.id }
    });

    if (!student) {
      await ctx.reply('❌ לא נמצא פרופיל. התחל עם /start תחילה.');
      return;
    }

    const currentDetails = `
📝 <b>הפרטים הנוכחיים שלך:</b>

👤 <b>שם:</b> ${student.full_name || student.first_name || 'לא מוגדר'}
📱 <b>טלפון:</b> ${student.phone_number || 'לא מוגדר'}
📧 <b>אימייל:</b> ${student.email || 'לא מוגדר'}
⏰ <b>משך שיעור מועדף:</b> ${student.preferred_lesson_duration || 60} דקות
📍 <b>כתובת:</b> ${student.notes ? student.notes.split('\n').find(line => line.includes('כתובת:')) || 'לא מוגדר' : 'לא מוגדר'}

💡 <b>מה תרצה לעדכן?</b>
    `;

    await ctx.reply(currentDetails, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👤 שם מלא', callback_data: 'update_name' },
            { text: '📱 טלפון', callback_data: 'update_phone' }
          ],
          [
            { text: '📧 אימייל', callback_data: 'update_email' },
            { text: '📍 כתובת', callback_data: 'update_address' }
          ],
          [
            { text: '⏰ משך שיעור מועדף', callback_data: 'update_duration' }
          ],
          [
            { text: '✅ סיום', callback_data: 'details_done' }
          ]
        ]
      }
    });

  } catch (error) {
    logger.error('Error in update details command:', error);
    await ctx.reply('❌ שגיאה בטעינת הפרטים. נסה שוב.');
  }
};

module.exports = {
  start,
  help,
  book,
  schedule,
  cancel,
  status,
  waitlist,
  settings,
  feedback,
  admin,
  stats,
  broadcast,
  viewWaitlist,
  updateDetailsCommand
}; 