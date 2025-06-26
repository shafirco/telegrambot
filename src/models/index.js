const sequelize = require('../config/database');
const Student = require('./Student');
const Lesson = require('./Lesson');
const Waitlist = require('./Waitlist');
const TeacherAvailability = require('./TeacherAvailability');
const NotificationLog = require('./NotificationLog');

// Define model associations
const initializeAssociations = () => {
  // Student associations
  Student.hasMany(Lesson, { 
    foreignKey: 'student_id', 
    as: 'lessons',
    onDelete: 'CASCADE'
  });
  
  Student.hasMany(Waitlist, { 
    foreignKey: 'student_id', 
    as: 'waitlistEntries',
    onDelete: 'CASCADE'
  });
  
  Student.hasMany(NotificationLog, { 
    foreignKey: 'student_id', 
    as: 'notifications',
    onDelete: 'CASCADE'
  });

  // Lesson associations
  Lesson.belongsTo(Student, { 
    foreignKey: 'student_id', 
    as: 'student'
  });

  // Waitlist associations
  Waitlist.belongsTo(Student, { 
    foreignKey: 'student_id', 
    as: 'student'
  });

  // NotificationLog associations
  NotificationLog.belongsTo(Student, { 
    foreignKey: 'student_id', 
    as: 'student'
  });
  
  NotificationLog.belongsTo(Lesson, { 
    foreignKey: 'lesson_id', 
    as: 'lesson'
  });
};

// Initialize all associations
initializeAssociations();

// Sync database (create tables if they don't exist)
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('Database synchronized successfully');
  } catch (error) {
    console.error('Error synchronizing database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  Student,
  Lesson,
  Waitlist,
  TeacherAvailability,
  NotificationLog,
  syncDatabase,
  initializeAssociations
}; 