import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

try:
    res = supabase.table('STUDENTS').select('id').limit(1).execute()
    if res.data:
        val = res.data[0]['id']
        print(f"Sample ID: {val}, Type: {type(val)}")
except Exception as e:
    print(f"Error: {e}")
