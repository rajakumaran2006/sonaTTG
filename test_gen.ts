import { getDepartmentByName } from "./src/lib/supabaseService";
import { generateAllYears } from "./src/lib/timetable";

async function run() {
  const dept = await getDepartmentByName("IT");
  if (!dept) return;
  const res = await generateAllYears(dept.name);
  console.log("Generated:", res.results.length);
}
run();
