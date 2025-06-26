const moment = require('moment-timezone');
const cron = require('node-cron');
const { Op } = require('sequelize');
const { Lesson, Student, Waitlist, TeacherAvailability } = require('../models');
const calendarService = require('./calendar');
const notificationService = require('./notifications');
const aiScheduler = require('../ai/scheduler');
const logger = require('../utils/logger');
const settings = require('../config/settings');

class SchedulerService {
  constructor() {
    this.maintenanceTask = null;
    this.isMaintenanceRunning = false;
    this.maintenanceInterval = null;
  }

  /**
   * Process a natural language scheduling request
   */
  async processBookingRequest(userMessage, student, conversationContext = {}) {
    try {
      logger.scheduleLog('processing_request', {
        studentId: student.id,
        message: userMessage.substring(0, 100)
      });

      // Get student's recent lessons for context
      const recentLessons = await Lesson.findActiveByStudent(student.id);
      
      const studentProfile = {
        id: student.id,
        name: student.getDisplayName(),
        timezone: student.timezone,
        preferredDuration: student.preferred_lesson_duration,
        recentLessons: recentLessons.slice(0, 3) // Last 3 lessons for context
      };

      // Use AI to understand the request
      const schedulingData = await aiScheduler.processSchedulingRequest(userMessage, studentProfile);

      // Process based on intent
      switch (schedulingData.intent) {
        case 'book_lesson':
          return await this.handleBookingRequest(schedulingData, student);
        
        case 'check_availability':
          return await this.handleAvailabilityCheck(schedulingData, student);
        
        case 'reschedule_lesson':
          return await this.handleRescheduleRequest(schedulingData, student);
        
        case 'cancel_lesson':
          return await this.handleCancellationRequest(schedulingData, student);
        
        case 'join_waitlist':
          return await this.handleWaitlistRequest(schedulingData, student);
        
        default:
          return await this.handleOtherRequest(schedulingData, student);
      }

    } catch (error) {
      logger.error('Error processing booking request:', error);
      throw new Error('Unable to process your scheduling request. Please try again or contact support.');
    }
  }

  /**
   * Handle lesson booking requests
   */
  async handleBookingRequest(schedulingData, student) {
    const { datetime_preferences, lesson_details } = schedulingData;

    if (!datetime_preferences || datetime_preferences.length === 0) {
      return {
        success: false,
        message: 'I need to know when you\'d like to schedule your lesson. Could you please specify a date and time?',
        needsMoreInfo: true,
        type: 'datetime_needed'
      };
    }

    const availableSlots = [];
    const conflictingSlots = [];

    // Check each datetime preference
    for (const preference of datetime_preferences) {
      const slots = await this.findAvailableSlots(
        preference,
        lesson_details?.duration_minutes || student.preferred_lesson_duration
      );

      if (slots.length > 0) {
        availableSlots.push(...slots);
      } else {
        conflictingSlots.push(preference);
      }
    }

    if (availableSlots.length > 0) {
      // Sort slots by preference match
      const sortedSlots = this.sortSlotsByPreference(availableSlots, datetime_preferences);
      
      return {
        success: true,
        message: 'Great! I found some available time slots for you.',
        availableSlots: sortedSlots.slice(0, 5), // Show top 5 options
        schedulingData,
        type: 'slots_available'
      };
    } else {
      // No available slots - offer waitlist
      return await this.offerWaitlistOptions(schedulingData, student, conflictingSlots);
    }
  }

