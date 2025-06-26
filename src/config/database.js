const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Ensure data directory exists
const dataDir = path.dirname(process.env.DATABASE_PATH || './data/scheduler.db');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DATABASE_PATH || './data/scheduler.db',
  logging: (msg) => logger.debug(msg),
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Test the connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection has been established successfully.');
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    throw error;
  }
}

module.exports = sequelize; 