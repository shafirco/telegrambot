const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Check if we have DATABASE_URL (production/Render) or use local SQLite
const databaseUrl = process.env.DATABASE_URL;
let sequelize;

if (databaseUrl) {
  // Production - use DATABASE_URL (PostgreSQL on Render)
  logger.info('Using PostgreSQL database from DATABASE_URL');
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
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
} else {
  // Development - use local SQLite
  logger.info('Using SQLite database for development');
  const dataDir = path.dirname('./data/scheduler.db');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './data/scheduler.db',
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
}

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