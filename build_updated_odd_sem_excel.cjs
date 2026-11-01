const fs = require('fs');
const XLSX = require('xlsx');

// 1. Faculty Directory for reliable email & designation lookup
const facultyDirectory = {
  'Dr. P. Shanmugaraja': { email: 'pshanmugaraja@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. J. Akilandeswari': { email: 'jakilandeswari@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. J. L. Aldo Stalin': { email: 'jlaldostalin@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. K. Karthick': { email: 'kkarthick@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. K. Thangaraj': { email: 'kthangaraj@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. K. Hemalatha': { email: 'khemalatha@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. A. S. Syed Fiaz': { email: 'assyedfiaz@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. P. Iyyanar': { email: 'piyyanar@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. Y. Suresh': { email: 'ysuresh@sonatech.ac.in', desig: 'Professor' },
  'Mr. D. Jayaprakash': { email: 'djayaprakash@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. M. Janani': { email: 'mjanani@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. J. Jeba Emilyn': { email: 'jjebaemilyn@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. S. M. C. Subashini': { email: 'smcsubashini@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. S.M.C. Subashini': { email: 'smcsubashini@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. A. Vaishnavi Dali': { email: 'avaishnavidali@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. P. Kruthika': { email: 'pkruthika@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. J. Deepika': { email: 'jdeepika@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. J. Gokulraj': { email: 'jgokulraj@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. P. Satish Raj': { email: 'psatishraj@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. D. S. Mohanram': { email: 'dsmohanram@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. D.S. Mohanram': { email: 'dsmohanram@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. G. Hemanatchatra': { email: 'ghemanatchatra@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. C. Mohankumar': { email: 'cmohankumar@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. P. Srudhi': { email: 'psrudhi@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Staff - 1': { email: 'newstaff-1@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Staff - 2': { email: 'newstaff-2@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Staff - 3': { email: 'newstaff-3@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Staff - 4': { email: 'newstaff-4@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Staff - 6': { email: 'newstaff-6@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Staff - 7': { email: 'newstaff-7@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Staff - 8': { email: 'newstaff-8@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. K. Gokula Saranya': { email: 'kgokulasaranya@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. G. Kiruthiga': { email: 'gkiruthiga@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. A. Naveen Kumar': { email: 'anaveenkumar@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. Lydia D. Isaac': { email: 'lydiadisaac@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. C. Santhosh Kumar': { email: 'csanthoshkumar@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. M. Murali': { email: 'mmurali@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. S. David': { email: 'sdavid@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. N. Selvanathan': { email: 'nselvanathan@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. A. Velusamy': { email: 'avelusamy@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. P. Ilanchezhian': { email: 'pilanchezhian@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. P. Sakthivel': { email: 'psakthivel@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. R. Sangeethapriya': { email: 'rsangeethapriya@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. R. Krishna Prakash': { email: 'rkrishnaprakash@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. P. Dinesh Kumar': { email: 'pdineshkumar@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. D. Komalavalli': { email: 'dkomalavalli@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. V. Mohanraj': { email: 'vmohanraj@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. P. Abinaya': { email: 'pabinaya@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. B. Mohanraj': { email: 'bmohanraj@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. M. Parameswari': { email: 'mparameswari@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. L. Sindhu': { email: 'lsindhu@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. R. Nivedha': { email: 'rnivedha@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. S. Vasanthi': { email: 'svasanthi@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. J. Senthilkumar': { email: 'jsenthilkumar@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. D. Sharmiladevi': { email: 'dsharmiladevi@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Faculty 5': { email: 'newfaculty-5@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Faculty 6': { email: 'newfaculty-6@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. K. Kandasamy': { email: 'kkandasamy@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. J. E. Madhushree': { email: 'jemadhushree@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. M. Vinoth': { email: 'mvinoth@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. M. Prabhu': { email: 'mprabhu@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. T. Sowmya': { email: 'tsowmya@sonatech.ac.in', desig: 'Associate Professor' },
  'Mr. N. Vetriselvan': { email: 'nvetriselvan@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. G. S. Sivagurnathan': { email: 'gssivagurnathan@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. S. Indira': { email: 'sindira@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. B. Parvathavardhini': { email: 'bparvathavardhini@sonatech.ac.in', desig: 'Associate Professor' },
  'Dr. S. Gowri': { email: 'sgowri@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. M. Saraswathy': { email: 'msaraswathy@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. M. Mohammed Aslum': { email: 'mmohammedaslum@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. R. Banupriya': { email: 'rbanupriya@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. G. Sarathalakshmi': { email: 'gsarathalakshmi@sonatech.ac.in', desig: 'Associate Professor' },
  'Dr. C. Saravanan': { email: 'csaravanan@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. K. Saranya': { email: 'ksaranya@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. M. Satheeshkumar': { email: 'msatheeshkumar@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. C. Shahin Banu': { email: 'cshahinbanu@sonatech.ac.in', desig: 'Associate Professor' },
  'Dr. B. Kanchanamala': { email: 'bkanchanamala@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mrs. T. Keerthana': { email: 'tkeerthana@sonatech.ac.in', desig: 'Assistant Professor' },
  'Dr. K. Vinothini': { email: 'kvinothini@sonatech.ac.in', desig: 'Assistant Professor' },
  'Mr. R. Balaji': { email: 'rbalaji@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. M. Sasikala': { email: 'msasikala@sonatech.ac.in', desig: 'Assistant Professor' },
  'Ms. C. Anusuya': { email: 'canusuya@sonatech.ac.in', desig: 'Assistant Professor' },
  'New Faculty 2': { email: 'newfaculty-2@sonatech.ac.in', desig: 'Assistant Professor' },
};

function formatFaculty(facultyStr) {
  if (!facultyStr) return { names: '', emails: '', desigs: '' };
  const parts = facultyStr.split(';').map(s => s.trim()).filter(Boolean);
  const emails = [];
  const desigs = [];
  for (const p of parts) {
    const info = facultyDirectory[p];
    if (info) {
      emails.push(info.email);
      desigs.push(info.desig);
    } else {
      // Fallback
      const slug = p.toLowerCase().replace(/[^a-z0-9]/g, '');
      emails.push(`${slug}@sonatech.ac.in`);
      desigs.push('Assistant Professor');
    }
  }
  return {
    names: parts.join('; '),
    emails: emails.join('; '),
    desigs: desigs.join('; ')
  };
}

function makeRow(dept, year, sem, sec, code, name, abbr, type, hrs, credits, staffStr, isCC) {
  const f = formatFaculty(staffStr);
  return {
    'Department': dept,
    'Year': year,
    'Semester': sem,
    'Section': sec,
    'Subject Code': code,
    'Subject Name': name,
    'Abbreviation': abbr,
    'Type': type,
    'Hours Per Week': Number(hrs),
    'Credits': Number(credits),
    'Faculty Name': f.names,
    'Faculty Email': f.emails,
    'Designation': f.desigs,
    'Class Counsellor': isCC ? 'Yes' : ''
  };
}

// Open electives list for Year IV (Abbreviation is always 'OE' as in the timetable PDF)
function getOpenElectives(dept, year, sem, sec) {
  return [
    makeRow(dept, year, sem, sec, 'U23BM1004', 'Open Elective: Hospital Management', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23BM1007', 'Home Medicare Technology', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23CE1010', 'Building Services and Safety Regulations', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23CE1011', 'Disaster Management', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23EC1009', 'Sensors And Smart Structures Technologies', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23EC1010', 'Mobile Technology and Its Applications', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23EC1011', 'CMOS VLSI Design', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23EE1013', 'Energy Conservation and Auditing', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23EE1021', 'Innovation, IPR and Entrepreneurship Development', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23FT1001', 'Fundamentals of Fashion Design', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23MC1008', 'Fundamentals of Robotics', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23MC1009', 'Smart Automation', 'OE', 'open elective', 5, 3, '', false),
    makeRow(dept, year, sem, sec, 'U23ME1007', 'Renewable Energy Sources', 'OE', 'open elective', 5, 3, '', false),
  ];
}

const allRows = [];

// ==========================================
// 1. IT IV A (CC: Mr. A. Naveen Kumar)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23GE701', 'Professional Ethics and Human Values', 'PE', 'theory', 4, 3, 'Mr. A. Naveen Kumar', true),
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23IT701', 'Deep Learning', 'DL', 'theory', 4, 3, 'Ms. Lydia D. Isaac', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23IT702', 'Cloud Computing', 'CC', 'theory', 4, 3, 'Dr. C. Santhosh Kumar', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23IT964', 'Elective - Human Computer Interaction', 'HCI', 'elective', 3, 3, 'Mr. M. Murali', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23IT976', 'Elective - Total Quality Management', 'TQM', 'elective', 4, 3, 'New Staff - 8', false),
  ...getOpenElectives('Information Technology', 'IV', 'Sem VII', 'A'),
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23IT703', 'Deep Learning Laboratory', 'DL LAB', 'lab', 4, 2, 'Ms. Lydia D. Isaac; New Staff - 6', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23IT704', 'Cloud Computing Laboratory', 'CC LAB', 'lab', 2, 1, 'Dr. C. Santhosh Kumar', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23IT964', 'Elective - Human Computer Interaction Laboratory', 'HCI LAB', 'lab', 1, 1, 'Mr. M. Murali', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'A', 'U23IT705', 'Mini Project', 'MINI PROJ', 'project', 2, 1, 'Dr. P. Shanmugaraja', false)
);

// ==========================================
// 2. IT IV B (CC: Dr. C. Santhosh Kumar)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23GE701', 'Professional Ethics and Human Values', 'PE', 'theory', 4, 3, 'Dr. C. Santhosh Kumar', true),
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23IT701', 'Deep Learning', 'DL', 'theory', 4, 3, 'Mr. S. David', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23IT702', 'Cloud Computing', 'CC', 'theory', 4, 3, 'Mr. M. Murali', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23IT964', 'Elective - Human Computer Interaction', 'HCI', 'elective', 3, 3, 'New Staff - 7', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23IT976', 'Elective - Total Quality Management', 'TQM', 'elective', 4, 3, 'Ms. M. Sasikala', false),
  ...getOpenElectives('Information Technology', 'IV', 'Sem VII', 'B'),
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23IT703', 'Deep Learning Laboratory', 'DL LAB', 'lab', 4, 2, 'Mr. S. David; New Staff - 7', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23IT704', 'Cloud Computing Laboratory', 'CC LAB', 'lab', 2, 1, 'Mr. M. Murali', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23IT964', 'Elective - Human Computer Interaction Laboratory', 'HCI LAB', 'lab', 1, 1, 'New Staff - 7', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'B', 'U23IT705', 'Mini Project', 'MINI PROJ', 'project', 2, 1, 'Dr. P. Shanmugaraja', false)
);

// ==========================================
// 3. IT IV C (CC: Mr. A. Velusamy)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23GE701', 'Professional Ethics and Human Values', 'PE', 'theory', 4, 3, 'Mr. N. Selvanathan', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23IT701', 'Deep Learning', 'DL', 'theory', 4, 3, 'Mr. S. David', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23IT702', 'Cloud Computing', 'CC', 'theory', 4, 3, 'Mr. A. S. Syed Fiaz', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23IT964', 'Elective - Human Computer Interaction', 'HCI', 'elective', 3, 3, 'Mr. A. Velusamy', true),
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23IT976', 'Elective - Total Quality Management', 'TQM', 'elective', 4, 3, 'Ms. A. Vaishnavi Dali', false),
  ...getOpenElectives('Information Technology', 'IV', 'Sem VII', 'C'),
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23IT703', 'Deep Learning Laboratory', 'DL LAB', 'lab', 4, 2, 'Mr. S. David; New Staff - 7', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23IT704', 'Cloud Computing Laboratory', 'CC LAB', 'lab', 2, 1, 'Mr. A. S. Syed Fiaz', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23IT964', 'Elective - Human Computer Interaction Laboratory', 'HCI LAB', 'lab', 1, 1, 'Mr. A. Velusamy', false),
  makeRow('Information Technology', 'IV', 'Sem VII', 'C', 'U23IT705', 'Mini Project', 'MINI PROJ', 'project', 2, 1, 'Dr. P. Ilanchezhian', false)
);

// ==========================================
// 4. IT III A (CC: Ms. K. Hemalatha)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT501', 'Computer Networks', 'CN', 'theory', 4, 3, 'Dr. P. Shanmugaraja', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT502', 'Database Management Systems', 'DBMS', 'theory', 4, 3, 'Dr. J. Akilandeswari; Mr. J. L. Aldo Stalin', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT503', 'Theory of Computation', 'TOC', 'theory', 5, 4, 'Mr. J. L. Aldo Stalin', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'noc26-cs***', 'Elective- NPTEL Internet of Things', 'NPTEL (IOT)', 'elective', 3, 3, 'Dr. K. Thangaraj', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT940', 'Elective - Business Intelligence', 'BI', 'elective', 4, 3, 'Ms. K. Hemalatha; Mr. A. S. Syed Fiaz', true),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT975', 'Elective - Software Quality Assurance', 'SQA', 'elective', 4, 3, 'Dr. P. Iyyanar', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT952', 'Elective - Cyber Security', 'CS', 'elective', 4, 3, 'Dr. Y. Suresh; Mr. D. Jayaprakash', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT950', 'Elective - Big Data Technologies', 'BDT', 'elective', 4, 3, 'Dr. K. Thangaraj', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT504', 'Database Management Systems Lab', 'DBMS LAB', 'lab', 3, 1.5, 'Mr. J. L. Aldo Stalin', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT505', 'Mobile Application Development Lab', 'MAD LAB', 'lab', 3, 1.5, 'New Staff - 1', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23IT506', 'Internet of Things Laboratory', 'IOT LAB', 'lab', 2, 1, 'Dr. K. Thangaraj', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (A)', 'lab', 2, 1, 'Mr. P. Satish Raj', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (SS)', 'lab', 1, 0.5, 'Mr. D. S. Mohanram', false),
  makeRow('Information Technology', 'III', 'Sem V', 'A', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (V)', 'lab', 1, 0.5, 'Dr. G. Hemanatchatra', false)
);

// ==========================================
// 5. IT III B (CC: Mr. A. S. Syed Fiaz)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT501', 'Computer Networks', 'CN', 'theory', 4, 3, 'Ms. M. Janani', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT502', 'Database Management Systems', 'DBMS', 'theory', 4, 3, 'Dr. J. Jeba Emilyn', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT503', 'Theory of Computation', 'TOC', 'theory', 5, 4, 'Mr. K. Karthick', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'noc26-cs***', 'Elective- NPTEL Internet of Things', 'NPTEL (IOT)', 'elective', 3, 3, 'Ms. K. Hemalatha', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT940', 'Elective - Business Intelligence', 'BI', 'elective', 4, 3, 'Mr. A. S. Syed Fiaz; Ms. K. Hemalatha', true),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT975', 'Elective - Software Quality Assurance', 'SQA', 'elective', 4, 3, 'Dr. P. Iyyanar', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT952', 'Elective - Cyber Security', 'CS', 'elective', 4, 3, 'Dr. Y. Suresh; Mr. D. Jayaprakash', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT950', 'Elective - Big Data Technologies', 'BDT', 'elective', 4, 3, 'Dr. K. Thangaraj', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT504', 'Database Management Systems Lab', 'DBMS LAB', 'lab', 3, 1.5, 'Dr. J. Jeba Emilyn', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT505', 'Mobile Application Development Lab', 'MAD LAB', 'lab', 3, 1.5, 'Ms. S. M. C. Subashini', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23IT506', 'Internet of Things Laboratory', 'IOT LAB', 'lab', 2, 1, 'Ms. K. Hemalatha', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (AP)', 'lab', 2, 1, 'Mr. C. Mohankumar', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (V)', 'lab', 1, 0.5, 'New Staff - 1', false),
  makeRow('Information Technology', 'III', 'Sem V', 'B', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (SS)', 'lab', 1, 0.5, 'Ms. P. Srudhi', false)
);

// ==========================================
// 6. IT III C (CC: Ms. A. Vaishnavi Dali)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT501', 'Computer Networks', 'CN', 'theory', 4, 3, 'Ms. A. Vaishnavi Dali', true),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT502', 'Database Management Systems', 'DBMS', 'theory', 4, 3, 'Ms. P. Kruthika', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT503', 'Theory of Computation', 'TOC', 'theory', 5, 4, 'Dr. J. Jeba Emilyn', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'noc26-cs***', 'Elective- NPTEL Internet of Things', 'NPTEL (IOT)', 'elective', 3, 3, 'Ms. J. Deepika', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT940', 'Elective - Business Intelligence', 'BI', 'elective', 4, 3, 'Ms. K. Hemalatha; Mr. A. S. Syed Fiaz', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT975', 'Elective - Software Quality Assurance', 'SQA', 'elective', 4, 3, 'Dr. P. Iyyanar', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT952', 'Elective - Cyber Security', 'CS', 'elective', 4, 3, 'Dr. Y. Suresh; Mr. D. Jayaprakash', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT950', 'Elective - Big Data Technologies', 'BDT', 'elective', 4, 3, 'Dr. K. Thangaraj', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT504', 'Database Management Systems Lab', 'DBMS LAB', 'lab', 3, 1.5, 'Ms. P. Kruthika', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT505', 'Mobile Application Development Lab', 'MAD LAB', 'lab', 3, 1.5, 'Mr. J. Gokulraj', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23IT506', 'Internet of Things Laboratory', 'IOT LAB', 'lab', 2, 1, 'Ms. J. Deepika', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (AP)', 'lab', 2, 1, 'Ms. K. Gokula Saranya', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (V)', 'lab', 1, 0.5, 'New Staff - 2', false),
  makeRow('Information Technology', 'III', 'Sem V', 'C', 'U23GE501', 'Soft Skills and Aptitude - III', 'SSA-III (SS)', 'lab', 1, 0.5, 'Ms. G. Kiruthiga', false)
);

// ==========================================
// 7. IT II A (CC: Ms. Lydia D. Isaac)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23MAT301E', 'Applied Probability and Statistics-I', 'AP&S', 'theory', 5, 4, '', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23IT301', 'Data Structures', 'DS', 'theory', 4, 3, 'Ms. M. Parameswari', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23IT302', 'Computer Architecture', 'CA', 'theory', 4, 3, 'Ms. Lydia D. Isaac', true),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23IT303', 'Object Oriented Programming in C++', 'OOP (C++)', 'theory', 4, 3, 'Dr. D. Komalavalli', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23IT304', 'Digital Logic Design', 'DLD', 'theory', 4, 3, 'Ms. D. Sharmiladevi', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'noc26-cs***', 'NPTEL: Design Thinking- A Primer', 'NPTEL (DT)', 'elective', 2, 2, 'Ms. Lydia D. Isaac', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23GE302', 'Audit Course: Environment and Climate Science', 'AC', 'theory', 2, 0, 'Dr. K. Kandasamy; Dr. J. E. Madhushree', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23IT305', 'Data Structures Laboratory', 'DS LAB', 'lab', 4, 2, 'Ms. M. Parameswari; Ms. A. Vaishnavi Dali', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23IT306', 'Programming in C++ Laboratory', 'C++ LAB', 'lab', 2, 1, 'Dr. D. Komalavalli', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23ENG301', 'Communication Skills Laboratory', 'CS LAB', 'lab', 2, 1, 'Dr. M. Vinoth', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23IT304 (Integrated)', 'Digital Logic Design Lab', 'DLD LAB', 'lab', 2, 1, 'Ms. D. Sharmiladevi; New Faculty 6', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (SS)', 'lab', 2, 1, 'Ms. G. Kiruthiga', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (AP)', 'lab', 1, 0.5, 'Mr. M. Prabhu', false),
  makeRow('Information Technology', 'II', 'Sem III', 'A', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (V)', 'lab', 1, 0.5, 'Dr. T. Sowmya', false)
);

// ==========================================
// 8. IT II B (CC: Ms. M. Sasikala)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23MAT301E', 'Applied Probability and Statistics-I', 'AP&S', 'theory', 5, 4, '', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23IT301', 'Data Structures', 'DS', 'theory', 4, 3, 'Mr. B. Mohanraj', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23IT302', 'Computer Architecture', 'CA', 'theory', 4, 3, 'Dr. P. Ilanchezhian', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23IT303', 'Object Oriented Programming in C++', 'OOP (C++)', 'theory', 4, 3, 'Ms. M. Sasikala', true),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23IT304', 'Digital Logic Design', 'DLD', 'theory', 4, 3, 'Mr. N. Vetriselvan', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'noc26-cs***', 'NPTEL: Design Thinking- A Primer', 'NPTEL (DT)', 'elective', 2, 2, 'Ms. M. Sasikala', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23GE302', 'Audit Course: Environment and Climate Science', 'AC', 'theory', 2, 0, 'Dr. G. S. Sivagurnathan; Dr. S. Indira', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23IT305', 'Data Structures Laboratory', 'DS LAB', 'lab', 4, 2, 'Mr. B. Mohanraj; Ms. M. Parameswari', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23IT306', 'Programming in C++ Laboratory', 'C++ LAB', 'lab', 2, 1, 'Ms. M. Sasikala', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23ENG301', 'Communication Skills Laboratory', 'CS LAB', 'lab', 2, 1, 'Dr. B. Parvathavardhini', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23IT304 (Integrated)', 'Digital Logic Design Lab', 'DLD LAB', 'lab', 2, 1, 'Mr. N. Vetriselvan; New Faculty 6', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (SS)', 'lab', 2, 1, 'Ms. P. Srudhi', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (AP)', 'lab', 1, 0.5, 'Ms. K. Gokula Saranya', false),
  makeRow('Information Technology', 'II', 'Sem III', 'B', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (V)', 'lab', 1, 0.5, 'Dr. B. Parvathavardhini', false)
);

// ==========================================
// 9. IT II C (CC: Ms. C. Anusuya)
// ==========================================
allRows.push(
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23MAT301E', 'Applied Probability and Statistics-I', 'AP&S', 'theory', 5, 4, '', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23IT301', 'Data Structures', 'DS', 'theory', 4, 3, 'Mr. N. Selvanathan', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23IT302', 'Computer Architecture', 'CA', 'theory', 4, 3, 'Ms. C. Anusuya', true),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23IT303', 'Object Oriented Programming in C++', 'OOP (C++)', 'theory', 4, 3, 'Dr. P. Iyyanar', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23IT304', 'Digital Logic Design', 'DLD', 'theory', 4, 3, 'New Faculty 5', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'noc26-cs***', 'NPTEL: Design Thinking- A Primer', 'NPTEL (DT)', 'elective', 2, 2, 'Ms. C. Anusuya', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23GE302', 'Audit Course: Environment and Climate Science', 'AC', 'theory', 2, 0, 'Dr. S. Gowri', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23IT305', 'Data Structures Laboratory', 'DS LAB', 'lab', 4, 2, 'Mr. N. Selvanathan; Ms. P. Abinaya', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23IT306', 'Programming in C++ Laboratory', 'C++ LAB', 'lab', 2, 1, 'Dr. P. Iyyanar', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23ENG301', 'Communication Skills Laboratory', 'CS LAB', 'lab', 2, 1, 'Dr. M. Saraswathy', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23IT304 (Integrated)', 'Digital Logic Design Lab', 'DLD LAB', 'lab', 2, 1, 'New Faculty 5; New Faculty 2', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (SS)', 'lab', 2, 1, 'Mr. M. Mohammed Aslum', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (AP)', 'lab', 1, 0.5, 'Ms. R. Banupriya', false),
  makeRow('Information Technology', 'II', 'Sem III', 'C', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (V)', 'lab', 1, 0.5, 'Dr. G. Sarathalakshmi', false)
);

// ==========================================
// 10. AIDS IV A (CC: Ms. J. Deepika)
// ==========================================
allRows.push(
  makeRow('AIDS', 'IV', 'Sem VII', 'A', 'U23GE701', 'Professional Ethics and Human Values', 'PE', 'theory', 4, 3, 'Ms. J. Deepika', true),
  makeRow('AIDS', 'IV', 'Sem VII', 'A', 'U23ADS701', 'Generative AI', 'GAI', 'theory', 4, 3, 'Ms. R. Sangeethapriya', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'A', 'U23ADS702', 'Data Engineering', 'DE', 'theory', 4, 3, 'Mr. R. Krishna Prakash', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'A', 'U23IT975', 'Elective - Software Quality Assurance', 'SQA', 'elective', 4, 3, 'Dr. P. Shanmugaraja', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'A', 'U23IT976', 'Elective - Total Quality Management', 'TQM', 'elective', 4, 3, 'Ms. A. Vaishnavi Dali', false),
  ...getOpenElectives('AIDS', 'IV', 'Sem VII', 'A'),
  makeRow('AIDS', 'IV', 'Sem VII', 'A', 'U23ADS703', 'Generative AI Lab Laboratory', 'GAI LAB', 'lab', 4, 2, 'Ms. R. Sangeethapriya; Ms. S. M. C. Subashini', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'A', 'U23ADS704', 'Data Engineering Laboratory', 'DE LAB', 'lab', 2, 1, 'Mr. R. Krishna Prakash', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'A', 'U23ADS705', 'Mini Project', 'MINI PROJ', 'project', 2, 1, 'Dr. P. Ilanchezhian', false)
);

// ==========================================
// 11. AIDS IV B (CC: Mr. M. Murali)
// ==========================================
allRows.push(
  makeRow('AIDS', 'IV', 'Sem VII', 'B', 'U23GE701', 'Professional Ethics and Human Values', 'PE', 'theory', 4, 3, 'New Staff - 8', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'B', 'U23ADS701', 'Generative AI', 'GAI', 'theory', 4, 3, 'Dr. P. Sakthivel', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'B', 'U23ADS702', 'Data Engineering', 'DE', 'theory', 4, 3, 'Mr. P. Dinesh Kumar', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'B', 'U23IT975', 'Elective - Software Quality Assurance', 'SQA', 'elective', 4, 3, 'Mr. M. Murali', true),
  makeRow('AIDS', 'IV', 'Sem VII', 'B', 'U23IT976', 'Elective - Total Quality Management', 'TQM', 'elective', 4, 3, 'Mr. J. Gokulraj', false),
  ...getOpenElectives('AIDS', 'IV', 'Sem VII', 'B'),
  makeRow('AIDS', 'IV', 'Sem VII', 'B', 'U23ADS703', 'Generative AI Lab Laboratory', 'GAI LAB', 'lab', 4, 2, 'Dr. P. Sakthivel; New Staff - 8', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'B', 'U23ADS704', 'Data Engineering Laboratory', 'DE LAB', 'lab', 2, 1, 'Mr. P. Dinesh Kumar', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'B', 'U23ADS705', 'Mini Project', 'MINI PROJ', 'project', 2, 1, 'Dr. Y. Suresh', false)
);

// ==========================================
// 12. AIDS IV C (CC: Mr. D. Jayaprakash)
// ==========================================
allRows.push(
  makeRow('AIDS', 'IV', 'Sem VII', 'C', 'U23GE701', 'Professional Ethics and Human Values', 'PE', 'theory', 4, 3, 'Mr. A. S. Syed Fiaz', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'C', 'U23ADS701', 'Generative AI', 'GAI', 'theory', 4, 3, 'Dr. P. Sakthivel', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'C', 'U23ADS702', 'Data Engineering', 'DE', 'theory', 4, 3, 'Mr. D. Jayaprakash', true),
  makeRow('AIDS', 'IV', 'Sem VII', 'C', 'U23IT975', 'Elective - Software Quality Assurance', 'SQA', 'elective', 4, 3, 'New Staff - 6', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'C', 'U23IT976', 'Elective - Total Quality Management', 'TQM', 'elective', 4, 3, 'New Staff - 7', false),
  ...getOpenElectives('AIDS', 'IV', 'Sem VII', 'C'),
  makeRow('AIDS', 'IV', 'Sem VII', 'C', 'U23ADS703', 'Generative AI Lab Laboratory', 'GAI LAB', 'lab', 4, 2, 'Dr. P. Sakthivel; New Staff - 8', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'C', 'U23ADS704', 'Data Engineering Laboratory', 'DE LAB', 'lab', 2, 1, 'Mr. D. Jayaprakash', false),
  makeRow('AIDS', 'IV', 'Sem VII', 'C', 'U23ADS705', 'Mini Project', 'MINI PROJ', 'project', 2, 1, 'Dr. J. Jeba Emilyn', false)
);

// ==========================================
// 13. AIDS III A (CC: Mr. J. Gokulraj)
// ==========================================
allRows.push(
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23IT501', 'Computer Networks', 'CN', 'theory', 4, 3, 'New Staff - 4', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23IT502', 'Database Management Systems', 'DBMS', 'theory', 4, 3, 'Ms. R. Sangeethapriya', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23ADS501', 'Introduction to Artificial Intelligence and Data Science', 'AIDS', 'theory', 4, 3, 'Dr. C. Santhosh Kumar', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23ADS502', 'Machine Learning', 'ML', 'theory', 4, 3, 'Mr. J. Gokulraj', true),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'noc26-cs***', 'Elective - NPTEL- IOT', 'NPTEL (IOT)', 'elective', 3, 3, 'Ms. C. Anusuya', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23IT953', 'Elective - Data Warehousing and Data Mining', 'DWDM', 'elective', 4, 3, 'Ms. L. Sindhu', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23ADS503', 'Database Management Systems Lab', 'DBMS LAB', 'lab', 2, 1, 'Ms. R. Sangeethapriya', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23ADS504', 'Machine Learning Laboratory', 'ML LAB', 'lab', 4, 2, 'Mr. J. Gokulraj; Ms. J. Deepika', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23IT506', 'Internet of Things Laboratory', 'IOT LAB', 'lab', 2, 1, 'Ms. C. Anusuya', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23ADS501 (Integrated)', 'Introduction to Artificial Intelligence and Data Science Lab', 'AIDS LAB', 'lab', 2, 1, 'Dr. C. Santhosh Kumar', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (SS)', 'lab', 2, 1, 'Mr. M. Mohammed Aslum', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (A)', 'lab', 1, 0.5, 'Mrs. T. Keerthana', false),
  makeRow('AIDS', 'III', 'Sem V', 'A', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (V)', 'lab', 1, 0.5, 'Mr. M. Satheeshkumar', false)
);

// ==========================================
// 14. AIDS III B (CC: Dr. D. Komalavalli)
// ==========================================
allRows.push(
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23IT501', 'Computer Networks', 'CN', 'theory', 4, 3, 'Dr. D. Komalavalli', true),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23IT502', 'Database Management Systems', 'DBMS', 'theory', 4, 3, 'Ms. P. Abinaya', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23ADS501', 'Introduction to Artificial Intelligence and Data Science', 'AIDS', 'theory', 4, 3, 'Ms. C. Anusuya', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23ADS502', 'Machine Learning', 'ML', 'theory', 4, 3, 'Mr. B. Mohanraj', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'noc26-cs***', 'Elective - NPTEL- IOT', 'NPTEL (IOT)', 'elective', 3, 3, 'Mr. A. Velusamy', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23IT953', 'Elective - Data Warehousing and Data Mining', 'DWDM', 'elective', 4, 3, 'Dr. V. Mohanraj', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23ADS503', 'Database Management Systems Lab', 'DBMS LAB', 'lab', 2, 1, 'Ms. P. Abinaya', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23ADS504', 'Machine Learning Laboratory', 'ML LAB', 'lab', 4, 2, 'Mr. B. Mohanraj; New Staff - 8', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23IT506', 'Internet of Things Laboratory', 'IOT LAB', 'lab', 2, 1, 'Mr. A. Velusamy', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23ADS501 (Integrated)', 'Introduction to Artificial Intelligence and Data Science Lab', 'AIDS LAB', 'lab', 2, 1, 'Ms. C. Anusuya', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (SS)', 'lab', 2, 1, 'Mr. D. S. Mohanram', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (A)', 'lab', 1, 0.5, 'Ms. R. Banupriya', false),
  makeRow('AIDS', 'III', 'Sem V', 'B', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (V)', 'lab', 1, 0.5, 'Dr. K. Vinothini', false)
);

// ==========================================
// 15. AIDS III C (CC: Ms. M. Parameswari)
// ==========================================
allRows.push(
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23IT501', 'Computer Networks', 'CN', 'theory', 4, 3, 'Ms. M. Parameswari', true),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23IT502', 'Database Management Systems', 'DBMS', 'theory', 4, 3, 'Ms. M. Janani', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23ADS501', 'Introduction to Artificial Intelligence and Data Science', 'AIDS', 'theory', 4, 3, 'New Staff - 6', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23ADS502', 'Machine Learning', 'ML', 'theory', 4, 3, 'New Staff - 1', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'noc26-cs***', 'Elective - NPTEL- IOT', 'NPTEL (IOT)', 'elective', 3, 3, 'Dr. D. Komalavalli', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23IT953', 'Elective - Data Warehousing and Data Mining', 'DWDM', 'elective', 4, 3, 'New Staff - 4', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23ADS503', 'Database Management Systems Lab', 'DBMS LAB', 'lab', 2, 1, 'Ms. M. Janani', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23ADS504', 'Machine Learning Laboratory', 'ML LAB', 'lab', 4, 2, 'New Staff - 1; Mr. R. Krishna Prakash', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23IT506', 'Internet of Things Laboratory', 'IOT LAB', 'lab', 2, 1, 'Dr. D. Komalavalli', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23ADS501 (Integrated)', 'Introduction to Artificial Intelligence and Data Science Lab', 'AIDS LAB', 'lab', 2, 1, 'New Staff - 6', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (SS)', 'lab', 2, 1, 'Ms. G. Kiruthiga', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (A)', 'lab', 1, 0.5, 'Mr. R. Balaji', false),
  makeRow('AIDS', 'III', 'Sem V', 'C', 'U23GE501', 'Soft Skills and Aptitude-III', 'SSA-III (V)', 'lab', 1, 0.5, 'Dr. B. Kanchanamala', false)
);

// ==========================================
// ==========================================
// 16. AIDS II A (CC: Ms. S.M.C. Subashini)
// ==========================================
allRows.push(
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23MAT301E', 'Applied Probability and Statistics-I', 'AP&S', 'theory', 5, 4, '', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23IT301', 'Data Structures', 'DS', 'theory', 4, 3, 'Mr. R. Krishna Prakash', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23IT302', 'Computer Architecture', 'CA', 'theory', 4, 3, 'Ms. S.M.C. Subashini', true),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23IT303', 'Object Oriented Programming in C++', 'OOP (C++)', 'theory', 4, 3, 'Mr. A. Naveen Kumar', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23IT304', 'Digital Logic Design', 'DLD', 'theory', 4, 3, 'New Staff - 2', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'noc26-cs***', 'NPTEL: Design Thinking- A Primer', 'NPTEL (DT)', 'elective', 2, 2, 'Ms. S.M.C. Subashini', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23GE302', 'Audit Course: Environment and Climate Science', 'AC', 'theory', 2, 0, 'Dr. G. S. Sivagurnathan', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23IT305', 'Data Structures Laboratory', 'DS LAB', 'lab', 3, 1.5, 'Mr. R. Krishna Prakash; Ms. L. Sindhu', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23IT306', 'Programming in C++ Laboratory', 'C++ LAB', 'lab', 2, 1, 'Mr. A. Naveen Kumar', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23ENG301', 'Communication Skills Laboratory', 'CS LAB', 'lab', 2, 1, '', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23IT304 (Integrated)', 'Digital Logic Design Lab', 'DLD LAB', 'lab', 2, 1, 'New Staff - 2; Ms. K. Saranya', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (SS)', 'lab', 2, 1, 'Mr. M. Mohammed Aslum', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (AP)', 'lab', 1, 0.5, 'Mr. M. Satheeshkumar', false),
  makeRow('AIDS', 'II', 'Sem III', 'A', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (V)', 'lab', 1, 0.5, 'New Staff - 3', false)
);

// ==========================================
// 17. AIDS II B (CC: Ms. R. Nivedha)
// ==========================================
allRows.push(
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23MAT301E', 'Applied Probability and Statistics-I', 'AP&S', 'theory', 5, 4, '', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23IT301', 'Data Structures', 'DS', 'theory', 4, 3, 'Dr. S. Vasanthi', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23IT302', 'Computer Architecture', 'CA', 'theory', 4, 3, 'Dr. P. Ilanchezhian', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23IT303', 'Object Oriented Programming in C++', 'OOP (C++)', 'theory', 4, 3, 'Ms. R. Nivedha', true),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23IT304', 'Digital Logic Design', 'DLD', 'theory', 4, 3, 'New Staff - 2', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'noc26-cs***', 'NPTEL: Design Thinking- A Primer', 'NPTEL (DT)', 'elective', 2, 2, 'Ms. R. Nivedha', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23GE302', 'Audit Course: Environment and Climate Science', 'AC', 'theory', 2, 0, 'Dr. C. Saravanan', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23IT305', 'Data Structures Laboratory', 'DS LAB', 'lab', 3, 1.5, 'Dr. S. Vasanthi; Ms. P. Kruthika', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23IT306', 'Programming in C++ Laboratory', 'C++ LAB', 'lab', 2, 1, 'Ms. R. Nivedha', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23ENG301', 'Communication Skills Laboratory', 'CS LAB', 'lab', 2, 1, '', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23IT304 (Integrated)', 'Digital Logic Design Lab', 'DLD LAB', 'lab', 2, 1, 'New Staff - 2; New Staff - 3', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (SS)', 'lab', 2, 1, 'Mr. D. S. Mohanram', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (AP)', 'lab', 1, 0.5, 'Mr. P. Satish Raj', false),
  makeRow('AIDS', 'II', 'Sem III', 'B', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (V)', 'lab', 1, 0.5, 'Dr. C. Shahin Banu', false)
);

// ==========================================
// 18. AIDS II C (CC: Ms. P. Abinaya)
// ==========================================
allRows.push(
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23MAT301E', 'Applied Probability and Statistics-I', 'AP&S', 'theory', 5, 4, '', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23IT301', 'Data Structures', 'DS', 'theory', 4, 3, 'Ms. L. Sindhu', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23IT302', 'Computer Architecture', 'CA', 'theory', 4, 3, 'Dr. J. Senthilkumar', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23IT303', 'Object Oriented Programming in C++', 'OOP (C++)', 'theory', 4, 3, 'Ms. P. Abinaya', true),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23IT304', 'Digital Logic Design', 'DLD', 'theory', 4, 3, 'New Staff - 6', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'noc26-cs***', 'NPTEL: Design Thinking- A Primer', 'NPTEL (DT)', 'elective', 2, 2, 'Ms. P. Abinaya', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23GE302', 'Audit Course: Environment and Climate Science', 'AC', 'theory', 2, 0, 'Dr. C. Saravanan', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23IT305', 'Data Structures Laboratory', 'DS LAB', 'lab', 3, 1.5, 'Ms. L. Sindhu; New Staff - 4', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23IT306', 'Programming in C++ Laboratory', 'C++ LAB', 'lab', 2, 1, 'Ms. P. Abinaya', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23ENG301', 'Communication Skills Laboratory', 'CS LAB', 'lab', 2, 1, '', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23IT304 (Integrated)', 'Digital Logic Design Lab', 'DLD LAB', 'lab', 2, 1, 'New Staff - 6; Mr. N. Vetriselvan', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (SS)', 'lab', 2, 1, 'Ms. P. Srudhi', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (AP)', 'lab', 1, 0.5, 'Mrs. T. Keerthana', false),
  makeRow('AIDS', 'II', 'Sem III', 'C', 'U23GE301', 'Soft Skills and Aptitude - I', 'SSA-I (V)', 'lab', 1, 0.5, 'Dr. K. Vinothini', false)
);

console.log(`Prepared ${allRows.length} rows for Odd Semester Master.`);

// Backup existing Excel file
const targetFile = 'd:/PROJECTS/sonaTTG/ODD_SEM_BULK_IMPORT_.xlsx';
const backupFile = 'd:/PROJECTS/sonaTTG/ODD_SEM_BULK_IMPORT_.xlsx.bak';
if (fs.existsSync(targetFile)) {
  fs.copyFileSync(targetFile, backupFile);
  console.log(`Backed up ${targetFile} to ${backupFile}`);
}

// Read existing workbook to retain 'Column Guide' and properties
const wb = XLSX.readFile(targetFile);

// Convert allRows to sheet
const newWs = XLSX.utils.json_to_sheet(allRows, {
  header: [
    'Department',
    'Year',
    'Semester',
    'Section',
    'Subject Code',
    'Subject Name',
    'Abbreviation',
    'Type',
    'Hours Per Week',
    'Credits',
    'Faculty Name',
    'Faculty Email',
    'Designation',
    'Class Counsellor'
  ]
});

// Set column widths
newWs['!cols'] = [
  { wch: 24 }, // Department
  { wch: 8 },  // Year
  { wch: 10 }, // Semester
  { wch: 8 },  // Section
  { wch: 16 }, // Subject Code
  { wch: 45 }, // Subject Name
  { wch: 14 }, // Abbreviation
  { wch: 14 }, // Type
  { wch: 16 }, // Hours Per Week
  { wch: 10 }, // Credits
  { wch: 38 }, // Faculty Name
  { wch: 45 }, // Faculty Email
  { wch: 25 }, // Designation
  { wch: 16 }, // Class Counsellor
];

wb.Sheets['Odd Semester Master'] = newWs;

// Write updated workbook
XLSX.writeFile(wb, targetFile);
console.log(`Successfully updated ${targetFile}!`);