  /**
   * Find available time slots based on preferences
   */
  async findAvailableSlots(preference, durationMinutes = 60) {
    try {
      let searchDate, searchTime;

      if (preference.datetime) {
        const momentTime = moment(preference.datetime).tz(settings.teacher.timezone);
        searchDate = momentTime.format('YYYY-MM-DD');
        searchTime = momentTime.format('HH:mm');
      } else if (preference.date) {
        searchDate = preference.date;
        searchTime = preference.time || '09:00';
      } else {
        // No specific date - search next available
        return await this.findNextAvailableSlots(durationMinutes, 7); // Next 7 days
      }

      // Generate basic available slots for business hours
      const availableSlots = [];
      const searchMoment = moment.tz(searchDate, settings.teacher.timezone);
      
      // Skip if not a business day
      if (!settings.isBusinessDay(searchMoment.toDate())) {
        return [];
      }

      // Create time slots every 30 minutes during business hours
      const startHour = parseInt(settings.businessHours.start.split(':')[0]);
      const startMinute = parseInt(settings.businessHours.start.split(':')[1]);
      const endHour = parseInt(settings.businessHours.end.split(':')[0]);
      const endMinute = parseInt(settings.businessHours.end.split(':')[1]);

      let currentSlot = searchMoment.clone().set({ hour: startHour, minute: startMinute, second: 0 });
      const endTime = searchMoment.clone().set({ hour: endHour, minute: endMinute, second: 0 });

      while (currentSlot.isBefore(endTime.subtract(durationMinutes, 'minutes'))) {
        const slotEnd = currentSlot.clone().add(durationMinutes, 'minutes');
        
        // Check if this slot is in the future (at least 2 hours from now)
        const hoursUntilSlot = currentSlot.diff(moment(), 'hours');
        if (hoursUntilSlot >= 2) {
          
          // Check for conflicts with existing lessons
          const hasConflict = await Lesson.hasConflict(currentSlot.toDate(), slotEnd.toDate());
          
          if (!hasConflict) {
            // Check teacher availability (manual blocks)
            const isTeacherAvailable = await this.checkTeacherAvailability(currentSlot.toDate(), durationMinutes);
            
            if (isTeacherAvailable.available) {
              availableSlots.push({
                start: currentSlot.toDate(),
                end: slotEnd.toDate(),
                duration: durationMinutes,
                date: currentSlot.format('YYYY-MM-DD'),
                time: currentSlot.format('HH:mm'),
                formattedTime: currentSlot.format('dddd, D בMMMM בשעה HH:mm'),
                pricePerHour: settings.lessons.defaultPrice || 100
              });
            }
          }
        }
        
        // Move to next 30-minute slot
        currentSlot.add(30, 'minutes');
      }

      return availableSlots;

    } catch (error) {
      logger.error('Error finding available slots:', error);
      return [];
    }
  }

  /**
   * Find next available slots across multiple days
   */
  async findNextAvailableSlots(durationMinutes = 60, daysAhead = 14) {
    const availableSlots = [];
    const startDate = moment().tz(settings.teacher.timezone);
    
    for (let i = 0; i < daysAhead; i++) {
      const checkDate = startDate.clone().add(i, 'days');
      
      // Skip if not a business day
      if (!settings.isBusinessDay(checkDate.toDate())) {
        continue;
      }

      const daySlots = await this.findAvailableSlots({
        date: checkDate.format('YYYY-MM-DD')
      }, durationMinutes);

      availableSlots.push(...daySlots);

      // Limit total slots returned
      if (availableSlots.length >= 20) {
        break;
      }
    }

    return availableSlots.slice(0, 20);
  }

  /**
   * Book a specific time slot
   */
  async bookTimeSlot(slotDetails, student, lessonDetails = {}) {
    try {
      logger.scheduleLog('booking_slot', {
        studentId: student.id,
        slotStart: slotDetails.start,
        duration: slotDetails.duration
      });

      // Double-check availability
      const hasConflict = await Lesson.hasConflict(slotDetails.start, slotDetails.end);
      if (hasConflict) {
        throw new Error('This time slot is no longer available');
      }

      // Create the lesson
      const lesson = await Lesson.create({
        student_id: student.id,
        start_time: slotDetails.start,
        end_time: slotDetails.end,
        duration_minutes: slotDetails.duration,
        subject: lessonDetails.subject || 'Math Lesson',
        topic: lessonDetails.topic,
        difficulty_level: lessonDetails.difficulty,
        lesson_type: lessonDetails.lesson_type || 'regular',
        original_request: lessonDetails.original_request,
        booking_method: 'telegram_bot',
        price_amount: this.calculateLessonPrice(slotDetails),
        metadata: {
          ai_confidence: lessonDetails.ai_confidence,
          booking_source: 'telegram_bot'
        }
      });

      // Create calendar event
      try {
        const calendarEvent = await calendarService.createEvent({
          summary: `Math Lesson - ${student.getDisplayName()}`,
          description: `Lesson with ${student.getDisplayName()}${lessonDetails.topic ? `\nTopic: ${lessonDetails.topic}` : ''}`,
          start: {
            dateTime: moment(slotDetails.start).toISOString(),
            timeZone: settings.teacher.timezone
          },
          end: {
            dateTime: moment(slotDetails.end).toISOString(),
            timeZone: settings.teacher.timezone
          },
          attendees: [{
            email: student.email,
            displayName: student.getDisplayName()
          }]
        });

        // Update lesson with calendar event ID
        lesson.google_calendar_event_id = calendarEvent.id;
        lesson.calendar_sync_status = 'synced';
        await lesson.save();

      } catch (calendarError) {
        logger.error('Failed to create calendar event:', calendarError);
        lesson.calendar_sync_status = 'error';
        await lesson.save();
      }

      // Update student lesson count
      await student.incrementLessonCount('booked');

      // Send confirmation notification
      await notificationService.sendBookingConfirmation(student, lesson);

      // Check and notify waitlist
      await this.processWaitlistForCancellation(slotDetails.start, slotDetails.duration);

      logger.scheduleLog('lesson_booked', {
        studentId: student.id,
        lessonId: lesson.id,
        startTime: lesson.start_time
      });

      return {
        success: true,
        lesson,
        message: `✅ Your lesson has been booked for ${moment(lesson.start_time).format('dddd, MMMM Do [at] h:mm A')}! You'll receive a reminder 24 hours before the lesson.`
      };

    } catch (error) {
      logger.error('Error booking time slot:', error);
      throw error;
    }
  }

