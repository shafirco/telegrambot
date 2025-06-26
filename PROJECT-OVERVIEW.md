# סקירת פרויקט - בוט תלגרם לתיאום שיעורים 📚🤖

## סקירה כללית

הפרויקט הוא בוט תלגרם חכם לתיאום שיעורי מתמטיקה פרטיים, הכולל:
- **עיבוד שפה טבעית** עם OpenAI GPT-4
- **אינטגרציה עם גוגל קלנדר** לניהול זמנים
- **מערכת ניהול תלמידים** מתקדמת
- **רשימת המתנה חכמה** עם התראות אוטומטיות
- **מערכת תזכורות והודעות**

## ארכיטקטורה טכנית

### 🏗️ מבנה המערכת

```
teltgrambot/
├── src/
│   ├── ai/              # מודול AI לעיבוד שפה טבעית
│   ├── bot/             # לוגיקת הבוט והתפריטים
│   ├── config/          # הגדרות מערכת ובסיס נתונים
│   ├── models/          # מודלים של בסיס הנתונים
│   ├── routes/          # נתיבי API
│   ├── services/        # שירותים עסקיים
│   └── utils/           # כלי עזר ולוגינג
├── .github/workflows/   # CI/CD עם GitHub Actions
├── data/               # קבצי נתונים
├── logs/               # לוגים
└── scripts/            # סקריפטי הקמה
```

### 🔧 טכנולוגיות עיקריות

- **Node.js** - פלטפורמת הרצה
- **Telegraf** - ספריית בוט תלגרם
- **SQLite + Sequelize** - בסיס נתונים ו-ORM
- **Google Calendar API** - אינטגרציה עם לוח שנה
- **OpenAI GPT-4** - עיבוד שפה טבעית
- **LangChain** - פריימוורק AI
- **Winston** - לוגינג
- **Moment.js** - ניהול תאריכים ושעות

## תכונות עיקריות

### 🤖 AI Agent - העוזר החכם

**מיקום**: `src/ai/scheduler.js`

העוזר החכם מבין בקשות בשפה טבעית בעברית ובאנגלית:

- **ניתוח כוונות**: זיהוי האם המשתמש רוצה לתאם, לבטל, לשנות או לבדוק זמינות
- **חילוץ זמנים**: הבנת תאריכים ושעות מטקסט טבעי
- **המלצות חכמות**: הצעת זמנים חלופיים
- **תגובות מותאמות אישית**: יצירת הודעות מותאמות למצב

#### דוגמאות לשימוש:
```
👤 "אני רוצה שיעור מחר בשעה 3 אחר הצהריים"
🤖 ✅ הבנתי שאתה רוצה לתאם שיעור מחר ב-15:00

👤 "איזה זמנים פנויים יש השבוע הבא?"
🤖 📅 אבדוק עבורך את הזמנים הזמינים...

👤 "אני רוצה להיות ברשימת המתנה לימי שני"
🤖 ⏰ אוסיף אותך לרשימת המתנה!
```

### 📅 מערכת תיאום זמנים

**מיקום**: `src/services/scheduler.js`

- **בדיקת זמינות אוטומטית**: בדיקה מול גוגל קלנדר
- **חלונות זמן גמישים**: יצירת זמנים זמינים כל 30 דקות
- **חסימות ידניות**: אפשרות לחסום זמנים ספציפיים
- **אופטימיזציה חכמה**: מיון זמנים לפי העדפות התלמיד

### 📱 ממשק משתמש בעברית

**מיקום**: `src/bot/handlers/` & `src/bot/commands/`

- **תפריט ראשי מלא בעברית**
- **הודעות שגיאה מתורגמות**
- **כפתורים אינטראקטיביים**
- **מידע סטטוס מפורט**

### 🗃️ מודלי נתונים

**מיקום**: `src/models/`

#### Student (תלמיד)
```javascript
{
  id, telegram_id, first_name, last_name,
  email, phone, timezone, preferred_days,
  preferred_time_start, preferred_time_end,
  preferred_lesson_duration, total_lessons,
  completed_lessons, cancelled_lessons
}
```

#### Lesson (שיעור)
```javascript
{
  id, student_id, start_time, end_time,
  duration_minutes, subject, topic,
  difficulty_level, lesson_type, status,
  price_amount, google_calendar_event_id
}
```

#### Waitlist (רשימת המתנה)
```javascript
{
  id, student_id, preferred_start_time,
  preferred_duration, position, status,
  urgency_level, created_at
}
```

### 🔔 מערכת התראות

**מיקום**: `src/services/notifications.js`

- **תזכורות שיעור**: 24 שעות לפני השיעור
- **עדכוני רשימת המתנה**: כשמתפנה מקום
- **אישורי הזמנה**: לאחר תיאום שיעור
- **התראות ביטול**: כשמבטלים שיעור

## סביבות הפעלה

### 🌐 Production - Render.com

**URL**: https://math-tutor-bot.onrender.com

- **סביבת ייצור** עם בסיס נתונים PostgreSQL
- **SSL אוטומטי** ואבטחה מתקדמת
- **סקלינג אוטומטי** לפי עומס
- **מוניטורינג ולוגים** בזמן אמת

