const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TeacherAvailability = sequelize.define('TeacherAvailability', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Schedule type
  schedule_type: {
    type: DataTypes.ENUM('recurring', 'specific_date', 'exception', 'block'),
    allowNull: false,
    defaultValue: 'recurring',
    index: true
  },
  
  // Recurring schedule (for regular weekly availability)
  day_of_week: {
    type: DataTypes.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
    allowNull: true,
    index: true
  },
  
  // Time slots
  start_time: {
    type: DataTypes.TIME,
    allowNull: false
  },
  
  end_time: {
    type: DataTypes.TIME,
    allowNull: false
  },
  
  // Specific dates (for exceptions or one-time availability)
  specific_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    index: true
  },
  
  // Date range for blocks or vacations
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  
  // Availability status
  is_available: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  
  // Priority and ordering
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  // Lesson constraints
  max_lessons_per_slot: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  
  min_lesson_duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30 // minutes
  },
  
  max_lesson_duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 120 // minutes
  },
  
  // Buffer times
  buffer_before: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 15 // minutes
  },
  
  buffer_after: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 15 // minutes
  },
  
  // Booking constraints
  advance_booking_hours: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 24
  },
  
  max_advance_booking_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30
  },
  
  // Status and metadata
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'temporary'),
    allowNull: false,
    defaultValue: 'active',
    index: true
  },
  
  title: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Lesson types allowed during this time
  allowed_lesson_types: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['regular', 'makeup', 'trial', 'exam_prep']
  },
  
  // Pricing for this time slot
  price_per_hour: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  
  // Timezone
  timezone: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'America/New_York'
  },
  
  // Recurrence rules (for complex recurring patterns)
  recurrence_rule: {
    type: DataTypes.JSON,
    allowNull: true
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
      fields: ['schedule_type']
    },
    {
      fields: ['day_of_week']
    },
    {
      fields: ['specific_date']
    },
    {
      fields: ['start_date', 'end_date']
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_available']
    },
    {
      name: 'recurring_schedule',
      fields: ['schedule_type', 'day_of_week', 'start_time', 'end_time'],
      where: {
        schedule_type: 'recurring'
      }
    }
  ],
  
  validate: {
    endTimeAfterStartTime() {
      if (this.end_time <= this.start_time) {
        throw new Error('End time must be after start time');
      }
    },
    
    validDateRange() {
      if (this.start_date && this.end_date && this.end_date < this.start_date) {
        throw new Error('End date must be after start date');
      }
    },
    
    requiredFields() {
      if (this.schedule_type === 'recurring' && !this.day_of_week) {
        throw new Error('Day of week is required for recurring schedules');
      }
      
      if (this.schedule_type === 'specific_date' && !this.specific_date) {
        throw new Error('Specific date is required for specific date schedules');
      }
      
      if (['exception', 'block'].includes(this.schedule_type) && (!this.start_date || !this.end_date)) {
        throw new Error('Start and end dates are required for exceptions and blocks');
      }
    }
  }
});

// Instance methods
TeacherAvailability.prototype.isActiveOn = function(date) {
  if (this.status !== 'active') return false;
  
  const checkDate = new Date(date);
  
  switch (this.schedule_type) {
    case 'recurring':
      const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      return this.day_of_week === dayName;
      
    case 'specific_date':
      return this.specific_date === checkDate.toISOString().split('T')[0];
      
    case 'exception':
    case 'block':
      const dateStr = checkDate.toISOString().split('T')[0];
      return dateStr >= this.start_date && dateStr <= this.end_date;
      
    default:
      return false;
  }
};

TeacherAvailability.prototype.getDurationMinutes = function() {
  const start = new Date(`1970-01-01T${this.start_time}`);
  const end = new Date(`1970-01-01T${this.end_time}`);
  return (end - start) / (1000 * 60);
};

TeacherAvailability.prototype.canAccommodateLesson = function(durationMinutes) {
  return durationMinutes >= this.min_lesson_duration && 
         durationMinutes <= this.max_lesson_duration &&
         durationMinutes <= this.getDurationMinutes();
};

