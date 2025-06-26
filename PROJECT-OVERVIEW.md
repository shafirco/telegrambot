# Math Tutor Telegram Bot - סקירת פרוייקט מלאה 📚🤖

## מה זה הפרוייקט?

בוט טלגרם חכם לתיאום שיעורי מתמטיקה פרטיים עם יכולות AI מתקדמות. הבוט מבין שפה טבעית בעברית ובאנגלית ומאפשר לתלמידים לתאם שיעורים בקלות.

## 🎯 תכונות עיקריות

### 🤖 AI-Powered עיבוד שפה טבעית
- הבנת בקשות בעברית: "אני רוצה שיעור מחר בשעה 3"
- זיהוי כוונות: תיאום, ביטול, שינוי זמן
- חילוץ פרטים אוטומטי: תאריכים, שעות, נושאים

### 📅 ניהול לוח זמנים
- אינטגרציה עם Google Calendar
- בדיקת זמינות בזמן אמת
- רשימת המתנה לזמנים תפוסים
- תזכורות אוטומטיות

### 🎓 ניהול תלמידים מתקדם
- פרופילים אישיים
- מעקב אחר התקדמות
- היסטוריית שיעורים
- העדפות אישיות

### 🔔 מערכת התראות
- תזכורות לפני שיעור
- אישורי תיאום
- עדכונים על שינויים
- התראות רשימת המתנה

## 🏗️ ארכיטקטורה טכנית

### מבנה תיקיות
```
teltgrambot/
├── src/
│   ├── ai/             # מודולי AI (GPT-4, LangChain)
│   │   └── scheduler.js
│   ├── bot/            # לוגיקת הבוט
│   │   ├── commands/   # פקודות בוט
│   │   └── handlers/   # מטפלי הודעות
│   ├── config/         # הגדרות והקשרי DB
│   ├── models/         # מודלי נתונים (Sequelize)
│   ├── services/       # שירותים (לוח שנה, התראות)
│   ├── routes/         # API endpoints
│   └── utils/          # כלי עזר ולוגים
├── data/              # קבצי נתונים
├── logs/              # קבצי לוג
└── scripts/           # סקריפטי התקנה
```

### טכנולוגיות בשימוש

#### Backend
- **Node.js** - פלטפורמה
- **Express.js** - שרת web
- **Telegraf** - מסגרת עבודה לבוט טלגרם
- **Sequelize + SQLite** - מסד נתונים
- **Winston** - לוגים

#### AI & ML
- **OpenAI GPT-4 Turbo** - עיבוד שפה טבעית
- **LangChain** - מסגרת עבודה עם LLM
- **Chrono-node** - זיהוי תאריכים ושעות
- **Zod** - ולידציית נתונים

#### אינטגרציות
- **Google Calendar API** - ניהול לוח זמנים
- **Moment.js + Timezone** - עיבוד זמנים
- **Render** - פלטפורמת deployment

## 📊 מסד הנתונים

### טבלאות עיקריות

#### Students (תלמידים)
```sql
- id, telegram_id, username, first_name, last_name
- phone, email, timezone, language
- total_lessons_booked, total_lessons_completed
- status, preferences, created_at, updated_at
```

#### Lessons (שיעורים)
```sql
- id, student_id, start_time, end_time
- subject, topic, difficulty_level, lesson_type
- status, price, currency, meeting_link
- teacher_notes, student_feedback, created_at
```

#### TeacherAvailability (זמינות מורה)
```sql
- id, schedule_type, day_of_week, start_time, end_time
- is_available, priority, max_lessons_per_slot
- buffer_before, buffer_after, status
```

#### NotificationLog (לוג התראות)
```sql
- id, student_id, lesson_id, notification_type
- content, status, sent_at, read_at
```

#### Waitlist (רשימת המתנה)
```sql
- id, student_id, requested_start_time, requested_end_time
- priority, status, created_at, notified_at
```

## 🔄 זרימת עבודה

### תיאום שיעור חדש
1. **קבלת הודעה** - תלמיד שולח בקשה בשפה טבעית
2. **עיבוד AI** - GPT-4 מנתח ומחלץ פרטים
3. **בדיקת זמינות** - המערכת בודקת לוח זמנים
4. **תצוגת אפשרויות** - מציגה זמנים זמינים
5. **אישור תיאום** - תלמיד מאשר
6. **עדכון לוח זמנים** - Google Calendar + DB
7. **שליחת אישור** - התראה לתלמיד

### טיפול בהודעה רגילה
```javascript
// src/bot/handlers/messageHandler.js
const message = ctx.message.text;
const aiResult = await aiScheduler.processSchedulingRequest(message, student);

switch(aiResult.intent) {
  case 'book_lesson':
    await handleBookingRequest(ctx, aiResult);
    break;
  case 'cancel_lesson':
    await handleCancellation(ctx, aiResult);
    break;
  // ... עוד מקרים
}
```

## 🤖 ה-AI Agent בפירוט

### איך זה עובד?
```javascript
// דוגמה לעיבוד בקשה
const result = await aiScheduler.processSchedulingRequest(
  "אני רוצה שיעור אלגברה ביום שישי אחרי 3",
  studentProfile
);

// תוצאה:
{
  "intent": "book_lesson",
  "confidence": 0.92,
  "datetime_preferences": [{
    "date": "2024-01-19", 
    "time": "15:00",
    "flexibility": "preferred"
  }],
  "lesson_details": {
    "subject": "math",
    "topic": "algebra"
  }
}
```

