import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rnlzgirfkqmyvmtyyoqx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubHpnaXJma3FteXZtdHl5b3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MTUwNjYsImV4cCI6MjA3MDM5MTA2Nn0.O189CI_Pl1uA_dPv-p7AdC49p2naXXDNdHG63Hy4h50";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkFaculty() {
  const { data: fsa } = await supabase.from('faculty_subject_assignments').select('*, faculty_members(*), subjects(*)').ilike('subjects.name', '%Data Structures%');
  console.log('FSA for Data Structures count:', fsa?.length);
  for (const f of fsa || []) {
    if (f.subjects) {
      console.log(`Faculty: ${f.faculty_members?.name}, Subj: ${f.subjects?.name}, Dept: ${f.subjects?.department_id}, Year: ${f.year}, Sec: ${f.section}`);
    }
  }
}

checkFaculty();
