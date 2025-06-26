const moment = require('moment-timezone');

const settings = {
  // Teacher Configuration
  teacher: {
    name: process.env.TEACHER_NAME || 'Math Teacher',
    timezone: process.env.TEACHER_TIMEZONE || 'America/New_York'
  },

  // Business Hours Configuration
  businessHours: {
    start: process.env.BUSINESS_HOURS_START || '09:00',
    end: process.env.BUSINESS_HOURS_END || '18:00',
    days: (process.env.WORKING_DAYS || 'monday,tuesday,wednesday,thursday,friday')
      .split(',').map(day => day.trim().toLowerCase())
  },

  // Lesson Settings
  lessons: {
    defaultDuration: parseInt(process.env.DEFAULT_LESSON_DURATION) || 60, // minutes
    bufferTime: 15, // minutes between lessons
    maxAdvanceBooking: parseInt(process.env.BOOKING_ADVANCE_DAYS) || 30, // days
    minAdvanceBooking: 2, // hours
    allowWeekends: false,
    allowHolidays: false
  },

  // Waitlist Configuration
  waitlist: {
    enabled: process.env.WAITLIST_NOTIFICATION_ENABLED !== 'false',
    maxEntries: 50,
    notificationDelay: 5 // minutes before notifying next person
  },

  // Notification Settings
  notifications: {
    reminderHours: parseInt(process.env.REMINDER_HOURS_BEFORE) || 24,
    enableReminders: true,
    enableWaitlistNotifications: true,
    enableBookingConfirmations: true
  },

  // AI Configuration
  ai: {
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    maxTokens: parseInt(process.env.MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.TEMPERATURE) || 0.7,
    timeout: parseInt(process.env.AI_RESPONSE_TIMEOUT) || 10000
  },

  // Telegram Bot Configuration
  telegram: {
    parseMode: 'HTML',
    disableWebPagePreview: true
  },

  // Rate Limiting
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // per window
    skipSuccessfulRequests: false
  },

  // Calendar Configuration
  calendar: {
    syncInterval: 5 * 60 * 1000, // 5 minutes
    lookAheadDays: 7,
    bufferTime: 15 // minutes
  },

  // Validation Rules
  validation: {
    studentName: {
      minLength: 2,
      maxLength: 50,
      pattern: /^[a-zA-Z\s\u0590-\u05FF\u0600-\u06FF]+$/ // English, Hebrew, Arabic
    },
    phoneNumber: {
      pattern: /^[\+]?[1-9][\d]{0,15}$/
    }
  },

  // Time Slots Configuration
  timeSlots: {
    intervalMinutes: 30,
    generateAheadDays: 14,
    cleanupPastDays: 7
  },

  // Supported Languages
  languages: {
    default: 'en',
    supported: ['en', 'he', 'ar', 'es', 'fr']
  }
};

// Helper functions
settings.isBusinessDay = (date) => {
  const momentDate = moment(date).tz(settings.teacher.timezone);
  const dayName = momentDate.format('dddd').toLowerCase();
  return settings.businessHours.days.includes(dayName);
};

settings.isBusinessHour = (datetime) => {
  const momentTime = moment(datetime).tz(settings.teacher.timezone);
  const timeString = momentTime.format('HH:mm');
  return timeString >= settings.businessHours.start && timeString <= settings.businessHours.end;
};

settings.getBusinessHoursToday = () => {
  const today = moment().tz(settings.teacher.timezone);
  return {
    start: today.clone().set({
      hour: parseInt(settings.businessHours.start.split(':')[0]),
      minute: parseInt(settings.businessHours.start.split(':')[1]),
      second: 0,
      millisecond: 0
    }),
    end: today.clone().set({
      hour: parseInt(settings.businessHours.end.split(':')[0]),
      minute: parseInt(settings.businessHours.end.split(':')[1]),
      second: 0,
      millisecond: 0
    })
  };
};

settings.getNextBusinessDay = (fromDate = new Date()) => {
  let date = moment(fromDate).tz(settings.teacher.timezone).add(1, 'day');
  while (!settings.isBusinessDay(date.toDate())) {
    date.add(1, 'day');
  }
  return date.toDate();
};

module.exports = settings; 