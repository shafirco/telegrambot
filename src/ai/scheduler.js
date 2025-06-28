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
      ['system', `אתה מערכת AI לתיאום שיעורי מתמטיקה של המורה שפיר.

התפקיד שלך הוא לנתח בקשות תיאום מתלמידים ולהחזיר תגובה JSON תקנית בעברית בלבד.

חובה לענות רק בעברית ולא להשתמש באנגלית כלל!

אזור זמן מורה: Asia/Jerusalem
שעות עבודה: 10:00 - 18:00
ימי עבודה: ראשון, שני, שלישי, רביעי, חמישי

עליך לנתח את הבקשה ולזהות:
- כוונה (intent): book_lesson, cancel_lesson, reschedule_lesson, check_availability, join_waitlist, other
- רמת ביטחון (confidence): 0.0-1.0
- העדפות תאריך ושעה אם נמצאו
- פרטי השיעור

חזור תמיד JSON תקני בפורמט הזה בדיוק:
{{
  "intent": "book_lesson",
  "confidence": 0.8,
  "datetime_preferences": [
    {{
      "datetime": "2025-06-27T14:00:00",
      "date": "2025-06-27",
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
  "reasoning": "התלמיד מבקש לתאם שיעור מחר בשעה 2",
  "suggested_responses": [
    "אבדוק עבורך זמנים זמינים מחר אחר הצהריים",
    "איזה נושא בספציפי ברצונך להתמקד?"
  ]
}}

חובה להחזיר JSON תקני בלבד ללא טקסט נוסף!`],
      ['human', `הודעת התלמיד: {user_message}
קונטקסט: {context}

נא לנתח ולהחזיר JSON תקני בעברית בלבד:`]
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
        logger.warn('OpenAI not available, using fallback parsing');
        return this.fallbackParsing(userMessage, studentProfile);
      }

      // Prepare the prompt with student context
      const contextPrompt = `
שם התלמיד: ${studentProfile.name || 'לא ידוע'}
אזור זמן: ${studentProfile.timezone || settings.teacher.timezone}
העדפות אורך שיעור: ${studentProfile.preferredDuration || settings.lessons.defaultDuration} דקות

הודעת התלמיד: "${userMessage}"

נא לנתח את הבקשה וליצור תגובה JSON תקנית בעברית בלבד.
`;

      logger.aiLog('processing_request', userMessage, 'undefined', { studentId: studentProfile.id });

      // Use chain to process the request with longer timeout
      const response = await Promise.race([
        this.chain.invoke({
          user_message: userMessage,
          context: contextPrompt
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 25000))
      ]);

      logger.info('Raw AI response type:', typeof response);
      logger.info('Raw AI response length:', response?.length || 'undefined');
      
      // Handle different response types
      let responseText = '';
      if (typeof response === 'string') {
        responseText = response;
      } else if (response && typeof response.content === 'string') {
        responseText = response.content;
      } else if (response && typeof response.text === 'string') {
        responseText = response.text;
      } else if (Array.isArray(response)) {
        // Handle array of characters/chunks
        responseText = response.join('');
      } else if (response && typeof response === 'object') {
        // Try to extract text from object
        responseText = JSON.stringify(response);
      } else {
        logger.warn('Unexpected response type, using fallback');
        return this.fallbackParsing(userMessage, studentProfile);
      }

      // Parse JSON response with better error handling
      let parsedResponse;
      try {
        // Clean the response more thoroughly
        const cleanResponse = responseText
          .replace(/```json\n?|\n?```/g, '')
          .replace(/```\n?|\n?```/g, '')
          .replace(/^\s*[\r\n]+|[\r\n]+\s*$/g, '')
          .trim();
        
        logger.info('Cleaned response:', cleanResponse.substring(0, 200) + '...');
        
        // Find JSON object within the response
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON object found in response');
        }
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON:', parseError);
        logger.error('Clean response:', responseText.substring(0, 500));
        
        // Use fallback instead of throwing error
        logger.info('Using fallback parsing due to JSON error');
        return this.fallbackParsing(userMessage, studentProfile);
      }

      // Validate and enhance the response
      if (!parsedResponse.intent) {
        parsedResponse.intent = 'other';
      }
      if (!parsedResponse.confidence) {
        parsedResponse.confidence = 0.5;
      }

      // Post-process datetime preferences
      if (parsedResponse.datetime_preferences) {
        parsedResponse.datetime_preferences = parsedResponse.datetime_preferences.map(pref => 
          this.enhanceDatetimePreference(pref, userMessage, studentProfile.timezone)
        );
      }

      logger.aiLog('request_processed', userMessage.substring(0, 100), JSON.stringify(parsedResponse), {
        intent: parsedResponse.intent,
        confidence: parsedResponse.confidence
      });

      return parsedResponse;

    } catch (error) {
      logger.error('Error processing scheduling request:', error);
      
      // Always fallback to basic parsing on any error
      return this.fallbackParsing(userMessage, studentProfile);
    }
  }

  enhanceDatetimePreference(preference, originalMessage, studentTimezone) {
    try {
      // Use chrono for additional date/time parsing
      const chronoResults = chrono.parse(originalMessage, new Date(), { 
        forwardDate: true,
        timezone: studentTimezone || settings.teacher.timezone
      });

      if (chronoResults.length > 0) {
        const chronoResult = chronoResults[0];
        const parsedDateTime = moment(chronoResult.start.date()).tz(settings.teacher.timezone);

        // Enhance the preference with chrono results if not already specified
        if (!preference.datetime && !preference.date) {
          preference.date = parsedDateTime.format('YYYY-MM-DD');
          preference.time = parsedDateTime.format('HH:mm');
          preference.datetime = parsedDateTime.toISOString();
        }
      }

      // Convert relative times to absolute
      if (preference.datetime) {
        const momentTime = moment.tz(preference.datetime, settings.teacher.timezone);
        if (momentTime.isValid()) {
          preference.datetime = momentTime.toISOString();
          preference.date = momentTime.format('YYYY-MM-DD');
          preference.time = momentTime.format('HH:mm');
        }
      }

      return preference;
    } catch (error) {
      logger.error('Error enhancing datetime preference:', error);
      return preference;
    }
  }

  fallbackParsing(userMessage, studentProfile) {
    logger.info('Using fallback parsing for message:', userMessage);

    // Enhanced keyword-based intent detection for Hebrew and English
    const message = userMessage.toLowerCase();
    let intent = 'other';
    let confidence = 0.3;

    // Check cancellation first (more specific patterns)
    if (message.includes('ביטול') || message.includes('לבטל') || message.includes('מבטל') || 
        message.includes('בטל') || message.includes('לבטל את השיעור') || message.includes('אני רוצה לבטל') || 
        message.includes('רוצה לבטל') || message.includes('cancel') || message.includes('remove') || 
        message.includes('delete')) {
      intent = 'cancel_lesson';
      confidence = 0.8;
    } else if (message.includes('תאם') || message.includes('שיעור') || message.includes('לתאם') || 
               message.includes('רוצה') || message.includes('צריך') || message.includes('אפשר') ||
               message.includes('book') || message.includes('schedule') || message.includes('lesson') || 
               message.includes('want') || message.includes('need')) {
      intent = 'book_lesson';
      confidence = 0.7;
    } else if (message.includes('לשנות') || message.includes('להעביר') || message.includes('לדחות') || 
               message.includes('reschedule') || message.includes('change') || message.includes('move')) {
      intent = 'reschedule_lesson';
      confidence = 0.8;
    } else if (message.includes('זמינים') || message.includes('פנוי') || message.includes('זמנים') || 
               message.includes('מתי') || message.includes('available') || message.includes('free') || 
               message.includes('when')) {
      intent = 'check_availability';
      confidence = 0.8;
    } else if (message.includes('המתנה') || message.includes('רשימה') || message.includes('לחכות') || 
               message.includes('wait') || message.includes('list') || message.includes('waitlist')) {
      intent = 'join_waitlist';
      confidence = 0.7;
    }

    // Enhanced date/time parsing
    const datetime_preferences = [];
    
    try {
      // Basic chrono parsing for English dates
      const chronoResults = chrono.parse(userMessage);
      chronoResults.forEach(result => {
        const startDate = result.start.date();
        datetime_preferences.push({
          datetime: moment(startDate).toISOString(),
          date: moment(startDate).format('YYYY-MM-DD'),
          time: moment(startDate).format('HH:mm'),
          flexibility: 'preferred',
          duration_minutes: studentProfile.preferredDuration || settings.lessons.defaultDuration
        });
      });

      // Enhanced Hebrew time patterns
      const hebrewTimePatterns = [
        { pattern: /מחר|tomorrow/, offset: 1, time: '15:00' },
        { pattern: /היום|today/, offset: 0, time: '16:00' },
        { pattern: /מחרתיים|day after tomorrow/, offset: 2, time: '15:00' },
        { pattern: /השבוע הבא|next week/, offset: 7, time: '15:00' },
        { pattern: /השבוע|this week/, offset: 3, time: '15:00' },
        { pattern: /(יום )?ראשון|sunday/, dayOfWeek: 0 },
        { pattern: /(יום )?שני|monday/, dayOfWeek: 1 },
        { pattern: /(יום )?שלישי|tuesday/, dayOfWeek: 2 },
        { pattern: /(יום )?רביעי|wednesday/, dayOfWeek: 3 },
        { pattern: /(יום )?חמישי|thursday/, dayOfWeek: 4 },
        { pattern: /(יום )?שישי|friday/, dayOfWeek: 5 }
      ];
      
      // Hebrew time expressions
      const timePatterns = [
        { pattern: /בבוקר|morning/, hour: 10 },
        { pattern: /אחר הצהריים|afternoon/, hour: 15 },
        { pattern: /בערב|evening/, hour: 18 },
        { pattern: /בלילה|night/, hour: 20 },
        { pattern: /שעה (\d+)/, match: 1 },
        { pattern: /(\d+) בבוקר/, match: 1, modifier: 'morning' },
        { pattern: /(\d+) אחר הצהריים/, match: 1, modifier: 'afternoon' }
      ];
      
      for (const timePattern of hebrewTimePatterns) {
        const match = timePattern.pattern.exec(message);
        if (match) {
          const baseDate = moment().tz(studentProfile.timezone || 'Asia/Jerusalem');
          let targetDate;
          
          if (timePattern.offset !== undefined) {
            targetDate = baseDate.clone().add(timePattern.offset, 'days');
          } else if (timePattern.dayOfWeek !== undefined) {
            targetDate = baseDate.clone().day(timePattern.dayOfWeek);
            if (targetDate.isBefore(baseDate) || targetDate.isSame(baseDate, 'day')) {
              targetDate.add(1, 'week');
            }
          }
          
          if (targetDate) {
            let hour = 15; // Default hour
            
            // Look for time patterns in the same message
            for (const timePat of timePatterns) {
              const timeMatch = timePat.pattern.exec(message);
              if (timeMatch) {
                if (timePat.match) {
                  hour = parseInt(timeMatch[timePat.match]);
                  if (timePat.modifier === 'afternoon' && hour <= 12) {
                    hour += 12;
                  }
                } else if (timePat.hour) {
                  hour = timePat.hour;
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
              duration_minutes: studentProfile.preferredDuration || settings.lessons.defaultDuration
            });
            confidence = Math.min(confidence + 0.3, 0.95);
            break;
          }
        }
      }
    } catch (error) {
      logger.warn('Error in enhanced fallback time parsing:', error);
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
      reasoning: `זיהוי משופר: ${intent} ברמת ביטחון ${confidence}`,
      suggested_responses: [
        'אני כאן לעזור! איזה תאריך ושעה הכי נוחים לך?',
        'בואו נמצא יחד את הזמן המושלם לשיעור',
        'תוכל להגיד לי "מחר אחרי 3" או "ביום ראשון בערב"'
      ]
    };
  }

  async generateResponse(schedulingData, availableSlots = [], studentName = '') {
    try {
      if (!this.llm) {
        logger.warn('OpenAI not available, using fallback response generation');
        return this.fallbackResponseGeneration(schedulingData, availableSlots, studentName);
      }

      const prompt = `
אתה מורה למתמטיקה בשם שפיר, חם ומועיל. ענה בעברית בלבד תמיד!

נתונים על הבקשה:
- כוונה: ${schedulingData.intent}
- נימוק: ${schedulingData.reasoning || 'לא צוין'}
- זמנים זמינים: ${availableSlots.length > 0 ? 'יש זמנים זמינים' : 'אין זמנים זמינים'}
- שם התלמיד: ${studentName}

הקפד על:
1. ענה רק בעברית
2. היה חם ומועיל
3. תמיד חתום עם "בברכה, שפיר."
4. אל תציע רשימת המתנה אלא אם צריך
5. תן מידע מועיל ופרקטי

הודעה מקורית: "${schedulingData.original_message || ''}"

ענה באופן ישיר ומועיל:`;

      const response = await Promise.race([
        this.llm.invoke([['human', prompt]]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Response timeout')), 8000))
      ]);

      const content = response.content;
      
      // Ensure proper Hebrew signature
      if (!content.includes('בברכה, שפיר')) {
        return content + '\n\nבברכה,\nשפיר.';
      }
      
      return content;

    } catch (error) {
      logger.error('Error generating AI response:', error);
      return this.fallbackResponseGeneration(schedulingData, availableSlots, studentName);
    }
  }

  /**
   * Generate fallback responses when AI is not available
   */
  fallbackResponseGeneration(schedulingData, availableSlots = [], studentName = '') {
    const intent = schedulingData.intent || 'other';
    const name = studentName || 'חבר';

    switch (intent) {
      case 'book_lesson':
        if (availableSlots.length > 0) {
          return `שלום ${name}! 📚\n\nמצאתי זמנים זמינים עבורך. תוכל לבחור מהאפשרויות שמוצגות או לומר לי איזה זמן הכי מתאים לך.\n\nבברכה,\nשפיר.`;
        } else {
          return `שלום ${name}! 📚\n\nהזמן שביקשת תפוס כרגע. תוכל לומר לי זמן אחר שמתאים לך, ואני אבדוק האם הוא פנוי.\n\nבברכה,\nשפיר.`;
        }
        
      case 'check_availability':
        return `שלום ${name}! 📅\n\nאני בודק עבורך זמנים זמינים. רגע אחד...\n\nבברכה,\nשפיר.`;
        
      case 'cancel_lesson':
        return `שלום ${name}! ❌\n\nאוכל לעזור לך לבטל שיעור. אנא פרט איזה שיעור תרצה לבטל.\n\nבברכה,\nשפיר.`;
        
      case 'reschedule_lesson':
        return `שלום ${name}! 🔄\n\nבוודאי אוכל לעזור לך להעביר שיעור. ספר לי איזה שיעור ולאיזה זמן תרצה להעביר.\n\nבברכה,\nשפיר.`;
        
      default:
        return `שלום ${name}! 😊\n\nאני כאן לעזור לך עם שיעורי מתמטיקה. תוכל לבקש לתאם שיעור, לבדוק זמנים זמינים, או לשאול כל שאלה.\n\nפשוט כתוב מה שאתה צריך!\n\nבברכה,\nשפיר.`;
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