import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rnlzgirfkqmyvmtyyoqx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubHpnaXJma3FteXZtdHl5b3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MTUwNjYsImV4cCI6MjA3MDM5MTA2Nn0.O189CI_Pl1uA_dPv-p7AdC49p2naXXDNdHG63Hy4h50";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkSections() {
  const { data: tts } = await supabase.from('timetables').select('department_id, year, section, departments(name)');
  const secSet = new Set();
  tts?.forEach(t => {
    secSet.add(`${t.departments?.name} Year ${t.year} Sec ${t.section}`);
  });
  console.log('Sections from timetables:', Array.from(secSet).sort());
}

checkSections();
