import * as fs from 'fs';

const content = fs.readFileSync('src/lib/optimizer/timetableValidator.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.toLowerCase().includes('code') || l.toLowerCase().includes('duplicate') || l.toLowerCase().includes('soft') || l.toLowerCase().includes('ssa')) {
    console.log((idx + 1) + ': ' + l.trim());
  }
});

