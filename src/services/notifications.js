const { Telegraf } = require('telegraf');
const { Op } = require('sequelize');
const moment = require('moment-timezone');
const cron = require('node-cron');
const { NotificationLog, Lesson, Student } = require('../models');
const logger = require('../utils/logger');
const settings = require('../config/settings');

/**
 * Service for managing user notifications
 * Handles scheduling, sending, and tracking of notifications
 */
class NotificationService {
  constructor() {
    this.bot = null;
    this.isRunning = false;
    this.processingTask = null;
    this.cleanupTask = null;
  }

  /**
   * Initialize the notification service
   * @param {Telegraf} botInstance - Telegram bot instance
   */
  initialize(botInstance) {
    this.bot = botInstance;
    logger.info('Notification service initialized');
  }

  /**
   * Start the notification processing services
   */
  start() {
    if (this.isRunning) {
      return;
    }
    
    logger.info('Starting notification service...');
    
    // Process pending notifications every minute
    this.processingTask = cron.schedule('*/1 * * * *', async () => {
      try {
        await this.processPendingNotifications();
      } catch (error) {
        logger.error('Error processing pending notifications:', error);
      }
    });

    // Clean up old notifications daily
    this.cleanupTask = cron.schedule('0 3 * * *', async () => {
      try {
        await this.cleanupOldNotifications();
      } catch (error) {
        logger.error('Error cleaning up old notifications:', error);
      }
    });
    
    this.isRunning = true;
    logger.info('Notification service started');
  }

  /**
   * Stop the notification processing services
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    
    logger.info('Stopping notification service...');
    
    if (this.processingTask) {
      this.processingTask.stop();
    }
    
    if (this.cleanupTask) {
      this.cleanupTask.stop();
    }
    
    this.isRunning = false;
    logger.info('Notification service stopped');
  }

  /**
   * Process notifications that are scheduled to be sent now
   */
  async processPendingNotifications() {
    try {
      const now = new Date();
      
      const pendingNotifications = await NotificationLog.findAll({
        where: {
          delivery_status: 'pending',
          scheduled_at: {
            [Op.lte]: now
          }
        },
        include: [
          { model: Student, as: 'student' },
          { model: Lesson, as: 'lesson' }
        ],
        limit: 50 // Process in batches
      });
      
      if (pendingNotifications.length === 0) {
        return;
      }
      
      logger.info(`Processing ${pendingNotifications.length} pending notifications`);
      
      for (const notification of pendingNotifications) {
        try {
          await this.sendNotification(notification);
        } catch (error) {
          logger.error(`Failed to send notification ${notification.id}:`, error);
          await notification.markFailed(error.message);
        }
      }
    } catch (error) {
      logger.error('Error in processPendingNotifications:', error);
    }
  }

  /**
   * Send a notification via the appropriate channel
   */
  async sendNotification(notification) {
    if (!notification.student) {
      throw new Error('Notification has no associated student');
    }
    
    switch (notification.delivery_method) {
      case 'telegram':
        return await this.sendTelegramNotification(notification);
      case 'email':
        return await this.sendEmailNotification(notification);
      case 'sms':
        return await this.sendSmsNotification(notification);
      default:
        throw new Error(`Unsupported delivery method: ${notification.delivery_method}`);
    }
  }

  /**
   * Send notification via Telegram
   */
  async sendTelegramNotification(notification) {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }
    
    if (!notification.student.telegram_id) {
      throw new Error('Student has no Telegram ID');
    }
    
    try {
      const messageResult = await this.bot.telegram.sendMessage(
        notification.student.telegram_id,
        notification.message,
        {
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );
      
      await notification.markSent(messageResult.message_id);
      
      return {
        success: true,
        messageId: messageResult.message_id
      };
    } catch (error) {
      logger.error(`Failed to send Telegram notification to student ${notification.student_id}:`, error);
      await notification.markFailed(error.message);
      throw error;
    }
  }

