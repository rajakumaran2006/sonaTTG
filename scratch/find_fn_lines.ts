import * as fs from 'fs';

const content = fs.readFileSync('src/lib/supabaseService.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('getLabSchedulesForSection')) {
    console.log((idx + 1) + ': ' + l.trim());
  }
});