### רמות ביטחון
- **0.9-1.0** - זיהוי מדויק, פעולה ישירה
- **0.7-0.8** - זיהוי טוב, הצגת אפשרויות
- **0.5-0.6** - זיהוי חלקי, בקשת הבהרה
- **0-0.4** - לא הבין, מענה כללי

## 🚀 Deployment ו-CI/CD

### Render Platform
- **שרת production**: https://math-tutor-bot.onrender.com
- **Auto-deployment** מ-main branch
- **Environment variables** מוגדרים ב-Render
- **Health checks** אוטומטיים

### GitHub Actions (.github/workflows/deploy.yml)
```yaml
1. Test (Node 18.x, 20.x)
   - npm ci
   - npm run lint
   - npm test
   
2. Deploy to Render
   - Auto-trigger on push to main
   - Webhook verification
   
3. Health Check
   - Service availability
   - Bot response test
```

### הגדרות Environment
```
# Required
TELEGRAM_BOT_TOKEN=your_bot_token
OPENAI_API_KEY=your_openai_key

# Optional
NODE_ENV=production
PORT=3000
WEBHOOK_URL=https://math-tutor-bot.onrender.com
DATABASE_URL=sqlite:./data/database.sqlite
```

## 📝 הגדרות מרכזיות

### src/config/settings.js
```javascript
module.exports = {
  // מידע מורה
  teacher: {
    name: "Math Tutor",
    timezone: "Asia/Jerusalem",
    email: "tutor@example.com"
  },
  
  // שעות פעילות
  businessHours: {
    start: "08:00",
    end: "20:00", 
    days: ["sunday", "monday", "tuesday", "wednesday", "thursday"]
  },
  
  // הגדרות שיעורים
  lessons: {
    defaultDuration: 60,
    bufferTime: 15,
    maxAdvanceBooking: 30
  },
  
  // הגדרות AI
  ai: {
    model: "gpt-4-turbo-preview",
    temperature: 0.7,
    maxTokens: 500
  }
};
```

## 🔧 פקודות פיתוח

### התקנה מקומית
```bash
npm install
cp env.example .env
# ערוך .env עם הטוקנים שלך
npm run setup
npm start
```

### פקודות זמינות
```bash
npm start          # הפעלת הבוט
npm run dev        # מצב פיתוח עם nodemon
npm test           # הרצת בדיקות
npm run setup      # הגדרת מסד נתונים
npm run lint       # בדיקת קוד
```

## 📊 ניטור ולוגים

### Winston Logging
```javascript
logger.botLog('user_action', userId, username, 'Started bot');
logger.aiLog('processing_request', message, result);
logger.error('Database error:', error);
```

### סוגי לוגים
- **INFO** - פעולות רגילות
- **WARN** - התראות
- **ERROR** - שגיאות
- **DEBUG** - מידע פיתוח

### מיקום לוגים
- **Development**: קונסול + logs/
- **Production**: Render logs

## 🔐 אבטחה

### אימות Webhook
```javascript
// Telegram webhook validation
const isValid = validateTelegramWebhook(req.body, secretToken);
```

### הגנת API
- Environment variables לטוקנים רגישים
- HTTPS בלבד בproduction
- Rate limiting על requests

## 🎮 דוגמאות שימוש

### תיאום בשפה טבעית
```
תלמיד: "אני רוצה שיעור מתמטיקה מחר אחר הצהריים"
בוט: "🎓 נמצאו זמנים זמינים מחר:
      • 14:00-15:00 ✅
      • 16:00-17:00 ✅
      • 17:30-18:30 ✅
      איזה זמן מתאים לך?"
```

### ביטול שיעור
```
תלמיד: "צריך לבטל את השיעור ביום רביעי"
בוט: "🔍 מצאתי שיעור ברביעי 15/1 בשעה 16:00
      האם אתה בטוח שברצונך לבטל? ⚠️"
```

### בדיקת זמינות
```
תלמיד: "מתי יש זמנים פנויים השבוע?"
בוט: "📅 זמנים פנויים השבוע:
      יום ב׳ 13/1: 14:00, 16:00, 18:00
      יום ג׳ 14/1: 15:00, 17:00
      יום ה׳ 16/1: 14:00, 16:30"
```

## 🚀 פיצ'רים עתידיים

### בתכנון
- [ ] תשלומים אונליין
- [ ] וידיאו קול במהלך השיעור  
- [ ] מערכת ציונים והערכות
- [ ] בוט למורים (ממשק ניהול)
- [ ] תמיכה בשפות נוספות
- [ ] אינטגרציה עם Zoom/Teams

### שיפורים טכניים
- [ ] Redis לקאש
- [ ] PostgreSQL במקום SQLite
- [ ] Docker containers
- [ ] Kubernetes deployment
- [ ] גרפנה + PromQL למטריקס

## 🆘 פתרון בעיות נפוצות

### הבוט לא מגיב
1. בדוק webhook ב-Render logs
2. ודא ש-TELEGRAM_BOT_TOKEN תקין
3. בדוק ש-NODE_ENV=production

### שגיאות AI
1. בדוק OPENAI_API_KEY
2. ודא חיבור לאינטרנט
3. בדוק מכסת OpenAI

### בעיות מסד נתונים
1. הרץ `npm run setup`
2. בדוק הרשאות קבצים
3. ודא שטבלאות נוצרו

## 📞 תמיכה

- **GitHub Issues**: לבאגים ובקשות פיצ'רים
- **Logs**: בדוק ב-Render dashboard
- **Documentation**: קרא את DEPLOYMENT.md

---

**🎉 הפרוייקט משלב טכנולוגיות מתקדמות כדי ליצור חוויית תיאום שיעורים חלקה ואינטליגנטית!** 