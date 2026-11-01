const { createClient } = require('@supabase/supabase-js');

const fs = require('fs');
const path = require('path');

// Read .env if present
let envUrl = process.env.VITE_SUPABASE_URL;
let envKey = process.env.VITE_SUPABASE_ANON_KEY;

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
      envUrl = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
    } else if (trimmed.startsWith('VITE_SUPABASE_ANON_KEY=')) {
      envKey = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const SUPABASE_URL = process.argv[2] || envUrl || 'https://rnlzgirfkqmyvmtyyoqx.supabase.co';
const SUPABASE_KEY = process.argv[3] || envKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubHpnaXJma3FteXZtdHl5b3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MTUwNjYsImV4cCI6MjA3MDM5MTA2Nn0.O189CI_Pl1uA_dPv-p7AdC49p2naXXDNdHG63Hy4h50';

console.log(`Testing connection to: ${SUPABASE_URL}`);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  try {
    const { data, error } = await supabase.from('departments').select('id, name');
    if (error) {
      console.error('❌ Connection Failed:', error.message || error);
    } else {
      console.log('✅ Connection SUCCESS! Found departments:', data);
    }
  } catch (err) {
    console.error('❌ Exception during connection test:', err.message || err);
  }
}

test();
