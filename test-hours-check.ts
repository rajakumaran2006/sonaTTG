import { supabase } from "./src/integrations/supabase/client";

async function findCounseling() {
  const { data } = await supabase.from("subjects").select("*");
  const matching = (data || []).filter(s => /counsel/i.test(s.name) || /mini.*project/i.test(s.name) || /student.*counsel/i.test(s.name));
  console.log("Matching subjects:", matching.map(s => ({ name: s.name, dept: s.department_id, year: s.year, hours: s.hours_per_week, type: s.type })));
  
  const { data: specData } = await supabase.from("special_hours_config").select("*");
  console.log("special_hours_config:", (specData || []).map(s => ({ type: s.special_type, dept: s.department_id, year: s.year, hours: s.total_hours, active: s.is_active })));
}
findCounseling().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
