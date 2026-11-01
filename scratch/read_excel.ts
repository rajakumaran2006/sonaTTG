import * as fs from 'fs';
import * as XLSX from 'xlsx';

const buf = fs.readFileSync('EVEN_SEM_BULK_IMPORT_.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
console.log('Sheets:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json<any>(ws);
  console.log(`Sheet "${name}" rows:`, json.length);
  const ssaRows = json.filter((r: any) => {
    const s = JSON.stringify(r).toLowerCase();
    return s.includes('u23ge401') || s.includes('soft skill') || s.includes('aptitude') || s.includes('verbal');
  });
  console.log(`SSA rows in "${name}":`, ssaRows.slice(0, 10));
}
