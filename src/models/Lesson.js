const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Lesson = sequelize.define('Lesson', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Foreign key to student
  student_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Student',
      key: 'id'
    }
  },
  
  // Lesson scheduling
  start_time: {
    type: DataTypes.DATE,
    allowNull: false,
    index: true
  },
  
  end_time: {
    type: DataTypes.DATE,
    allowNull: false,
    index: true
  },
  
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
    validate: {
      min: 15,
      max: 240
    }
  },
  
  // Lesson status
  status: {
    type: DataTypes.ENUM(
      'scheduled', 
      'confirmed', 
      'in_progress', 
      'completed', 
      'cancelled_by_student', 
      'cancelled_by_teacher', 
      'no_show'
    ),
    allowNull: false,
    defaultValue: 'scheduled',
    index: true
  },
  
  // Google Calendar integration
  google_calendar_event_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true
  },
  
  calendar_sync_status: {
    type: DataTypes.ENUM('pending', 'synced', 'error'),
    allowNull: false,
    defaultValue: 'pending'
  },
  
  // Booking information
  booking_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  booking_method: {
    type: DataTypes.ENUM('telegram_bot', 'manual', 'waitlist_promotion'),
    allowNull: false,
    defaultValue: 'telegram_bot'
  },
  
  original_request: {
    type: DataTypes.TEXT,
    allowNull: true // Original message from student
  },
  
  // Lesson details
  subject: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Math Lesson'
  },
  
  topic: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  
  difficulty_level: {
    type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
    allowNull: true
  },
  
  lesson_type: {
    type: DataTypes.ENUM('regular', 'makeup', 'trial', 'exam_prep'),
    allowNull: false,
    defaultValue: 'regular'
  },
  
  // Meeting information
  meeting_link: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  
  meeting_password: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  location: {
    type: DataTypes.STRING(200),
    allowNull: true,
    defaultValue: 'Online'
  },
  
  // Lesson content and notes
  teacher_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  student_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  homework_assigned: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  materials_needed: {
    type: DataTypes.JSON,
    allowNull: true
  },
  
  // Cancellation information
  cancellation_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  cancelled_by: {
    type: DataTypes.ENUM('student', 'teacher', 'system'),
    allowNull: true
  },
  
  // Rescheduling
  is_rescheduled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  
  original_lesson_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Lesson',
      key: 'id'
    }
  },
  
  reschedule_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  // Payment and pricing
  price_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  
  payment_status: {
    type: DataTypes.ENUM('pending', 'paid', 'refunded', 'waived'),
    allowNull: false,
    defaultValue: 'pending'
  },
  
  // Notification tracking
  reminder_sent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  
  confirmation_sent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  // Model options
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  indexes: [
    {
      fields: ['student_id']
    },
    {
      fields: ['start_time']
    },
    {
      fields: ['end_time']
    },
    {
      fields: ['status']
    },
    {
      fields: ['google_calendar_event_id']
    }
  ],
  
  validate: {
    endTimeAfterStartTime() {
      if (this.end_time <= this.start_time) {
        throw new Error('End time must be after start time');
      }
    },
    
    durationMatches() {
      const calculatedDuration = Math.floor((this.end_time - this.start_time) / (1000 * 60));
      if (Math.abs(calculatedDuration - this.duration_minutes) > 1) {
        throw new Error('Duration does not match start and end times');
      }
    }
  },
  
  hooks: {
    beforeValidate: (lesson) => {
      // Auto-calculate end time if not provided
      if (lesson.start_time && lesson.duration_minutes && !lesson.end_time) {
        lesson.end_time = new Date(lesson.start_time.getTime() + (lesson.duration_minutes * 60 * 1000));
      }
      
      // Auto-calculate duration if not provided
      if (lesson.start_time && lesson.end_time && !lesson.duration_minutes) {
        lesson.duration_minutes = Math.floor((lesson.end_time - lesson.start_time) / (1000 * 60));
      }
    }
  }
});

