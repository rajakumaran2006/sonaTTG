import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rnlzgirfkqmyvmtyyoqx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubHpnaXJma3FteXZtdHl5b3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MTUwNjYsImV4cCI6MjA3MDM5MTA2Nn0.O189CI_Pl1uA_dPv-p7AdC49p2naXXDNdHG63Hy4h50";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkNewStaff7() {
  const { data: ns7 } = await supabase.from('faculty_members').select('*').ilike('name', '%New Staff-7%');
  console.log('New Staff 7:', ns7);

  // Check any lab_schedules or external slots for New Staff 7
  if (ns7 && ns7.length > 0) {
    const fId = ns7[0].id;
    const { data: ext } = await supabase.from('faculty_external_slots').select('*').eq('faculty_id', fId);
    console.log('External slots:', ext);

    const { data: fsa } = await supabase.from('faculty_subject_assignments').select('*, subjects(*)').eq('faculty_id', fId);
    for (const f of fsa || []) {
      console.log(`FSA: ${f.subjects?.name}, Year ${f.year} Sec ${f.section}`);
    }
  }
}

checkNewStaff7();
