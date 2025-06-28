const moment = require('moment-timezone');

const settings = {
  // Teacher Configuration
  teacher: {
    name: 'שפיר',
    timezone: process.env.TEACHER_TIMEZONE || 'Asia/Jerusalem',
    email: process.env.TEACHER_EMAIL || 'shafshaf6@gmail.com',
    phone: process.env.TEACHER_PHONE || '0544271232',
    language: 'he', // Hebrew as primary language
    currency: 'ILS'
  },

  // Business Hours Configuration
  businessHours: {
    start: process.env.BUSINESS_HOURS_START || '10:00',
    end: process.env.BUSINESS_HOURS_END || '18:00',
    days: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'], // Hebrew business days
    timezone: process.env.TEACHER_TIMEZONE || 'Asia/Jerusalem'
  },

  // Lesson Settings
  lessons: {
    defaultDuration: parseInt(process.env.DEFAULT_LESSON_DURATION) || 60,
    bufferTime: 15, // Minutes between lessons
    maxAdvanceBooking: 30, // Days ahead students can book
    defaultPrice: parseFloat(process.env.DEFAULT_LESSON_PRICE) || 180,
    currency: 'ILS',
    location: 'אונליין' // Default to online lessons
  },

  // Waitlist Configuration
  waitlist: {
    enabled: process.env.WAITLIST_NOTIFICATION_ENABLED !== 'false',
    maxEntries: 50,
    notificationDelay: 5 // minutes before notifying next person
  },

  // Notification Settings
  notifications: {
    reminderHours: [24, 2], // Hours before lesson to send reminders
    waitlistNotifications: true,
    confirmationNotifications: true,
    emailNotifications: false, // Disabled as requested
    smsNotifications: false
  },

  // AI Configuration
  ai: {
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    timeout: parseInt(process.env.AI_TIMEOUT) || 10000,
    language: 'hebrew'
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
  },

  bot: {
    username: process.env.BOT_USERNAME || 'math_tutor_bot',
    language: 'he',
    timezone: 'Asia/Jerusalem',
    enableAI: true,
    enableCalendar: true,
    maxSessionDuration: 30 * 60 * 1000, // 30 minutes
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100
    }
  },

  database: {
    dialect: 'sqlite',
    // Database config moved to database.js
    logging: process.env.NODE_ENV === 'development',
    timezone: '+02:00' // Israel timezone
  }
};

// Helper functions
settings.isBusinessDay = (date) => {
  const day = moment(date).tz(settings.teacher.timezone).day();
  // Sunday=0, Monday=1, ..., Saturday=6
  // Business days: Sunday(0) to Thursday(4)
  return day >= 0 && day <= 4;
};

settings.isBusinessHour = (date) => {
  const momentTime = moment(date).tz(settings.teacher.timezone);
  const hour = momentTime.hour();
  const minute = momentTime.minute();
  const currentTimeMinutes = hour * 60 + minute;
  
  const [startHour, startMinute] = settings.businessHours.start.split(':').map(Number);
  const [endHour, endMinute] = settings.businessHours.end.split(':').map(Number);
  
  const startTimeMinutes = startHour * 60 + startMinute;
  const endTimeMinutes = endHour * 60 + endMinute;
  
  return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
};

settings.getNextBusinessDay = (fromDate) => {
  let nextDay = moment(fromDate).tz(settings.teacher.timezone).add(1, 'day');
  while (!settings.isBusinessDay(nextDay.toDate())) {
    nextDay.add(1, 'day');
  }
  return nextDay.toDate();
};

settings.getBusinessDayName = (dayNumber) => {
  const hebrewDays = {
    0: 'ראשון',
    1: 'שני', 
    2: 'שלישי',
    3: 'רביעי',
    4: 'חמישי',
    5: 'שישי',
    6: 'שבת'
  };
  return hebrewDays[dayNumber] || 'יום';
};

settings.formatCurrency = (amount) => {
  return `₪${amount}`;
};

module.exports = settings; 