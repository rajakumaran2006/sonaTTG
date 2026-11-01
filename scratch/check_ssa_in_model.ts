import * as fs from 'fs';

const content = fs.readFileSync('src/lib/optimizer/globalConstraintModel.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.toLowerCase().includes('soft skill') || l.toLowerCase().includes('aptitude') || l.toLowerCase().includes('verbal') || l.toLowerCase().includes('ssa') || l.toLowerCase().includes('u23ge')) {
    console.log((idx + 1) + ': ' + l.trim());
  }
});

