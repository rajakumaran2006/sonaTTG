globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

async function inspectConflict() {
  const { supabase } = await import('../src/integrations/supabase/client.ts');

  const { data: assignments } = await supabase.from('faculty_subject_assignments').select('*, faculty_members(*), subjects(*)');
  console.log('Total assignments:', assignments?.length);

  // Group by faculty_id
  const facMap = new Map();
  for (const a of assignments || []) {
    const facName = a.faculty_members?.name || a.faculty_id;
    if (!facMap.has(facName)) facMap.set(facName, []);
    facMap.get(facName).push({
      subject: a.subjects?.name,
      year: a.year,
      section: a.section,
      dept: a.department_id,
      subjId: a.subject_id
    });
  }

  for (const [facName, subs] of facMap.entries()) {
    const hasSsa = subs.some(s => /SSA|soft/i.test(s.subject || ''));
    const hasHci = subs.some(s => /Human Computer/i.test(s.subject || ''));
    const hasSqa = subs.some(s => /Software Quality/i.test(s.subject || ''));
    const hasCc = subs.some(s => /Cloud Computing/i.test(s.subject || ''));

    if ((hasSsa && hasHci) || (hasSqa && hasCc) || subs.length >= 4) {
      console.log(`\nFaculty: "${facName}" teaches ${subs.length} subjects:`);
      for (const s of subs) {
        console.log(`  - ${s.subject} (Yr ${s.year} Sec ${s.section})`);
      }
    }
  }
}

inspectConflict().catch(console.error);
