import * as fs from 'fs';

const content = fs.readFileSync('src/lib/optimizer/optimizerIntegration.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('manualLabs') || l.includes('lab_schedules') || l.includes('manualLabsMap')) {
    console.log((idx + 1) + ': ' + l.trim());
  }
});

