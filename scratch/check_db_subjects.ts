import { supabase } from '../src/integrations/supabase/client';

async function check() {
  const { data: subjs } = await supabase
    .from('subjects')
    .select('id, name, code, abbreviation, department_id, year, type, tags, hours_per_week');
  
  console.log('Total subjects in DB:', subjs?.length);
  const ssa = (subjs || []).filter(s => {
    const str = `${s.code} ${s.name}`.toLowerCase();
    return str.includes('u23ge401') || str.includes('soft skill') || str.includes('aptitude') || str.includes('verbal');
  });
  console.log('Current SSA subjects in DB:', ssa);
}

check();

