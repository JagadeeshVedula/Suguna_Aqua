import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

def verify_user(username, password):
    try:
        # Specifically targeting the 'suguna_aqua' schema
        response = supabase.postgrest.schema("suguna_aqua").table("CRED").select("*").eq("USERNAME", username).eq("PASSWORD", password).execute()
        
        if response.data and len(response.data) > 0:
            return True, response.data[0]
        return False, "Invalid Credentials"
    except Exception as e:
        return False, str(e)

def get_dashboard_metrics():
    try:
        import datetime
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        
        # 1. Get Opening Balances from DASHBOARD (Total and Itemized)
        # Ordering by DATE desc ensures we get the latest closed day
        dash_resp = supabase.postgrest.schema("suguna_aqua").table("DASHBOARD").select("*").order("DATE", desc=True).order("id", desc=True).limit(1).execute()
        opening_total = 0
        opening_details = {"250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0}
        cash_opening = 0
        
        if dash_resp.data:
            row = dash_resp.data[0]
            opening_total = int(row.get('OPENING_BALANCE') or 0)
            cash_opening = float(row.get('CASH_ON_HAND') or 0)
            for k in opening_details.keys():
                opening_details[k] = int(row.get(k) or 0)
        
        # 2. Get Sum of Production (Itemized)
        prod_resp = supabase.postgrest.schema("suguna_aqua").table("PRODUCTION").select("*").gte("DATE", today + " 00:00:00").execute()
        prod_details = {"250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0}
        prod_total = 0
        if prod_resp.data:
            for row in prod_resp.data:
                for key in prod_details.keys():
                    val = int(row.get(key) or 0)
                    prod_details[key] += val
                    prod_total += val

        # 3. Sales Metrics (Cumulative: Line + Dealer)
        line_cash_resp = supabase.postgrest.schema("suguna_aqua").table("CASH").select("*").neq("VEHICLE_NO", "DEALER_SALE").gte("DATE", today + " 00:00:00").execute()
        dealer_sales_resp = supabase.postgrest.schema("suguna_aqua").table("SALES").select("*").eq("TYPE", "DEALER").gte("DATE", today + " 00:00:00").execute()
        
        sales_total = 0
        sales_details = {"250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0}
        all_sales = (line_cash_resp.data or []) + (dealer_sales_resp.data or [])
        
        for row in all_sales:
            for k in sales_details.keys():
                val = int(row.get(k) or 0)
                sales_details[k] += val
                sales_total += val

        # 4. Cash Collections
        cash_recs = supabase.postgrest.schema("suguna_aqua").table("CASH").select("CASH_RECEIVED").gte("DATE", today + " 00:00:00").execute()
        today_cash = sum(float(row.get('CASH_RECEIVED') or 0) for row in (cash_recs.data or []))
        
        # 4. Calculate Final Stock (Itemized & Total)
        stock_details = {}
        for key in prod_details.keys():
            stock_details[key] = opening_details[key] + prod_details[key] - sales_details[key]
        stock_total = opening_total + prod_total - sales_total
        
        # 5. Account Ledger Transactions (Today's) - Resilient to missing table
        ledger_credit = 0
        ledger_debit = 0
        try:
            ledger_resp = supabase.postgrest.schema("suguna_aqua").table("ACCOUNT_TRANSACTIONS").select("CREDIT, DEBIT").gte("DATE", today + " 00:00:00").execute()
            ledger_credit = sum(float(row.get('CREDIT') or 0) for row in (ledger_resp.data or []))
            ledger_debit = sum(float(row.get('DEBIT') or 0) for row in (ledger_resp.data or []))
        except:
            pass

        return {
            "OPENING_BALANCE": opening_total, "OPENING_DETAILS": opening_details,
            "PRODUCTION": prod_total, "PROD_DETAILS": prod_details,
            "SALES": sales_total, "SALES_DETAILS": sales_details,
            "STOCK": stock_total, "STOCK_DETAILS": stock_details,
            "CASH_ON_HAND": cash_opening + today_cash + ledger_credit - ledger_debit
        }
    except Exception as e:
        print(f"METRICS ERROR: {e}")
        v = {"250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0}
        return {
            "OPENING_BALANCE": 0, "OPENING_DETAILS": v,
            "PRODUCTION": 0, "PROD_DETAILS": v,
            "SALES": 0, "SALES_DETAILS": v,
            "STOCK": 0, "STOCK_DETAILS": v,
            "CASH_ON_HAND": 0
        }

def save_production_data(data):
    try:
        response = supabase.postgrest.schema("suguna_aqua").table("PRODUCTION").insert(data).execute()
        return True, response.data
    except Exception as e:
        print(f"SAVE ERROR: {e}")
        return False, str(e)

def get_filtered_data(report_type, timeframe, specific_dealer=None):
    try:
        import datetime
        now = datetime.datetime.now()
        
        # Calculate start date
        if timeframe == 'daily':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif timeframe == 'weekly':
            start_date = now - datetime.timedelta(days=7)
        elif timeframe == 'monthly':
            start_date = now - datetime.timedelta(days=30)
        elif timeframe == 'yearly':
            start_date = now - datetime.timedelta(days=365)
        else:
            start_date = now - datetime.timedelta(days=30)
            
        start_str = start_date.strftime("%Y-%m-%d %H:%M:%S")
        
        if report_type == "Production":
            res = supabase.postgrest.schema("suguna_aqua").table("PRODUCTION").select("*").gte("DATE", start_str).order("DATE", desc=True).execute()
            data = res.data or []
            return [{"DATE": r.get('DATE'), "250ML": r.get('250ML', 0), "500ML": r.get('500ML', 0), "1LTR": r.get('1LTR', 0), "2LTR": r.get('2LTR', 0), "5LTR": r.get('5LTR', 0), "20LTR": r.get('20LTR', 0), "BAGS": r.get('BAGS', 0)} for r in data]
            
        elif report_type == "Sales":
            res = supabase.postgrest.schema("suguna_aqua").table("SALES").select("*").eq("TYPE", "LINE").gte("DATE", start_str).order("DATE", desc=True).execute()
            data = res.data or []
            return [{"DRIVER": r.get('DRIVER'), "PLACE": r.get('ROUTE'), "MOBILE": r.get('MOBILE'), "DATE": r.get('DATE'), "250ML": r.get('250ML', 0), "500ML": r.get('500ML', 0), "1LTR": r.get('1LTR', 0), "2LTR": r.get('2LTR', 0), "5LTR": r.get('5LTR', 0), "20LTR": r.get('20LTR', 0), "BAGS": r.get('BAGS', 0), "QUANTITY": r.get('QUANTITY', 0)} for r in data]

        elif report_type == "Account Ledger":
            return get_ledger_report(head_name=specific_dealer, timeframe=timeframe)

        elif report_type == "Dealer Sales":
            # 1. Fetch current dealer prices for bill calculation
            dealers_resp = supabase.postgrest.schema("suguna_aqua").table("DEALERS").select("*").execute()
            dealer_map = {d['NAME']: d for d in (dealers_resp.data or [])}
            
            query = supabase.postgrest.schema("suguna_aqua").table("SALES").select("*").eq("TYPE", "DEALER").gte("DATE", start_str)
            if specific_dealer and specific_dealer != "All Dealers":
                query = query.eq("DRIVER", specific_dealer)
            
            response = query.order("DATE", desc=True).execute()
            data = response.data if response.data else []
            
            # 2. Enrich data
            for row in data:
                # Remove ID
                sales_id = str(row.pop('id', '0'))
                
                # Fetch Payments
                cash_resp = supabase.postgrest.schema("suguna_aqua").table("CASH")\
                    .select("PAID_BY_CUSTOMER")\
                    .eq("SALES_ID", sales_id).execute()
                row['PAID_AMOUNT'] = sum(float(c.get('PAID_BY_CUSTOMER') or 0) for c in (cash_resp.data or []))
                
                # Calculate Bill
                d_prices = dealer_map.get(row['DRIVER'], {})
                bill = 0
                for item in ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"]:
                    qty = int(row.get(item) or 0)
                    price = float(d_prices.get(f"PR_{item}") or 0)
                    bill += (qty * price)
                row['TOTAL_BILL'] = bill
                row['PENDING'] = bill - row['PAID_AMOUNT']
            # 3. Final Ordering
            ordered_data = []
            for row in data:
                ordered_data.append({
                    "DEALER": row.get('DRIVER'),
                    "PLACE": row.get('ROUTE'),
                    "MOBILE": row.get('MOBILE'),
                    "DATE": row.get('DATE'),
                    "250ML": row.get('250ML', 0),
                    "500ML": row.get('500ML', 0),
                    "1LTR": row.get('1LTR', 0),
                    "2LTR": row.get('2LTR', 0),
                    "5LTR": row.get('5LTR', 0),
                    "20LTR": row.get('20LTR', 0),
                    "BAGS": row.get('BAGS', 0),
                    "TOTAL_QTY": row.get('QUANTITY', 0),
                    "TOTAL_BILL": row.get('TOTAL_BILL', 0),
                    "PAID": row.get('PAID_AMOUNT', 0),
                    "PENDING": row.get('PENDING', 0)
                })

            return ordered_data
            
        else: # Calculated Stock Report
            dash_resp = supabase.postgrest.schema("suguna_aqua").table("DASHBOARD").select("OPENING_BALANCE").order("id", desc=True).limit(1).execute()
            opening = int(dash_resp.data[0]['OPENING_BALANCE'] or 0) if dash_resp.data else 0
            prod = supabase.postgrest.schema("suguna_aqua").table("PRODUCTION").select("*").execute()
            sales = supabase.postgrest.schema("suguna_aqua").table("SALES").select("*").execute()
            prod_total = 0
            for row in (prod.data or []):
                prod_total += sum(int(row.get(k) or 0) for k in ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"])
            sales_total = sum(int(item.get('QUANTITY') or 0) for item in (sales.data or []))
            return [{
                "REPORT_NAME": f"Stock Report ({timeframe})",
                "OPENING_BALANCE": opening, "TOTAL_PRODUCTION": prod_total,
                "TOTAL_SALES": sales_total, "FINAL_STOCK": opening + prod_total - sales_total,
                "GENERATED_AT": now.strftime("%Y-%m-%d %H:%M:%S")
            }]
    except Exception as e:
        print(f"REPORT ERROR ({report_type}): {e}")
        return []

def get_vehicles():
    try:
        response = supabase.postgrest.schema("suguna_aqua").table("VEHICLES").select("VEHICLE_NO").execute()
        return response.data if response.data else []
    except: return []

def get_routes():
    try:
        response = supabase.postgrest.schema("suguna_aqua").table("ROUTES").select("ROUTE").execute()
        return response.data if response.data else []
    except: return []

def add_route(route_name):
    try:
        response = supabase.postgrest.schema("suguna_aqua").table("ROUTES").insert({"ROUTE": route_name}).execute()
        return True
    except: return False

def save_sales_data(data):
    try:
        response = supabase.postgrest.schema("suguna_aqua").table("SALES").insert(data).execute()
        if response.data:
            return True, response.data[0].get('id')
        return True, None
    except Exception as e:
        print(f"SALES SAVE ERROR: {e}")
        return False, str(e)

def end_day_process():
    try:
        import datetime
        # 1. Get current calculated metrics
        metrics = get_dashboard_metrics()
        
        # 2. Prepare data for DASHBOARD insert (closing to opening rollover)
        new_entry = {
            "OPENING_BALANCE": metrics['STOCK'],
            "DATE": datetime.datetime.now().strftime("%Y-%m-%d"),
            "CASH_ON_HAND": metrics.get('CASH_ON_HAND', 0),
            "250ML": metrics['STOCK_DETAILS']['250ML'],
            "500ML": metrics['STOCK_DETAILS']['500ML'],
            "1LTR": metrics['STOCK_DETAILS']['1LTR'],
            "2LTR": metrics['STOCK_DETAILS']['2LTR'],
            "5LTR": metrics['STOCK_DETAILS']['5LTR'],
            "20LTR": metrics['STOCK_DETAILS']['20LTR'],
            "BAGS": metrics['STOCK_DETAILS']['BAGS']
        }
        
        # 3. Insert into DASHBOARD
        supabase.postgrest.schema("suguna_aqua").table("DASHBOARD").insert(new_entry).execute()
        return True
    except Exception as e:
        print(f"END DAY ERROR: {e}")
        return False

def get_todays_dispatches():
    try:
        import datetime
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        
        # 1. Get IDs of already settled dispatches from CASH table
        settled_resp = supabase.postgrest.schema("suguna_aqua").table("CASH").select("SALES_ID").execute()
        settled_ids = [str(item.get('SALES_ID')) for item in settled_resp.data if item.get('SALES_ID')]
        
        # 2. Fetch today's sales but EXCLUDE settled IDs and ONLY LINE type
        query = supabase.postgrest.schema("suguna_aqua").table("SALES")\
            .select("*")\
            .eq("TYPE", "LINE")\
            .gte("DATE", today + " 00:00:00")
            
        if settled_ids:
            query = query.filter("id", "not.in", f"({','.join(settled_ids)})")
            
        response = query.order("DATE", desc=True).execute()
        return response.data if response.data else []
    except Exception as e:
        print(f"DISPATCH FETCH ERROR: {e}")
        return []

def save_cash_entry(data):
    try:
        # Expected keys: DATE, VEHICLE_NO, DRIVER, TOTAL_AMOUNT, CASH_RECEIVED, EXPENSES, DUE, SALES_ID
        supabase.postgrest.schema("suguna_aqua").table("CASH").insert(data).execute()
        return True
    except Exception as e:
        print(f"CASH SAVE ERROR: {e}")
        return False

def get_driver_dues():
    try:
        # Group by DRIVER and sum DUE from CASH table
        resp = supabase.postgrest.schema("suguna_aqua").table("CASH").select("DRIVER, DUE").execute()
        dues = {}
        if resp.data:
            for row in resp.data:
                driver = row.get('DRIVER')
                due = float(row.get('DUE') or 0)
                dues[driver] = dues.get(driver, 0) + due
        return dues
    except: return {}

# --- DEALER MANAGEMENT ---

def get_dealers():
    try:
        resp = supabase.postgrest.schema("suguna_aqua").table("DEALERS").select("*").order("NAME").execute()
        return resp.data if resp.data else []
    except: return []

def add_dealer(data):
    try:
        # data: NAME, PLACE, PR_250ML, PR_500ML, PR_1LTR, PR_2LTR, PR_5LTR, PR_20LTR, PR_BAGS
        supabase.postgrest.schema("suguna_aqua").table("DEALERS").insert(data).execute()
        return True
    except Exception as e:
        print(f"ADD DEALER ERROR: {e}")
        return False

def update_dealer_prices(name, prices):
    try:
        supabase.postgrest.schema("suguna_aqua").table("DEALERS").update(prices).eq("NAME", name).execute()
        return True
    except Exception as e:
        print(f"UPDATE DEALER ERROR: {e}")
        return False

def get_dealer_dispatches(date_str):
    try:
        # Fetch dispatches
        resp = supabase.postgrest.schema("suguna_aqua").table("SALES")\
            .select("*")\
            .eq("TYPE", "DEALER")\
            .ilike("DATE", f"{date_str}%")\
            .order("DATE", desc=True).execute()
        
        dispatches = resp.data if resp.data else []
        
        # Hydrate with payment data from CASH table
        for d in dispatches:
            sales_id_str = str(d['id'])
            cash_resp = supabase.postgrest.schema("suguna_aqua").table("CASH")\
                .select("PAID_BY_CUSTOMER")\
                .eq("SALES_ID", sales_id_str).execute()
            
            total_paid = sum(float(row.get('PAID_BY_CUSTOMER') or 0) for row in (cash_resp.data or []))
            d['PAID_AMOUNT'] = total_paid
            
        return dispatches
    except Exception as e:
        print(f"DEALER FETCH ERROR: {e}")
        return []

# --- ACCOUNT LEDGER FUNCTIONS ---

def get_account_heads():
    try:
        resp = supabase.postgrest.schema("suguna_aqua").table("ACCOUNT_HEADS").select("*").order("NAME").execute()
        return resp.data if resp.data else []
    except: return []

def add_account_head(name):
    try:
        supabase.postgrest.schema("suguna_aqua").table("ACCOUNT_HEADS").insert({"NAME": name}).execute()
        return True
    except Exception as e:
        print(f"ADD HEAD ERROR: {e}")
        return False

def save_account_transaction(data):
    try:
        # data: HEAD_ID, HEAD_NAME, CREDIT, DEBIT, TO_BE_PAID, DATE
        supabase.postgrest.schema("suguna_aqua").table("ACCOUNT_TRANSACTIONS").insert(data).execute()
        return True
    except Exception as e:
        print(f"SAVE LEDGER ERROR: {e}")
        return False

def get_ledger_report(head_name=None, timeframe='monthly'):
    try:
        import datetime
        now = datetime.datetime.now()
        if timeframe == 'daily': start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif timeframe == 'weekly': start_date = now - datetime.timedelta(days=7)
        elif timeframe == 'monthly': start_date = now - datetime.timedelta(days=30)
        elif timeframe == 'yearly': start_date = now - datetime.timedelta(days=365)
        else: start_date = now - datetime.timedelta(days=30)
        
        start_str = start_date.strftime("%Y-%m-%d %H:%M:%S")
        
        query = supabase.postgrest.schema("suguna_aqua").table("ACCOUNT_TRANSACTIONS").select("*").gte("DATE", start_str)
        if head_name and head_name != "All Heads":
            query = query.eq("HEAD_NAME", head_name)
        
        resp = query.order("DATE", desc=True).execute()
        return resp.data if resp.data else []
    except Exception as e:
        print(f"LEDGER REPORT ERROR: {e}")
        return []
