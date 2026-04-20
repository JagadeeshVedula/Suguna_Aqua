async function loadModule(moduleName, element) {
    const viewport = document.getElementById('page-viewport');
    if (element) {
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }

    viewport.innerHTML = `<div class="text-center" style="padding-top: 100px;"><i class="fas fa-spinner fa-spin fa-3x" style="color:#3b82f6;"></i><p style="margin-top:1rem;color:#64748b;">Loading ${moduleName}...</p></div>`;

    try {
        const response = await fetch(`/api/module/${moduleName}`);
        const html = await response.text();
        viewport.innerHTML = html;
        if (moduleName === 'dashboard') initDashboard();
        else if (moduleName === 'students') initStudents();
        else if (moduleName === 'staff') initStaff();
    } catch (error) {
        viewport.innerHTML = `<div class="error-msg">Error loading module: ${error}</div>`;
    }
}

async function initDashboard() {
    try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        document.getElementById('total-students').innerText = stats.total_students || 0;
        document.getElementById('total-classes').innerText = stats.total_classes || 0;
        document.getElementById('total-sections').innerText = stats.total_sections || 0;
        document.getElementById('academic-students').innerText = stats.academic_students || 0;
        document.getElementById('total-dropouts').innerText = stats.total_dropouts || 0;

        const strengthRes = await fetch('/api/class-strength');
        const strengthData = await strengthRes.json();
        const tbody = document.getElementById('strength-table-body');
        if (tbody) {
            tbody.innerHTML = strengthData.map(item => {
                const parts = (item.class_name || 'N/A').split('-');
                return `<tr><td>${parts[0]}</td><td>${parts[1] || ''}</td><td>${item.strength}</td><td><small style="color:green;">Active</small></td></tr>`;
            }).join('');
        }
    } catch (e) { console.error(e); }
}

// --- Students Module ---
async function initStudents() {
    const classSelect = document.getElementById('filter-class');
    if (classSelect) {
        const classes = ['LKG', 'UKG', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        classes.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.innerText = c; classSelect.appendChild(opt); });
    }
    fetchStudents();
}

