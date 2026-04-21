
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://mggcskkkricnmkjqdqai.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZ2Nza2trcmljbm1ranFkcWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNjk4MjQsImV4cCI6MjA3ODc0NTgyNH0.Z74XcwusKBcVr82QWU5UxKBRgwyAILwKXiVgyTg5SaQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'suguna_aqua' }
});

async function inspect() {
    console.log("--- DASHBOARD TABLE ---");
    const { data: dash } = await supabase.from('DASHBOARD').select('*').order('DATE', { ascending: false }).limit(5);
    console.log(JSON.stringify(dash, null, 2));

    console.log("\n--- CASH TABLE (RECENT) ---");
    const { data: cash } = await supabase.from('CASH').select('*').order('DATE', { ascending: false }).limit(5);
    console.log(JSON.stringify(cash, null, 2));

    console.log("\n--- ACCOUNT_TRANSACTIONS (RECENT) ---");
    const { data: ledger } = await supabase.from('ACCOUNT_TRANSACTIONS').select('*').order('DATE', { ascending: false }).limit(5);
    console.log(JSON.stringify(ledger, null, 2));
}

inspect();
