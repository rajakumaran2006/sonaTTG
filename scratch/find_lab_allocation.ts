import * as fs from 'fs';
import * as path from 'path';

function searchDir(dir: string) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      searchDir(full);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      const c = fs.readFileSync(full, 'utf8');
      if (c.includes('lab_schedules') || c.includes('LabAllocation') || c.includes('Lab Allocation') || c.includes('manualLabsMap')) {
        console.log(full);
      }
    }
  }
}

searchDir('src');