// Instance methods
Lesson.prototype.isActive = function() {
  return ['scheduled', 'confirmed', 'in_progress'].includes(this.status);
};

Lesson.prototype.canBeCancelled = function() {
  return ['scheduled', 'confirmed'].includes(this.status);
};

Lesson.prototype.canBeRescheduled = function() {
  return this.canBeCancelled() && this.reschedule_count < 3;
};

Lesson.prototype.isInFuture = function() {
  return this.start_time > new Date();
};

Lesson.prototype.isToday = function() {
  const today = new Date();
  const lessonDate = new Date(this.start_time);
  return lessonDate.toDateString() === today.toDateString();
};

Lesson.prototype.getTimeUntilStart = function() {
  return this.start_time - new Date();
};

Lesson.prototype.cancel = async function(reason, cancelledBy = 'student') {
  this.status = cancelledBy === 'student' ? 'cancelled_by_student' : 'cancelled_by_teacher';
  this.cancellation_reason = reason;
  this.cancelled_at = new Date();
  this.cancelled_by = cancelledBy;
  await this.save();
};

Lesson.prototype.markCompleted = async function(teacherNotes = null) {
  this.status = 'completed';
  if (teacherNotes) {
    this.teacher_notes = teacherNotes;
  }
  await this.save();
};

Lesson.prototype.reschedule = async function(newStartTime, newDuration = null) {
  const newLesson = await Lesson.create({
    student_id: this.student_id,
    start_time: newStartTime,
    duration_minutes: newDuration || this.duration_minutes,
    subject: this.subject,
    topic: this.topic,
    difficulty_level: this.difficulty_level,
    lesson_type: this.lesson_type,
    is_rescheduled: true,
    original_lesson_id: this.id,
    reschedule_count: this.reschedule_count + 1
  });
  
  await this.cancel('Rescheduled', 'student');
  return newLesson;
};

// Static methods
Lesson.hasConflict = async function(startTime, endTime) {
  try {
    const conflictingLesson = await this.findOne({
      where: {
        status: {
          [sequelize.Sequelize.Op.not]: ['cancelled_by_student', 'cancelled_by_teacher', 'no_show']
        },
        [sequelize.Sequelize.Op.or]: [
          // New lesson starts during existing lesson
          {
            start_time: {
              [sequelize.Sequelize.Op.lte]: startTime
            },
            end_time: {
              [sequelize.Sequelize.Op.gt]: startTime
            }
          },
          // New lesson ends during existing lesson
          {
            start_time: {
              [sequelize.Sequelize.Op.lt]: endTime
            },
            end_time: {
              [sequelize.Sequelize.Op.gte]: endTime
            }
          },
          // New lesson completely contains existing lesson
          {
            start_time: {
              [sequelize.Sequelize.Op.gte]: startTime
            },
            end_time: {
              [sequelize.Sequelize.Op.lte]: endTime
            }
          }
        ]
      }
    });

    return !!conflictingLesson;
  } catch (error) {
    console.error('Error checking lesson conflict:', error);
    return true; // Assume conflict if error occurs
  }
};

Lesson.findActiveByStudent = async function(studentId) {
  try {
    const now = new Date();
    return await this.findAll({
      where: {
        student_id: studentId,
        status: {
          [sequelize.Sequelize.Op.not]: ['cancelled_by_student', 'cancelled_by_teacher', 'no_show']
        },
        start_time: {
          [sequelize.Sequelize.Op.gte]: now
        }
      },
      order: [['start_time', 'ASC']]
    });
  } catch (error) {
    console.error('Error finding active lessons:', error);
    return [];
  }
};

// Class methods
Lesson.findByTimeRange = async function(startTime, endTime) {
  return await this.findAll({
    where: {
      start_time: {
        [sequelize.Sequelize.Op.gte]: startTime,
        [sequelize.Sequelize.Op.lt]: endTime
      }
    },
    order: [['start_time', 'ASC']]
  });
};

Lesson.findScheduledForToday = async function() {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));
  
  return await this.findByTimeRange(startOfDay, endOfDay);
};

module.exports = Lesson; 