  /**
   * Send notification via email (placeholder for future implementation)
   */
  async sendEmailNotification(notification) {
    // Implementation for email notifications would go here
    logger.info('Email notifications not yet implemented');
    await notification.markFailed('Email delivery not implemented');
    throw new Error('Email notifications not implemented');
  }

  /**
   * Send notification via SMS (placeholder for future implementation)
   */
  async sendSmsNotification(notification) {
    // Implementation for SMS notifications would go here
    logger.info('SMS notifications not yet implemented');
    await notification.markFailed('SMS delivery not implemented');
    throw new Error('SMS notifications not implemented');
  }

  /**
   * Clean up old notification records
   */
  async cleanupOldNotifications() {
    const retentionDays = settings.notifications?.retentionDays || 30;
    const cutoffDate = moment().subtract(retentionDays, 'days').toDate();
    
    const deletedCount = await NotificationLog.destroy({
      where: {
        created_at: {
          [Op.lt]: cutoffDate
        },
        delivery_status: {
          [Op.in]: ['sent', 'delivered']
        }
      }
    });
    
    logger.info(`Cleaned up ${deletedCount} old notifications`);
  }

  /**
   * Schedule a notification for a student
   */
  async scheduleNotification({
    student,
    lesson = null,
    type,
    title,
    message,
    deliveryMethod = 'telegram',
    scheduledAt = new Date(),
    priority = 'normal',
    templateName = null,
    templateVariables = {},
    metadata = {},
    tags = []
  }) {
    if (!student || !student.id) {
      throw new Error('Valid student is required for notification');
    }

    try {
      const notification = await NotificationLog.create({
        student_id: student.id,
        lesson_id: lesson ? lesson.id : null,
        notification_type: type,
        title,
        message,
        delivery_method: deliveryMethod,
        scheduled_at: scheduledAt,
        priority,
        template_name: templateName,
        template_variables: templateVariables,
        telegram_chat_id: student.telegram_id,
        metadata,
        tags
      });
      
      logger.info(`Scheduled ${type} notification for student ${student.id}`);
      return notification;
    } catch (error) {
      logger.error(`Failed to schedule notification for student ${student.id}:`, error);
      throw error;
    }
  }

  /**
   * Send lesson booking confirmation
   */
  async sendBookingConfirmation(student, lesson) {
    try {
      const formattedDate = moment(lesson.start_time).format('dddd, MMMM Do, YYYY');
      const formattedTime = moment(lesson.start_time).format('h:mm A');
      
      const message = `<b>Lesson Confirmed!</b>

📅 <b>Date:</b> ${formattedDate}
🕒 <b>Time:</b> ${formattedTime}
⏱ <b>Duration:</b> ${lesson.duration_minutes} minutes
📝 <b>Subject:</b> ${lesson.subject || 'Math'}
${lesson.topic ? `📚 <b>Topic:</b> ${lesson.topic}` : ''}

Your lesson has been successfully booked. Please be ready 5 minutes before the start time.

See you soon!`;

      await this.scheduleNotification({
        student,
        lesson,
        type: 'booking_confirmation',
        title: 'Lesson Booking Confirmed',
        message,
        priority: 'high'
      });
      
      logger.info(`Booking confirmation sent to student ${student.id} for lesson ${lesson.id}`);
    } catch (error) {
      logger.error(`Failed to send booking confirmation to student ${student.id}:`, error);
    }
  }

  /**
   * Send cancellation confirmation
   */
  async sendCancellationConfirmation(student, lesson) {
    try {
      const formattedDate = moment(lesson.start_time).format('dddd, MMMM Do, YYYY');
      const formattedTime = moment(lesson.start_time).format('h:mm A');
      
      const message = `<b>Lesson Cancellation Confirmation</b>

Your lesson scheduled for ${formattedDate} at ${formattedTime} has been cancelled.

If you'd like to reschedule, simply send a message with your preferred new date and time.`;

      await this.scheduleNotification({
        student,
        lesson,
        type: 'lesson_cancellation',
        title: 'Lesson Cancellation Confirmed',
        message,
        priority: 'high'
      });
      
      logger.info(`Cancellation confirmation sent to student ${student.id} for lesson ${lesson.id}`);
    } catch (error) {
      logger.error(`Failed to send cancellation confirmation to student ${student.id}:`, error);
    }
  }

