const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { ChatOpenAI } = require('@langchain/openai');
const { z } = require('zod');
const chrono = require('chrono-node');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const settings = require('../config/settings');

// Schema and validation code follows...

// Schema for structured scheduling output
const SchedulingRequestSchema = z.object({
  intent: z.enum(['book_lesson', 'reschedule_lesson', 'cancel_lesson', 'check_availability', 'join_waitlist', 'other']),
  confidence: z.number().min(0).max(1),
  datetime_preferences: z.array(z.object({
    date: z.string().nullable().optional(),
    time: z.string().nullable().optional(),
    datetime: z.string().nullable().optional(),
    flexibility: z.enum(['exact', 'preferred', 'flexible']).default('preferred'),
    duration_minutes: z.number().optional()
  })).default([]),
  lesson_details: z.object({
    subject: z.string().optional(),
    topic: z.string().optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    lesson_type: z.enum(['regular', 'makeup', 'trial', 'exam_prep']).optional(),
    special_requests: z.string().optional()
  }).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  constraints: z.object({
    must_avoid_times: z.array(z.string()).optional(),
    preferred_days: z.array(z.string()).optional(),
    max_wait_days: z.number().optional()
  }).optional(),
  extracted_entities: z.object({
    dates: z.array(z.string()).optional(),
    times: z.array(z.string()).optional(),
    durations: z.array(z.string()).optional(),
    subjects: z.array(z.string()).optional()
  }).optional(),
  reasoning: z.string(),
  suggested_responses: z.array(z.string()).optional()
});

/**
 * AI-powered scheduler service for processing natural language scheduling requests
 */
