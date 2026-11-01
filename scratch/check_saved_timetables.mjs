globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

async function checkSavedTimetables() {
  const { supabase } = await import('../src/integrations/supabase/client.ts');

  const { data: tts } = await supabase.from('timetables').select('id, department_id, year, section, grid_data, updated_at');
  console.log(`Found ${tts?.length} timetables in DB`);

  for (const tt of tts || []) {
    console.log(`\nTimetable: Dept ${tt.department_id} Year ${tt.year} Section ${tt.section} (updated: ${tt.updated_at})`);
    const grid = typeof tt.grid_data === 'string' ? JSON.parse(tt.grid_data) : tt.grid_data;
    if (Array.isArray(grid)) {
      // Day 5 (index 4 or 5?) Wait! Day 5 Period 2 in description:
      // Notice: "Day 5 Period 2" in description comes from `dayIdx + 1`!
      // So Day 5 means dayIdx = 4 (Friday)! Period 2 means periodIdx = 1 (Period 2)!
      // Day 3 Period 3 means dayIdx = 2 (Wednesday)! Period 3 means periodIdx = 2 (Period 3)!
      console.log(`  Fri (d=4) P2 (p=1): "${grid[4]?.[1]}"`);
      console.log(`  Wed (d=2) P3 (p=2): "${grid[2]?.[2]}"`);
    }
  }
}

checkSavedTimetables().catch(console.error);