TeacherAvailability.prototype.getTimeSlots = function(date, slotDuration = 60) {
  if (!this.isActiveOn(date) || !this.is_available) return [];
  
  const slots = [];
  const slotStart = new Date(`${date}T${this.start_time}`);
  const slotEnd = new Date(`${date}T${this.end_time}`);
  
  let currentTime = new Date(slotStart);
  
  while (currentTime.getTime() + (slotDuration * 60 * 1000) <= slotEnd.getTime()) {
    slots.push({
      start: new Date(currentTime),
      end: new Date(currentTime.getTime() + (slotDuration * 60 * 1000)),
      duration: slotDuration
    });
    
    // Move to next slot (including buffer time)
    currentTime = new Date(currentTime.getTime() + (slotDuration + this.buffer_after) * 60 * 1000);
  }
  
  return slots;
};

// Class methods
TeacherAvailability.findForDate = async function(date) {
  const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const dateStr = new Date(date).toISOString().split('T')[0];
  
  return await this.findAll({
    where: {
      status: 'active',
      [sequelize.Sequelize.Op.or]: [
        {
          schedule_type: 'recurring',
          day_of_week: dayName
        },
        {
          schedule_type: 'specific_date',
          specific_date: dateStr
        },
        {
          schedule_type: ['exception', 'block'],
          start_date: {
            [sequelize.Sequelize.Op.lte]: dateStr
          },
          end_date: {
            [sequelize.Sequelize.Op.gte]: dateStr
          }
        }
      ]
    },
    order: [['priority', 'DESC'], ['start_time', 'ASC']]
  });
};

TeacherAvailability.getAvailableSlots = async function(date, durationMinutes = 60) {
  const availabilities = await this.findForDate(date);
  const slots = [];
  
  for (const availability of availabilities) {
    if (availability.is_available && availability.canAccommodateLesson(durationMinutes)) {
      const timeSlots = availability.getTimeSlots(date, durationMinutes);
      slots.push(...timeSlots.map(slot => ({
        ...slot,
        availabilityId: availability.id,
        pricePerHour: availability.price_per_hour
      })));
    }
  }
  
  return slots.sort((a, b) => a.start - b.start);
};

TeacherAvailability.isAvailableAt = async function(datetime, durationMinutes = 60) {
  const date = datetime.toISOString().split('T')[0];
  const time = datetime.toTimeString().substr(0, 8);
  
  const availabilities = await this.findForDate(date);
  
  for (const availability of availabilities) {
    if (availability.is_available && 
        time >= availability.start_time && 
        time <= availability.end_time &&
        availability.canAccommodateLesson(durationMinutes)) {
      return availability;
    }
  }
  
  return null;
};

TeacherAvailability.createRecurringSchedule = async function(dayOfWeek, startTime, endTime, options = {}) {
  return await this.create({
    schedule_type: 'recurring',
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    ...options
  });
};

TeacherAvailability.createException = async function(startDate, endDate, isAvailable = false, reason = null) {
  return await this.create({
    schedule_type: 'exception',
    start_date: startDate,
    end_date: endDate,
    is_available: isAvailable,
    description: reason,
    start_time: '00:00:00',
    end_time: '23:59:59'
  });
};

TeacherAvailability.getBusinessHours = async function() {
  const recurringSchedules = await this.findAll({
    where: {
      schedule_type: 'recurring',
      status: 'active',
      is_available: true
    },
    order: [['day_of_week', 'ASC'], ['start_time', 'ASC']]
  });
  
  const businessHours = {};
  recurringSchedules.forEach(schedule => {
    if (!businessHours[schedule.day_of_week]) {
      businessHours[schedule.day_of_week] = [];
    }
    businessHours[schedule.day_of_week].push({
      start: schedule.start_time,
      end: schedule.end_time
    });
  });
  
  return businessHours;
};

module.exports = TeacherAvailability; 