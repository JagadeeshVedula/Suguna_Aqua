import os
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv
import pandas as pd
from io import BytesIO

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "default_secret_key")

# Supabase Setup
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

@app.route('/')
def index():
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        try:
            response = supabase.table('CRED').select('*').eq('USERNAME', username).eq('PASSWORD', password).execute()
            if response.data:
                session['user'] = username
                return redirect(url_for('dashboard'))
            else:
                return render_template('login.html', error="Invalid Username or Password")
        except Exception as e:
            return render_template('login.html', error=str(e))
            
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('base.html')

# --- API Endpoints ---

@app.route('/api/module/<module_name>')
def get_module(module_name):
    if 'user' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    template_path = f"modules/{module_name}.html"
    try:
        return render_template(template_path)
    except:
        return f"<div style='padding:2rem;'><h3>Module '{module_name}' is currently being developed.</h3><p>Parity with Flutter version is in progress.</p></div>", 404

@app.route('/api/students/<student_id>', methods=['GET', 'POST'])
def handle_student(student_id):
    if 'user' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Safely convert to integer if possible, otherwise keep as string
    try:
        lookup_id = int(student_id)
    except:
        lookup_id = student_id
        
    if request.method == 'GET':
        try:
            response = supabase.table('STUDENTS').select('*').eq('id', lookup_id).execute()
            if response.data:
                return jsonify(response.data[0])
            else:
                return jsonify({"error": "Student not found"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        
    if request.method == 'POST':
        update_data = request.json
        try:
            supabase.table('STUDENTS').update(update_data).eq('id', lookup_id).execute()
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

@app.route('/api/stats')
def get_stats():
    if 'user' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        # 1. Academic Students (STUDENTS count)
        students_res = supabase.table('STUDENTS').select('id', count='exact').execute()
        students_count = students_res.count or 0
        
        # 2. Total Dropouts
        dropout_res = supabase.table('DROPOUT').select('id', count='exact').execute()
        dropout_count = dropout_res.count or 0
        
        # 3. Total Students (STUDENTS + DROPOUT)
        total_students = students_count + dropout_count
        
        # 4. Total Classes (FEE STRUCTURE - CLASS count)
        classes_data = supabase.table('FEE STRUCTURE').select('CLASS').execute()
        total_classes = len(set([d['CLASS'] for d in classes_data.data if d.get('CLASS')])) if classes_data.data else 0
        
        # 5. Total Sections (Unique from CLASS_TEACHER - CLASS column)
        sections_data = supabase.table('CLASS_TEACHER').select('CLASS').execute()
        total_sections = len(set([d['CLASS'] for d in sections_data.data if d.get('CLASS')])) if sections_data.data else 0
        
        return jsonify({
            "total_students": total_students,
            "total_classes": total_classes,
            "total_sections": total_sections,
            "academic_students": students_count,
            "total_dropouts": dropout_count
        })
    except Exception as e:
        print(f"Stats error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/students')
def get_students():
    if 'user' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    class_f = request.args.get('class', 'All')
    section_f = request.args.get('section', 'All')
    search_q = request.args.get('search', '')

    query = supabase.table('STUDENTS').select('*')
    
    # Matching exact column "Class" (Case Sensitive)
    if class_f != 'All' and section_f != 'All':
        query = query.eq('Class', f"{class_f}-{section_f}")
    elif class_f != 'All':
        query = query.ilike('Class', f"{class_f}-%")
    elif section_f != 'All':
        query = query.ilike('Class', f"%-{section_f}")

    try:
        data = query.execute().data
        if search_q:
            search_q = search_q.lower()
            data = [d for d in data if search_q in str(d.get('Name', '')).lower() or search_q in str(d.get('id', '')).lower()]
        return jsonify(data)
    except Exception as e:
        print(f"Students fetch error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/staff')
def get_staff():
    if 'user' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        data = supabase.table('STAFF').select('*').execute().data
        search_q = request.args.get('search', '').lower()
        if search_q:
            data = [d for d in data if search_q in str(d.get('Name', '')).lower()]
        return jsonify(data)
    except Exception as e:
        print(f"Staff fetch error: {e}")
        return jsonify({"error": str(e)}), 500

# Registration Endpoints
@app.route('/api/register/<type>', methods=['POST'])
def register_record(type):
    if 'user' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    table_map = {
        'student': 'STUDENTS',
        'staff': 'STAFF',
        'transport': 'TRANSPORT',
        'performance': 'PERFORMANCE'
    }
    
    target_table = table_map.get(type)
    if not target_table:
        return jsonify({"error": "Invalid registration type"}), 400
        
    try:
        supabase.table(target_table).insert(data).execute()
        return jsonify({"success": True})
    except Exception as e:
        print(f"Register {type} error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/staff/assign', methods=['POST'])
def assign_staff_class():
    if 'user' not in session: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    try:
        supabase.table('CLASS_TEACHER').insert(data).execute()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/staff/remove-class', methods=['POST'])
def remove_staff_class():
    if 'user' not in session: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    try:
        supabase.table('CLASS_TEACHER').delete().eq('STAFF', data['STAFF']).eq('CLASS', data['CLASS']).execute()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/class-strength')
def get_class_strength():
    if 'user' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        # Group by Class and count
        res = supabase.table('STUDENTS').select('Class').execute()
        from collections import Counter
        counts = Counter([d['Class'] for d in res.data if d.get('Class')])
        
        # Format for table: [{ "class_name": "I-A", "strength": 32 }, ...]
        strength_data = [{"class_name": k, "strength": v} for k, v in counts.items()]
        # Sort by class name
        strength_data.sort(key=lambda x: x['class_name'])
        
        return jsonify(strength_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
