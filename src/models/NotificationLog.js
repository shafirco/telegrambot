const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NotificationLog = sequelize.define('NotificationLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Foreign keys
  student_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Student',
      key: 'id'
    }
  },
  
  lesson_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Lesson',
      key: 'id'
    }
  },
  
  // Notification details
  notification_type: {
    type: DataTypes.ENUM(
      'lesson_reminder',
      'lesson_confirmation', 
      'lesson_cancellation',
      'lesson_rescheduled',
      'waitlist_position_update',
      'waitlist_slot_available',
      'booking_confirmation',
      'payment_reminder',
      'system_announcement',
      'welcome_message'
    ),
    allowNull: false,
    index: true
  },
  
  // Message content
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  
  // Delivery details
  delivery_method: {
    type: DataTypes.ENUM('telegram', 'email', 'sms', 'push'),
    allowNull: false,
    defaultValue: 'telegram'
  },
  
  delivery_status: {
    type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed', 'retrying'),
    allowNull: false,
    defaultValue: 'pending',
    index: true
  },
  
  // Timing
  scheduled_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  delivered_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Response tracking
  read_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  responded_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  response_action: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Error handling
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  retry_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  max_retries: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3
  },
  
  // Priority and urgency
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    allowNull: false,
    defaultValue: 'normal'
  },
  
  // Telegram specific data
  telegram_message_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  
  telegram_chat_id: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  
  // Template and personalization
  template_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  template_variables: {
    type: DataTypes.JSON,
    allowNull: true
  },
  
  language: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'en'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  
  // Tracking tags
  tags: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  indexes: [
    {
      fields: ['student_id']
    },
    {
      fields: ['lesson_id']
    },
    {
      fields: ['notification_type']
    },
    {
      fields: ['delivery_status']
    },
    {
      fields: ['scheduled_at']
    },
    {
      fields: ['sent_at']
    },
    {
      fields: ['priority']
    },
    {
      name: 'pending_notifications',
      fields: ['delivery_status', 'scheduled_at'],
      where: {
        delivery_status: 'pending'
      }
    },
    {
      name: 'failed_notifications',
      fields: ['delivery_status', 'retry_count', 'max_retries'],
      where: {
        delivery_status: 'failed'
      }
    }
  ]
});

// Instance methods
NotificationLog.prototype.canRetry = function() {
  return this.delivery_status === 'failed' && this.retry_count < this.max_retries;
};

NotificationLog.prototype.markSent = async function(messageId = null) {
  this.delivery_status = 'sent';
  this.sent_at = new Date();
  if (messageId) {
    this.telegram_message_id = messageId;
  }
  await this.save();
};

NotificationLog.prototype.markDelivered = async function() {
  this.delivery_status = 'delivered';
  this.delivered_at = new Date();
  await this.save();
};

NotificationLog.prototype.markFailed = async function(errorMessage) {
  this.delivery_status = 'failed';
  this.error_message = errorMessage;
  this.retry_count += 1;
  await this.save();
};

NotificationLog.prototype.markRead = async function() {
  this.read_at = new Date();
  await this.save();
};

NotificationLog.prototype.markResponded = async function(action) {
  this.responded_at = new Date();
  this.response_action = action;
  await this.save();
};

NotificationLog.prototype.scheduleRetry = async function(delayMinutes = 5) {
  this.delivery_status = 'retrying';
  this.scheduled_at = new Date(Date.now() + delayMinutes * 60 * 1000);
  await this.save();
};

NotificationLog.prototype.isOverdue = function() {
  return this.scheduled_at < new Date() && ['pending', 'retrying'].includes(this.delivery_status);
};

// Class methods
NotificationLog.findPendingNotifications = async function(limit = 100) {
  return await this.findAll({
    where: {
      delivery_status: ['pending', 'retrying'],
      scheduled_at: {
        [sequelize.Sequelize.Op.lte]: new Date()
      }
    },
    order: [['priority', 'DESC'], ['scheduled_at', 'ASC']],
    limit
  });
};

NotificationLog.findByStudent = async function(studentId, limit = 50) {
  return await this.findAll({
    where: { student_id: studentId },
    order: [['created_at', 'DESC']],
    limit
  });
};

NotificationLog.findByLesson = async function(lessonId) {
  return await this.findAll({
    where: { lesson_id: lessonId },
    order: [['created_at', 'ASC']]
  });
};

NotificationLog.findFailedNotifications = async function() {
  return await this.findAll({
    where: {
      delivery_status: 'failed',
      retry_count: {
        [sequelize.Sequelize.Op.lt]: sequelize.col('max_retries')
      }
    },
    order: [['retry_count', 'ASC'], ['created_at', 'ASC']]
  });
};

NotificationLog.getDeliveryStats = async function(startDate = null, endDate = null) {
  const whereClause = {};
  
  if (startDate && endDate) {
    whereClause.created_at = {
      [sequelize.Sequelize.Op.between]: [startDate, endDate]
    };
  }
  
  const [total, sent, delivered, failed] = await Promise.all([
    this.count({ where: whereClause }),
    this.count({ where: { ...whereClause, delivery_status: 'sent' } }),
    this.count({ where: { ...whereClause, delivery_status: 'delivered' } }),
    this.count({ where: { ...whereClause, delivery_status: 'failed' } })
  ]);
  
  return {
    total,
    sent,
    delivered,
    failed,
    deliveryRate: total > 0 ? ((sent + delivered) / total * 100).toFixed(2) : 0,
    failureRate: total > 0 ? (failed / total * 100).toFixed(2) : 0
  };
};

NotificationLog.createNotification = async function(studentId, type, title, message, options = {}) {
  return await this.create({
    student_id: studentId,
    notification_type: type,
    title,
    message,
    lesson_id: options.lessonId || null,
    delivery_method: options.deliveryMethod || 'telegram',
    priority: options.priority || 'normal',
    scheduled_at: options.scheduledAt || new Date(),
    telegram_chat_id: options.telegramChatId || null,
    template_name: options.templateName || null,
    template_variables: options.templateVariables || null,
    language: options.language || 'en',
    metadata: options.metadata || null,
    tags: options.tags || null
  });
};

NotificationLog.cleanupOldNotifications = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const deletedCount = await this.destroy({
    where: {
      created_at: {
        [sequelize.Sequelize.Op.lt]: cutoffDate
      },
      delivery_status: ['delivered', 'failed']
    }
  });
  
  return deletedCount;
};

module.exports = NotificationLog; 