  /**
   * Cancel a lesson and notify waitlist
   */
  async cancelLesson(lessonId, student, reason = 'Student cancellation') {
    try {
      const lesson = await Lesson.findByPk(lessonId, {
        include: [{ model: Student, as: 'student' }]
      });

      if (!lesson) {
        throw new Error('Lesson not found');
      }

      if (lesson.student_id !== student.id) {
        throw new Error('You can only cancel your own lessons');
      }

      if (!lesson.canBeCancelled()) {
        throw new Error('This lesson cannot be cancelled');
      }

      // Cancel the lesson
      await lesson.cancel(reason, 'student');

      // Remove from calendar
      if (lesson.google_calendar_event_id) {
        try {
          await calendarService.deleteEvent(lesson.google_calendar_event_id);
        } catch (calendarError) {
          logger.error('Failed to delete calendar event:', calendarError);
        }
      }

      // Update student statistics
      await student.incrementLessonCount('cancelled');

      // Notify waitlist about available slot
      await this.processWaitlistForCancellation(lesson.start_time, lesson.duration_minutes);

      // Send cancellation notification
      await notificationService.sendCancellationConfirmation(student, lesson);

      logger.scheduleLog('lesson_cancelled', {
        studentId: student.id,
        lessonId: lesson.id,
        reason
      });

      return {
        success: true,
        message: `Your lesson on ${moment(lesson.start_time).format('dddd, MMMM Do [at] h:mm A')} has been cancelled.`
      };

    } catch (error) {
      logger.error('Error cancelling lesson:', error);
      throw error;
    }
  }

  /**
   * Add student to waitlist
   */
  async addToWaitlist(schedulingData, student) {
    try {
      const { datetime_preferences, lesson_details, urgency } = schedulingData;

      const waitlistEntry = await Waitlist.create({
        student_id: student.id,
        preferred_start_time: datetime_preferences?.[0]?.datetime ? new Date(datetime_preferences[0].datetime) : null,
        preferred_duration: lesson_details?.duration_minutes || student.preferred_lesson_duration,
        preferred_days: student.preferred_days,
        preferred_time_range_start: student.preferred_time_start,
        preferred_time_range_end: student.preferred_time_end,
        original_request: schedulingData.original_message,
        request_type: datetime_preferences?.[0]?.flexibility || 'flexible_time',
        urgency_level: urgency,
        lesson_type: lesson_details?.lesson_type || 'regular',
        subject_areas: lesson_details?.subject ? [lesson_details.subject] : ['math'],
        max_wait_days: schedulingData.constraints?.max_wait_days || 14
      });

      // Send waitlist confirmation
      await notificationService.sendWaitlistConfirmation(student, waitlistEntry);

      logger.scheduleLog('waitlist_added', {
        studentId: student.id,
        waitlistId: waitlistEntry.id,
        position: waitlistEntry.position
      });

      return {
        success: true,
        waitlistEntry,
        message: `You've been added to the waitlist (position #${waitlistEntry.position}). I'll notify you as soon as a matching time slot becomes available! 🕐`
      };

    } catch (error) {
      logger.error('Error adding to waitlist:', error);
      throw error;
    }
  }

