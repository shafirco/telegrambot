const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Student = sequelize.define('Student', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Telegram information
  telegram_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
    index: true
  },
  
  username: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Contact information
  full_name: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  
  phone_number: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      is: /^[\+]?[1-9][\d]{0,15}$/
    }
  },
  
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  
  // Student preferences
  preferred_language: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'he'
  },
  
  timezone: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'Asia/Jerusalem'
  },
  
  // Lesson preferences
  preferred_lesson_duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 60,
    validate: {
      min: 30,
      max: 180
    }
  },
  
  preferred_days: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  },
  
  preferred_time_start: {
    type: DataTypes.STRING(5),
    allowNull: true,
    defaultValue: '16:00'
  },
  
  preferred_time_end: {
    type: DataTypes.STRING(5),
    allowNull: true,
    defaultValue: '19:00'
  },
  
  // Student status and tracking
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'blocked'),
    allowNull: false,
    defaultValue: 'active'
  },
  
  registration_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  last_activity: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  // Lesson statistics
  total_lessons_booked: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  total_lessons_completed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  total_lessons_cancelled: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  // Bot interaction data
  current_conversation_state: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  conversation_context: {
    type: DataTypes.JSON,
    allowNull: true
  },
  
  // Notification preferences
  notification_preferences: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {
      lesson_reminders: true,
      waitlist_updates: true,
      schedule_changes: true,
      promotional: false
    }
  },
  
  // Notes and additional information
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Parent/guardian information (for minors)
  parent_name: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  
  parent_phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  
  parent_email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  }
}, {
  indexes: [
    {
      fields: ['telegram_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['last_activity']
    },
    {
      fields: ['registration_date']
    }
  ],
  
  hooks: {
    beforeSave: (student) => {
      // Update last activity
      student.last_activity = new Date();
      
      // Set full name if not provided
      if (!student.full_name && (student.first_name || student.last_name)) {
        student.full_name = [student.first_name, student.last_name]
          .filter(Boolean)
          .join(' ');
      }
    }
  }
});

// Instance methods
Student.prototype.getDisplayName = function() {
  return this.full_name || this.first_name || this.username || `User ${this.telegram_id}`;
};

Student.prototype.isActive = function() {
  return this.status === 'active';
};

Student.prototype.updateActivity = async function() {
  this.last_activity = new Date();
  await this.save();
};

Student.prototype.incrementLessonCount = async function(type = 'booked') {
  switch (type) {
    case 'booked':
      this.total_lessons_booked += 1;
      break;
    case 'completed':
      this.total_lessons_completed += 1;
      break;
    case 'cancelled':
      this.total_lessons_cancelled += 1;
      break;
  }
  await this.save();
};

// Class methods
Student.findByTelegramId = async function(telegramId) {
  return await this.findOne({
    where: { telegram_id: telegramId }
  });
};

Student.getActiveStudents = async function() {
  return await this.findAll({
    where: { status: 'active' }
  });
};

module.exports = Student; 