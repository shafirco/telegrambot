const assert = require('assert');
const moment = require('moment-timezone');

// Mock environment for testing
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'dummy_key_for_testing';
// Use in-memory SQLite for tests (no DATABASE_URL)
delete process.env.DATABASE_URL;

describe('Basic Functionality Tests', () => {
  
  describe('AI Scheduler', () => {
    let aiScheduler;
    
    before(() => {
      // Import after setting environment
      aiScheduler = require('../src/ai/scheduler');
    });
    
    it('should initialize without OpenAI when using dummy key', () => {
      assert.strictEqual(aiScheduler.initialized, false);
      assert.strictEqual(aiScheduler.llm, null);
    });
    
    it('should perform fallback parsing for Hebrew booking request', async () => {
      const result = await aiScheduler.processSchedulingRequest(
        'אני רוצה שיעור מחר בשעה 3',
        { 
          id: 1, 
          name: 'טסט', 
          timezone: 'Asia/Jerusalem',
          preferredDuration: 60 
        }
      );
      
      assert.strictEqual(result.intent, 'book_lesson');
      assert(result.confidence > 0.6);
      assert(result.reasoning.includes('זיהוי'));
    });
    
    it('should parse Hebrew time expressions correctly', async () => {
      const result = await aiScheduler.processSchedulingRequest(
        'אני רוצה שיעור מחר אחר הצהריים',
        { 
          id: 1, 
          name: 'טסט', 
          timezone: 'Asia/Jerusalem',
          preferredDuration: 60 
        }
      );
      
      assert.strictEqual(result.intent, 'book_lesson');
      assert(result.datetime_preferences.length > 0);
      
      if (result.datetime_preferences.length > 0) {
        const pref = result.datetime_preferences[0];
        assert(pref.date);
        assert(pref.time);
        assert.strictEqual(pref.duration_minutes, 60);
      }
    });
    
    it('should detect cancellation intent in Hebrew', async () => {
      const result = await aiScheduler.processSchedulingRequest(
        'אני רוצה לבטל את השיעור שלי',
        { id: 1, name: 'טסט', timezone: 'Asia/Jerusalem' }
      );
      
      assert.strictEqual(result.intent, 'cancel_lesson');
      assert(result.confidence > 0.7);
    });
    
    it('should detect availability check intent', async () => {
      const result = await aiScheduler.processSchedulingRequest(
        'מתי יש זמנים פנויים השבוע?',
        { id: 1, name: 'טסט', timezone: 'Asia/Jerusalem' }
      );
      
      assert.strictEqual(result.intent, 'check_availability');
      assert(result.confidence > 0.7);
    });
  });
  
  describe('Settings Configuration', () => {
    let settings;
    
    before(() => {
      settings = require('../src/config/settings');
    });
    
    it('should have correct Hebrew language defaults', () => {
      assert.strictEqual(settings.teacher.language, 'he');
      assert.strictEqual(settings.teacher.timezone, 'Asia/Jerusalem');
    });
    
    it('should have correct business hours', () => {
      assert.strictEqual(settings.businessHours.start, '10:00');
      assert.strictEqual(settings.businessHours.end, '18:00');
      assert(settings.businessHours.days.includes('ראשון'));
    });
    
    it('should correctly identify business days', () => {
      const sunday = new Date('2024-01-07'); // Sunday
      const saturday = new Date('2024-01-06'); // Saturday
      
      assert.strictEqual(settings.isBusinessDay(sunday), true);
      assert.strictEqual(settings.isBusinessDay(saturday), false);
    });
    
    it('should correctly identify business hours', () => {
      const israelTime = moment.tz('2024-01-07 14:00', 'Asia/Jerusalem').toDate();
      const outsideHours = moment.tz('2024-01-07 20:00', 'Asia/Jerusalem').toDate();
      
      assert.strictEqual(settings.isBusinessHour(israelTime), true);
      assert.strictEqual(settings.isBusinessHour(outsideHours), false);
    });
    
    it('should format currency correctly', () => {
      assert.strictEqual(settings.formatCurrency(180), '₪180');
    });
  });
  
  describe('Input Validation', () => {
    let messageHandler;
    
    before(() => {
      messageHandler = require('../src/bot/handlers/messageHandler');
    });
    
    it('should reject empty messages', () => {
      const { validateAndSanitizeInput } = messageHandler;
      
      try {
        validateAndSanitizeInput('');
        assert.fail('Should have thrown error for empty message');
      } catch (error) {
        assert.strictEqual(error.message, 'Empty message');
      }
    });
    
    it('should reject overly long messages', () => {
      const { validateAndSanitizeInput } = messageHandler;
      const longMessage = 'א'.repeat(1001);
      
      try {
        validateAndSanitizeInput(longMessage);
        assert.fail('Should have thrown error for long message');
      } catch (error) {
        assert.strictEqual(error.message, 'Message too long');
      }
    });
    
    it('should sanitize HTML tags while preserving Hebrew', () => {
      const { validateAndSanitizeInput } = messageHandler;
      const result = validateAndSanitizeInput('שלום <script>alert("test")</script> עולם');
      
      assert(result.includes('שלום'));
      assert(result.includes('עולם'));
      assert(!result.includes('<script>'));
      assert(!result.includes('</script>'));
    });
  });
  
  describe('Model Initialization', () => {
    it('should create Student model with Hebrew defaults', async () => {
      const { Student } = require('../src/models');
      
      // Test default values
      const student = Student.build({
        telegram_id: 12345,
        first_name: 'טסט'
      });
      
      assert.strictEqual(student.preferred_language, 'he');
      assert.strictEqual(student.timezone, 'Asia/Jerusalem');
      assert.strictEqual(student.preferred_lesson_duration, 60);
    });
    
    it('should validate Hebrew names properly', () => {
      const { Student } = require('../src/models');
      
      const student = Student.build({
        telegram_id: 12345,
        first_name: 'שם בעברית'
      });
      
      assert.doesNotThrow(() => {
        student.validate();
      });
    });
  });
  
  describe('Error Handling', () => {
    it('should handle scheduler errors gracefully', async () => {
      const schedulerService = require('../src/services/scheduler');
      
      // Mock student with minimal data
      const mockStudent = {
        id: 1,
        getDisplayName: () => 'טסט',
        preferred_lesson_duration: 60
      };
      
      // Test with invalid input that should trigger fallback response
      const result = await schedulerService.processBookingRequest(
        'invalid input that will cause errors',
        mockStudent
      );
      
      // The system should handle it gracefully and return a response
      assert(typeof result === 'object');
      assert(result.message.includes('שלום'));
      assert(result.message.includes('טסט'));
      assert(['ai_response', 'error_recovery', 'general_response'].includes(result.type));
    });
  });
});

// Export test helpers for integration tests
module.exports = {
  createMockStudent: (overrides = {}) => ({
    id: 1,
    telegram_id: 12345,
    first_name: 'טסט',
    last_name: '',
    preferred_language: 'he',
    timezone: 'Asia/Jerusalem',
    preferred_lesson_duration: 60,
    getDisplayName: () => overrides.name || 'טסט',
    updateActivity: async () => {},
    save: async () => {},
    ...overrides
  }),
  
  createMockContext: (overrides = {}) => ({
    from: { id: 12345, first_name: 'טסט', username: 'test_user' },
    message: { text: 'אני רוצה שיעור מחר' },
    session: { step: null, data: {}, lastActivity: Date.now() },
    reply: async (message) => ({ message_id: 1, text: message }),
    sendChatAction: async () => {},
    ...overrides
  })
}; 