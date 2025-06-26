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
      ['system', `אתה עוזר תיאום שיעורים AI עבור המורה שפיר ללמידת מתמטיקה. 

חשוב מאוד: ענה רק ואך ורק בעברית! אל תענה באנגלית בשום מקרה!

המשימה שלך היא להבין בקשות תיאום ולהמיר אותן לנתונים מובנים.

הקשר נוכחי:
- המורה: שפיר
- אזור זמן: ${settings.teacher.timezone}
- שעות פעילות: ${settings.businessHours.start} - ${settings.businessHours.end}
- ימי עבודה: ${settings.businessHours.days.join(', ')}
- משך שיעור ברירת מחדל: ${settings.lessons.defaultDuration} דקות
- תאריך/שעה נוכחיים: {current_datetime}

הנחיות חשובות:
1. ענה תמיד בעברית בלבד!
2. נתח את הודעת המשתמש כדי להבין את כוונת התיאום שלו
3. חלץ העדפות תאריך/שעה - אם אין תאריך/שעה ספציפיים, השאר את המערך ריק
4. אם יש תאריך/שעה, ודא שהם מחרוזות תקינות (לא null)
5. זהה פרטי שיעור (נושא, רמת קושי וכו')
6. קבע דחיפות וגמישות
7. ספק ציון ביטחון לפרשנות שלך
8. כתוב reasoning בעברית בלבד
9. חתום תמיד עם "בברכה, שפיר."

כוונות זמינות:
- book_lesson: המשתמש רוצה לתאם שיעור חדש
- reschedule_lesson: המשתמש רוצה לשנות זמן שיעור קיים
- cancel_lesson: המשתמש רוצה לבטל שיעור
- check_availability: המשתמש שואל על זמנים זמינים
- join_waitlist: המשתמש רוצה להצטרף לרשימת המתנה
- other: ההודעה לא קשורה לתיאום

חשוב: החזר רק JSON תקין. אל תכלול date או time או datetime כ-null - אם אין תאריך ספציפי, השאר datetime_preferences כמערך ריק.

דוגמה לתגובת JSON תקינה (עם תאריך ספציפי):
{{
  "intent": "book_lesson",
  "confidence": 0.9,
  "datetime_preferences": [
    {{
      "date": "2024-01-15",
      "time": "15:00",
      "flexibility": "exact",
      "duration_minutes": 60
    }}
  ],
  "lesson_details": {{
    "subject": "math",
    "topic": "algebra",
    "difficulty": "intermediate"
  }},
  "urgency": "medium",
  "reasoning": "המשתמש ביקש בבירור לתאם שיעור מתמטיקה ב-15 בינואר בשעה 15:00 לעזרה באלגברה."
}}

דוגמה לתגובת JSON תקינה (בלי תאריך ספציפי):
{{
  "intent": "check_availability",
  "confidence": 0.95,
  "datetime_preferences": [],
  "lesson_details": {{
    "subject": "math"
  }},
  "urgency": "medium",
  "reasoning": "המשתמש שואל על זמינות כללית ללא זמן ספציפי."
}}`],
      ['human', 'הודעת תלמיד: "{user_message}"\n\nפרופיל תלמיד:\n- שם: {student_name}\n- אזור זמן: {student_timezone}\n- משך מועדף: {preferred_duration} דקות\n- שיעורים אחרונים: {recent_lessons}\n\nאנא נתח את ההודעה והחזר נתוני תיאום מובנים כ-JSON תקין. זכור: ענה רק בעברית!']
    ]);
  }

  setupChain() {
    this.chain = this.promptTemplate
      .pipe(this.llm)
      .pipe(this.outputParser);
  }

  async processSchedulingRequest(userMessage, studentProfile = {}) {
    try {
      logger.aiLog('processing_request', userMessage.substring(0, 100), null, {
        studentId: studentProfile.id
      });

      // If AI is not initialized, use fallback parsing
      if (!this.initialized) {
        console.log('AI not available, using fallback parsing');
        return this.fallbackParsing(userMessage, studentProfile);
      }

      // Prepare context
      const currentDatetime = moment().tz(settings.teacher.timezone).format('YYYY-MM-DD HH:mm:ss');
      const recentLessons = studentProfile.recentLessons || [];
      
      // Invoke the AI chain
      const response = await this.chain.invoke({
        current_datetime: currentDatetime,
        user_message: userMessage,
        student_name: studentProfile.name || 'Unknown',
        student_timezone: studentProfile.timezone || settings.teacher.timezone,
        preferred_duration: studentProfile.preferredDuration || settings.lessons.defaultDuration,
        recent_lessons: recentLessons.map(lesson => 
          `${lesson.subject} on ${moment(lesson.start_time).format('YYYY-MM-DD HH:mm')}`
        ).join(', ') || 'None'
      });

      // Parse JSON response
      let parsedResponse;
      try {
        // Clean the response (remove any markdown formatting)
        const cleanResponse = response.replace(/```json\n?|\n?```/g, '').trim();
        parsedResponse = JSON.parse(cleanResponse);
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON:', parseError);
        logger.error('Raw AI response:', response);
        throw new Error('AI returned invalid JSON response');
      }

      // Validate against schema
      const validatedResponse = SchedulingRequestSchema.parse(parsedResponse);

      // Post-process datetime preferences
      if (validatedResponse.datetime_preferences) {
        validatedResponse.datetime_preferences = validatedResponse.datetime_preferences.map(pref => 
          this.enhanceDatetimePreference(pref, userMessage, studentProfile.timezone)
        );
      }

      logger.aiLog('request_processed', userMessage.substring(0, 100), JSON.stringify(validatedResponse), {
        intent: validatedResponse.intent,
        confidence: validatedResponse.confidence
      });

      return validatedResponse;

    } catch (error) {
      logger.error('Error processing scheduling request:', error);
      
      // Fallback to basic parsing
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