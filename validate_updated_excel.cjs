const fs = require('fs');
const XLSX = require('xlsx');

const wb = XLSX.readFile('d:/PROJECTS/sonaTTG/ODD_SEM_BULK_IMPORT_.xlsx');
console.log('Sheet Names:', wb.SheetNames);

const ws = wb.Sheets['Odd Semester Master'];
const rows = XLSX.utils.sheet_to_json(ws);
console.log('Total Rows in Odd Semester Master:', rows.length);

const classMap = new Map();
let errors = 0;

rows.forEach((r, idx) => {
  const rowNum = idx + 2;
  const key = `${r['Department']} | Year ${r['Year']} | ${r['Semester']} | Sec ${r['Section']}`;
  if (!classMap.has(key)) classMap.set(key, []);
  classMap.get(key).push(r);

  // Check required fields (unallocated subjects in PDF: U23MAT301E, open electives, AIDS II CS LAB)
  const isUnallocated = r['Subject Code'] === 'U23MAT301E' || r['Type'] === 'open elective' || (r['Department'] === 'AIDS' && r['Year'] === 'II' && r['Subject Code'] === 'U23ENG301');
  
  if (isUnallocated) {
    if ((r['Faculty Name'] && String(r['Faculty Name']).trim() !== '') ||
        (r['Faculty Email'] && String(r['Faculty Email']).trim() !== '') ||
        (r['Designation'] && String(r['Designation']).trim() !== '')) {
      console.error(`Row ${rowNum} (${key}) should be unallocated (empty faculty) but has: ${r['Faculty Name']}`);
      errors++;
    }
  }

  const requiredFields = [
    'Department', 'Year', 'Semester', 'Section',
    'Subject Code', 'Subject Name', 'Abbreviation', 'Type',
    'Hours Per Week', 'Credits'
  ];
  if (!isUnallocated) {
    requiredFields.push('Faculty Name', 'Faculty Email', 'Designation');
  }
  for (const f of requiredFields) {
    if (r[f] === undefined || r[f] === null || String(r[f]).trim() === '') {
      console.error(`Row ${rowNum} (${key}) missing required field: ${f}`);
      errors++;
    }
  }

  // Check co-teaching consistency
  const fNames = (r['Faculty Name'] || '').split(';').map(s => s.trim()).filter(Boolean);
  const fEmails = (r['Faculty Email'] || '').split(';').map(s => s.trim()).filter(Boolean);
  const fDesigs = (r['Designation'] || '').split(';').map(s => s.trim()).filter(Boolean);
  if (fNames.length !== fEmails.length || fNames.length !== fDesigs.length) {
    console.error(`Row ${rowNum} co-teaching count mismatch: ${fNames.length} names vs ${fEmails.length} emails vs ${fDesigs.length} desigs`);
    errors++;
  }

  // Check no special hours
  const nameLower = (r['Subject Name'] || '').toLowerCase();
  const codeLower = (r['Subject Code'] || '').toLowerCase();
  if (nameLower.includes('counseling') || nameLower.includes('seminar') || nameLower.includes('library') || codeLower.includes('lib') || codeLower.includes('sc') || codeLower.includes('sem')) {
    console.error(`Row ${rowNum} contains special hour: ${r['Subject Name']} (${r['Subject Code']})`);
    errors++;
  }
});

console.log(`\nValidating all 18 classes (Found ${classMap.size} classes):`);
const expectedClasses = [
  'Information Technology | Year IV | Sem VII | Sec A',
  'Information Technology | Year IV | Sem VII | Sec B',
  'Information Technology | Year IV | Sem VII | Sec C',
  'Information Technology | Year III | Sem V | Sec A',
  'Information Technology | Year III | Sem V | Sec B',
  'Information Technology | Year III | Sem V | Sec C',
  'Information Technology | Year II | Sem III | Sec A',
  'Information Technology | Year II | Sem III | Sec B',
  'Information Technology | Year II | Sem III | Sec C',
  'AIDS | Year IV | Sem VII | Sec A',
  'AIDS | Year IV | Sem VII | Sec B',
  'AIDS | Year IV | Sem VII | Sec C',
  'AIDS | Year III | Sem V | Sec A',
  'AIDS | Year III | Sem V | Sec B',
  'AIDS | Year III | Sem V | Sec C',
  'AIDS | Year II | Sem III | Sec A',
  'AIDS | Year II | Sem III | Sec B',
  'AIDS | Year II | Sem III | Sec C',
];

for (const exp of expectedClasses) {
  if (!classMap.has(exp)) {
    console.error(`Missing expected class: ${exp}`);
    errors++;
    continue;
  }
  const classRows = classMap.get(exp);
  const counselors = classRows.filter(r => r['Class Counsellor'] === 'Yes');
  if (counselors.length !== 1) {
    console.error(`Class ${exp} has ${counselors.length} Class Counselors marked! Expected exactly 1.`);
    errors++;
  } else {
    console.log(`✓ ${exp.padEnd(52)} | ${classRows.length} subjects | CC: ${counselors[0]['Faculty Name'].padEnd(25)} (${counselors[0]['Subject Code']})`);
  }
}

console.log(`\nValidation complete. Total errors: ${errors}`);
if (errors === 0) {
  console.log('SUCCESS! All data perfectly validated.');
}
