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
        
        const labels = { dashboard: 'Dashboard', update: 'Update Production' };
        tabIndicator.innerText = labels[tabId] || 'Dashboard';

        // Data Loading
        if (tabId === 'dashboard') loadDashboard();
        
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
        setupProductionForm();
    }

    function setupProductionForm() {
        const form = document.getElementById('prod-entry-form');
        if (!form) return;
        
        form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            btn.innerText = 'Saving...';
            btn.disabled = true;

            const products = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"];
            const data = {};
            let hasData = false;

            products.forEach(p => {
                const val = document.getElementById(`p-${p}`).value;
                if (val) {
                    data[p] = parseInt(val);
                    hasData = true;
                } else {
                    data[p] = 0;
                }
            });

            if (!hasData) {
                alert("Please enter at least one quantity");
                btn.innerText = 'Save Production';
                btn.disabled = false;
                return;
            }

            try {
                const res = await SupabaseService.saveProduction(data);
                if (res.error) throw res.error;
                alert("Production data saved successfully!");
                form.reset();
                switchTab('dashboard');
            } catch (err) {
                alert("Error saving data: " + err.message);
            } finally {
                btn.innerText = 'Save Production';
                btn.disabled = false;
            }
        };
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
            btn.innerText = 'Login to Dashboard';
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
                const total = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"].reduce((sum, k) => sum + parseInt(row[k]||0), 0);
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
});
