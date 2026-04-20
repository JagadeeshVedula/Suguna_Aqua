import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_KEY')
supabase = create_client(url, key)

# 1. Fetch Dealers
d_res = supabase.postgrest.schema('suguna_aqua').table('DEALERS').select('*').execute()
d_map = {d['NAME']: d for d in d_res.data}
print(f"Loaded Dealers: {list(d_map.keys())}")

# 2. Fetch Dealer Sales
s_res = supabase.postgrest.schema('suguna_aqua').table('SALES').select('*').eq('TYPE', 'DEALER').execute()

items = ['250ML', '500ML', '1LTR', '2LTR', '5LTR', '20LTR', 'BAGS']

for s in s_res.data:
    p = d_map.get(s['DRIVER'], {})
    if not p:
        print(f"MISSING DEALER: {s['DRIVER']}")
        continue
        
    bill = 0
    for i in items:
        qty = int(s.get(i) or 0)
        rate = float(p.get('PR_' + i) or 0)
        bill += (qty * rate)
    
    print(f"Dealer: {s['DRIVER']}, Bill: {bill}, Quantities: {[s.get(i) for i in items]}")
    print(f"Rates used: {[p.get('PR_'+i) for i in items]}")
