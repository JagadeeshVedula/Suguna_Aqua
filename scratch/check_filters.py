import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

print("--- Data Filter Values ---")

# Unique Classes
try:
    res = supabase.table('STUDENTS').select('CLASS').execute()
    classes = sorted(list(set([d['CLASS'] for d in res.data if d['CLASS']])))
    print(f"Unique CLASSES from STUDENTS: {classes}")
except Exception as e:
    print(f"Error: {e}")

# Class Teachers
try:
    res = supabase.table('CLASS_TEACHER').select('CLASS').execute()
    print(f"Unique CLASSES from CLASS_TEACHER: {sorted(list(set([d['CLASS'] for d in res.data if d.get('CLASS')] or [])))}")
except Exception as e:
    print(f"Error: {e}")
