
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspect() {
    console.log("--- SALES TABLE SAMPLE ---");
    const { data: sales } = await supabase.from('SALES').select('*').limit(3);
    console.log(JSON.stringify(sales, null, 2));

    console.log("\n--- CASH TABLE SAMPLE ---");
    const { data: cash } = await supabase.from('CASH').select('*').limit(3);
    console.log(JSON.stringify(cash, null, 2));
}

inspect();
