const moment = require('moment-timezone');
const { Lesson, Student } = require('./src/models');
const settings = require('./src/config/settings');
const schedulerService = require('./src/services/scheduler');

async function testScheduling() {
  console.log('🔍 Testing scheduling system...\n');

  // Test 1: Check business hours configuration
  console.log('📅 Business Hours Configuration:');
  console.log(`Start: ${settings.businessHours.start}`);
  console.log(`End: ${settings.businessHours.end}`);
  console.log(`Timezone: ${settings.teacher.timezone}\n`);

  // Test 2: Check current time in correct timezone  
  const now = moment().tz(settings.teacher.timezone);
  console.log(`🕐 Current time in teacher timezone: ${now.format('YYYY-MM-DD HH:mm:ss')}\n`);

  // Test 3: Check available slots for tomorrow
  const tomorrow = moment().tz(settings.teacher.timezone).add(1, 'day').format('YYYY-MM-DD');
  console.log(`🔍 Checking available slots for ${tomorrow}...`);
  
  try {
    const slots = await schedulerService.findAvailableSlots({ date: tomorrow }, 60);
    console.log(`Found ${slots.length} available slots:`);
    
    slots.slice(0, 5).forEach((slot, index) => {
      const slotTime = moment(slot.start).tz(settings.teacher.timezone);
      console.log(`${index + 1}. ${slotTime.format('YYYY-MM-DD HH:mm')} (${slot.duration}min)`);
    });
  } catch (error) {
    console.log(`❌ Error finding slots: ${error.message}`);
  }

  console.log('\n');

  // Test 4: Check lessons in database
  console.log('📚 Checking lessons in database...');
  try {
    const allLessons = await Lesson.findAll({
      order: [['start_time', 'DESC']],
      limit: 10
    });
    
    console.log(`Found ${allLessons.length} lessons in database:`);
    allLessons.forEach((lesson, index) => {
      const lessonTime = moment(lesson.start_time).tz(settings.teacher.timezone);
      console.log(`${index + 1}. Student ${lesson.student_id}: ${lessonTime.format('YYYY-MM-DD HH:mm')} - ${lesson.status}`);
    });
  } catch (error) {
    console.log(`❌ Error querying lessons: ${error.message}`);
  }

  console.log('\n');

  // Test 5: Check students in database
  console.log('👥 Checking students in database...');
  try {
    const allStudents = await Student.findAll({
      limit: 5
    });
    
    console.log(`Found ${allStudents.length} students in database:`);
    allStudents.forEach((student, index) => {
      console.log(`${index + 1}. ${student.getDisplayName()} (ID: ${student.id}) - Lessons: ${student.total_lessons_booked}`);
    });
  } catch (error) {
    console.log(`❌ Error querying students: ${error.message}`);
  }

  console.log('\n✅ Debug test completed!');
  process.exit(0);
}

// Run the test
testScheduling().catch(console.error); 