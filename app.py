from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify, send_file
from supabase_handler import verify_user, get_dashboard_metrics, save_production_data, get_filtered_data, get_vehicles, get_routes, add_route, save_sales_data, end_day_process, get_todays_dispatches, save_cash_entry, get_driver_dues, get_dealers, add_dealer, update_dealer_prices, get_dealer_dispatches
import os, datetime, io
import pandas as pd

app = Flask(__name__)
app.secret_key = os.urandom(24)

@app.route('/')
def index():
    if 'user' in session:
        return redirect(url_for('products'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        success, result = verify_user(username, password)
        if success:
            session['user'] = result
            return redirect(url_for('products'))
        else:
            flash(f"Login Failed: {result}", "error")
            
    return render_template('login.html')

@app.route('/products')
def products():
    if 'user' not in session:
        return redirect(url_for('login'))
    metrics = get_dashboard_metrics()
    vehicles = get_vehicles()
    routes = get_routes()
    todays_dispatches = get_todays_dispatches()
    driver_dues = get_driver_dues()
    dealers = get_dealers()
    return render_template('products.html', metrics=metrics, vehicles=vehicles, routes=routes, todays_dispatches=todays_dispatches, driver_dues=driver_dues, dealers=dealers)

@app.route('/save_production', methods=['POST'])
def save_production():
    if 'user' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401
    
    try:
        data = {
            "250ML": int(request.form.get('250ml', 0)),
            "500ML": int(request.form.get('500ml', 0)),
            "1LTR": int(request.form.get('1ltr', 0)),
            "2LTR": int(request.form.get('2ltr', 0)),
            "5LTR": int(request.form.get('5ltr', 0)),
            "20LTR": int(request.form.get('20ltr', 0)),
            "BAGS": int(request.form.get('bags', 0)),
            "DATE": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        success, result = save_production_data(data)
        if success:
            flash("Production data saved successfully!", "success")
            return redirect(url_for('products'))
        else:
            flash(f"Error saving data: {result}", "error")
            return redirect(url_for('products'))
            
    except ValueError:
        flash("Please enter valid numbers.", "error")
        return redirect(url_for('products'))

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

@app.route('/get_report_data', methods=['GET'])
def get_report_data():
    if 'user' not in session: return jsonify([])
    report_type = request.args.get('type', 'Production')
    timeframe = request.args.get('timeframe', 'monthly')
    dealer_name = request.args.get('dealer')
    data = get_filtered_data(report_type, timeframe, specific_dealer=dealer_name)
    return jsonify(data)

@app.route('/export_report', methods=['GET'])
def export_report():
    if 'user' not in session: return "Unauthorized", 401
    
    report_type = request.args.get('type', 'Production')
    timeframe = request.args.get('timeframe', 'monthly')
    dealer_name = request.args.get('dealer') # New parameter for filtering
    data = get_filtered_data(report_type, timeframe, specific_dealer=dealer_name)
    
    if not data:
        flash("No data found for the selected report.", "error")
        return redirect(url_for('products'))

    df = pd.DataFrame(data)
    
    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Report')
    output.seek(0)
    
    filename = f"Suguna_Aqua_{report_type}_{timeframe}_{datetime.date.today()}.xlsx"
    return send_file(output, as_attachment=True, download_name=filename, 
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@app.route('/save_sales', methods=['POST'])
def save_sales():
    if 'user' not in session: return jsonify({"success": False}), 401
    try:
        p250 = int(request.form.get('250ml', 0))
        p500 = int(request.form.get('500ml', 0))
        p1ltr = int(request.form.get('1ltr', 0))
        p2ltr = int(request.form.get('2ltr', 0))
        p5ltr = int(request.form.get('5ltr', 0))
        p20ltr = int(request.form.get('20ltr', 0))
        pbags = int(request.form.get('bags', 0))
        total_qty = p250 + p500 + p1ltr + p2ltr + p5ltr + p20ltr + pbags
        data = {
            "VEHICLE_NO": request.form.get('vehicle_no'),
            "DRIVER": request.form.get('driver_name'),
            "MOBILE": request.form.get('driver_mobile'),
            "ADHAR": request.form.get('aadhar_no'),
            "ROUTE": request.form.get('route'),
            "250ML": p250, "500ML": p500, "1LTR": p1ltr,
            "2LTR": p2ltr, "5LTR": p5ltr, "20LTR": p20ltr, "BAGS": pbags,
            "QUANTITY": total_qty,
            "DATE": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "TYPE": "LINE"
        }
        success, result = save_sales_data(data)
        if success: flash("Sales recorded successfully!", "success")
        else: flash(f"Error: {result}", "error")
    except Exception as e: flash(f"Error: {e}", "error")
    return redirect(url_for('products'))

@app.route('/add_route_entry', methods=['POST'])
def add_route_entry():
    if 'user' not in session: return jsonify({"success": False}), 401
    route_name = request.form.get('new_route')
    if route_name:
        if add_route(route_name): flash(f"Route '{route_name}' added!", "success")
        else: flash("Failed to add route", "error")
    return redirect(url_for('products'))

@app.route('/end_day')
def end_day():
    if 'user' not in session: return redirect(url_for('login'))
    if end_day_process():
        flash("Day closed successfully! Current stock set as opening for next entry.", "success")
    else:
        flash("Failed to close day. Check terminal for errors.", "error")
    return redirect(url_for('products'))

@app.route('/save_cash_entry', methods=['POST'])
def save_cash_entry_route():
    if 'user' not in session: return jsonify({"success": False}), 401
    try:
        data = {
            "DATE": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "VEHICLE_NO": request.form.get('vehicle_no'),
            "DRIVER": request.form.get('driver'),
            "TOTAL_AMOUNT": request.form.get('total_amount', '0'),
            "PAID_BY_CUSTOMER": request.form.get('paid_by_customer', '0'),
            "EXPENSES": request.form.get('expenses', '0'),
            "CASH_RECEIVED": request.form.get('cash_received', '0'),
            "DUE": request.form.get('due', '0'),
            "SALES_ID": request.form.get('sales_id'),
            # Itemized quantities sold (total across all customers for this settlement)
            "250ML": request.form.get('sold_250ml', '0'),
            "500ML": request.form.get('sold_500ml', '0'),
            "1LTR": request.form.get('sold_1ltr', '0'),
            "2LTR": request.form.get('sold_2ltr', '0'),
            "5LTR": request.form.get('sold_5ltr', '0'),
            "20LTR": request.form.get('sold_20ltr', '0'),
            "BAGS": request.form.get('sold_bags', '0')
        }
        if save_cash_entry(data): flash("Settlement recorded and added to Sales metrics!", "success")
        else: flash("Error saving settlement", "error")
    except Exception as e: flash(f"Error: {e}", "error")
    return redirect(url_for('products'))

@app.route('/add_dealer', methods=['POST'])
def add_dealer_route():
    if 'user' not in session: return redirect(url_for('login'))
    data = {
        "NAME": request.form.get('name'),
        "PLACE": request.form.get('place'),
        "MOBILE": request.form.get('mobile'),
        "ADHAR": request.form.get('adhar'),
        "PR_250ML": request.form.get('pr_250ml', '0'),
        "PR_500ML": request.form.get('pr_500ml', '0'),
        "PR_1LTR": request.form.get('pr_1ltr', '0'),
        "PR_2LTR": request.form.get('pr_2ltr', '0'),
        "PR_5LTR": request.form.get('pr_5ltr', '0'),
        "PR_20LTR": request.form.get('pr_20ltr', '0'),
        "PR_BAGS": request.form.get('pr_bags', '0')
    }
    if add_dealer(data): flash("Dealer added!", "success")
    else: flash("Error adding dealer", "error")
    return redirect(url_for('products'))

@app.route('/update_dealer_prices', methods=['POST'])
def update_dealer_route():
    if 'user' not in session: return redirect(url_for('login'))
    name = request.form.get('name')
    prices = {
        "PR_250ML": request.form.get('pr_250ml', '0'),
        "PR_500ML": request.form.get('pr_500ml', '0'),
        "PR_1LTR": request.form.get('pr_1ltr', '0'),
        "PR_2LTR": request.form.get('pr_2ltr', '0'),
        "PR_5LTR": request.form.get('pr_5ltr', '0'),
        "PR_20LTR": request.form.get('pr_20ltr', '0'),
        "PR_BAGS": request.form.get('pr_bags', '0')
    }
    if update_dealer_prices(name, prices): flash("Prices updated!", "success")
    return redirect(url_for('products'))

@app.route('/save_dealer_dispatch', methods=['POST'])
def save_dealer_dispatch():
    if 'user' not in session: return redirect(url_for('login'))
    
    total_amount = float(request.form.get('total_amount', '0'))
    amount_paid = float(request.form.get('amount_paid', '0'))
    dealer_name = request.form.get('dealer_name')
    place = request.form.get('place')

    # 1. Reduction from Stock (Insert into SALES table)
    sales_data = {
        "DATE": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "VEHICLE_NO": "DEALER_SALE",
        "DRIVER": dealer_name,
        "ROUTE": place,
        "QUANTITY": request.form.get('total_qty', '0'),
        "250ML": request.form.get('250ml', '0'),
        "500ML": request.form.get('500ml', '0'),
        "1LTR": request.form.get('1ltr', '0'),
        "2LTR": request.form.get('2ltr', '0'),
        "5LTR": request.form.get('5ltr', '0'),
        "20LTR": request.form.get('20ltr', '0'),
        "BAGS": request.form.get('bags', '0'),
        "TYPE": "DEALER"
    }
    success, sales_id = save_sales_data(sales_data) # This reduces stock

    # 2. Financial Record (Always record to show in metrics)
    if success:
        cash_data = {
            "DATE": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "VEHICLE_NO": "DEALER_SALE",
            "DRIVER": dealer_name,
            "TOTAL_AMOUNT": total_amount,
            "PAID_BY_CUSTOMER": amount_paid,
            "EXPENSES": "0",
            "CASH_RECEIVED": amount_paid,
            "DUE": total_amount - amount_paid,
            "SALES_ID": sales_id or "0",
            "250ML": request.form.get('250ml', '0'),
            "500ML": request.form.get('500ml', '0'),
            "1LTR": request.form.get('1ltr', '0'),
            "2LTR": request.form.get('2ltr', '0'),
            "5LTR": request.form.get('5ltr', '0'),
            "20LTR": request.form.get('20ltr', '0'),
            "BAGS": request.form.get('bags', '0')
        }
        save_cash_entry(cash_data)
        if amount_paid > 0:
            flash(f"Dealer Sale saved! ₹{amount_paid} added to Cash on Hand.", "success")
        else:
            flash("Dealer Sale saved as Credit (Unpaid).", "success")
    else:
        flash(f"Error saving dispatch: {sales_id}", "error")

    return redirect(url_for('products'))

@app.route('/fetch_dealer_dispatches')
def fetch_dealer_dispatches_route():
    if 'user' not in session: return jsonify([])
    date = request.args.get('date')
    if not date: return jsonify([])
    return jsonify(get_dealer_dispatches(date))

@app.route('/update_dealer_payment', methods=['POST'])
def update_dealer_payment():
    if 'user' not in session: return redirect(url_for('login'))
    
    # This adds a payment entry for a PAST dealer dispatch
    amount_paid = float(request.form.get('amount_paid', '0'))
    total_amount = float(request.form.get('total_amount', '0'))
    sales_id = request.form.get('sales_id')
    dealer_name = request.form.get('dealer_name')

    if amount_paid > 0:
        cash_data = {
            "DATE": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "VEHICLE_NO": "DEALER_PAYMENT",
            "DRIVER": dealer_name,
            "TOTAL_AMOUNT": total_amount,
            "PAID_BY_CUSTOMER": amount_paid,
            "EXPENSES": "0",
            "CASH_RECEIVED": amount_paid,
            "DUE": 0, # Subsequent payment
            "SALES_ID": sales_id,
            "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0
        }
        save_cash_entry(cash_data)
        flash(f"Payment of ₹{amount_paid} recorded for {dealer_name}", "success")
    
    return redirect(url_for('products'))

if __name__ == '__main__':
    app.run(debug=True)
