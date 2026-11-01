import * as fs from 'fs';

const content = fs.readFileSync('src/lib/optimizer/globalConstraintModel.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('placedHours')) {
    console.log((idx + 1) + ': ' + l.trim());
  }
});

