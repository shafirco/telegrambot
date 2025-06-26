const express = require('express');
const { Student, Lesson, Waitlist, NotificationLog } = require('../models');
const schedulerService = require('../services/scheduler');
const calendarService = require('../services/calendar');
const logger = require('../utils/logger');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'connected',
      calendar: calendarService.isAvailable() ? 'connected' : 'disabled',
      bot: 'running'
    }
  });
});

// Statistics endpoint
router.get('/stats', async (req, res) => {
  try {
    const [
      totalStudents,
      activeStudents,
      totalLessons,
      upcomingLessons,
      activeWaitlist
    ] = await Promise.all([
      Student.count(),
      Student.count({ where: { status: 'active' } }),
      Lesson.count(),
      Lesson.count({ 
        where: { 
          status: ['scheduled', 'confirmed'],
          start_time: { [require('sequelize').Op.gte]: new Date() }
        }
      }),
      Waitlist.count({ where: { status: 'active' } })
    ]);

    res.json({
      students: {
        total: totalStudents,
        active: activeStudents
      },
      lessons: {
        total: totalLessons,
        upcoming: upcomingLessons
      },
      waitlist: {
        active: activeWaitlist
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Calendar sync endpoint
router.post('/calendar/sync', async (req, res) => {
  try {
    if (!calendarService.isAvailable()) {
      return res.status(503).json({ error: 'Calendar service not available' });
    }

    const events = await calendarService.syncCalendarEvents();
    
    res.json({
      success: true,
      message: 'Calendar sync completed',
      eventCount: events.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error syncing calendar:', error);
    res.status(500).json({ error: 'Calendar sync failed' });
  }
});

// Manual notification endpoint
router.post('/notifications/send', async (req, res) => {
  try {
    const { studentId, type, title, message } = req.body;

    if (!studentId || !type || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const notification = await NotificationLog.createNotification(
      studentId,
      type,
      title,
      message
    );

    res.json({
      success: true,
      notificationId: notification.id,
      message: 'Notification created'
    });

  } catch (error) {
    logger.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// Get student information
router.get('/students/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    
    const student = await Student.findByTelegramId(telegramId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const [lessons, waitlistEntries] = await Promise.all([
      Lesson.findActiveByStudent(student.id),
      Waitlist.findByStudent(student.id)
    ]);

    res.json({
      student: {
        id: student.id,
        telegramId: student.telegram_id,
        name: student.getDisplayName(),
        status: student.status,
        registrationDate: student.registration_date,
        lastActivity: student.last_activity,
        preferences: {
          duration: student.preferred_lesson_duration,
          timezone: student.timezone,
          language: student.preferred_language
        },
        statistics: {
          totalBooked: student.total_lessons_booked,
          totalCompleted: student.total_lessons_completed,
          totalCancelled: student.total_lessons_cancelled
        }
      },
      lessons: lessons.map(lesson => ({
        id: lesson.id,
        startTime: lesson.start_time,
        endTime: lesson.end_time,
        duration: lesson.duration_minutes,
        status: lesson.status,
        subject: lesson.subject,
        topic: lesson.topic
      })),
      waitlist: waitlistEntries.filter(entry => entry.isActive()).map(entry => ({
        id: entry.id,
        position: entry.position,
        preferredTime: entry.preferred_start_time,
        duration: entry.preferred_duration,
        urgency: entry.urgency_level,
        createdAt: entry.created_at
      }))
    });

  } catch (error) {
    logger.error('Error getting student info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update student preferences
router.patch('/students/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const updates = req.body;

    const student = await Student.findByTelegramId(telegramId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Only allow certain fields to be updated via API
    const allowedUpdates = [
      'preferred_lesson_duration',
      'timezone',
      'preferred_language',
      'preferred_days',
      'preferred_time_start',
      'preferred_time_end',
      'notification_preferences'
    ];

    const updateData = {};
    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    await student.update(updateData);

    res.json({
      success: true,
      message: 'Student preferences updated',
      student: {
        id: student.id,
        telegramId: student.telegram_id,
        name: student.getDisplayName(),
        preferences: {
          duration: student.preferred_lesson_duration,
          timezone: student.timezone,
          language: student.preferred_language
        }
      }
    });

  } catch (error) {
    logger.error('Error updating student:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get lessons in date range
router.get('/lessons', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    let whereClause = {};

    if (startDate && endDate) {
      whereClause.start_time = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    if (status) {
      whereClause.status = status;
    }

    const lessons = await Lesson.findAll({
      where: whereClause,
      include: [{ model: Student, as: 'student' }],
      order: [['start_time', 'ASC']]
    });

    res.json({
      lessons: lessons.map(lesson => ({
        id: lesson.id,
        student: {
          name: lesson.student.getDisplayName(),
          telegramId: lesson.student.telegram_id
        },
        startTime: lesson.start_time,
        endTime: lesson.end_time,
        duration: lesson.duration_minutes,
        status: lesson.status,
        subject: lesson.subject,
        topic: lesson.topic,
        location: lesson.location,
        calendarEventId: lesson.google_calendar_event_id
      }))
    });

  } catch (error) {
    logger.error('Error getting lessons:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel lesson (admin)
router.post('/lessons/:lessonId/cancel', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { reason } = req.body;

    const lesson = await Lesson.findByPk(lessonId, {
      include: [{ model: Student, as: 'student' }]
    });

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    if (!lesson.canBeCancelled()) {
      return res.status(400).json({ error: 'Lesson cannot be cancelled' });
    }

    await lesson.cancel(reason || 'Cancelled by admin', 'teacher');

    res.json({
      success: true,
      message: 'Lesson cancelled successfully',
      lesson: {
        id: lesson.id,
        status: lesson.status,
        cancellationReason: lesson.cancellation_reason
      }
    });

  } catch (error) {
    logger.error('Error cancelling lesson:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// System maintenance endpoint
router.post('/maintenance', async (req, res) => {
  try {
    await schedulerService.runMaintenance();
    
    res.json({
      success: true,
      message: 'Maintenance completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error running maintenance:', error);
    res.status(500).json({ error: 'Maintenance failed' });
  }
});

// Error handler
router.use((error, req, res, next) => {
  logger.error('API error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router; 