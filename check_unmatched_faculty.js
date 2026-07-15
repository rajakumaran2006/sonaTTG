import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rnlzgirfkqmyvmtyyoqx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubHpnaXJma3FteXZtdHl5b3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MTUwNjYsImV4cCI6MjA3MDM5MTA2Nn0.O189CI_Pl1uA_dPv-p7AdC49p2naXXDNdHG63Hy4h50";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const excelFilePath = 'Subject_Allocation_Even_Sem_II & III year IT.xlsx';

async function main() {
  try {
    // 1. Fetch DB faculties
    const { data: dbFaculties, error } = await supabase.from('faculty_members').select('*');
    if (error) throw error;
    
    const dbFacultyNames = new Set(dbFaculties.map(f => f.name.toLowerCase().trim()));
    const dbFacultyEmails = new Set(dbFaculties.map(f => f.email ? f.email.toLowerCase().trim() : ''));

    // 2. Read Excel
    const workbook = XLSX.readFile(excelFilePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    const excelFacultyNames = new Set();
    const excelEmails = new Set();
    const unmatchedNames = new Set();

    rows.forEach(row => {
      const facNameString = row['Faculty Name'] || '';
      const emailString = row['Faculty Mail Id'] || '';
      
      // Split by '&' or ',' to handle multiple faculties
      const names = facNameString.split(/[&,]/).map(n => n.trim()).filter(Boolean);
      names.forEach(name => {
        excelFacultyNames.add(name);
        if (!dbFacultyNames.has(name.toLowerCase())) {
          unmatchedNames.add(name);
        }
      });

      const emails = emailString.split(/[&,]/).map(e => e.trim()).filter(Boolean);
      emails.forEach(email => {
        excelEmails.add(email);
      });
    });

    console.log("Unique Faculty Names in Excel:", Array.from(excelFacultyNames).sort());
    console.log("\nUnmatched Faculty Names (not in DB):", Array.from(unmatchedNames).sort());

  } catch (e) {
    console.error(e);
  }
}

main();
