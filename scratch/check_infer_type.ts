import * as fs from 'fs';

const content = fs.readFileSync('src/components/UploadCSV.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('inferSubjectType')) {
    console.log((idx + 1) + ': ' + l.trim());
  }
});