### 🔧 Development - מקומי

```bash
npm install
npm run dev
```

## משתנים סביבתיים

```bash
# בוט תלגרם
TELEGRAM_BOT_TOKEN=your_bot_token
WEBHOOK_URL=https://your-app.onrender.com

# OpenAI
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4-turbo-preview

# בסיס נתונים
DATABASE_URL=your_database_url

# גוגל קלנדר
GOOGLE_CALENDAR_CREDENTIALS=your_credentials_json
GOOGLE_CALENDAR_ID=your_calendar_id

# הגדרות מורה
TEACHER_TIMEZONE=Asia/Jerusalem
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=18:00
WORKING_DAYS=sunday,monday,tuesday,wednesday,thursday
```

## CI/CD עם GitHub Actions

**מיקום**: `.github/workflows/deploy.yml`

### זרימת פיתוח:
1. **Push ל-main** → הפעלת workflow
2. **בדיקות אוטומטיות** (linting, tests)
3. **deployment לרנדר** באמצעות webhook
4. **בדיקת תקינות** של השירות
5. **התראות סטטוס** הצלחה/כישלון

### תכונות CI/CD:
- ✅ **בדיקות אוטומטיות** לפני deployment
- ✅ **בדיקת משתני סביבה** נדרשים
- ✅ **health checks** לאחר deployment
- ✅ **rollback אוטומטי** במקרה של כישלון

## תהליכי פיתוח

### 🔄 Git Workflow

```bash
# יצירת feature branch
git checkout -b feature/new-feature

# פיתוח והוספת שינויים
git add .
git commit -m "feat: תיאור השינוי"

# push ו-PR
git push origin feature/new-feature
# יצירת Pull Request ב-GitHub
```

### 🧪 בדיקות

```bash
# הרצת בדיקות מקומיות
npm test

# בדיקת linting
npm run lint

# בדיקת טיפוסים
npm run type-check
```

## מוניטורינג ותחזוקה

### 📊 לוגים ומעקב

**מיקום**: `src/utils/logger.js`

- **לוגי פעילות משתמשים**
- **לוגי AI ותגובות**
- **לוגי שגיאות מפורטים**
- **מעקב אחר ביצועים**

### 🔧 תחזוקה שוטפת

- **ניקוי נתונים ישנים** (אוטומטי)
- **סינכרון עם גוגל קלנדר** (כל 5 דקות)
- **עדכון רשימות המתנה** (יומי)
- **גיבויי בסיס נתונים** (שבועי)

## אבטחה ופרטיות

### 🔒 אמצעי אבטחה

- **הצפנת תקשורת** (HTTPS/TLS)
- **הסתרת משתני סביבה** רגישים
- **ולידציה של קלטים** מהמשתמש
- **הגבלת גישה ל-API**

### 🛡️ פרטיות

- **הצפנת נתוני משתמשים**
- **מחיקת נתונים ישנים**
- **אי שמירת מידע רגיש** בלוגים

## תיעוד למפתחים

### 📖 מבנה התיקיות

```
src/
├── ai/scheduler.js         # AI Agent העיקרי
├── bot/
│   ├── commands/index.js   # פקודות בוט (/start, /help)
│   ├── handlers/           # מטפלי הודעות וקולבקים
│   └── index.js           # אתחול הבוט
├── config/
│   ├── database.js        # הגדרות בסיס נתונים
│   └── settings.js        # הגדרות כלליות
├── models/                # מודלי Sequelize
├── routes/api.js          # נתיבי API ובדיקת תקינות
├── services/              # לוגיקה עסקית
└── utils/logger.js        # מערכת לוגינג
```

### 🔌 API Endpoints

```
GET  /health           # בדיקת תקינות המערכת
POST /webhook/webhook  # webhook לתלגרם
GET  /api/stats        # סטטיסטיקות מערכת
```

## שאלות נפוצות (FAQ)

### ❓ איך להוסיף שפה חדשה?
עדכן את `src/config/settings.js` ותרגם את הודעות הבוט בקבצים התואמים.

### ❓ איך לשנות שעות עבודה?
עדכן את משתני הסביבה `BUSINESS_HOURS_START` ו-`BUSINESS_HOURS_END`.

### ❓ איך להוסיף סוג שיעור חדש?
עדכן את enum ב-`src/models/Lesson.js` ואת לוגיקת ה-AI ב-`src/ai/scheduler.js`.

### ❓ איך לשלב לוח שנה נוסף?
הוסף אינטגרציה חדשה ב-`src/services/calendar.js`.

---

## 🚀 הרצה מהירה

```bash
# 1. שכפול הפרויקט
git clone https://github.com/shafirco/telegrambot.git
cd telegrambot

# 2. התקנת תלויות
npm install

# 3. העתקת משתני סביבה
cp env.example .env

# 4. הגדרת משתני סביבה ב-.env

# 5. הרצה מקומית
npm run dev

# 6. deployment לייצור
git push origin main  # יפעיל CI/CD אוטומטי
```

---

**נוצר ב-2025 | מתוחזק על ידי GitHub Actions | מופעל על Render.com** 