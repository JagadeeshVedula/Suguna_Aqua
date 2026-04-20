import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

try:
    res = supabase.table('STUDENTS').select('*').limit(1).execute()
    print(f"STUDENTS Columns: {list(res.data[0].keys())}")
except Exception as e:
    print(f"Error checking STUDENTS: {e}")
