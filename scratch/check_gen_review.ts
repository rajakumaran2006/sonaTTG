import * as fs from 'fs';

const content = fs.readFileSync('src/pages/admin/GenerateReviewPage.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.toLowerCase().includes('duplicate') || l.toLowerCase().includes('subject code') || l.toLowerCase().includes('code')) {
    if (l.includes('error') || l.includes('warn') || l.includes('Duplicate') || l.includes('duplicate')) {
      console.log((idx + 1) + ': ' + l.trim());
    }
  }
});

