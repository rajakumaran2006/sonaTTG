import * as fs from 'fs';

const content = fs.readFileSync('src/pages/admin/Lab.tsx', 'utf8');
const lines = content.split('\n');
console.log('Total lines in Lab.tsx:', lines.length);
lines.forEach((l, idx) => {
  if (l.includes('useState') || l.includes('supabase') || l.includes('lab_schedules') || l.includes('subjects') || l.includes('save') || l.includes('allocation') || l.includes('fixed')) {
    if (idx < 100 || l.includes('lab_schedules') || l.includes('save') || l.includes('handleSubmit')) {
      console.log((idx + 1) + ': ' + l.trim());
    }
  }
});

