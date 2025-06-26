const moment = require('moment-timezone');
const { Markup } = require('telegraf');
const schedulerService = require('../../services/scheduler');
const { Lesson, Waitlist } = require('../../models');
const logger = require('../../utils/logger');
const config = require('../../config/settings');

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

// Help command
const help = async (ctx) => {
  try {
    const helpMessage = `
🤖 <b>Math Tutoring Bot Help</b>

<b>📚 Booking Lessons:</b>
You can book lessons by telling me when you're available in natural language:

<i>Examples:</i>
• "I want to book a lesson tomorrow at 3 PM"
• "Can I schedule something for next Tuesday afternoon?"
• "I'm free Wednesday after 4"
• "Book me a lesson this Friday at 2:30"

<b>📅 Managing Your Schedule:</b>
• <code>/schedule</code> - View your upcoming lessons
• <code>/status</code> - Check your account status
• <code>/cancel</code> - Cancel an upcoming lesson
• <code>/waitlist</code> - View your waitlist position

<b>⚙️ Settings & Preferences:</b>
• <code>/settings</code> - Update your preferences
• Set your preferred lesson duration
• Choose your available days and times
• Update notification preferences

<b>🎯 Quick Actions:</b>
• <code>/book</code> - Start booking a lesson
• <code>/help</code> - Show this help message

<b>💬 Natural Language:</b>
I understand natural language, so feel free to type your requests normally! I can understand dates, times, and scheduling preferences in conversational language.

<b>📞 Support:</b>
If you need help or have questions, just ask me or contact ${config.teacher.name} directly.
    `;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('📚 Book Lesson', 'book_lesson')],
      [
        Markup.button.callback('📅 Schedule', 'my_schedule'),
        Markup.button.callback('⚙️ Settings', 'settings')
      ]
    ]);

    await ctx.reply(helpMessage, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

  } catch (error) {
    logger.error('Error in help command:', error);
    await ctx.reply('❌ Sorry, something went wrong. Please try again.');
  }
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

// Status command - show student status
const status = async (ctx) => {
  try {
    const student = ctx.student;
    const upcomingLessons = await Lesson.findActiveByStudent(student.id);
    const waitlistEntries = await Waitlist.findByStudent(student.id);
    const activeWaitlist = waitlistEntries.filter(entry => entry.isActive());

    const statusMessage = `
📊 <b>Your Account Status</b>

👤 <b>Student Info:</b>
• Name: ${student.getDisplayName()}
• Status: ${student.status === 'active' ? '✅ Active' : '❌ Inactive'}
• Member since: ${moment(student.registration_date).format('MMMM YYYY')}

📚 <b>Lesson Statistics:</b>
• Total Booked: ${student.total_lessons_booked}
• Completed: ${student.total_lessons_completed}
• Cancelled: ${student.total_lessons_cancelled}
• Upcoming: ${upcomingLessons.length}

⏰ <b>Waitlist:</b>
• Active entries: ${activeWaitlist.length}
${activeWaitlist.length > 0 ? `• Position: #${activeWaitlist[0].position}` : ''}

⚙️ <b>Preferences:</b>
• Lesson Duration: ${student.preferred_lesson_duration || config.lessons.defaultDuration} min
• Language: ${student.preferred_language}
• Timezone: ${student.timezone || config.teacher.timezone}

📱 <b>Last Activity:</b> ${moment(student.last_activity).fromNow()}
    `;

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('📅 Schedule', 'my_schedule'),
        Markup.button.callback('📚 Book Lesson', 'book_lesson')
      ],
      [
        Markup.button.callback('⏰ Waitlist', 'view_waitlist'),
        Markup.button.callback('⚙️ Settings', 'settings')
      ]
    ]);

    await ctx.reply(statusMessage, {
      parse_mode: 'HTML',
      reply_markup: buttons.reply_markup
    });

  } catch (error) {
    logger.error('Error in status command:', error);
    await ctx.reply('❌ Sorry, something went wrong. Please try again.');
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