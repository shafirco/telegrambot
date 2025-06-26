# 🚀 Deployment Guide - Telegram AI Scheduler Bot

This guide covers different deployment options for your Telegram AI Scheduler Bot.

## 📋 Prerequisites

- Node.js 18+ installed
- Telegram Bot Token (from @BotFather)
- OpenAI API Key
- Google Calendar API credentials (optional)

## 🔧 Environment Setup

1. **Copy environment file:**
   ```bash
   cp env.example .env
   ```

2. **Update `.env` with your credentials:**
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   OPENAI_API_KEY=your_openai_key_here
   GOOGLE_CALENDAR_ID=your_calendar_id_here
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REFRESH_TOKEN=your_refresh_token
   ```

## 🖥️ Local Development

```bash
# Install dependencies
npm install

# Setup database and initial data
npm run setup

# Start in development mode
npm run dev
```

## 🌐 Production Deployment

### Option 1: Direct Server Deployment

1. **Setup on server:**
   ```bash
   git clone <your-repo-url>
   cd telegram-ai-scheduler-bot
   npm ci --production
   npm run setup
   ```

2. **Start with PM2:**
   ```bash
   npm install -g pm2
   pm2 start src/app.js --name "telegram-bot"
   pm2 startup
   pm2 save
   ```

3. **Setup reverse proxy (nginx):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Option 2: Docker Deployment

1. **Build and run with Docker:**
   ```bash
   docker build -t telegram-scheduler-bot .
   docker run -d --name telegram-bot --env-file .env -p 3000:3000 telegram-scheduler-bot
   ```

2. **Or use Docker Compose:**
   ```bash
   docker-compose up -d
   ```

### Option 3: Cloud Platform Deployment

#### Heroku

1. **Install Heroku CLI and login:**
   ```bash
   heroku login
   ```

2. **Create app and deploy:**
   ```bash
   heroku create your-app-name
   heroku config:set TELEGRAM_BOT_TOKEN=your_token
   heroku config:set OPENAI_API_KEY=your_key
   git push heroku main
   ```

3. **Setup database:**
   ```bash
   heroku run npm run setup
   ```

#### Railway

1. **Connect GitHub repo to Railway**
2. **Set environment variables in dashboard**
3. **Deploy automatically on push**

#### Digital Ocean App Platform

1. **Create app from GitHub repo**
2. **Configure environment variables**
3. **Set build and run commands:**
   - Build: `npm ci && npm run setup`
   - Run: `npm start`

## 🔐 Security Configuration

### Environment Variables

Ensure these are set in production:

```env
NODE_ENV=production
WEBHOOK_URL=https://your-domain.com/webhook
PORT=3000

# Security
SESSION_SECRET=your_random_session_secret
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Database
DATABASE_PATH=./data/scheduler.db

# Teacher Configuration
TEACHER_NAME="Your Name"
TEACHER_TIMEZONE=America/New_York
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=18:00
WORKING_DAYS=monday,tuesday,wednesday,thursday,friday
```

### SSL/HTTPS Setup

For production, ensure HTTPS is enabled:

1. **With Let's Encrypt (certbot):**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

2. **With Cloudflare:**
   - Point domain to your server
   - Enable Cloudflare SSL

## 📊 Monitoring & Maintenance

### Health Monitoring

The bot includes health check endpoints:
- `GET /health` - Basic health check
- `GET /api/stats` - System statistics

### Log Management

Logs are written to:
- Console (in development)
- `./logs/app.log` (all logs)
- `./logs/error.log` (errors only)

### Database Backup

```bash
# Backup SQLite database
cp ./data/scheduler.db ./backups/scheduler-$(date +%Y%m%d).db

# Automated backup (add to crontab)
0 2 * * * cd /path/to/bot && cp ./data/scheduler.db ./backups/scheduler-$(date +\%Y\%m\%d).db
```

### Automatic Maintenance

The bot runs automatic maintenance tasks:
- Expired waitlist cleanup
- Lesson reminders
- Calendar synchronization

## 🔄 Webhook vs Polling

### Webhook (Production - Recommended)

```env
NODE_ENV=production
WEBHOOK_URL=https://your-domain.com/webhook
```

Benefits:
- Lower latency
- More efficient
- Better for high-traffic bots

### Polling (Development)

```env
NODE_ENV=development
# WEBHOOK_URL not set
```

Benefits:
- Easier local development
- No need for public domain
- Works behind firewalls

## 🐛 Troubleshooting

### Common Issues

1. **Bot not responding:**
   - Check TELEGRAM_BOT_TOKEN is correct
   - Verify webhook URL is accessible
   - Check logs for errors

2. **AI not working:**
   - Verify OPENAI_API_KEY is valid
   - Check API usage limits
   - Ensure sufficient credits

3. **Calendar sync issues:**
   - Verify Google Calendar credentials
   - Check calendar permissions
   - Ensure calendar ID is correct

4. **Database errors:**
   - Check file permissions on data directory
   - Ensure SQLite is installed
   - Verify disk space

### Log Analysis

```bash
# View recent logs
tail -f logs/app.log

# Search for errors
grep ERROR logs/app.log

# Check bot interactions
grep "bot_interaction" logs/app.log
```

## 📈 Scaling Considerations

### Single Instance
- Good for up to 1000 active students
- Uses SQLite database
- File-based logging

### Multi-Instance
For larger deployments:
- Switch to PostgreSQL/MySQL
- Use Redis for session storage
- Implement centralized logging
- Use load balancer

### Database Migration (SQLite → PostgreSQL)

1. **Install PostgreSQL adapter:**
   ```bash
   npm install pg pg-hstore
   ```

2. **Update database config:**
   ```javascript
   // src/config/database.js
   const sequelize = new Sequelize(process.env.DATABASE_URL, {
     dialect: 'postgres',
     // ... other options
   });
   ```

## 🔄 Updates & Maintenance

### Updating the Bot

```bash
# Backup database
cp ./data/scheduler.db ./backups/

# Pull latest changes
git pull origin main

# Install new dependencies
npm ci --production

# Restart bot
pm2 restart telegram-bot
```

### Database Migrations

```bash
# Run any new migrations
npm run migrate

# Or force sync (development only)
npm run setup -- --force
```

## 📞 Support

If you encounter issues:

1. Check this deployment guide
2. Review the logs
3. Check GitHub issues
4. Contact support

---

**Happy Deploying! 🚀** 