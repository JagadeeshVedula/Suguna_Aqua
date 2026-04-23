document.addEventListener('DOMContentLoaded', () => {
    // Initialize Icons
    lucide.createIcons();

    // App State
    const state = {
        user: JSON.parse(localStorage.getItem('suguna_user')),
        activeTab: 'dashboard',
        dues: [],
        charts: {}
    };

    // UI Elements
    const loader = document.getElementById('app-loader');
    const loginView = document.getElementById('login-view');
    const appRoot = document.getElementById('app-root');
    const loginForm = document.getElementById('login-form');
    const navBtns = document.querySelectorAll('.nav-btn');
    const panes = document.querySelectorAll('.tab-pane');
    const tabIndicator = document.getElementById('tab-indicator');

    // --- Bootstrapping ---
    setTimeout(() => {
        if (state.user) {
            showApp();
        } else {
            showLogin();
        }
    }, 1000);

    // --- Navigation ---
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = btn.getAttribute('data-t');
            switchTab(tabId);
        });
    });

    function switchTab(tabId) {
        state.activeTab = tabId;
        
        // UI Updates
        navBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-t') === tabId));
        panes.forEach(p => p.classList.toggle('active', p.id === `pane-${tabId}`));
        
        const labels = { dashboard: 'Dashboard', dues: 'Dues & Collections', trends: 'Market Trends' };
        tabIndicator.innerText = labels[tabId];

        // Data Loading
        if (tabId === 'dashboard') loadDashboard();
        if (tabId === 'dues') loadDues();
        if (tabId === 'trends') loadTrends();
        
        lucide.createIcons();
    }

    // --- Authentication ---
    function showLogin() {
        loader.classList.add('hidden');
        loginView.classList.remove('hidden');
        appRoot.classList.add('hidden');
    }

    function showApp() {
        loader.classList.add('hidden');
        loginView.classList.add('hidden');
        appRoot.classList.remove('hidden');
        loadDashboard();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        btn.innerText = 'Signing in...';
        btn.disabled = true;

        const res = await SupabaseService.verifyUser(
            document.getElementById('username').value,
            document.getElementById('password').value
        );

        if (res.success) {
            state.user = res.user;
            localStorage.setItem('suguna_user', JSON.stringify(res.user));
            showApp();
        } else {
            alert(res.message);
            btn.innerText = 'Sign In';
            btn.disabled = false;
        }
    });

    document.getElementById('logout-trigger').onclick = () => {
        localStorage.removeItem('suguna_user');
        location.reload();
    };

    // --- Dashboard Data ---
    async function loadDashboard() {
        try {
            const metrics = await SupabaseService.getDashboardMetrics();
            document.getElementById('val-prod').innerText = metrics.PRODUCTION.toLocaleString();
            document.getElementById('val-sales').innerText = metrics.SALES.toLocaleString();
            document.getElementById('val-stock').innerText = metrics.STOCK.toLocaleString();
            document.getElementById('val-cash').innerText = '₹' + metrics.CASH_ON_HAND.toLocaleString();

            // RM Stock
            const rm = await SupabaseService.getRawMaterialMetrics();
            const rmContainer = document.getElementById('rm-container');
            rmContainer.innerHTML = '';
            
            const important = ['PB_1LTR', 'PB_500ML', 'LR_1LTR', 'LR_500ML', 'GUM_PACKETS', 'CAP_BOXES'];
            important.forEach(k => {
                const item = document.createElement('div');
                item.className = 'list-item-row';
                item.innerHTML = `
                    <div class="info">
                        <div class="title">${k.replace('_', ' ')}</div>
                        <div class="meta">Inventory Level</div>
                    </div>
                    <div class="value-tag">${rm.CB[k] || 0}</div>
                `;
                rmContainer.appendChild(item);
            });

            // Recent Production
            const prods = await SupabaseService.getReportData('Production', 'weekly');
            const prodContainer = document.getElementById('prod-container');
            prodContainer.innerHTML = '';
            prods.slice(0, 5).forEach(row => {
                const total = (parseInt(row['1LTR']||0) + parseInt(row['500ML']||0) + parseInt(row['250ML']||0) + parseInt(row['20LTR']||0));
                const card = document.createElement('div');
                card.className = 'data-card list-item-row';
                card.innerHTML = `
                    <div class="info">
                        <div class="title">Batch ${new Date(row.DATE).toLocaleDateString()}</div>
                        <div class="meta">${new Date(row.DATE).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    </div>
                    <div class="value-tag" style="color:var(--primary)">+${total}</div>
                `;
                prodContainer.appendChild(card);
            });

            document.getElementById('refresh-rm').onclick = loadDashboard;
        } catch (e) { console.error(e); }
    }

    // --- Dues Data ---
    async function loadDues() {
        const container = document.getElementById('dues-container');
        container.innerHTML = '<div class="loader"><div class="pulse-loader" style="width:40px;height:40px"></div></div>';
        state.dues = await SupabaseService.getReportData('Dues Report');
        renderDues();
    }

    function renderDues() {
        const container = document.getElementById('dues-container');
        const search = document.getElementById('due-search').value.toLowerCase();
        const filter = document.querySelector('.chip.active').getAttribute('data-f');

        let filtered = state.dues;
        if (filter === 'line') filtered = filtered.filter(d => d.CATEGORY === 'DRIVER');
        if (filter === 'dealer') filtered = filtered.filter(d => d.CATEGORY === 'DEALER');
        
        if (search) {
            filtered = filtered.filter(d => d.NAME.toLowerCase().includes(search));
        }

        container.innerHTML = '';
        if (filtered.length === 0) {
            container.innerHTML = '<div class="data-card" style="text-align:center;color:var(--text-muted)">No matching records</div>';
            return;
        }

        filtered.forEach(due => {
            const card = document.createElement('div');
            card.className = 'data-card list-item-row';
            card.innerHTML = `
                <div class="info">
                    <div class="title">${due.NAME}</div>
                    <div class="meta">${new Date(due.DATE).toLocaleDateString()} • ${due.CATEGORY}</div>
                </div>
                <div class="value-tag" style="color:var(--danger)">₹${parseFloat(due.DUE).toLocaleString()}</div>
            `;
            container.appendChild(card);
        });
    }

    document.querySelectorAll('.chip').forEach(c => {
        c.onclick = () => {
            document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
            c.classList.add('active');
            renderDues();
        };
    });

    document.getElementById('due-search').oninput = renderDues;

    // --- Trends Data ---
    async function loadTrends() {
        const end = new Date().toLocaleDateString('en-CA');
        const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
        
        const prod = await SupabaseService.getReportData('Production', null, null, null, {start, end});
        const sales = await SupabaseService.getReportData('All Transactions', null, null, null, {start, end});

        const days = [];
        for(let i=6; i>=0; i--) days.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA'));

        const pData = days.map(d => prod.filter(r => r.DATE.startsWith(d)).reduce((s, r) => s + (parseInt(r['1LTR']||0) + parseInt(row['500ML']||0)), 0));
        // Fixed typo in previous line (row -> r)
        const pDataFixed = days.map(d => prod.filter(r => r.DATE.startsWith(d)).reduce((s, r) => s + (parseInt(r['1LTR']||0) + parseInt(r['500ML']||0)), 0));
        const sData = days.map(d => sales.filter(r => r.DATE.startsWith(d) && r.TYPE === 'SALE').reduce((s, r) => s + (parseInt(r['1LTR']||0) + parseInt(r['500ML']||0)), 0));

        initChart('chart-prod', days.map(d => d.split('-')[2]), pDataFixed, '#38bdf8');
        initChart('chart-sales', days.map(d => d.split('-')[2]), sData, '#34d399');

        const avg = await SupabaseService.getTrendData(start, end);
        const rmCont = document.getElementById('rm-trends-container');
        rmCont.innerHTML = '';
        if (avg?.rm) {
            ['PB_1LTR', 'PB_500ML'].forEach(k => {
                const item = document.createElement('div');
                item.className = 'list-item-row';
                item.innerHTML = `<div class="info"><div class="title">${k.replace('_', ' ')}</div><div class="meta">Daily Avg Usage</div></div><div class="value-tag">${avg.rm[k].used}</div>`;
                rmCont.appendChild(item);
            });
        }
    }

    function initChart(id, labels, data, color) {
        if (state.charts[id]) state.charts[id].destroy();
        const ctx = document.getElementById(id).getContext('2d');
        state.charts[id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{ data, borderColor: color, backgroundColor: color + '10', borderWidth: 3, fill: true, tension: 0.4, pointRadius: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                }
            }
        });
    }
});