  /**
   * Process waitlist when a slot becomes available
   */
  async processWaitlistForCancellation(startTime, duration) {
    try {
      const matchingEntries = await Waitlist.findMatchingEntries(startTime, duration);

      for (const entry of matchingEntries.slice(0, 3)) { // Notify top 3 matches
        if (entry.canBeNotified()) {
          await notificationService.sendWaitlistSlotAvailable(entry, {
            start_time: startTime,
            duration: duration,
            formatted_time: moment(startTime).format('dddd, MMMM Do [at] h:mm A')
          });

          await entry.markNotified();
        }
      }

    } catch (error) {
      logger.error('Error processing waitlist:', error);
    }
  }

  /**
   * Calculate lesson price based on duration and time
   */
  calculateLessonPrice(slotDetails) {
    const basePricePerHour = slotDetails.pricePerHour || 50; // Default $50/hour
    const hours = slotDetails.duration / 60;
    return (basePricePerHour * hours).toFixed(2);
  }

  /**
   * Sort available slots by preference match
   */
  sortSlotsByPreference(slots, preferences) {
    return slots.sort((a, b) => {
      let scoreA = 0, scoreB = 0;

      for (const pref of preferences) {
        if (pref.datetime) {
          const prefTime = moment(pref.datetime);
          const diffA = Math.abs(moment(a.start).diff(prefTime, 'minutes'));
          const diffB = Math.abs(moment(b.start).diff(prefTime, 'minutes'));
          
          // Closer to preferred time = higher score
          scoreA += Math.max(0, 1000 - diffA);
          scoreB += Math.max(0, 1000 - diffB);
        }
      }

      return scoreB - scoreA; // Higher score first
    });
  }

  /**
   * Offer waitlist options when no slots available
   */
  async offerWaitlistOptions(schedulingData, student, conflictingSlots) {
    // Find alternative slots
    const alternativeSlots = await this.findNextAvailableSlots(
      schedulingData.lesson_details?.duration_minutes || student.preferred_lesson_duration,
      14
    );

    return {
      success: false,
      message: 'I don\'t have any available slots for your preferred times, but I can offer you these alternatives or add you to the waitlist.',
      alternativeSlots: alternativeSlots.slice(0, 5),
      waitlistOption: true,
      schedulingData,
      type: 'no_slots_waitlist_offered'
    };
  }

  /**
   * Handle other types of requests
   */
  async handleOtherRequest(schedulingData, student) {
    const response = await aiScheduler.generateResponse(
      schedulingData,
      [],
      student.getDisplayName()
    );

    return {
      success: true,
      message: response,
      type: 'general_response'
    };
  }

  /**
   * Handle availability check requests
   */
  async handleAvailabilityCheck(schedulingData, student) {
    const slots = await this.findNextAvailableSlots(
      student.preferred_lesson_duration,
      7 // Next week
    );

    const response = await aiScheduler.generateResponse(
      schedulingData,
      slots.slice(0, 5),
      student.getDisplayName()
    );

    return {
      success: true,
      message: response,
      availableSlots: slots.slice(0, 10),
      type: 'availability_check'
    };
  }

  /**
   * Handle reschedule requests
   */
  async handleRescheduleRequest(schedulingData, student) {
    // Find student's upcoming lessons
    const upcomingLessons = await Lesson.findActiveByStudent(student.id);
    
    if (upcomingLessons.length === 0) {
      return {
        success: false,
        message: 'You don\'t have any upcoming lessons to reschedule.',
        type: 'no_lessons_to_reschedule'
      };
    }

    return {
      success: true,
      message: 'Which lesson would you like to reschedule?',
      upcomingLessons: upcomingLessons,
      type: 'reschedule_lesson_selection'
    };
  }

  /**
   * Handle cancellation requests
   */
  async handleCancellationRequest(schedulingData, student) {
    // Find student's upcoming lessons
    const upcomingLessons = await Lesson.findActiveByStudent(student.id);
    
    if (upcomingLessons.length === 0) {
      return {
        success: false,
        message: 'You don\'t have any upcoming lessons to cancel.',
        type: 'no_lessons_to_cancel'
      };
    }

    return {
      success: true,
      message: 'Which lesson would you like to cancel?',
      upcomingLessons: upcomingLessons,
      type: 'cancel_lesson_selection'
    };
  }

