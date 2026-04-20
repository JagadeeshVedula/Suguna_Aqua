import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

tables = ['CRED', 'STUDENTS', 'DROPOUT', 'FEE STRUCTURE', 'CLASS_TEACHER', 'STAFF', 'TRANSPORT', 'PERFORMANCE', 'FEES']

for table in tables:
    try:
        res = supabase.table(table).select('*').limit(1).execute()
        if res.data:
            print(f"[{table}]: {list(res.data[0].keys())}")
        else:
            print(f"[{table}]: Table Empty")
    except Exception as e:
        print(f"[{table}]: Error - {e}")
