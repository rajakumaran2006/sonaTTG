import { supabase } from '../src/integrations/supabase/client';

async function check() {
  const { data: subjs } = await supabase
    .from('subjects')
    .select('id, name, code, department_id, year, type')
    .limit(10);
  console.log('Sample subjects:', subjs);
}

check();

