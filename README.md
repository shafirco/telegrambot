# 🧮 Telegram AI Scheduler Bot - Intelligent Math Tutoring Assistant

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![OpenAI](https://img.shields.io/badge/AI-OpenAI%20GPT--4-blue)](https://openai.com/)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot%20API-2CA5E0)](https://core.telegram.org/bots/api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An advanced Telegram bot that combines **AI-powered natural language processing** with intelligent scheduling to provide seamless math tutoring appointment management. Built with OpenAI GPT-4, the bot understands conversational Hebrew and English, making lesson booking as natural as texting a friend.

## ✨ Key Features

### 🤖 AI-Powered Natural Language Understanding
- **GPT-4 Integration**: Understands complex scheduling requests in Hebrew and English
- **Intent Recognition**: Automatically identifies booking, cancellation, and rescheduling requests
- **Contextual Responses**: Provides intelligent, contextually aware replies
- **Confidence Scoring**: Self-evaluates response quality and asks for clarification when needed

### 📅 Smart Scheduling System
- **Google Calendar Integration**: Real-time synchronization with teacher's calendar
- **Conflict Detection**: Automatically prevents double-bookings
- **Flexible Time Parsing**: Understands "tomorrow at 3", "next Tuesday afternoon", etc.
- **Business Hours Enforcement**: Respects configured working hours and days

### 🎓 Complete Student Management
- **Profile Management**: Full student registration with preferences
- **Lesson History**: Tracks completed, cancelled, and upcoming lessons
- **Progress Tracking**: Monitors student engagement and lesson patterns
- **Preference Learning**: Remembers preferred times and subjects

### 📋 Intelligent Waitlist System
- **Priority Management**: Handles lesson availability with smart notifications
- **Automatic Promotion**: Moves waitlist students when slots open
- **Urgency Levels**: Prioritizes urgent requests (exams, deadlines)
- **Position Tracking**: Shows waitlist position and estimated wait time

### 🔔 Advanced Notification System
- **Automated Reminders**: 24-hour and 2-hour lesson reminders
- **Waitlist Updates**: Instant notifications when slots become available
- **Booking Confirmations**: Immediate confirmation of successful bookings
- **Cancellation Alerts**: Professional handling of schedule changes

### 📊 Teacher Dashboard
- **Real-time Statistics**: Student counts, lesson metrics, revenue tracking
- **Waitlist Management**: View and manage waiting students
- **Schedule Overview**: Visual calendar with upcoming lessons
- **Student Insights**: Detailed student profiles and histories

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Telegram      │    │   AI Agent      │    │   Scheduler     │
│   Bot API       │◄──►│   (GPT-4)       │◄──►│   Service       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Message       │    │   Natural       │    │   Google        │
│   Handlers      │    │   Language      │    │   Calendar      │
│                 │    │   Processing    │    │   Integration   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                             │
         ▼                                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Database Layer                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │  Students   │ │   Lessons   │ │  Waitlist   │ │Notifications││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 🧠 AI Agent Capabilities

The AI agent is the heart of this system, powered by OpenAI's GPT-4:

### Intent Recognition
- **book_lesson**: "I want a lesson tomorrow at 3"
- **cancel_lesson**: "I need to cancel my Thursday lesson"  
- **reschedule_lesson**: "Can we move my lesson to a different time?"
- **check_availability**: "What times are available this week?"
- **join_waitlist**: "Put me on the waitlist for Monday afternoon"

### Natural Language Processing
```javascript
// Examples the AI understands:
"אני רוצה שיעור מחר בשעה 3" → {intent: "book_lesson", time: "15:00", date: "tomorrow"}
"מתי יש זמנים פנויים השבוע?" → {intent: "check_availability", timeframe: "this_week"}
"צריך להעביר את השיעור לזמן אחר" → {intent: "reschedule_lesson", flexibility: "high"}
```

### Context Awareness
- Remembers conversation history
- Understands follow-up questions
- Maintains session state
- Provides relevant suggestions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- OpenAI API Key
- Google Calendar API credentials (optional)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shafirco/telegrambot.git
   cd telegrambot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup environment:**
   ```bash
   cp env.example .env
   # Edit .env with your API keys
   ```

4. **Initialize the database:**
   ```bash
   npm run setup
   ```

5. **Start the bot:**
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Environment Variables

```env
# Core Services
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key

# Google Calendar (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REFRESH_TOKEN=your_google_refresh_token
GOOGLE_CALENDAR_ID=your_calendar_id

# Teacher Settings
TEACHER_NAME=Your Name
TEACHER_TIMEZONE=Asia/Jerusalem
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=18:00
WORKING_DAYS=sunday,monday,tuesday,wednesday,thursday

# Bot Configuration
DEFAULT_LESSON_DURATION=60
BOOKING_ADVANCE_DAYS=30
REMINDER_HOURS_BEFORE=24
```

### Business Logic Customization

The bot can be customized for different tutoring subjects, languages, and business models:

- **Language Support**: Primary Hebrew with English support
- **Subject Areas**: Math by default, easily extendable
- **Scheduling Rules**: Configurable business hours and days
- **Pricing**: Flexible pricing per lesson type
- **Notifications**: Customizable reminder timing

## 💬 Usage Examples

### Student Interactions

**Basic Booking:**
```
Student: "אני רוצה שיעור מחר בשעה 4"
Bot: "מצוין! אני אבדוק זמינות למחר ב-16:00..."
Bot: "✅ השיעור נקבע בהצלחה למחר ב-16:00-17:00"
```

**Availability Check:**
```
Student: "מה יש פנוי השבוע הבא?"
Bot: "הזמנים הפנויים השבוע הבא:"
Bot: "🗓 יום ראשון: 10:00, 14:00, 17:00"
Bot: "🗓 יום שני: 11:00, 15:00, 18:00"
```

**Waitlist Management:**
```
Student: "אני רוצה להיות ברשימת המתנה לימי שני"
Bot: "🎯 נוספת לרשימת ההמתנה ליום שני"
Bot: "📊 מיקומך ברשימה: 3"
Bot: "⏱ זמן המתנה משוער: 2-3 ימים"
```

## 🎯 API Documentation

### REST Endpoints

- `GET /health` - System health check
- `GET /api/stats` - Usage statistics
- `GET /api/students/:telegramId` - Student information
- `GET /api/teacher-dashboard` - Teacher dashboard data
- `POST /api/calendar/sync` - Manual calendar synchronization

### Webhook Support

The bot supports both polling and webhook modes:
- **Development**: Polling mode (automatic)
- **Production**: Webhook mode with HTTPS

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm test -- --grep "AI Scheduler"
```

### Test Categories
- **AI Processing**: Natural language understanding
- **Scheduling Logic**: Time slot management
- **Database Operations**: CRUD operations
- **Integration Tests**: End-to-end scenarios

## 📦 Deployment

### Local Development
```bash
npm run dev
```

### Production Deployment

#### Option 1: Render.com (Recommended)
```bash
# Automatically deploys on git push to main
git push origin main
```

#### Option 2: Docker
```bash
docker build -t telegram-scheduler-bot .
docker run -d --env-file .env -p 3000:3000 telegram-scheduler-bot
```

#### Option 3: PM2
```bash
npm install -g pm2
pm2 start src/app.js --name "telegram-bot"
```

## 🔒 Security Features

- **Input Validation**: Comprehensive message sanitization
- **Rate Limiting**: Prevents spam and abuse
- **Session Management**: Secure session handling
- **Environment Variables**: Sensitive data protection
- **SQL Injection Prevention**: Parameterized queries
- **Error Handling**: Graceful error recovery

## 📈 Monitoring & Analytics

### Built-in Monitoring
- **Health Checks**: `/health` endpoint
- **Performance Metrics**: Response times, success rates
- **Error Tracking**: Comprehensive error logging
- **Usage Statistics**: Student engagement metrics

### Logging
- **Structured Logging**: JSON format with Winston
- **Log Levels**: Debug, Info, Warn, Error
- **Log Rotation**: Automatic log file management
- **Error Aggregation**: Centralized error tracking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow ESLint configuration
- Write tests for new features
- Update documentation
- Ensure backward compatibility

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Project Wiki](https://github.com/shafirco/telegrambot/wiki)
- **Issues**: [GitHub Issues](https://github.com/shafirco/telegrambot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/shafirco/telegrambot/discussions)

## 🙏 Acknowledgments

- **OpenAI**: For providing the GPT-4 API
- **Telegram**: For the Bot API platform
- **Google**: For Calendar API integration
- **Community**: For feedback and contributions

---

**Built with ❤️ for the education community** 