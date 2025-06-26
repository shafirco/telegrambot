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
    defaultDuration: 60, // minutes
    defaultPrice: 150, // per hour in local currency
    minAdvanceBooking: 2, // hours
    maxAdvanceBooking: 30, // days
    bufferTime: 15, // minutes between lessons
    maxReschedules: 3, // per lesson
    cancellationWindowHours: 24 // hours before lesson start
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
    default: 'he',
    supported: ['he', 'en', 'ar', 'es', 'fr']
  }
};

// Helper functions
settings.isBusinessDay = (date) => {
  const dayName = moment(date).format('dddd').toLowerCase();
  const englishToHebrewDays = {
    'sunday': 'ראשון',
    'monday': 'שני', 
    'tuesday': 'שלישי',
    'wednesday': 'רביעי',
    'thursday': 'חמישי',
    'friday': 'שישי',
    'saturday': 'שבת'
  };
  
  // Check both English and Hebrew day names
  const businessDays = settings.businessHours.days.map(day => day.toLowerCase());
  return businessDays.includes(dayName) || businessDays.includes(englishToHebrewDays[dayName]);
};

settings.isBusinessHour = (date) => {
  const time = moment(date).format('HH:mm');
  return time >= settings.businessHours.start && time <= settings.businessHours.end;
};

settings.getNextBusinessDay = (fromDate = new Date()) => {
  let nextDay = moment(fromDate).add(1, 'day');
  while (!settings.isBusinessDay(nextDay.toDate())) {
    nextDay.add(1, 'day');
  }
  return nextDay.toDate();
};

module.exports = settings; 