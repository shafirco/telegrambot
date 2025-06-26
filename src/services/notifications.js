const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { NotificationLog } = require('../models');
const { Op } = require('sequelize');
const settings = require('../config/settings');

class NotificationService {
  constructor() {
    this.bot = null;
  }

  setBotInstance(bot) {
    this.bot = bot;
  }

  /**
   * Send booking confirmation to student
   */
  async sendBookingConfirmation(student, lesson) {
    try {
      const lessonTime = moment(lesson.start_time)
        .tz(student.timezone || settings.teacher.timezone)
        .format('dddd, MMMM Do, YYYY [at] h:mm A');

      const message = `✅ <b>Lesson Confirmed!</b>

📚 <b>Math Lesson</b>
📅 ${lessonTime}
⏱️ Duration: ${lesson.duration_minutes} minutes
📍 ${lesson.location}
💰 Price: $${lesson.price}

🔔 You'll receive a reminder ${settings.notifications?.reminderHours || 24} hours before your lesson.

Looking forward to our session! 📖`;

      await this.sendNotification(student.telegram_id, message, 'booking_confirmation', lesson.id);
      
      logger.info('Booking confirmation sent', {
        studentId: student.id,
        lessonId: lesson.id,
        lessonTime
      });

    } catch (error) {
      logger.error('Error sending booking confirmation:', error);
    }
  }

  /**
   * Send cancellation confirmation to student
   */
  async sendCancellationConfirmation(student, lesson) {
    try {
      const lessonTime = moment(lesson.start_time)
        .tz(student.timezone || settings.teacher.timezone)
        .format('dddd, MMMM Do, YYYY [at] h:mm A');

      const message = `❌ <b>Lesson Cancelled</b>

Your lesson scheduled for ${lessonTime} has been cancelled.

📝 <b>Cancellation Details:</b>
• Lesson: ${lesson.subject || 'Math Lesson'}
• Date: ${lessonTime}
• Status: Cancelled

💰 Any charges will be refunded according to our cancellation policy.

Feel free to book a new lesson anytime! 📚`;

      await this.sendNotification(student.telegram_id, message, 'cancellation_confirmation', lesson.id);
      
      logger.info('Cancellation confirmation sent', {
        studentId: student.id,
        lessonId: lesson.id,
        lessonTime
      });

    } catch (error) {
      logger.error('Error sending cancellation confirmation:', error);
    }
  }

  /**
   * Send waitlist confirmation to student
   */
  async sendWaitlistConfirmation(student, waitlistEntry) {
    try {
      const preferredTime = waitlistEntry.preferred_start_time
        ? moment(waitlistEntry.preferred_start_time).format('dddd, MMMM Do [at] h:mm A')
        : 'Flexible timing';

      const message = `⏰ <b>Added to Waitlist</b>

You've been successfully added to the waitlist!

📋 <b>Waitlist Details:</b>
• Position: #${waitlistEntry.position}
• Preferred Time: ${preferredTime}
• Duration: ${waitlistEntry.preferred_duration} minutes
• Priority: ${waitlistEntry.urgency_level || 'Normal'}

🔔 I'll notify you immediately when a matching slot becomes available!

You can check your waitlist status anytime by typing /waitlist`;

      await this.sendNotification(student.telegram_id, message, 'waitlist_confirmation', waitlistEntry.id);
      
      logger.info('Waitlist confirmation sent', {
        studentId: student.id,
        waitlistId: waitlistEntry.id,
        position: waitlistEntry.position
      });

    } catch (error) {
      logger.error('Error sending waitlist confirmation:', error);
    }
  }

  /**
   * Notify student that a waitlist slot is available
   */
  async sendWaitlistSlotAvailable(waitlistEntry, slotDetails) {
    try {
      const student = waitlistEntry.student;
      const slotTime = moment(slotDetails.start)
        .tz(student.timezone || settings.teacher.timezone)
        .format('dddd, MMMM Do, YYYY [at] h:mm A');

      const message = `🎉 <b>Great News!</b>

A time slot matching your preferences is now available!

⏰ <b>Available Slot:</b>
📅 ${slotTime}
⏱️ Duration: ${slotDetails.duration} minutes
💰 Price: $${slotDetails.price}

This slot is reserved for you for the next 15 minutes. Would you like to book it?

Reply with "BOOK" to confirm, or "PASS" to stay on the waitlist.`;

      await this.sendNotification(student.telegram_id, message, 'waitlist_slot_available', waitlistEntry.id);
      
      logger.info('Waitlist slot notification sent', {
        studentId: student.id,
        waitlistId: waitlistEntry.id,
        slotTime
      });

    } catch (error) {
      logger.error('Error sending waitlist slot notification:', error);
    }
  }