  /**
   * Handle waitlist requests
   */
  async handleWaitlistRequest(schedulingData, student) {
    return await this.addToWaitlist(schedulingData, student);
  }

  /**
   * Start maintenance tasks
   */
  startMaintenance() {
    // Run maintenance every hour
    this.maintenanceTask = cron.schedule('0 * * * *', async () => {
      if (this.isMaintenanceRunning) return;
      
      this.isMaintenanceRunning = true;
      try {
        await this.runMaintenance();
      } catch (error) {
        logger.error('Maintenance task failed:', error);
      } finally {
        this.isMaintenanceRunning = false;
      }
    });

    logger.info('Scheduler maintenance tasks started');
  }

  /**
   * Stop maintenance tasks
   */
  stopMaintenance() {
    if (this.maintenanceTask) {
      this.maintenanceTask.destroy();
      this.maintenanceTask = null;
      logger.info('Scheduler maintenance tasks stopped');
    }
  }

  /**
   * Run periodic maintenance
   */
  async runMaintenance() {
    logger.info('Running scheduler maintenance...');

    try {
      // Expire old waitlist entries
      const expiredCount = await Waitlist.expireOldEntries();
      if (expiredCount > 0) {
        logger.info(`Expired ${expiredCount} old waitlist entries`);
      }

      // Send lesson reminders
      await this.sendLessonReminders();

      // Sync pending calendar events
      await this.syncPendingCalendarEvents();

      logger.info('Scheduler maintenance completed');

    } catch (error) {
      logger.error('Error during maintenance:', error);
    }
  }

  /**
   * Send lesson reminders
   */
  async sendLessonReminders() {
    const reminderTime = moment().add(settings.notifications.reminderHours, 'hours');
    
    const upcomingLessons = await Lesson.findAll({
      where: {
        start_time: {
          [Op.between]: [new Date(), reminderTime.toDate()]
        },
        status: ['scheduled', 'confirmed'],
        reminder_sent: false
      },
      include: [{ model: Student, as: 'student' }]
    });

    for (const lesson of upcomingLessons) {
      try {
        await notificationService.sendLessonReminder(lesson.student, lesson);
        lesson.reminder_sent = true;
        await lesson.save();
      } catch (error) {
        logger.error(`Failed to send reminder for lesson ${lesson.id}:`, error);
      }
    }

    if (upcomingLessons.length > 0) {
      logger.info(`Sent ${upcomingLessons.length} lesson reminders`);
    }
  }

  /**
   * Sync pending calendar events
   */
  async syncPendingCalendarEvents() {
    const pendingLessons = await Lesson.findAll({
      where: {
        calendar_sync_status: 'pending',
        status: ['scheduled', 'confirmed']
      },
      include: [{ model: Student, as: 'student' }]
    });

    for (const lesson of pendingLessons) {
      try {
        const calendarEvent = await calendarService.createEvent({
          summary: `Math Lesson - ${lesson.student.getDisplayName()}`,
          start: {
            dateTime: moment(lesson.start_time).toISOString(),
            timeZone: settings.teacher.timezone
          },
          end: {
            dateTime: moment(lesson.end_time).toISOString(),
            timeZone: settings.teacher.timezone
          }
        });

        lesson.google_calendar_event_id = calendarEvent.id;
        lesson.calendar_sync_status = 'synced';
        await lesson.save();

      } catch (error) {
        logger.error(`Failed to sync calendar for lesson ${lesson.id}:`, error);
        lesson.calendar_sync_status = 'error';
        await lesson.save();
      }
    }

    if (pendingLessons.length > 0) {
      logger.info(`Synced ${pendingLessons.length} calendar events`);
    }
  }