class AIScheduler {
  constructor() {
    // Only initialize if API key is available
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy_key_for_testing') {
      this.llm = new ChatOpenAI({
        modelName: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.3,
        maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 800,
        timeout: parseInt(process.env.AI_TIMEOUT) || 30000,
        openAIApiKey: process.env.OPENAI_API_KEY
      });
      
      this.outputParser = new StringOutputParser();
      this.chain = null;
      this.initialized = true;
      this.setupPromptTemplate();
      this.setupChain();
    } else {
      this.llm = null;
      this.outputParser = null;
      this.chain = null;
      this.initialized = false;
      console.warn('OpenAI API key not configured. AI features will be disabled.');
    }
  }

  setupPromptTemplate() {
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', `אתה מורה פרטי למתמטיקה בשם שפיר - חכם, חם, ועוזר לתלמידים לתאם שיעורים בצורה טבעית.

🎯 **התפקיד שלך:**
- לנהל שיחה טבעית ונעימה עם תלמידים
- להבין בקשות לתיאום שיעורים בכל צורה שהן יכתבו
- לעזור להם למצוא זמנים מתאימים
- להיות מועיל וידידותי

📅 **פרטי העבודה:**
- שעות עבודה: 10:00-19:00
- ימי עבודה: ראשון-חמישי  
- אורך שיעור: 60 דקות
- אזור זמן: Asia/Jerusalem

🕐 **הבנת זמנים חכמה:**
- מספרים בודדים (1-7) = אחר הצהריים/ערב (13:00-19:00)
- "5" = 17:00, "3" = 15:00, "6" = 18:00
- "רביעי בצהריים" = Wednesday 12:00
- "מחר ב5" = Tomorrow 17:00
- "שלישי אחרי 4" = Tuesday after 16:00

🗣️ **איך לנהל שיחה:**
- תמיד ענה בעברית בלבד!
- היה חם ואישי
- הבן גם ביטויים לא פורמליים
- הבן זמנים גמישים ומספרים בודדים
- אם לא הבנת - בקש הבהרה בצורה נחמדה
- הצע פתרונות ואלטרנטיבות

📝 **פורמט התשובה:**
חזור JSON בדיוק כך:
{{
  "intent": "book_lesson/check_availability/cancel_lesson/reschedule_lesson/join_waitlist/other",
  "confidence": 0.8,
  "datetime_preferences": [
    {{
      "datetime": "2025-01-15T14:00:00",
      "date": "2025-01-15", 
      "time": "14:00",
      "flexibility": "preferred",
      "duration_minutes": 60
    }}
  ],
  "lesson_details": {{
    "subject": "מתמטיקה",
    "lesson_type": "regular"
  }},
  "urgency": "medium",
  "reasoning": "התלמיד רוצה שיעור ביום רביעי בצהריים",
  "natural_response": "נהדר! אני אבדוק עבורך זמנים זמינים ביום רביעי בצהריים. יש לי כמה אפשרויות טובות!",
  "suggested_responses": [
    "האם השעה 12:00 מתאימה לך?",
    "יש לי גם אפשרות ב-13:00 או 14:00"
  ]
}}

❗ **חשוב:** חזור רק JSON תקני, ללא טקסט נוסף!`],
      ['human', `💬 הודעת התלמיד: "{user_message}"

📋 קצת עליו:
שם: {student_name}
זמן מועדף: {preferred_duration} דקות
אזור זמן: {timezone}

🤖 נתח את הבקשה והחזר JSON עם תגובה טבעית ומועילה:`]
    ]);
  }

  setupChain() {
    this.chain = this.promptTemplate
      .pipe(this.llm)
      .pipe(this.outputParser);
  }

  async processSchedulingRequest(userMessage, studentProfile = {}) {
    try {
      if (!this.llm) {
        logger.warn('OpenAI not available, using enhanced fallback parsing');
        return this.enhancedFallbackParsing(userMessage, studentProfile);
      }

      logger.aiLog('processing_enhanced_request', userMessage, 'undefined', { studentId: studentProfile.id });

      // Use simplified, quota-friendly approach
      const quickResponse = await this.quickAiRequest(userMessage, studentProfile);
      
      if (quickResponse && quickResponse.intent) {
        logger.aiLog('enhanced_ai_result', userMessage.substring(0, 100), JSON.stringify(quickResponse), {
          intent: quickResponse.intent,
          confidence: quickResponse.confidence
        });
        return quickResponse;
      }

      // If quick AI fails, use enhanced fallback
      return this.enhancedFallbackParsing(userMessage, studentProfile);

    } catch (error) {
      logger.error('Error in enhanced AI processing:', error);
      return this.enhancedFallbackParsing(userMessage, studentProfile);
    }
  }

  /**
   * Quick, quota-efficient AI request with timeout
   */
  async quickAiRequest(userMessage, studentProfile) {
    try {
      const prompt = this.createEnhancedPrompt(userMessage, studentProfile);
      
      const response = await Promise.race([
        this.llm.invoke([['human', prompt]]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 8000))
      ]);

      const responseText = this.extractResponseText(response);
      const parsedResponse = this.parseAIResponse(responseText, userMessage, studentProfile);
      
      return this.validateAndEnhanceResponse(parsedResponse, userMessage, studentProfile);

    } catch (error) {
      logger.warn('Quick AI request failed:', error.message);
      return null;
    }
  }

  extractResponseText(response) {
    if (typeof response === 'string') return response;
    if (response?.content) return response.content;
    if (response?.text) return response.text;
    if (Array.isArray(response)) return response.join('');
    if (typeof response === 'object') return JSON.stringify(response);
    return '';
  }

  parseAIResponse(responseText, userMessage, studentProfile) {
    try {
      // Clean response thoroughly
      const cleanResponse = responseText
        .replace(/```json\s*|\s*```/g, '')
        .replace(/```\s*|\s*```/g, '')
        .trim();
      
      // Find JSON object
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found');
    } catch (error) {
      logger.warn('Failed to parse AI JSON response, using enhanced fallback');
      return this.enhancedFallbackParsing(userMessage, studentProfile);
    }
  }

  validateAndEnhanceResponse(response, userMessage, studentProfile) {
    // Ensure required fields
    if (!response.intent) response.intent = 'other';
    if (!response.confidence) response.confidence = 0.5;
    if (!response.natural_response) {
      response.natural_response = this.generateNaturalFallbackResponse(response.intent, studentProfile.name);
    }

    // Add original message for context
    response.original_message = userMessage;

    // Post-process datetime preferences
    if (response.datetime_preferences) {
      response.datetime_preferences = response.datetime_preferences.map(pref => 
        this.enhanceDatetimePreference(pref, userMessage, studentProfile.timezone)
      );
    }

    return response;
  }

  enhancedFallbackParsing(userMessage, studentProfile) {
    logger.info('Using enhanced fallback parsing for:', userMessage);

    const message = userMessage.toLowerCase();
    let intent = 'other';
    let confidence = 0.4;
    let naturalResponse = '';
    const studentName = studentProfile.name || 'חבר';

    // Enhanced Hebrew intent detection with comprehensive patterns
    const intentPatterns = {
      book_lesson: [
        'תאם', 'שיעור', 'לתאם', 'רוצה', 'צריך', 'אפשר', 'בא לי', 'מעוניין', 
        'לקבוע', 'מתי פנוי', 'זמין', 'זמנים', 'השבוע', 'מחר', 'היום',
        'יום', 'שעה', 'בצהריים', 'בערב', 'בבוקר', 'אחר הצהריים'
      ],
      check_availability: [
        'זמינים', 'פנוי', 'זמנים', 'מתי', 'איזה זמנים', 'מה יש', 'אפשרויות',
        'זמינות', 'מה פנוי', 'כשפנוי', 'מתי אפשר'
      ],
      cancel_lesson: [
        'לבטל', 'ביטול', 'מבטל', 'בטל', 'לא יכול', 'לא אוכל לגיע',
        'לא יגיע', 'משהו קרה', 'בעיה'
      ],
      reschedule_lesson: [
        'לשנות', 'להעביר', 'לדחות', 'זמן אחר', 'החלפה', 'להחליף',
        'לעבור', 'שינוי'
      ]
    };

    // Calculate intent scores with priority for cancel/reschedule
    let maxMatches = 0;
    let bestIntent = 'other';
    
    // First check for cancel/reschedule - these have priority
    const priorityIntents = ['cancel_lesson', 'reschedule_lesson'];
    for (const intentType of priorityIntents) {
      const patterns = intentPatterns[intentType];
      const matches = patterns.filter(pattern => message.includes(pattern)).length;
      if (matches > 0) {
        intent = intentType;
        confidence = Math.min(0.95, 0.8 + (matches * 0.1));
        bestIntent = intentType;
        maxMatches = matches;
        break; // Found high-priority intent, stop searching
      }
    }
    
    // If no priority intent found, check others
    if (bestIntent === 'other') {
      for (const [intentType, patterns] of Object.entries(intentPatterns)) {
        if (priorityIntents.includes(intentType)) continue; // Already checked
        
        const matches = patterns.filter(pattern => message.includes(pattern)).length;
        if (matches > maxMatches) {
          maxMatches = matches;
          intent = intentType;
          confidence = Math.min(0.95, 0.6 + (matches * 0.1));
        }
      }
    }

    // Enhanced Hebrew datetime parsing
    const datetime_preferences = this.parseHebrewDateTime(message, studentProfile);

    // If found time preferences, boost confidence
    if (datetime_preferences.length > 0) {
      confidence = Math.min(confidence + 0.2, 0.95);
      if (intent === 'other') {
        intent = 'book_lesson';
        confidence = 0.8;
      }
    }

    // Generate natural Hebrew responses based on intent
    switch (intent) {
      case 'book_lesson':
        if (datetime_preferences.length > 0) {
          const timeDesc = this.describeTimePreferences(datetime_preferences);
          naturalResponse = `נהדר ${studentName}! אני מחפש עבורך זמנים ${timeDesc}. רגע אחד...`;
        } else {
          naturalResponse = `שלום ${studentName}! אשמח לתאם לך שיעור מתמטיקה. איזה זמן נוח לך?`;
        }
        break;
        
      case 'check_availability':
        naturalResponse = `בטח ${studentName}! אני בודק עכשיו מה פנוי השבוע הזה ואחזור אליך מיד.`;
        break;
        
      case 'cancel_lesson':
        naturalResponse = `הבנתי ${studentName}. איזה שיעור תרצה לבטל? אני אעזור לך עם זה.`;
        break;
        
      case 'reschedule_lesson':
        naturalResponse = `כמובן ${studentName}! איזה שיעור תרצה לשנות ולאיזה זמן?`;
        break;
        
      default:
        // Default helpful response in Hebrew
        naturalResponse = `שלום ${studentName}! 😊

אני כאן לעזור לך עם שיעורי מתמטיקה. מה תרצה לעשות?

💡 אתה יכול לומר דברים כמו:
• "אני רוצה שיעור מחר בשעה 5"
• "מתי יש זמנים פנויים?"
• "אני רוצה לבטל שיעור"
• "בואו נתאם משהו השבוע"

פשוט ספר לי מה אתה צריך!`;
        break;
    }

    return {
      intent,
      confidence,
      datetime_preferences,
      lesson_details: {
        subject: 'מתמטיקה',
        lesson_type: 'regular'
      },
      urgency: 'medium',
      reasoning: `זיהוי עברית משופר: ${intent} (${confidence.toFixed(2)}) עם ${datetime_preferences.length} העדפות זמן`,
      natural_response: naturalResponse,
      suggested_responses: this.generateHebrewSuggestions(intent, datetime_preferences),
      original_message: userMessage
    };
  }

  matchesPattern(text, patterns) {
    return patterns.some(pattern => text.includes(pattern));
  }

  parseHebrewDateTime(message, studentProfile) {
    const datetime_preferences = [];
    const baseDate = moment().tz(studentProfile.timezone || 'Asia/Jerusalem');

    // Enhanced Hebrew patterns for days - much more comprehensive
    const dayPatterns = [
      { pattern: /(היום|עכשיו)/, offset: 0 },
      { pattern: /(מחר)/, offset: 1 },
      { pattern: /(מחרתיים|יומיים)/, offset: 2 },
      { pattern: /(ראשון|יום ראשון|ביום ראשון|בראשון)/, dayOfWeek: 0 },
      { pattern: /(שני|יום שני|ביום שני|בשני)/, dayOfWeek: 1 },
      { pattern: /(שלישי|יום שלישי|ביום שלישי|בשלישי)/, dayOfWeek: 2 },
      { pattern: /(רביעי|יום רביעי|ביום רביעי|ברביעי|wednesday)/, dayOfWeek: 3 },
      { pattern: /(חמישי|יום חמישי|ביום חמישי|בחמישי)/, dayOfWeek: 4 },
      { pattern: /(שישי|יום שישי|ביום שישי|בשישי)/, dayOfWeek: 5 },
      { pattern: /(שבת|ביום שבת|בשבת)/, dayOfWeek: 6 },
      { pattern: /(השבוע הבא|שבוע הבא)/, offset: 7 },
      { pattern: /(השבוע|השבוע הזה)/, offset: 2 }
    ];

    // Enhanced time patterns - EXACT TIMES FIRST, then general patterns
    const timePatterns = [
      // EXACT TIME PATTERNS FIRST (critical for parsing "15:00", "6:30" etc)
      { pattern: /(\d{1,2}):(\d{2})/, timeFormat: true }, // HH:MM format - MUST BE FIRST
      { pattern: /שעה (\d{1,2}):(\d{2})/, timeFormat: true }, // "שעה 15:00"
      { pattern: /ב(\d{1,2}):(\d{2})/, timeFormat: true }, // "ב15:00"
      
      // GENERAL TIME PATTERNS
      { pattern: /(בצהריים|צהריים|בצהרים|צהרים|noon|בצהריים|צהריים|12|בשתיים עשרה)/, hour: 12 },
      { pattern: /(בבוקר|בוקר|morning)/, hour: 10 },
      { pattern: /(אחר הצהריים|אחרי הצהריים|אחה"צ|afternoon)/, hour: 15 },
      { pattern: /(בערב|ערב|evening)/, hour: 18 },
      { pattern: /(בלילה|לילה|night)/, hour: 20 },
      
      // SPECIFIC HOUR WITH CONTEXT
      { pattern: /(\d+) בבוקר/, match: 1, modifier: 'morning' },
      { pattern: /(\d+) אחר הצהריים/, match: 1, modifier: 'afternoon' },
      { pattern: /(\d+) בערב/, match: 1, modifier: 'evening' },
      { pattern: /(\d+)\s*וחצי/, match: 1, modifier: 'half_hour' }, // "5 וחצי" = 5:30
      { pattern: /ברבע לפני (\d+)/, match: 1, modifier: 'quarter_before' }, // רבע לפני 5 = 4:45
      { pattern: /ברבע אחרי (\d+)/, match: 1, modifier: 'quarter_after' }, // רבע אחרי 5 = 5:15
      { pattern: /וחצי אחרי (\d+)/, match: 1, modifier: 'half_after' }, // חצי אחרי 5 = 5:30
      { pattern: /אחרי (\d+)/, match: 1, modifier: 'after' }, // אחרי 3 = after 3
      { pattern: /לפני (\d+)/, match: 1, modifier: 'before' }, // לפני 4 = before 4
      
      // STANDALONE NUMBERS - THESE MUST BE LAST to avoid conflicts
      { pattern: /שעה (\d{1,2})(?!:)/, match: 1, modifier: 'smart_default' }, // "שעה 5" (but not "שעה 5:00")
      { pattern: /ב(\d{1,2})(?!:)/, match: 1, modifier: 'smart_default' }, // "ב5" (but not "ב5:00")
      { pattern: /\b(\d{1,2})\b(?![:\.\d])/, match: 1, modifier: 'smart_default' } // Standalone numbers like "5"
    ];

    // Find day matches
    for (const dayPattern of dayPatterns) {
      const match = dayPattern.pattern.exec(message);
      if (match) {
        let targetDate;
        
        if (dayPattern.offset !== undefined) {
          targetDate = baseDate.clone().add(dayPattern.offset, 'days');
        } else if (dayPattern.dayOfWeek !== undefined) {
          targetDate = baseDate.clone().day(dayPattern.dayOfWeek);
          // If it's today or in the past, move to next week
          if (targetDate.isSameOrBefore(baseDate, 'day')) {
            targetDate.add(1, 'week');
          }
        }
        
        if (targetDate) {
          let hour = 14; // Default afternoon time
          
          // Look for time in the same message
          for (const timePattern of timePatterns) {
            const timeMatch = timePattern.pattern.exec(message);
            if (timeMatch) {
              if (timePattern.hour) {
                hour = timePattern.hour;
              } else if (timePattern.match) {
                hour = parseInt(timeMatch[timePattern.match]);
                
                // Enhanced modifier handling for better time parsing
                if (timePattern.modifier === 'afternoon' && hour <= 12) {
                  hour += 12;
                } else if (timePattern.modifier === 'evening' && hour <= 8) {
                  hour += 12;
                } else if (timePattern.modifier === 'smart_default') {
                  // Enhanced smart default for standalone numbers: prefer afternoon/evening for lessons
                  if (hour >= 1 && hour <= 9) {
                    // 1-9 becomes 13:00-21:00 (1PM-9PM) - most common lesson times
                    hour += 12;
                  } else if (hour === 10 || hour === 11) {
                    // 10-11 stays as morning (10AM-11AM)
                    hour = hour;
                  } else if (hour === 12) {
                    // 12 stays as noon
                    hour = 12;
                  } else if (hour === 0) {
                    // 0 becomes noon
                    hour = 12;
                  } else if (hour >= 13 && hour <= 21) {
                    // Already in 24-hour format, keep as is
                    hour = hour;
                  } else {
                    // Default fallback to 5PM for unusual numbers
                    hour = 17;
                  }
                } else if (timePattern.modifier === 'half_hour') {
                  // Handle "5 וחצי" = 5:30
                  if (hour >= 1 && hour <= 7) {
                    hour += 12; // Default to PM
                  }
                  targetDate.minute(30);
                } else if (timePattern.modifier === 'quarter_before') {
                  // רבע לפני 5 = 4:45
                  hour = hour - 1;
                  if (hour >= 1 && hour <= 7) {
                    hour += 12;
                  }
                  targetDate.minute(45);
                } else if (timePattern.modifier === 'quarter_after') {
                  // רבע אחרי 5 = 5:15
                  if (hour >= 1 && hour <= 7) {
                    hour += 12;
                  }
                  targetDate.minute(15);
                } else if (timePattern.modifier === 'half_after') {
                  // חצי אחרי 5 = 5:30
                  if (hour >= 1 && hour <= 7) {
                    hour += 12;
                  }
                  targetDate.minute(30);
                }
              } else if (timePattern.timeFormat) {
                hour = parseInt(timeMatch[1]);
                const minute = parseInt(timeMatch[2]) || 0;
                targetDate.minute(minute);
              }
              break;
            }
          }
          
          targetDate.hour(hour).minute(0).second(0);
          
          datetime_preferences.push({
            datetime: targetDate.toISOString(),
            date: targetDate.format('YYYY-MM-DD'),
            time: targetDate.format('HH:mm'),
            flexibility: 'preferred',
            duration_minutes: studentProfile.preferredDuration || 60
          });
          
          break; // Found a day, stop looking
        }
      }
    }

    return datetime_preferences;
  }

  describeTimePreferences(preferences) {
    if (preferences.length === 0) return '';
    
    const pref = preferences[0];
    const momentTime = moment(pref.datetime);
    const dayName = this.getHebrewDayName(momentTime.day());
    const timeDesc = momentTime.format('HH:mm');
    
    return `ב${dayName} בשעה ${timeDesc}`;
  }

  getHebrewDayName(dayNumber) {
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    return days[dayNumber] || 'יום';
  }

  generateHebrewSuggestions(intent, datetime_preferences) {
    const hasTime = datetime_preferences.length > 0;
    
    switch (intent) {
      case 'book_lesson':
        if (hasTime) {
          return [
            'אני בודק זמינות ומחזיר אליך מיד',
            'יש לי גם זמנים קרובים אם הזמן הזה תפוס'
          ];
        } else {
          return [
            'איזה יום השבוע הכי נוח לך?',
            'אתה מעדיף בוקר, צהריים או אחר הצהריים?',
            'תגיד לי "מחר ב5" או "יום רביעי בצהריים"'
          ];
        }
      case 'check_availability':
        return [
          'השבוע יש לי זמנים טובים',
          'איזה ימים הכי נוחים לך?',
          'אני יכול להציע כמה אפשרויות'
        ];
      case 'cancel_lesson':
        return [
          'איזה שיעור תרצה לבטל?',
          'אני אעזור לך עם הביטול'
        ];
      case 'reschedule_lesson':
        return [
          'איזה שיעור תרצה לשנות?',
          'לאיזה זמן תרצה להעביר?'
        ];
      default:
        return [
          'איך אני יכול לעזור לך?',
          'בוא נמצא יחד פתרון מתאים',
          'ספר לי מה אתה צריך'
        ];
    }
  }

  generateNaturalFallbackResponse(intent, studentName = '') {
    const name = studentName || 'חבר';
    
    switch (intent) {
      case 'book_lesson':
        return `היי ${name}! בואו נתאם לך שיעור מתמטיקה. איזה זמן הכי נוח לך?`;
      case 'check_availability':
        return `בטח ${name}! אני בודק עכשיו מה פנוי השבוע...`;
      case 'cancel_lesson':
        return `הבנתי ${name}, אתה רוצה לבטל שיעור. איזה שיעור?`;
      case 'reschedule_lesson':
        return `כמובן ${name}! איזה שיעור תרצה להעביר ולאיזה זמן?`;
      default:
        return `שלום ${name}! אני כאן לעזור לך עם שיעורי מתמטיקה. מה תרצה לעשות?`;
    }
  }

  /**
   * Generate fallback responses when AI is not available - PURE HEBREW
   */
  fallbackResponseGeneration(schedulingData, availableSlots = [], studentName = '') {
    const intent = schedulingData.intent || 'other';
    const name = studentName || 'חבר';

    // Use the natural response from fallback parsing if available
    if (schedulingData.natural_response) {
      return schedulingData.natural_response;
    }

    switch (intent) {
      case 'book_lesson':
        if (availableSlots.length > 0) {
          return `${name}, מצאתי זמנים זמינים עבורך! 📚

תוכל לבחור מהאפשרויות שמוצגות למטה, או לומר לי זמן אחר שמעניין אותך.

בברכה,
שפיר.`;
        } else {
          return `${name}, אני מחפש עבורך זמנים מתאימים... 📅

הזמן שביקשת לא זמין כרגע, אבל יש לי עוד הרבה אפשרויות טובות.

אתה יכול:
• לבחור זמן אחר מהרשימה
• לומר לי זמן שמתאים לך
• להצטרף לרשימת המתנה

בברכה,
שפיר.`;
        }
        
      case 'check_availability':
        return `${name}, אני בודק עבורך זמנים זמינים השבוע! 📅

רגע אחד, אני מכין לך את כל האפשרויות...

בברכה,
שפיר.`;
        
      case 'cancel_lesson':
        return `${name}, אוכל לעזור לך לבטל שיעור. ❌

תוכל לבחור את השיעור שתרצה לבטל מהרשימה למטה.

⚠️ שים לב: ביטול פחות מ-24 שעות לפני השיעור יחויב בתשלום 50%.

בברכה,
שפיר.`;
        
      case 'reschedule_lesson':
        return `${name}, בוודאי אוכל לעזור לך לשנות זמן שיעור! 🔄

תוכל לבחור את השיעור שתרצה לשנות, ואני אראה לך זמנים זמינים חדשים.

בברכה,
שפיר.`;
        
      default:
        return `שלום ${name}! 😊

אני שפיר, המורה למתמטיקה שלך. אני כאן לעזור לך עם תיאום שיעורים.

💡 מה אני יכול לעשות עבורך:
• לתאם שיעור חדש
• לבדוק זמנים זמינים  
• לבטל או לשנות שיעור קיים
• לענות על שאלות כלליות

פשוט כתוב לי מה אתה צריך, או בחר מהתפריט למטה!

בברכה,
שפיר.`;
    }
  }

  async extractLessonPreferences(userMessage, conversationHistory = []) {
    try {
      const extractionPrompt = ChatPromptTemplate.fromMessages([
        ['system', `Extract specific lesson preferences from the user's message. Focus on:
- Subject areas (algebra, geometry, calculus, statistics, etc.)
- Topics within those subjects
- Difficulty level
- Lesson type (regular, exam prep, makeup, trial)
- Special requests or materials needed

Return JSON with extracted preferences.`],
        ['human', `Message: {user_message}
Conversation history: {conversation_history}

Extract lesson preferences as JSON.`]
      ]);

      const extractionChain = extractionPrompt
        .pipe(this.llm)
        .pipe(this.outputParser);

      const response = await extractionChain.invoke({
        user_message: userMessage,
        conversation_history: JSON.stringify(conversationHistory)
      });

      return JSON.parse(response);
    } catch (error) {
      logger.error('Error extracting lesson preferences:', error);
      return {
        subject: 'math',
        lesson_type: 'regular',
        difficulty: 'intermediate'
      };
    }
  }

  /**
   * Simplified AI prompts that work better with quota limits
   */
  createEnhancedPrompt(userMessage, studentProfile) {
    return `אתה שפיר - מורה מתמטיקה ידידותי בעברית.

תלמיד: ${studentProfile.name || 'תלמיד'}
הודעה: "${userMessage}"

השב בעברית בלבד! אסור באנגלית!

חזור JSON:
{
  "intent": "book_lesson|check_availability|cancel_lesson|reschedule_lesson|other",
  "confidence": 0.8,
  "natural_response": "תגובה טבעית בעברית כאן",
  "datetime_preferences": [],
  "reasoning": "הסבר קצר בעברית"
}`;
  }
}

module.exports = new AIScheduler(); 

/**
 * Enhanced Hebrew NLP with better conversation understanding
 */
function enhancedHebrewNLP(text, studentName = null) {
  const message = text.toLowerCase();
  
  // Improved patterns for better conversation flow
  const patterns = {
    // Greetings and general conversation
    greeting: [
      /שלום/, /היי/, /הלו/, /בוקר טוב/, /ערב טוב/, /לילה טוב/,
      /מה נשמע/, /מה קורה/, /איך זה הולך/, /מה המצב/
    ],
    
    // Lesson booking with more natural language
    booking: [
      /רוצה שיעור/, /צריך שיעור/, /לתאם שיעור/, /לקבוע שיעור/,
      /בואו נתאם/, /אפשר לתאם/, /מתי אפשר/, /יש לך זמן/,
      /זמין/, /פנוי/, /אני יכול/, /בא לי/, /מעוניין/
    ],
    
    // Time expressions with Hebrew context
    timeExpressions: [
      /מחר/, /מחרתיים/, /היום/, /השבוע/, /שבוע הבא/,
      /ביום (\w+)/, /ב(\w+)/, /בשעה (\d+)/, /ב(\d+)/,
      /בצהריים/, /אחר הצהריים/, /בערב/, /בבוקר/,
      /יום ראשון/, /יום שני/, /יום שלישי/, /יום רביעי/, /יום חמישי/
    ],
    
    // Availability check
    availability: [
      /זמנים פנויים/, /מתי פנוי/, /מתי זמין/, /איזה זמנים/,
      /תראה לי/, /אפשרויות/, /מה יש לך/, /מתי אפשר/
    ],
    
    // Cancellation
    cancellation: [
      /לבטל/, /ביטול/, /לא יכול/, /לא אוכל/, /לא יגיע/,
      /משהו קרה/, /נדחה/, /לדחות/
    ],
    
    // Questions and help
    questions: [
      /איך/, /מה/, /למה/, /מתי/, /איפה/, /כמה/, /מי/,
      /עזרה/, /לא מבין/, /לא הבנתי/, /תסביר/, /תעזור/
    ],
    
    // Thanks and politeness
    thanks: [
      /תודה/, /תודות/, /שלום/, /בסדר/, /מעולה/, /נהדר/,
      /אוקיי/, /ברור/, /הבנתי/, /כן/, /לא/
    ]
  };
  
  // Calculate intent scores
  const intents = {};
  
  for (const [intent, regexes] of Object.entries(patterns)) {
    intents[intent] = regexes.some(regex => regex.test(message)) ? 1 : 0;
  }
  
  // Enhanced context understanding
  const context = {
    hasTimeReference: patterns.timeExpressions.some(regex => regex.test(message)),
    isQuestion: patterns.questions.some(regex => regex.test(message)) || message.includes('?'),
    isPolite: patterns.thanks.some(regex => regex.test(message)),
    mentionsName: studentName && message.includes(studentName.toLowerCase()),
    hasNumbers: /\d+/.test(message),
    isConversational: patterns.greeting.some(regex => regex.test(message)) || patterns.questions.some(regex => regex.test(message))
  };
  
  // Determine primary intent
  let primaryIntent = 'general_conversation';
  let confidence = 0.3;
  
  if (intents.booking > 0 || (intents.availability > 0 && context.hasTimeReference)) {
    primaryIntent = 'lesson_booking';
    confidence = 0.8;
  } else if (intents.availability > 0) {
    primaryIntent = 'check_availability';
    confidence = 0.7;
  } else if (intents.cancellation > 0) {
    primaryIntent = 'cancel_lesson';
    confidence = 0.7;
  } else if (intents.greeting > 0 || context.isConversational) {
    primaryIntent = 'general_conversation';
    confidence = 0.6;
  }
  
  return {
    intent: primaryIntent,
    confidence: confidence,
    context: context,
    intents: intents
  };
}

/**
 * Generate more natural AI responses
 */
function generateNaturalResponse(intent, studentName = null, context = {}) {
  const greeting = studentName ? `${studentName},` : '';
  
  const responses = {
    general_conversation: [
      `שלום ${greeting} אני כאן לעזור לך לתאם שיעורי מתמטיקה! 📚`,
      `היי ${greeting} מה אני יכול לעזור לך היום? אולי לתאם שיעור?`,
      `ברוכים הבאים ${greeting}! בוא נתאם שיעור מתמטיקה? 🔢`,
      `שלום ${greeting}! אני כאן בשבילך. איך אני יכול לעזור?`
    ],
    
    check_availability: [
      `בטח ${greeting}! בוא אראה לך מה יש לי פנוי השבוע...`,
      `כמובן! אני בודק עכשיו את הזמנים הפנויים שלי...`,
      `מצוין ${greeting}! תן לי שנייה לבדוק את לוח הזמנים...`
    ],
    
    lesson_booking: [
      `נהדר ${greeting}! בוא נתאם לך שיעור. איזה זמן מתאים לך?`,
      `מעולה! אני מחפש עכשיו זמנים פנויים עבורך...`,
      `בשמחה ${greeting}! בוא נמצא לך זמן מתאים לשיעור`
    ],
    
    need_more_info: [
      `${greeting} אני צריך קצת יותר פרטים כדי לעזור לך...`,
      `תוכל לתת לי עוד פרטים ${greeting}? איזה זמן מעדיף?`,
      `בוא נפרט ${greeting} - איזה יום ושעה מתאימים לך?`
    ]
  };
  
  const responseList = responses[intent] || responses.general_conversation;
  return responseList[Math.floor(Math.random() * responseList.length)];
}