async function fetchStudents() {
    const cls = document.getElementById('filter-class').value;
    const sec = document.getElementById('filter-section').value;
    const search = document.getElementById('search-student').value;
    const tbody = document.getElementById('students-list');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';
    
    try {
        const res = await fetch(`/api/students?class=${cls}&section=${sec}&search=${search}`);
        const data = await res.json();
        if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center">No records.</td></tr>'; return; }
        
        tbody.innerHTML = data.slice(0, 500).map(s => `
            <tr>
                <td>${s.id}</td>
                <td>${s.Name || 'N/A'}</td>
                <td>${s.Class || 'N/A'}</td>
                <td>${s['Father Name'] || 'N/A'}</td>
                <td>${s['Parent Mobile'] || 'N/A'}</td>
                <td>
                    <button class="primary-btn" style="padding:4px 8px; font-size:12px;" onclick="viewStudent('${s.id}')">View</button>
                    <button class="primary-btn" style="padding:4px 8px; font-size:12px; background:#64748b;" onclick="editStudent('${s.id}')">Edit</button>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="6" class="error-msg">${e}</td></tr>`; }
}

async function viewStudent(id) {
    const modal = document.getElementById('student-modal');
    const content = document.getElementById('modal-content');
    modal.style.display = 'block';
    content.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Fetching details...</div>';
    
    try {
        const res = await fetch(`/api/students/${id}`);
        const s = await res.json();
        
        let detailsHtml = `<div style="display:flex; gap:25px; margin-bottom:2rem;">
            <img src="${s.PHOTO_URL || 'https://via.placeholder.com/150'}" style="width:140px; height:160px; object-fit:cover; border-radius:12px; border:3px solid #f1f5f9;">
            <div style="flex:1;">
                <h2 style="color:var(--primary-color); margin-bottom:5px;">${s.Name}</h2>
                <p style="color:var(--text-muted); font-weight:500;">Class: ${s.Class} | ID: ${id}</p>
                <hr style="margin: 15px 0; border:0; border-top:1px solid #e2e8f0;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.95rem;">
                    <p><strong>Father:</strong> ${s['Father Name'] || '-'}</p>
                    <p><strong>Mother:</strong> ${s['Mother Name'] || '-'}</p>
                    <p><strong>Mobile:</strong> ${s['Parent Mobile'] || '-'}</p>
                    <p><strong>Aadhar:</strong> ${s.AADHAR || '-'}</p>
                </div>
            </div>
        </div>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:1.5rem; background:#f8fafc; padding:1.5rem; border-radius:12px;">`;
        
        // Add remaining technical fields
        const skip = ['id', 'Name', 'Class', 'Father Name', 'Mother Name', 'Parent Mobile', 'PHOTO_URL', 'AADHAR'];
        Object.keys(s).forEach(key => {
            if (!skip.includes(key)) {
                detailsHtml += `<div><label style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">${key}</label><p style="margin-top:2px;">${s[key] || '-'}</p></div>`;
            }
        });
        
        detailsHtml += `</div>`;
        content.innerHTML = detailsHtml;
    } catch (e) { content.innerHTML = `<p class="error-msg">Error: ${e}</p>`; }
}

async function editStudent(id) {
    const modal = document.getElementById('student-modal');
    modal.style.display = 'block';
    const content = document.getElementById('modal-content');
    content.innerHTML = 'Loading form...';
    
    try {
        const res = await fetch(`/api/students/${id}`);
        const s = await res.json();
        
        let formHtml = `<h3>Edit Record: ${s.Name}</h3><form id="edit-form" class="form-grid" style="margin-top:20px; max-height:60vh; overflow-y:auto; padding:10px;">`;
        
        // Generate inputs for all keys
        Object.keys(s).forEach(key => {
            if (key === 'id') return;
            formHtml += `<div class="form-group"><label class="form-label">${key}</label><input type="text" name="${key}" class="form-control" value="${s[key] || ''}"></div>`;
        });
        
        formHtml += `<div style="grid-column:span 2; margin-top:1rem;"><button type="button" class="primary-btn" style="width:100%;" onclick="saveStudent('${id}')">Update Database</button></div></form>`;
        content.innerHTML = formHtml;
    } catch (e) { content.innerHTML = `<p>Error: ${e}</p>`; }
}

async function saveStudent(id) {
    const data = {};
    new FormData(document.getElementById('edit-form')).forEach((v, k) => data[k] = v);
    try {
        const res = await fetch(`/api/students/${id}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if ((await res.json()).success) { alert('Record Synchronized!'); closeModal(); fetchStudents(); }
    } catch (e) { alert('Update failed: ' + e); }
}

function closeModal() { document.getElementById('student-modal').style.display = 'none'; }

// --- Staff Module ---
async function initStaff() { fetchStaff(); }

async function fetchStaff() {
    const search = document.getElementById('search-staff').value;
    const type = document.getElementById('staff-type').value;
    const tbody = document.getElementById('staff-list');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading Staff...</td></tr>';
    try {
        const res = await fetch(`/api/staff?search=${search}`);
        const data = await res.json();
        tbody.innerHTML = data.filter(s => type === 'All' || s.StaffType === type).map(s => `
            <tr>
                <td>${s.Name || 'N/A'}</td>
                <td>${s.Qualification || '-'}</td>
                <td>${s.Mobile || '-'}</td>
                <td>${s.StaffType || '-'}</td>
                <td>
                    <button class="primary-btn" style="padding:4px 8px; font-size:11px; background:#10b981;" onclick="staffAction('assign', '${s.Name}')">Assign</button>
                    <button class="primary-btn" style="padding:4px 8px; font-size:11px; background:#ef4444;" onclick="staffAction('remove', '${s.Name}')">Remove</button>
                </td>
            </tr>`).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="5">${e}</td></tr>`; }
}

async function staffAction(action, staffName) {
    if (action === 'assign') {
        const cls = prompt("Enter Class-Section to assign (e.g. I-A):");
        if (!cls) return;
        const res = await fetch('/api/staff/assign', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ STAFF: staffName, CLASS: cls })
        });
        const resJson = await res.json();
        alert(resJson.success ? "Class assigned!" : "Error: " + resJson.error);
    } else if (action === 'remove') {
        const cls = prompt("Enter Class-Section to remove (MUST exist in assignments):");
        if (!cls) return;
        const res = await fetch('/api/staff/remove-class', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ STAFF: staffName, CLASS: cls })
        });
        const resJson = await res.json();
        alert(resJson.success ? "Assignment removed!" : "Error: " + resJson.error);
    }
}

async function submitRegister(type, formId) {
    const data = {};
    new FormData(document.getElementById(formId)).forEach((v, k) => data[k] = v);
    try {
        const res = await fetch(`/api/register/${type}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            alert(type.toUpperCase() + " successfully registered!");
            document.getElementById(formId).reset();
        } else alert("Error: " + result.error);
    } catch (e) { alert("Network error: " + e); }
}