  /**
   * Send waitlist confirmation
   */
  async sendWaitlistConfirmation(student, waitlistEntry) {
    try {
      const formattedDate = moment(waitlistEntry.preferred_date).format('dddd, MMMM Do, YYYY');
      
      const message = `<b>You've been added to the waitlist!</b>

I've added you to the waitlist for ${formattedDate}.

If a slot becomes available that matches your preferences, I'll notify you right away so you can book it.

Your current waitlist position: #${waitlistEntry.position || 1}`;

      await this.scheduleNotification({
        student,
        type: 'waitlist_position_update',
        title: 'Added to Waitlist',
        message,
        metadata: {
          waitlist_id: waitlistEntry.id
        }
      });
      
      logger.info(`Waitlist confirmation sent to student ${student.id}`);
    } catch (error) {
      logger.error(`Failed to send waitlist confirmation to student ${student.id}:`, error);
    }
  }

  /**
   * Notify student about an available slot from waitlist
   */
  async sendWaitlistSlotAvailable(waitlistEntry, availableSlot) {
    try {
      const student = await Student.findByPk(waitlistEntry.student_id);
      
      if (!student) {
        logger.error(`Student ${waitlistEntry.student_id} not found for waitlist entry ${waitlistEntry.id}`);
        return;
      }
      
      const formattedDate = moment(availableSlot.start).format('dddd, MMMM Do, YYYY');
      const formattedTime = moment(availableSlot.start).format('h:mm A');
      
      const message = `<b>Good news! A slot you've been waiting for is now available!</b>

📅 <b>Date:</b> ${formattedDate}
🕒 <b>Time:</b> ${formattedTime}
⏱ <b>Duration:</b> ${availableSlot.duration} minutes

This slot matches your waitlist request. Would you like to book it?

This slot may be offered to others on the waitlist if you don't respond within 4 hours.`;

      await this.scheduleNotification({
        student,
        type: 'waitlist_slot_available',
        title: 'Waitlist Slot Available',
        message,
        priority: 'high',
        metadata: {
          waitlist_id: waitlistEntry.id,
          slot: availableSlot
        }
      });
      
      logger.info(`Waitlist slot available notification sent to student ${student.id}`);
    } catch (error) {
      logger.error(`Failed to send waitlist slot available notification for entry ${waitlistEntry.id}:`, error);
    }
  }

  /**
   * Send lesson reminder
   */
  async sendLessonReminder(student, lesson) {
    try {
      const formattedDate = moment(lesson.start_time).format('dddd, MMMM Do');
      const formattedTime = moment(lesson.start_time).format('h:mm A');
      const timeUntil = moment(lesson.start_time).fromNow();
      
      const message = `<b>Reminder: Upcoming Lesson</b>

You have a lesson scheduled ${timeUntil}:

📅 <b>Date:</b> ${formattedDate}
🕒 <b>Time:</b> ${formattedTime}
⏱ <b>Duration:</b> ${lesson.duration_minutes} minutes
📝 <b>Subject:</b> ${lesson.subject || 'Math'}
${lesson.topic ? `📚 <b>Topic:</b> ${lesson.topic}` : ''}

Please be ready 5 minutes before the start time.`;

      await this.scheduleNotification({
        student,
        lesson,
        type: 'lesson_reminder',
        title: 'Lesson Reminder',
        message
      });
      
      logger.info(`Reminder sent to student ${student.id} for lesson ${lesson.id}`);
    } catch (error) {
      logger.error(`Failed to send lesson reminder to student ${student.id}:`, error);
    }
  }
}

module.exports = new NotificationService();