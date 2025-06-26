# 🤖 Telegram AI Scheduler Bot for Private Math Lessons

A smart Telegram bot designed for private math teachers that allows students to independently schedule lessons using natural language processing. The bot manages availability, waitlists, and automatic notifications through AI-powered conversation.

## 🚀 Features

### Core Functionality
- **Natural Language Booking**: Students can book lessons using phrases like "I'm free Wednesday after 4"
- **AI-Powered Scheduling**: LangChain/LangGraph agents understand and process scheduling requests
- **Google Calendar Integration**: Seamless synchronization with teacher's calendar
- **Smart Waitlist Management**: Automatic waitlist when no slots are available
- **Intelligent Notifications**: AI-generated updates when slots become available
- **Multi-language Support**: Supports multiple languages for international students

### Advanced Features
- **Conflict Resolution**: Automatic detection and resolution of scheduling conflicts
- **Lesson Reminders**: Automated reminders sent to students
- **Availability Management**: Teachers can easily update their availability
- **Student Profiles**: Track lesson history and preferences
- **Analytics Dashboard**: Insights into booking patterns and popular time slots

## 🛠️ Technology Stack

- **Backend**: Node.js with Express
- **Bot Framework**: Telegraf (Telegram Bot API)
- **AI/ML**: LangChain, LangGraph, OpenAI GPT-4-turbo
- **Calendar**: Google Calendar API
- **Database**: SQLite with Sequelize ORM
- **Scheduling**: Moment.js, Chrono-node for time parsing
- **Deployment**: Docker support included

## 📋 Prerequisites

- Node.js 18+ installed
- Telegram Bot Token (from @BotFather)
- OpenAI API Key
- Google Calendar API credentials
- Basic knowledge of environment variables

## 🚀 Quick Start

### 1. Clone and Install

\`\`\`bash
git clone <repository-url>
cd telegram-ai-scheduler-bot
npm install
\`\`\`

### 2. Environment Setup

\`\`\`bash
cp env.example .env
# Edit .env with your API keys and configuration
\`\`\`

### 3. Configure APIs

#### Telegram Bot Setup
1. Message @BotFather on Telegram
2. Create a new bot with `/newbot`
3. Copy the bot token to `TELEGRAM_BOT_TOKEN` in `.env`

#### OpenAI Setup
1. Get API key from [OpenAI Platform](https://platform.openai.com/)
2. Add to `OPENAI_API_KEY` in `.env`

#### Google Calendar Setup
1. Enable Google Calendar API in [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add credentials to `.env` file

### 4. Initialize Database

\`\`\`bash
npm run setup
\`\`\`

### 5. Start the Bot

\`\`\`bash
# Development mode
npm run dev

# Production mode
npm start
\`\`\`

## 📱 Usage

### For Students

1. **Start Conversation**: Message the bot `/start`
2. **Book a Lesson**: 
   - "I want to book a lesson this Friday at 3 PM"
   - "Can I schedule something for next Tuesday afternoon?"
   - "I'm available Wednesday after 4"
3. **Check Status**: Use `/mystatus` to see upcoming lessons
4. **Cancel Booking**: Use `/cancel` or send a cancellation message

### For Teachers

1. **Set Availability**: Use `/setavailability` command
2. **View Schedule**: Use `/schedule` to see upcoming lessons
3. **Manage Waitlist**: Use `/waitlist` to see pending requests
4. **Update Settings**: Use `/settings` to configure preferences

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather | ✅ |
| `OPENAI_API_KEY` | OpenAI API key for AI processing | ✅ |
| `GOOGLE_CALENDAR_ID` | Google Calendar ID for scheduling | ✅ |
| `TEACHER_TIMEZONE` | Teacher's timezone (e.g., America/New_York) | ✅ |
| `DEFAULT_LESSON_DURATION` | Default lesson duration in minutes | ⚪ |

### Business Logic Configuration

Edit configuration in `src/config/settings.js`:

\`\`\`javascript
module.exports = {
  businessHours: {
    start: '09:00',
    end: '18:00',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  },
  lessonSettings: {
    defaultDuration: 60, // minutes
    bufferTime: 15, // minutes between lessons
    maxAdvanceBooking: 30 // days
  }
};
\`\`\`

## 🏗️ Project Structure

\`\`\`
src/
├── app.js                 # Main application entry point
├── bot/                   # Telegram bot logic
│   ├── index.js          # Bot initialization
│   ├── commands/         # Bot commands
│   └── handlers/         # Message handlers
├── ai/                   # AI agents and processing
│   ├── agents/           # LangChain agents
│   ├── chains/           # LangChain chains
│   └── prompts/          # AI prompts
├── services/             # Business logic services
│   ├── calendar.js       # Google Calendar integration
│   ├── scheduler.js      # Scheduling logic
│   └── notifications.js  # Notification system
├── models/               # Database models
├── config/               # Configuration files
└── utils/                # Utility functions

data/                     # SQLite database files
scripts/                  # Setup and utility scripts
tests/                    # Test files
\`\`\`

## 🧪 Testing

\`\`\`bash
# Run all tests
npm test

# Run specific test file
npm test tests/scheduler.test.js

# Run tests in watch mode
npm test -- --watch
\`\`\`

## 🚀 Deployment

### Using Docker

\`\`\`bash
# Build image
docker build -t telegram-scheduler-bot .

# Run container
docker run -d --env-file .env -p 3000:3000 telegram-scheduler-bot
\`\`\`

### Manual Deployment

1. Set up production environment variables
2. Install dependencies: `npm ci --production`
3. Start with PM2: `pm2 start src/app.js --name "scheduler-bot"`

## 🔮 Future Enhancements

- [ ] Group lesson support
- [ ] Payment integration
- [ ] Video call integration
- [ ] Advanced analytics dashboard
- [ ] Mobile app companion
- [ ] Multi-teacher support
- [ ] Lesson recording and notes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support, please open an issue on GitHub or contact the development team.

---

**Made with ❤️ for math teachers and students worldwide** 