  /**
   * Send lesson reminder to student
   */
  async sendLessonReminder(student, lesson) {
    try {
      const lessonTime = moment(lesson.start_time)
        .tz(student.timezone || settings.teacher.timezone);
      
      const hoursUntil = lessonTime.diff(moment(), 'hours');
      const timeUntil = hoursUntil > 1 ? `${hoursUntil} hours` : 'soon';

      const message = `🔔 <b>Lesson Reminder</b>

Your math lesson is starting ${timeUntil}!

📚 <b>Lesson Details:</b>
📅 ${lessonTime.format('dddd, MMMM Do, YYYY [at] h:mm A')}
⏱️ Duration: ${lesson.duration_minutes} minutes
📍 ${lesson.location}
📝 Topic: ${lesson.topic || 'General Math'}

🎯 <b>Preparation Tips:</b>
• Have your materials ready
• Review any assigned homework
• Prepare questions about topics you find difficult

See you soon! 📖`;

      await this.sendNotification(student.telegram_id, message, 'lesson_reminder', lesson.id);
      
      logger.info('Lesson reminder sent', {
        studentId: student.id,
        lessonId: lesson.id,
        hoursUntil
      });

    } catch (error) {
      logger.error('Error sending lesson reminder:', error);
    }
  }

  /**
   * Send notification to student via Telegram
   */
  async sendNotification(telegramId, message, type, relatedId = null) {
    try {
      if (!this.bot) {
        logger.warn('Bot instance not set - notification not sent', { 
          type, 
          telegramId: telegramId.toString().substring(0, 5) + '***' 
        });
        return;
      }

      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'HTML'
      });

      // Log notification
      try {
        await NotificationLog.create({
          telegram_id: telegramId,
          message_type: type,
          message_content: message,
          related_id: relatedId,
          status: 'sent',
          sent_at: new Date()
        });
      } catch (dbError) {
        logger.warn('Could not log notification to database:', dbError.message);
      }

      logger.info('Notification sent successfully', { 
        telegramId: telegramId.toString().substring(0, 5) + '***', 
        type, 
        relatedId 
      });

    } catch (error) {
      logger.error('Error sending notification:', error);

      // Log failed notification
      try {
        await NotificationLog.create({
          telegram_id: telegramId,
          message_type: type,
          message_content: message,
          related_id: relatedId,
          status: 'failed',
          error_message: error.message,
          attempted_at: new Date()
        });
      } catch (logError) {
        logger.warn('Error logging failed notification:', logError.message);
      }
    }
  }

  /**
   * Send bulk notifications (for maintenance, announcements, etc.)
   */
  async sendBulkNotification(students, message, type = 'announcement') {
    const results = { sent: 0, failed: 0 };

    for (const student of students) {
      try {
        await this.sendNotification(student.telegram_id, message, type);
        results.sent++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.failed++;
        logger.error(`Failed to send bulk notification to student ${student.id}:`, error);
      }
    }

    logger.info('Bulk notification completed', {
      type,
      totalStudents: students.length,
      sent: results.sent,
      failed: results.failed
    });

    return results;
  }

  /**
   * Retry failed notifications
   */
  async retryFailedNotifications(maxAttempts = 3) {
    try {
      const failedNotifications = await NotificationLog.findAll({
        where: {
          status: 'failed',
          retry_count: { [Op.lt]: maxAttempts }
        },
        order: [['attempted_at', 'ASC']],
        limit: 50 // Process in batches
      });

      let retried = 0;
      let succeeded = 0;

      for (const notification of failedNotifications) {
        try {
          await this.bot.telegram.sendMessage(
            notification.telegram_id,
            notification.message_content,
            { parse_mode: 'HTML' }
          );

          await notification.update({
            status: 'sent',
            sent_at: new Date(),
            retry_count: (notification.retry_count || 0) + 1
          });

          succeeded++;
        } catch (error) {
          await notification.update({
            retry_count: (notification.retry_count || 0) + 1,
            error_message: error.message,
            attempted_at: new Date()
          });
        }

        retried++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      logger.info('Retry failed notifications completed', {
        retried,
        succeeded,
        failed: retried - succeeded
      });

      return { retried, succeeded };

    } catch (error) {
      logger.error('Error retrying failed notifications:', error);
      return { retried: 0, succeeded: 0 };
    }
  }
}

module.exports = new NotificationService(); 