  /**
   * Check if teacher is available at a specific time
   */
  async checkTeacherAvailability(startTime, durationMinutes = 60) {
    try {
      const endTime = moment(startTime).add(durationMinutes, 'minutes');
      
      // Check if it's within business hours
      if (!settings.isBusinessHour(startTime) || !settings.isBusinessDay(startTime)) {
        return {
          available: false,
          reason: 'מחוץ לשעות הפעילות',
          nextAvailable: this.getNextBusinessHour()
        };
      }

      // Check for existing lessons (conflicts)
      const conflictingLessons = await Lesson.findAll({
        where: {
          start_time: {
            [Op.lt]: endTime.toDate()
          },
          end_time: {
            [Op.gt]: moment(startTime).toDate()
          },
          status: {
            [Op.in]: ['scheduled', 'confirmed']
          }
        }
      });

      if (conflictingLessons.length > 0) {
        return {
          available: false,
          reason: 'זמן תפוס - יש שיעור קיים',
          conflictingLesson: conflictingLessons[0],
          nextAvailable: await this.getNextAvailableSlot(startTime, durationMinutes)
        };
      }

      // Check teacher's specific availability (if manually set)
      const teacherUnavailable = await TeacherAvailability.findOne({
        where: {
          start_time: {
            [Op.lte]: moment(startTime).toDate()
          },
          end_time: {
            [Op.gte]: endTime.toDate()
          },
          is_available: false
        }
      });

      if (teacherUnavailable) {
        return {
          available: false,
          reason: teacherUnavailable.reason || 'המורה לא זמין',
          unavailableUntil: teacherUnavailable.end_time,
          nextAvailable: await this.getNextAvailableSlot(startTime, durationMinutes)
        };
      }

      return {
        available: true,
        startTime: moment(startTime).toDate(),
        endTime: endTime.toDate(),
        duration: durationMinutes
      };

    } catch (error) {
      logger.error('Error checking teacher availability:', error);
      throw error;
    }
  }

  /**
   * Set teacher as unavailable for a specific time period
   */
  async setTeacherUnavailable(startTime, endTime, reason = 'לא זמין') {
    try {
      await TeacherAvailability.create({
        start_time: moment(startTime).toDate(),
        end_time: moment(endTime).toDate(),
        is_available: false,
        reason: reason,
        created_by: 'system'
      });

      logger.info(`Teacher marked unavailable from ${startTime} to ${endTime}: ${reason}`);
      return true;
    } catch (error) {
      logger.error('Error setting teacher unavailable:', error);
      throw error;
    }
  }

  /**
   * Get next available time slot
   */
  async getNextAvailableSlot(fromTime, durationMinutes = 60) {
    try {
      let checkTime = moment(fromTime).add(30, 'minutes'); // Start checking 30 min later
      const maxDaysAhead = 14; // Don't check more than 2 weeks ahead
      
      for (let day = 0; day < maxDaysAhead; day++) {
        const dayStart = checkTime.clone().set({
          hour: parseInt(settings.businessHours.start.split(':')[0]),
          minute: parseInt(settings.businessHours.start.split(':')[1]),
          second: 0
        });
        
        const dayEnd = checkTime.clone().set({
          hour: parseInt(settings.businessHours.end.split(':')[0]),
          minute: parseInt(settings.businessHours.end.split(':')[1]),
          second: 0
        });

        if (settings.isBusinessDay(dayStart.toDate())) {
          let slotTime = dayStart.clone();
          
          while (slotTime.isBefore(dayEnd.subtract(durationMinutes, 'minutes'))) {
            const availability = await this.checkTeacherAvailability(slotTime.toDate(), durationMinutes);
            
            if (availability.available) {
              return slotTime.toDate();
            }
            
            slotTime.add(30, 'minutes'); // Check every 30 minutes
          }
        }
        
        checkTime.add(1, 'day');
      }

      return null; // No availability found in the next 2 weeks
    } catch (error) {
      logger.error('Error finding next available slot:', error);
      return null;
    }
  }

  getNextBusinessHour() {
    const now = moment().tz(settings.teacher.timezone);
    let nextTime = now.clone();
    
    // If it's after business hours today, move to next business day
    const businessEnd = now.clone().set({
      hour: parseInt(settings.businessHours.end.split(':')[0]),
      minute: parseInt(settings.businessHours.end.split(':')[1])
    });
    
    if (now.isAfter(businessEnd) || !settings.isBusinessDay(now.toDate())) {
      nextTime = moment(settings.getNextBusinessDay(now.toDate())).tz(settings.teacher.timezone);
    }
    
    // Set to business start time
    return nextTime.set({
      hour: parseInt(settings.businessHours.start.split(':')[0]),
      minute: parseInt(settings.businessHours.start.split(':')[1]),
      second: 0
    }).toDate();
  }
}

module.exports = new SchedulerService(); 