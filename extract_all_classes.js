const fs = require('fs');

let text = fs.readFileSync('d:/PROJECTS/sonaTTG/ocr_results.json', 'utf8').replace(/^\uFEFF/, '');
const ocr = JSON.parse(text);

const classPages = [
  { dept: 'Information Technology', year: 'IV', sem: 'Sem VII', sec: 'A', pages: [0, 1] },
  { dept: 'Information Technology', year: 'IV', sem: 'Sem VII', sec: 'B', pages: [2, 3] },
  { dept: 'Information Technology', year: 'IV', sem: 'Sem VII', sec: 'C', pages: [4, 5] },
  { dept: 'Information Technology', year: 'III', sem: 'Sem V', sec: 'A', pages: [6] },
  { dept: 'Information Technology', year: 'III', sem: 'Sem V', sec: 'B', pages: [7] },
  { dept: 'Information Technology', year: 'III', sem: 'Sem V', sec: 'C', pages: [8] },
  { dept: 'Information Technology', year: 'II', sem: 'Sem III', sec: 'A', pages: [9] },
  { dept: 'Information Technology', year: 'II', sem: 'Sem III', sec: 'B', pages: [10] },
  { dept: 'Information Technology', year: 'II', sem: 'Sem III', sec: 'C', pages: [11] },
  { dept: 'AIDS', year: 'IV', sem: 'Sem VII', sec: 'A', pages: [12, 13] },
  { dept: 'AIDS', year: 'IV', sem: 'Sem VII', sec: 'B', pages: [14, 15] },
  { dept: 'AIDS', year: 'IV', sem: 'Sem VII', sec: 'C', pages: [16, 17] },
  { dept: 'AIDS', year: 'III', sem: 'Sem V', sec: 'A', pages: [18] },
  { dept: 'AIDS', year: 'III', sem: 'Sem V', sec: 'B', pages: [19] },
  { dept: 'AIDS', year: 'III', sem: 'Sem V', sec: 'C', pages: [20] },
  { dept: 'AIDS', year: 'II', sem: 'Sem III', sec: 'A', pages: [21] },
  { dept: 'AIDS', year: 'II', sem: 'Sem III', sec: 'B', pages: [22] },
  { dept: 'AIDS', year: 'II', sem: 'Sem III', sec: 'C', pages: [23] },
];

for (const c of classPages) {
  console.log('======================================================================');
  console.log(`CLASS: ${c.dept} | Year ${c.year} | ${c.sem} | Sec ${c.sec} (Pages: ${c.pages.join(', ')})`);
  console.log('======================================================================');
  
  for (const pIdx of c.pages) {
    console.log(`--- Page ${pIdx} Content ---`);
    const p = ocr[pIdx];
    // Find Counselor
    let ccLine = '';
    for (let i = 0; i < p.lines.length; i++) {
      if (/COUNSELOR|COUNSELLOR/i.test(p.lines[i].text)) {
        ccLine = p.lines[i].text + (p.lines[i+1] ? ' -> ' + p.lines[i+1].text : '');
      }
    }
    if (ccLine) console.log('  [FOUND COUNSELOR]:', ccLine);

    // Filter lines in table region
    // If Year IV page 1: table is at y > 500
    // If Year IV page 2: table is at y < 650
    // If Year II/III single page: table is at y > 500
    const tableLines = p.lines.filter(l => {
      const y = l.words[0]?.y || 0;
      if (c.pages.length === 2 && pIdx === c.pages[1]) {
        return y < 800; // upper part of continuation page
      } else {
        return y > 500; // lower part of main page
      }
    });

    // Print sorted by y
    tableLines.sort((a,b) => (a.words[0]?.y || 0) - (b.words[0]?.y || 0));
    tableLines.forEach(l => {
      const w0 = l.words[0];
      console.log(`  [y=${Math.round(w0?.y || 0)}, x=${Math.round(w0?.x || 0)}] ${l.text}`);
    });
  }
}
