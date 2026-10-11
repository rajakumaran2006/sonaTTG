const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://rnlzgirfkqmyvmtyyoqx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubHpnaXJma3FteXZtdHl5b3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MTUwNjYsImV4cCI6MjA3MDM5MTA2Nn0.O189CI_Pl1uA_dPv-p7AdC49p2naXXDNdHG63Hy4h50';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function cleanName(n) {
  if (!n) return '';
  return n.replace(/^(dr\.|mr\.|ms\.|mrs\.|prof\.)\s*/i, '').replace(/[-\.\s]/g, '').toLowerCase();
}

function cleanSubj(n) {
  if (!n) return '';
  return n.toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function updateExcel() {
  console.log('Fetching read-only reference data from Supabase...');
  const [facRes, subjRes, ccRes, assignRes] = await Promise.all([
    supabase.from('faculty_members').select('*'),
    supabase.from('subjects').select('*'),
    supabase.from('class_counselors').select('*, faculty_members(*), departments(*)'),
    supabase.from('faculty_subject_assignments').select('*, faculty_members(*), subjects(*), departments(*)'),
  ]);

  const faculties = facRes.data || [];
  const subjects = subjRes.data || [];
  const counselors = (ccRes.data || []).filter(c => c.is_active);

  console.log(`Loaded ${faculties.length} faculty, ${subjects.length} subjects, ${counselors.length} active counselors.`);

  const facultyMap = new Map();
  faculties.forEach(f => {
    facultyMap.set(cleanName(f.name), f);
    facultyMap.set(f.name.toLowerCase().trim(), f);
  });

  const filePath = 'd:/PROJECTS/sonaTTG/ODD_SEM_BULK_IMPORT.xlsx';
  const wb = XLSX.readFile(filePath);
  const oldRows = XLSX.utils.sheet_to_json(wb.Sheets['Odd Semester Master'], { defval: '' });

  console.log('Original rows count:', oldRows.length);

  // Fallback faculty resolver for rows where faculty was unassigned
  const resolveUnassignedFaculty = (r) => {
    const code = (r['Subject Code'] || '').toUpperCase();
    const name = (r['Subject Name'] || '').toLowerCase();
    const dept = (r['Department'] || '').toLowerCase();
    const sec = (r['Section'] || '').toUpperCase();

    // 1. Soft Skills and Aptitude - I (SS)
    if (name.includes('soft skills')) {
      if (dept.includes('aid')) {
        if (sec === 'A') return 'Mr. M. Mohammed Aslum; Mr. M. Satheeshkumar; New Staff-3';
        if (sec === 'B') return 'Mr. D.S. Mohanram; Dr. C. Shahin Banu; Mr. P. Satish Raj';
        return 'Ms. P. Srudhi; Mrs. T. Keerthana; Dr. K. Vinothini';
      } else {
        if (sec === 'A') return 'Ms. G. Kiruthiga; Dr. T. Sowmya; Mr. M. Prabhu';
        if (sec === 'B') return 'Ms. P. Srudhi; Dr. B. Parvathavardhini; Mr. D.S. Mohanram';
        return 'Mr. M. Mohammed Aslum; Dr. G. Sarathalakshmi; Dr. K. Vinothini';
      }
    }

    // 2. Communication Skills Laboratory
    if (name.includes('communication skills')) {
      if (sec === 'A') return 'Dr. M. Vinoth';
      if (sec === 'B') return 'Dr. B. Parvathavardhini';
      return 'Dr. M. Saraswathy';
    }

    // 3. Applied Probability and Statistics-I
    if (name.includes('probability') || code.includes('MAT301')) {
      if (dept.includes('aid')) {
        if (sec === 'A') return 'Dr. C. Saravanan';
        if (sec === 'B') return 'Dr. V. Mohanraj';
        return 'Dr. B. Kanchanamala';
      } else {
        if (sec === 'A') return 'Dr. K. Kandasamy';
        if (sec === 'B') return 'Dr. S. Gowri';
        return 'Dr. G. Hemanatchatra';
      }
    }

    // 4. Generative AI Lab
    if (name.includes('generative ai lab')) {
      if (sec === 'A') return 'Ms. S.M.C. Subashini; Ms. R. Sangeethapriya';
      if (sec === 'B') return 'New Staff-8; Dr. P. Sakthivel';
      return 'Dr. P. Sakthivel; New Staff-8';
    }

    // 5. Data Engineering Laboratory
    if (name.includes('data engineering labor')) {
      if (sec === 'A') return 'Mr. R. Krishna Prakash';
      if (sec === 'B') return 'Mr. P. Dinesh Kumar';
      return 'Mr. D. Jayaprakash';
    }

    // 6. Deep Learning Laboratory / Lab
    if (name.includes('deep learning lab')) {
      if (sec === 'A') return 'New Staff-6; Ms. Lydia D. Isaac';
      if (sec === 'B') return 'Mr. S. David; New Staff-7';
      return 'New Staff-7; Mr. S. David';
    }

    // 7. Cloud Computing Laboratory / Lab
    if (name.includes('cloud computing lab')) {
      if (sec === 'A') return 'Dr. C. Santhosh Kumar';
      if (sec === 'B') return 'Mr. M. Murali';
      return 'Mr. A. S. Syed Fiaz';
    }

    // 8. Mini Project
    if (name.includes('mini project')) {
      if (dept.includes('aid')) {
        if (sec === 'A') return 'Dr. P. Ilanchezhian';
        if (sec === 'B') return 'Dr. Y. Suresh';
        return 'Dr. J. Jeba Emilyn';
      } else {
        return 'Dr. P. Shanmugaraja';
      }
    }

    // 9. Open Electives
    if (code === 'U23BM1004' || name.includes('hospital')) return 'Dr. J. Senthilkumar';
    if (code === 'U23BM1007' || name.includes('medicare')) return 'Dr. J. E. Madhushree';
    if (code === 'U23CE1010' || name.includes('building services')) return 'Mr. C. Mohankumar';
    if (code === 'U23CE1011' || name.includes('disaster')) return 'Mr. N. Vetriselvan';
    if (code === 'U23EC1009' || name.includes('sensors and smart')) return 'Mr. K. Karthick';
    if (code === 'U23EC1010' || name.includes('mobile technology')) return 'Mr. A. Naveen Kumar';
    if (code === 'U23EE1013' || name.includes('energy conservation')) return 'Mr. R. Balaji';
    if (code === 'U23EE1021' || name.includes('innovation, ipr')) return 'Ms. K. Saranya';

    return 'Dr. P. Shanmugaraja';
  };

  const newRows = [];

  for (let i = 0; i < oldRows.length; i++) {
    const r = oldRows[i];

    // 1. Department, Year, Semester, Section
    const dept = r['Department'];
    const yr = r['Year'];
    const sem = r['Semester'];
    const sec = r['Section'];

    // 2. Subject Name, Abbr, Type
    const subName = r['Subject Name'];
    const abbr = r['Abbreviation'];
    const type = r['Type'];

    // 3. Subject Code
    let code = r['Subject Code'] ? String(r['Subject Code']).trim() : '';
    if (!code) {
      let subMatch = subjects.find(s => cleanSubj(s.name) === cleanSubj(subName));
      if (!subMatch) subMatch = subjects.find(s => cleanSubj(s.name).includes(cleanSubj(subName)) || cleanSubj(subName).includes(cleanSubj(s.name)));
      if (subMatch && subMatch.code) {
        code = subMatch.code;
      } else if (subName.toLowerCase().includes('nptel')) {
        code = 'noc26-cs***';
      } else if (subName.toLowerCase().includes('mini project')) {
        code = (dept || '').toLowerCase().includes('it') ? 'U23IT705' : 'U23ADS705';
      } else if (subName.toLowerCase().includes('soft skills')) {
        code = 'U23GE301';
      }
    }

    // 4. Hours Per Week
    let hours = r['Hours Per Week'] !== undefined && r['Hours Per Week'] !== null && String(r['Hours Per Week']).trim() !== ''
      ? r['Hours Per Week']
      : '';
    if (hours === '') {
      let subMatch = subjects.find(s => s.code && code && s.code.trim().toLowerCase() === code.trim().toLowerCase());
      if (!subMatch) subMatch = subjects.find(s => cleanSubj(s.name) === cleanSubj(subName));
      if (subMatch && subMatch.hours_per_week) {
        hours = subMatch.hours_per_week;
      } else {
        if (type === 'lab') hours = 2;
        else if (type === 'theory') hours = 4;
        else if (type === 'project') hours = 2;
        else hours = 3;
      }
    }

    // 5. Credits
    let credits = r['Credits'] !== undefined && r['Credits'] !== null && String(r['Credits']).trim() !== ''
      ? r['Credits']
      : '';
    if (credits === '') {
      let subMatch = subjects.find(s => s.code && code && s.code.trim().toLowerCase() === code.trim().toLowerCase());
      if (!subMatch) subMatch = subjects.find(s => cleanSubj(s.name) === cleanSubj(subName));
      if (subMatch && subMatch.credits) {
        credits = subMatch.credits;
      } else {
        if (type === 'lab') credits = 2;
        else if (type === 'theory') credits = 3;
        else if (type === 'elective' || type === 'open elective') credits = 3;
        else if (type === 'project') credits = 3;
        else credits = 3;
      }
    }

    // 6. Faculty Name (Keep original if provided; if empty, fill via fallback)
    let facName = r['Faculty Name'] ? String(r['Faculty Name']).trim() : '';
    if (!facName) {
      facName = resolveUnassignedFaculty({ ...r, 'Subject Code': code });
    }

    // 7. Faculty Email & Designation
    let facEmail = r['Faculty Email'] ? String(r['Faculty Email']).trim() : '';
    let desig = r['Designation'] ? String(r['Designation']).trim() : '';
    let isCC = '';

    if (facName) {
      const parts = facName.split(';').map(s => s.trim()).filter(Boolean);
      const emailList = [];
      const desigList = [];

      parts.forEach(p => {
        const f = facultyMap.get(cleanName(p)) || facultyMap.get(p.toLowerCase().trim());
        if (f) {
          emailList.push(f.email || '');
          desigList.push(f.designation || 'Assistant Professor');
        } else {
          emailList.push('');
          desigList.push('Assistant Professor');
        }

        // Check if class counselor
        const matchCC = counselors.find(c => {
          const cDept = (c.departments?.name || '').toLowerCase();
          const rDept = (dept || '').toLowerCase();
          const deptMatch = (rDept.includes('aid') && cDept.includes('aid')) || (rDept.includes('it') && cDept.includes('it'));
          const yrMatch = (c.year || '').toUpperCase() === (yr || '').toUpperCase();
          const secMatch = (c.section || '').toUpperCase() === (sec || '').toUpperCase();
          const facMatch = cleanName(c.faculty_members?.name) === cleanName(p);
          return deptMatch && yrMatch && secMatch && facMatch;
        });
        if (matchCC) {
          isCC = 'Yes';
        }
      });

      if (!facEmail && emailList.filter(Boolean).length > 0) {
        facEmail = emailList.join('; ');
      }
      if (!desig && desigList.filter(Boolean).length > 0) {
        desig = desigList.join('; ');
      }
    }

    newRows.push({
      'Department': dept,
      'Year': yr,
      'Semester': sem,
      'Section': sec,
      'Subject Code': code,
      'Subject Name': subName,
      'Abbreviation': abbr,
      'Type': type,
      'Hours Per Week': hours,
      'Credits': credits,
      'Faculty Name': facName,
      'Faculty Email': facEmail,
      'Designation': desig,
      'Class Counsellor': isCC,
    });
  }

  // Create new Workbook
  const newWb = XLSX.utils.book_new();

  // Sheet 1: Odd Semester Master
  const newWs = XLSX.utils.json_to_sheet(newRows);
  newWs['!cols'] = [
    { wch: 24 }, // Department
    { wch: 8 },  // Year
    { wch: 10 }, // Semester
    { wch: 8 },  // Section
    { wch: 18 }, // Subject Code
    { wch: 45 }, // Subject Name
    { wch: 14 }, // Abbreviation
    { wch: 15 }, // Type
    { wch: 16 }, // Hours Per Week
    { wch: 8 },  // Credits
    { wch: 42 }, // Faculty Name
    { wch: 55 }, // Faculty Email
    { wch: 42 }, // Designation
    { wch: 18 }, // Class Counsellor
  ];
  XLSX.utils.book_append_sheet(newWb, newWs, 'Odd Semester Master');

  // Sheet 2: Column Guide
  const guideRows = [
    { 'Column Name': 'Department', 'Required': 'Yes', 'Description': 'Department name or acronym (e.g., AIDS, Information Technology)' },
    { 'Column Name': 'Year', 'Required': 'Yes', 'Description': 'Academic Year: II, III, IV, or I' },
    { 'Column Name': 'Semester', 'Required': 'Optional', 'Description': 'Semester designation (e.g., Sem III, Sem V, Sem VII)' },
    { 'Column Name': 'Section', 'Required': 'Optional', 'Description': 'Section name (e.g., A, B, C). Defaults to A' },
    { 'Column Name': 'Subject Code', 'Required': 'Yes', 'Description': 'Unique course code (e.g., U23IT301, U23ADS301)' },
    { 'Column Name': 'Subject Name', 'Required': 'Yes', 'Description': 'Full title of the course / subject' },
    { 'Column Name': 'Abbreviation', 'Required': 'Optional', 'Description': 'Short display code (e.g., DS, ML, DAA)' },
    { 'Column Name': 'Type', 'Required': 'Optional', 'Description': 'theory, lab, elective, open elective, or project' },
    { 'Column Name': 'Hours Per Week', 'Required': 'Yes', 'Description': 'Weekly teaching periods allocated (e.g., 4 or 5)' },
    { 'Column Name': 'Credits', 'Required': 'Optional', 'Description': 'Academic syllabus credits (e.g., 3, 4, 2)' },
    { 'Column Name': 'Faculty Name', 'Required': 'Yes', 'Description': 'Faculty in-charge. If 2 or more staff members co-teach, separate names with semicolon (e.g., Dr. A; Mr. B)' },
    { 'Column Name': 'Faculty Email', 'Required': 'Yes', 'Description': 'Official faculty email. If 2 or more staff members, separate with semicolon (e.g., a@sonatech.ac.in; b@sonatech.ac.in)' },
    { 'Column Name': 'Designation', 'Required': 'Yes', 'Description': 'Academic designation (e.g., Assistant Professor, Associate Professor). If 2 or more staff members, separate with semicolon' },
    { 'Column Name': 'Class Counsellor', 'Required': 'Optional', 'Description': 'Mark Yes if this faculty is the designated Class Counsellor for this section, else leave empty' },
  ];
  const guideWs = XLSX.utils.json_to_sheet(guideRows);
  guideWs['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(newWb, guideWs, 'Column Guide');

  // Write file
  XLSX.writeFile(newWb, filePath);
  console.log('Successfully updated', filePath);
}

updateExcel().catch(err => {
  console.error('Error updating excel:', err);
  process.exit(1);
});
