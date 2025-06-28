#!/usr/bin/env node

require('dotenv').config();
const { sequelize } = require('../src/models');
const logger = require('../src/utils/logger');

async function migrateDatabase() {
  try {
    logger.info('Starting database migration...');

    // Check if payment_debt column exists
    const studentTableInfo = await sequelize.getQueryInterface().describeTable('Student');
    
    if (!studentTableInfo.payment_debt) {
      logger.info('Adding payment_debt column to Student table...');
      await sequelize.getQueryInterface().addColumn('Student', 'payment_debt', {
        type: sequelize.Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      });
      logger.info('payment_debt column added successfully');
    } else {
      logger.info('payment_debt column already exists');
    }

    if (!studentTableInfo.currency) {
      logger.info('Adding currency column to Student table...');
      await sequelize.getQueryInterface().addColumn('Student', 'currency', {
        type: sequelize.Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'ILS'
      });
      logger.info('currency column added successfully');
    } else {
      logger.info('currency column already exists');
    }

    logger.info('Database migration completed successfully');

  } catch (error) {
    logger.error('Database migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      console.log('✅ Database migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateDatabase }; 