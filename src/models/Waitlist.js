const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Waitlist = sequelize.define('Waitlist', {
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
  
  // Requested time preferences
  preferred_start_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  preferred_end_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  preferred_duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
    validate: {
      min: 30,
      max: 180
    }
  },
  
  // Flexible time options
  preferred_days: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  },
  
  preferred_time_range_start: {
    type: DataTypes.STRING(5), // HH:MM format
    allowNull: true
  },
  
  preferred_time_range_end: {
    type: DataTypes.STRING(5), // HH:MM format
    allowNull: true
  },
  
  // Original request information
  original_request: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  request_type: {
    type: DataTypes.ENUM('specific_time', 'flexible_time', 'next_available'),
    allowNull: false,
    defaultValue: 'flexible_time'
  },
  
  // Waitlist status
  status: {
    type: DataTypes.ENUM('active', 'notified', 'expired', 'fulfilled', 'cancelled'),
    allowNull: false,
    defaultValue: 'active',
    index: true
  },
  
  // Priority and ordering
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    index: true
  },
  
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  
  // Timing information
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Notification tracking
  notification_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  last_notification_sent: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  notification_preference: {
    type: DataTypes.ENUM('immediate', 'daily_digest', 'weekly_digest'),
    allowNull: false,
    defaultValue: 'immediate'
  },
  
  // Fulfillment information
  fulfilled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  fulfilled_lesson_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Lesson',
      key: 'id'
    }
  },
  
  // Additional preferences
  lesson_type: {
    type: DataTypes.ENUM('regular', 'makeup', 'trial', 'exam_prep'),
    allowNull: false,
    defaultValue: 'regular'
  },
  
  subject_areas: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: ['algebra', 'geometry', 'calculus']
  },
  
  urgency_level: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    allowNull: false,
    defaultValue: 'medium'
  },
  
  // Flexibility settings
  accept_alternative_times: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  
  accept_shorter_duration: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  
  accept_longer_duration: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  
  max_wait_days: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 14
  },
  
  // Notes and metadata
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  indexes: [
    {
      fields: ['student_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['priority', 'created_at']
    },
    {
      fields: ['expires_at']
    },
    {
      fields: ['preferred_start_time']
    },
    {
      name: 'active_waitlist',
      fields: ['status', 'priority', 'created_at'],
      where: {
        status: 'active'
      }
    }
  ],
  
  hooks: {
    beforeCreate: async (waitlistEntry) => {
      // Set expiration if max_wait_days is specified
      if (waitlistEntry.max_wait_days) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + waitlistEntry.max_wait_days);
        waitlistEntry.expires_at = expirationDate;
      }
      
      // Calculate position in waitlist
      const count = await Waitlist.count({
        where: { status: 'active' }
      });
      waitlistEntry.position = count + 1;
    },
    
    afterCreate: async (waitlistEntry) => {
      // Update positions of other entries
      await Waitlist.updatePositions();
    },
    
    afterUpdate: async (waitlistEntry) => {
      // Update positions if status changed
      if (waitlistEntry.changed('status')) {
        await Waitlist.updatePositions();
      }
    }
  }
});

// Instance methods
Waitlist.prototype.isActive = function() {
  return this.status === 'active' && (!this.expires_at || this.expires_at > new Date());
};

Waitlist.prototype.isExpired = function() {
  return this.expires_at && this.expires_at <= new Date();
};

Waitlist.prototype.canBeNotified = function() {
  return this.isActive() && this.notification_count < 10; // Limit notifications
};

Waitlist.prototype.markNotified = async function() {
  this.notification_count += 1;
  this.last_notification_sent = new Date();
  this.status = 'notified';
  await this.save();
};

Waitlist.prototype.fulfill = async function(lessonId) {
  this.status = 'fulfilled';
  this.fulfilled_at = new Date();
  this.fulfilled_lesson_id = lessonId;
  await this.save();
};

Waitlist.prototype.cancel = async function(reason = null) {
  this.status = 'cancelled';
  if (reason) {
    this.notes = (this.notes || '') + `\nCancelled: ${reason}`;
  }
  await this.save();
};

Waitlist.prototype.expire = async function() {
  this.status = 'expired';
  await this.save();
};

Waitlist.prototype.matchesTimeSlot = function(startTime, duration) {
  // Check if the offered time slot matches preferences
  const slotDate = new Date(startTime);
  const dayName = slotDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  
  // Check day preference
  if (this.preferred_days && !this.preferred_days.includes(dayName)) {
    return false;
  }
  
  // Check time range preference
  if (this.preferred_time_range_start && this.preferred_time_range_end) {
    const slotTime = slotDate.toTimeString().substr(0, 5);
    if (slotTime < this.preferred_time_range_start || slotTime > this.preferred_time_range_end) {
      return false;
    }
  }
  
  // Check specific time preference
  if (this.preferred_start_time) {
    const timeDiff = Math.abs(startTime - this.preferred_start_time);
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    if (hoursDiff > 2) { // Allow 2-hour flexibility
      return false;
    }
  }
  
  // Check duration preference
  if (!this.accept_shorter_duration && duration < this.preferred_duration) {
    return false;
  }
  
  if (!this.accept_longer_duration && duration > this.preferred_duration) {
    return false;
  }
  
  return true;
};

// Class methods
Waitlist.findActiveEntries = async function() {
  return await this.findAll({
    where: {
      status: 'active',
      [sequelize.Sequelize.Op.or]: [
        { expires_at: null },
        { expires_at: { [sequelize.Sequelize.Op.gt]: new Date() } }
      ]
    },
    order: [['priority', 'DESC'], ['created_at', 'ASC']]
  });
};

Waitlist.findByStudent = async function(studentId) {
  return await this.findAll({
    where: { student_id: studentId },
    order: [['created_at', 'DESC']]
  });
};

Waitlist.findMatchingEntries = async function(startTime, duration) {
  const activeEntries = await this.findActiveEntries();
  return activeEntries.filter(entry => entry.matchesTimeSlot(startTime, duration));
};

Waitlist.updatePositions = async function() {
  const activeEntries = await this.findAll({
    where: { status: 'active' },
    order: [['priority', 'DESC'], ['created_at', 'ASC']]
  });
  
  for (let i = 0; i < activeEntries.length; i++) {
    activeEntries[i].position = i + 1;
    await activeEntries[i].save();
  }
};

Waitlist.expireOldEntries = async function() {
  const expiredEntries = await this.findAll({
    where: {
      status: 'active',
      expires_at: {
        [sequelize.Sequelize.Op.lte]: new Date()
      }
    }
  });
  
  for (const entry of expiredEntries) {
    await entry.expire();
  }
  
  return expiredEntries.length;
};

Waitlist.getWaitlistStats = async function() {
  const [total, active, expired, fulfilled] = await Promise.all([
    this.count(),
    this.count({ where: { status: 'active' } }),
    this.count({ where: { status: 'expired' } }),
    this.count({ where: { status: 'fulfilled' } })
  ]);
  
  return { total, active, expired, fulfilled };
};

module.exports = Waitlist; 