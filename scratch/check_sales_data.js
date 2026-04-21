const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://mggcskkkricnmkjqdqai.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZ2Nza2trcmljbm1ranFkcWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNjk4MjQsImV4cCI6MjA3ODc0NTgyNH0.Z74XcwusKBcVr82QWU5UxKBRgwyAILwKXiVgyTg5SaQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'suguna_aqua' }
});

async function checkSalesData() {
    const { data, error } = await supabase.from('SALES')
        .select('*')
        .ilike('DATE', '2026-04-21%');
    
    if (error) {
        console.error("Error fetching SALES:", error);
        return;
    }
    
    console.log(`Found ${data.length} records for 2026-04-21:`);
    data.forEach(r => {
        console.log(`ID: ${r.id}, DATE: ${r.DATE}, TYPE: ${r.TYPE}, DRIVER: ${r.DRIVER}, CUSTOMER_NAME: ${r.CUSTOMER_NAME}`);
    });
}

checkSalesData();
