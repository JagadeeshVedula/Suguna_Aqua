import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

tables = ['CRED', 'STUDENTS', 'DROPOUT', 'FEE STRUCTURE', 'CLASS_TEACHER', 'STAFF', 'TRANSPORT', 'PERFORMANCE', 'FEES']

print("--- Database Schema Check ---")
for table in tables:
    try:
        # Fetch 1 row to see the columns
        response = supabase.table(table).select('*').limit(1).execute()
        if response.data:
            print(f"Table: {table}")
            print(f"Columns: {list(response.data[0].keys())}")
        else:
            print(f"Table: {table} (Empty, trying to fetch single col to verify existence)")
            # If empty, this at least confirms the table exists
            supabase.table(table).select('*').limit(0).execute()
            print(f"Table {table} exists but is empty.")
    except Exception as e:
        print(f"Error checking table {table}: {e}")
    print("-" * 30)
