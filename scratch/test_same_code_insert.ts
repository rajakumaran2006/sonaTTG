import { supabase } from '../src/integrations/supabase/client';

async function testInsert() {
  const depts = (await supabase.from('departments').select('id, name')).data || [];
  const itDept = depts.find(d => d.name === 'IT')!;

  const testCode = 'U23TEST999';
  console.log("Inserting subject 1 with code", testCode);
  const res1 = await supabase.from('subjects').insert({
    code: testCode,
    name: 'Test Subject One (Integrated)',
    department_id: itDept.id,
    year: 'II',
    type: 'lab',
    hours_per_week: 1,
    credits: 1,
  }).select();
  console.log("Insert 1 res:", res1.data ? "SUCCESS" : res1.error);

  console.log("Inserting subject 2 with SAME code", testCode);
  const res2 = await supabase.from('subjects').insert({
    code: testCode,
    name: 'Test Subject Two (Integrated)',
    department_id: itDept.id,
    year: 'II',
    type: 'lab',
    hours_per_week: 2,
    credits: 1,
  }).select();
  console.log("Insert 2 res:", res2.data ? "SUCCESS" : res2.error);

  // Clean up
  if (res1.data?.[0]?.id) await supabase.from('subjects').delete().eq('id', res1.data[0].id);
  if (res2.data?.[0]?.id) await supabase.from('subjects').delete().eq('id', res2.data[0].id);
  console.log("Cleaned up successfully.");
}

testInsert();

