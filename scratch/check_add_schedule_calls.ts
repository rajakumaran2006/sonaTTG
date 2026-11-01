import * as fs from 'fs';

const content = fs.readFileSync('src/pages/admin/Lab.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('handleAddSchedule')) {
    console.log((idx + 1) + ': ' + l.trim());
  }
});

