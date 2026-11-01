const { generateAllTimetablesGlobal } = require('../src/lib/optimizer/optimizerIntegration.ts');
const { getDepartments, getDepartmentByName, getAcademicYears, getSectionsForYear } = require('../src/lib/supabaseService.ts');

async function checkFacultyWorkload() {
  const aids = await getDepartmentByName('AIDS');
  const it = await getDepartmentByName('IT');
  const years = ['II', 'III', 'IV'];
  const sections = ['A', 'B', 'C'];
  const classesToGenerate = [];

  for (const year of years) {
    for (const section of sections) {
      classesToGenerate.push({
        departmentId: aids.id,
        departmentName: 'AIDS',
        year,
        section,
      });
      classesToGenerate.push({
        departmentId: it.id,
        departmentName: 'IT',
        year,
        section,
      });
    }
  }

  const result = await generateAllTimetablesGlobal({
    classesToGenerate,
    semesterType: 'odd',
  });

  const facultyDayHours = new Map(); // facultyName -> [d0..d5]
  const facultySlots = new Map(); // facultyName -> Set('d:p')

  for (const [classKey, tt] of result.timetables.entries()) {
    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < 7; p++) {
        const cell = tt.grid[d][p];
        if (cell && cell.facultyName && cell.facultyName.trim() !== '') {
          const fn = cell.facultyName.trim();
          if (!facultyDayHours.has(fn)) {
            facultyDayHours.set(fn, [0, 0, 0, 0, 0, 0]);
            facultySlots.set(fn, new Set());
          }
          const slotKey = `${d}:${p}`;
          if (!facultySlots.get(fn).has(slotKey)) {
            facultySlots.get(fn).add(slotKey);
            facultyDayHours.get(fn)[d]++;
          }
        }
      }
    }
  }

  console.log('\n--- FACULTY DAILY WORKLOAD & FREE HOURS REPORT ---');
  let maxTeachingDay = 0;
  let over4Count = 0;
  let over5Count = 0;

  for (const [fn, days] of facultyDayHours.entries()) {
    const totalWeekly = days.reduce((a, b) => a + b, 0);
    const maxDay = Math.max(...days);
    if (maxDay > maxTeachingDay) maxTeachingDay = maxDay;
    const over4 = days.filter(h => h > 4).length;
    const over5 = days.filter(h => h > 5).length;
    if (over4 > 0) over4Count++;
    if (over5 > 0) over5Count++;

    const freeHours = days.map(h => 7 - h);
    console.log(`${fn.padEnd(30)} | Weekly: ${String(totalWeekly).padStart(2)} | Daily: [${days.join(', ')}] | Free: [${freeHours.join(', ')}]`);
  }

  console.log('\nSummary:');
  console.log(`Max teaching hours in a single day: ${maxTeachingDay}`);
  console.log(`Faculties with > 4 teaching hours on any day: ${over4Count}`);
  console.log(`Faculties with > 5 teaching hours on any day: ${over5Count}`);
}

checkFacultyWorkload().catch(console.error);
