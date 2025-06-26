const moment = require('moment-timezone');
const { Markup } = require('telegraf');
const schedulerService = require('../../services/scheduler');
const { Lesson, Waitlist } = require('../../models');
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
        Markup.button.callback('❓ עזרה', 'help')
      ],
      [
        Markup.button.callback('⚙️ הגדרות', 'settings'),
        Markup.button.callback('📊 סטטוס', 'my_status')
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
❓ <b>עזרה - בוט תיאום שיעורי מתמטיקה</b>

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
• 📅 סנכרון עם Google Calendar
• ⏰ רשימת המתנה אוטומטית
• 🔔 תזכורות ממוקדות
• 📊 מעקב התקדמות

<b>📞 יצירת קשר:</b>
אם אתה נתקל בבעיה, פשוט כתוב לי ואני אעזור!

<b>שעות פעילות:</b> ${config.businessHours.start} - ${config.businessHours.end}
<b>ימי פעילות:</b> ${config.businessHours.days.join(', ')}
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
📚 <b>Book a Math Lesson</b>

Hi ${student.getDisplayName()}! I'd be happy to help you schedule a lesson.

<b>Tell me when you'd like to have your lesson:</b>
• "I want a lesson tomorrow at 3 PM"
• "I'm free next Tuesday afternoon"  
• "Book me something this Friday after 4"
• "What times are available this week?"

<b>Current Settings:</b>
• Lesson Duration: ${student.preferred_lesson_duration || config.lessons.defaultDuration} minutes
• Your Timezone: ${student.timezone || config.teacher.timezone}

Just type your preferred time naturally, and I'll find the best available slots for you! 🕐
    `;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📅 Show Available Times', 'show_available_times')],
      [Markup.button.callback('⏰ Join Waitlist', 'join_waitlist')],
      [Markup.button.callback('⚙️ Update Preferences', 'settings')]
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
    await ctx.reply('❌ Sorry, something went wrong. Please try again.');
  }
};

// Schedule command - show upcoming lessons
const schedule = async (ctx) => {
  try {
    const student = ctx.student;
    const upcomingLessons = await Lesson.findActiveByStudent(student.id);

    if (upcomingLessons.length === 0) {
      const message = `
📅 <b>Your Schedule</b>

You don't have any upcoming lessons scheduled.

Would you like to book a lesson?
      `;

      const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('📚 Book a Lesson', 'book_lesson')]
      ]);

      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: buttons.reply_markup
      });
      return;
    }

    let scheduleMessage = `📅 <b>Your Upcoming Lessons</b>\n\n`;

    upcomingLessons.forEach((lesson, index) => {
      const startTime = moment(lesson.start_time).tz(student.timezone || config.teacher.timezone);
      const status = lesson.status === 'scheduled' ? '🕐' : lesson.status === 'confirmed' ? '✅' : '📝';
      
      scheduleMessage += `${status} <b>Lesson ${index + 1}</b>\n`;
      scheduleMessage += `📅 ${startTime.format('dddd, MMMM Do, YYYY')}\n`;
      scheduleMessage += `🕐 ${startTime.format('h:mm A')} (${lesson.duration_minutes} min)\n`;
      scheduleMessage += `📚 ${lesson.subject}${lesson.topic ? ` - ${lesson.topic}` : ''}\n`;
      scheduleMessage += `📍 ${lesson.location}\n\n`;
    });

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔄 Reschedule', 'reschedule_lesson'),
        Markup.button.callback('❌ Cancel', 'cancel_lesson')
      ],
      [Markup.button.callback('📚 Book Another', 'book_lesson')]
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

    // Get upcoming lessons
    const upcomingLessons = await Lesson.findAll({
      where: {
        student_id: student.id,
        status: {
          [Op.in]: ['scheduled', 'confirmed']
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

    let statusMessage = `👤 <b>המצב שלך - ${student.getDisplayName()}</b>\n\n`;

    // Lesson statistics
    statusMessage += `📊 <b>סטטיסטיקות:</b>\n`;
    statusMessage += `• סה"כ שיעורים שהוזמנו: ${student.total_lessons_booked}\n`;
    statusMessage += `• שיעורים שהושלמו: ${student.total_lessons_completed}\n`;
    statusMessage += `• חברות מתאריך: ${moment(student.created_at).format('DD/MM/YYYY')}\n\n`;

    // Upcoming lessons
    if (upcomingLessons.length > 0) {
      statusMessage += `📅 <b>השיעורים הקרובים שלך:</b>\n`;
      upcomingLessons.forEach((lesson, index) => {
        const lessonTime = moment(lesson.start_time).format('dddd, D בMMMM בשעה HH:mm');
        statusMessage += `${index + 1}. ${lesson.subject} - ${lessonTime}\n`;
      });
      statusMessage += '\n';
    } else {
      statusMessage += `📅 <b>אין שיעורים מתוכננים</b>\n\n`;
    }

    // Waitlist status
    if (waitlistEntries.length > 0) {
      statusMessage += `⏰ <b>רשימות המתנה פעילות:</b>\n`;
      waitlistEntries.forEach((entry, index) => {
        statusMessage += `${index + 1}. מיקום #${entry.position} - ${entry.request_type || 'זמן גמיש'}\n`;
      });
    } else {
      statusMessage += `⏰ <b>לא ברשימת המתנה כרגע</b>\n`;
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
  try {
    const student = ctx.student;

    const settingsMessage = `
⚙️ <b>Your Settings</b>

📚 <b>Lesson Preferences:</b>
• Duration: ${student.preferred_lesson_duration || config.lessons.defaultDuration} minutes
• Days: ${student.preferred_days?.join(', ') || 'Weekdays'}
• Time Range: ${student.preferred_time_start || '16:00'} - ${student.preferred_time_end || '19:00'}

🌍 <b>Personal:</b>
• Language: ${student.preferred_language || 'English'}
• Timezone: ${student.timezone || config.teacher.timezone}

🔔 <b>Notifications:</b>
• Reminders: ${student.notification_preferences?.lesson_reminders !== false ? '✅' : '❌'}
• Waitlist Updates: ${student.notification_preferences?.waitlist_updates !== false ? '✅' : '❌'}
• Schedule Changes: ${student.notification_preferences?.schedule_changes !== false ? '✅' : '❌'}

Click below to update any setting:
    `;

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('⏱️ Duration', 'set_duration'),
        Markup.button.callback('📅 Days', 'set_days')
      ],
      [
        Markup.button.callback('🕐 Time Range', 'set_time_range'),
        Markup.button.callback('🌍 Timezone', 'set_timezone')
      ],
      [
        Markup.button.callback('🔔 Notifications', 'set_notifications'),
        Markup.button.callback('🌐 Language', 'set_language')
      ],
      [Markup.button.callback('✅ Done', 'settings_done')]
    ]);

    await ctx.reply(settingsMessage, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

  } catch (error) {
    logger.error('Error in settings command:', error);
    await ctx.reply('❌ Sorry, something went wrong. Please try again.');
  }
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
  broadcast
}; 