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
        modelName: 'gpt-3.5-turbo',
        temperature: 0.3,
        maxTokens: 500,
        timeout: 10000,
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

      // Use chain to process the request
      const response = await Promise.race([
        this.chain.invoke({
          user_message: userMessage,
          context: contextPrompt
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 10000))
      ]);

      // Parse JSON response with better error handling
      let parsedResponse;
      try {
        // Clean the response more thoroughly
        const cleanResponse = response
          .replace(/```json\n?|\n?```/g, '')
          .replace(/```\n?|\n?```/g, '')
          .replace(/^\s*[\r\n]+|[\r\n]+\s*$/g, '')
          .trim();
        
        // Find JSON object within the response
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON object found in response');
        }
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON:', parseError);
        logger.error('Raw AI response:', response);
        
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

    // Simple keyword-based intent detection for Hebrew and English
    const message = userMessage.toLowerCase();
    let intent = 'other';
    let confidence = 0.3;

    // Hebrew keywords
    if (message.includes('תאם') || message.includes('שיעור') || message.includes('לתאם') || 
        message.includes('book') || message.includes('schedule') || message.includes('lesson')) {
      intent = 'book_lesson';
      confidence = 0.6;
    } else if (message.includes('ביטול') || message.includes('לבטל') || message.includes('cancel')) {
      intent = 'cancel_lesson';
      confidence = 0.7;
    } else if (message.includes('לשנות') || message.includes('להעביר') || message.includes('reschedule') || message.includes('change')) {
      intent = 'reschedule_lesson';
      confidence = 0.7;
    } else if (message.includes('זמינים') || message.includes('פנוי') || message.includes('זמנים') || 
               message.includes('available') || message.includes('free')) {
      intent = 'check_availability';
      confidence = 0.6;
    } else if (message.includes('המתנה') || message.includes('רשימה') || message.includes('wait') || message.includes('list')) {
      intent = 'join_waitlist';
      confidence = 0.6;
    }

    // Basic chrono parsing for dates
    const chronoResults = chrono.parse(userMessage);
    const datetime_preferences = chronoResults.map(result => ({
      datetime: moment(result.start.date()).toISOString(),
      date: moment(result.start.date()).format('YYYY-MM-DD'),
      time: moment(result.start.date()).format('HH:mm'),
      flexibility: 'preferred',
      duration_minutes: studentProfile.preferredDuration || settings.lessons.defaultDuration
    }));

    return {
      intent,
      confidence,
      datetime_preferences: datetime_preferences.length > 0 ? datetime_preferences : [],
      lesson_details: {
        subject: 'math',
        lesson_type: 'regular'
      },
      urgency: 'medium',
      reasoning: 'פירוש חלופי בשל שגיאה בעיבוד AI',
      suggested_responses: [
        'האם תוכל לציין מתי תרצה לתאם את השיעור?',
        'איזה תאריך ושעה מתאימים לך?'
      ]
    };
  }

  async generateResponse(schedulingData, availableSlots = [], studentName = '') {
    try {
      const responsePrompt = ChatPromptTemplate.fromMessages([
        ['system', `אתה עוזר תיאום שיעורים ידידותי של המורה שפיר. צור תגובה מועילה לתלמיד בהתבסס על בקשת התיאום שלו והאפשרויות הזמינות.

הנחיות:
- תמיד השב בעברית בלבד!
- היה חם ומקצועי
- פנה לתלמיד בשמו כשמסופק
- הסבר בבירור את האפשרויות הזמינות
- בקש הבהרה כשצריך
- הצע חלופות כשהזמנים המועדפים לא זמינים
- השתמש באימוג'ים במידה והם מתאימים
- שמור על תגובות קצרות אך מידעיות
- סיים כל הודעה עם "בברכה, שפיר."

הקשר נוכחי:
- המורה: שפיר
- אזור זמן מורה: ${settings.teacher.timezone}
- שעות פעילות: ${settings.businessHours.start} - ${settings.businessHours.end}
- ימי עבודה: ${settings.businessHours.days.join(', ')}`],
        ['human', `ניתוח תיאום: {scheduling_data}
זמנים זמינים: {available_slots}
שם התלמיד: {student_name}

צור הודעת תגובה מתאימה בעברית וסיים עם "בברכה, שפיר."`]
      ]);

      const responseChain = responsePrompt
        .pipe(this.llm)
        .pipe(this.outputParser);

      const response = await responseChain.invoke({
        scheduling_data: JSON.stringify(schedulingData, null, 2),
        available_slots: JSON.stringify(availableSlots, null, 2),
        student_name: studentName
      });

      logger.aiLog('response_generated', JSON.stringify(schedulingData), response.substring(0, 100));

      // ודא שהחתימה קיימת
      if (!response.includes('בברכה, שפיר')) {
        return response.trim() + '\n\nבברכה,\nשפיר.';
      }

      return response;

    } catch (error) {
      logger.error('Error generating AI response:', error);
      
      // Fallback response in Hebrew
      if (schedulingData.intent === 'book_lesson') {
        return `שלום${studentName ? ` ${studentName}` : ''}! אשמח לעזור לך לתאם שיעור. תן לי לבדוק איזה זמנים זמינים ואחזור אליך בקרוב. 📚\n\nבברכה,\nשפיר.`;
      }
      
      return `שלום${studentName ? ` ${studentName}` : ''}! קיבלתי את ההודעה שלך לגבי תיאום השיעור. תן לי לעבד את הבקשה ולתת לך את האפשרויות הטובות ביותר. 🕐\n\nבברכה,\nשפיר.`;
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