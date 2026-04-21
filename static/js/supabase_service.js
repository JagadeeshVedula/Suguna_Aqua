const SUPABASE_URL = "https://mggcskkkricnmkjqdqai.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZ2Nza2trcmljbm1ranFkcWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNjk4MjQsImV4cCI6MjA3ODc0NTgyNH0.Z74XcwusKBcVr82QWU5UxKBRgwyAILwKXiVgyTg5SaQ";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'suguna_aqua' }
});

const _getTodayDate = () => {
    return new Date().toLocaleDateString('en-CA'); // Guaranteed YYYY-MM-DD
};

const _getNowDateTime = () => {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    return `${date} ${time}`;
};

const _normalizeDate = (str) => {
    if (!str) return '1900-01-01';
    let datePart = str.split(' ')[0];
    const p = datePart.match(/\d+/g);
    if (!p || p.length < 3) return datePart;
    
    let year, month, day;
    if (p[0].length === 4) { // YYYY-MM-DD
        year = p[0]; month = p[1]; day = p[2];
    } else if (p[2].length === 4) { // DD-MM-YYYY
        year = p[2]; month = p[1]; day = p[0];
    } else {
        return datePart;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const _ensureISO = (str) => {
    if (!str) return '1900-01-01 00:00:00';
    const normDate = _normalizeDate(str);
    const timePart = str.includes(' ') ? str.split(' ')[1] : '00:00:00';
    return `${normDate} ${timePart}`;
};

const SupabaseService = {
    async verifyUser(username, password) {
        try {
            const { data, error } = await _supabase.from('CRED').select('*').eq('USERNAME', username).eq('PASSWORD', password).single();
            if (error || !data) return { success: false, message: "Invalid Credentials" };
            return { success: true, user: data };
        } catch (e) { return { success: false, message: e.message }; }
    },

    async getDashboardMetrics() {
        try {
            const todayStr = _getTodayDate();
            
            // 1. Fetch recent snapshots and sort in JS
            const { data: snaps, error: snapErr } = await _supabase.from('DASHBOARD').select('*').limit(100);
            if (snapErr) throw snapErr;

            const sortedSnaps = (snaps || []).sort((a, b) => _ensureISO(b.DATE).localeCompare(_ensureISO(a.DATE)));
            const hasToday = sortedSnaps.some(r => _normalizeDate(r.DATE) === todayStr);

            if (!hasToday) {
                console.log("No snapshot for today found. Auto-rolling...");
                const res = await this.endDayProcess(todayStr + " 00:00:00");
                if (res.error) {
                    console.error("Auto-init failed", res.error);
                    alert("Dashboard Auto-Init Failed: " + (res.error.message || JSON.stringify(res.error)));
                } else {
                    // Re-fetch after successful init
                    const { data: newSnaps } = await _supabase.from('DASHBOARD').select('*').limit(100);
                    const finalSnaps = (newSnaps || []).sort((a, b) => _ensureISO(b.DATE).localeCompare(_ensureISO(a.DATE)));
                    return await this._calculateMetricsFromLastSnapshot(finalSnaps);
                }
            }

            return await this._calculateMetricsFromLastSnapshot(sortedSnaps);
        } catch (e) {
            console.error("METRICS ERROR", e);
            const v = { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 };
            return { OPENING_BALANCE: 0, OPENING_DETAILS: v, PRODUCTION: 0, PROD_DETAILS: v, SALES: 0, SALES_DETAILS: v, STOCK: 0, STOCK_DETAILS: v, CASH_ON_HAND: 0 };
        }
    },

    async _calculateMetricsFromLastSnapshot(preFetchedSnaps = null) {
        let dashData = preFetchedSnaps;
        if (!dashData) {
            const { data: snaps } = await _supabase.from('DASHBOARD').select('*').limit(100);
            dashData = (snaps || []).sort((a, b) => _ensureISO(b.DATE).localeCompare(_ensureISO(a.DATE)));
        }
        
        let metrics = { 
            OPENING_BALANCE: 0, 
            OPENING_DETAILS: { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 },
            SNAPSHOT_DATE: '1900-01-01 00:00:00'
        };

        if (dashData && dashData.length > 0) {
            const row = dashData[0];
            metrics.OPENING_BALANCE = parseInt(row.OPENING_BALANCE || 0);
            metrics.SNAPSHOT_DATE = _ensureISO(row.DATE);
            Object.keys(metrics.OPENING_DETAILS).forEach(k => { metrics.OPENING_DETAILS[k] = parseInt(row[k] || 0); });
        }

        const snapshotDate = metrics.SNAPSHOT_DATE;

        // PRODUCTION since snapshot
        const { data: prodData } = await _supabase.from('PRODUCTION').select('*').gt('DATE', snapshotDate);
        let prodDetails = { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 };
        let prodTotal = 0;
        if (prodData) {
            prodData.forEach(row => {
                Object.keys(prodDetails).forEach(k => {
                    let val = parseInt(row[k] || 0);
                    prodDetails[k] += val; prodTotal += val;
                });
            });
        }

        // SALES since snapshot (Line Dispatches & Dealer Sales)
        const { data: lineCashData } = await _supabase.from('CASH').select('*').neq('VEHICLE_NO', 'DEALER_PAYMENT').gt('DATE', snapshotDate);
        const { data: dealerSalesData } = await _supabase.from('SALES').select('*').eq('TYPE', 'DEALER').gt('DATE', snapshotDate);
        let salesDetails = { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 };
        let salesTotal = 0;
        [...(lineCashData || []), ...(dealerSalesData || [])].forEach(row => {
            Object.keys(salesDetails).forEach(k => {
                let val = parseInt(row[k] || 0);
                salesDetails[k] += val; salesTotal += val;
            });
        });

        // CASH & LEDGER since snapshot (Always total accumulation as requested)
        const { data: allCashRecs } = await _supabase.from('CASH').select('CASH_RECEIVED');
        let totalCash = (allCashRecs || []).reduce((acc, row) => acc + parseFloat(row.CASH_RECEIVED || 0), 0);
        
        const { data: allLedgerData } = await _supabase.from('ACCOUNT_TRANSACTIONS').select('CREDIT, DEBIT');
        let totalLedgerCredit = (allLedgerData || []).reduce((acc, row) => acc + parseFloat(row.CREDIT || 0), 0);
        let totalLedgerDebit = (allLedgerData || []).reduce((acc, row) => acc + parseFloat(row.DEBIT || 0), 0);

        let stockDetails = {};
        Object.keys(prodDetails).forEach(k => { 
            stockDetails[k] = metrics.OPENING_DETAILS[k] + prodDetails[k] - salesDetails[k]; 
        });

        return {
            OPENING_BALANCE: metrics.OPENING_BALANCE, OPENING_DETAILS: metrics.OPENING_DETAILS,
            PRODUCTION: prodTotal, PROD_DETAILS: prodDetails,
            SALES: salesTotal, SALES_DETAILS: salesDetails,
            STOCK: metrics.OPENING_BALANCE + prodTotal - salesTotal, STOCK_DETAILS: stockDetails,
            CASH_ON_HAND: totalCash + totalLedgerCredit - totalLedgerDebit,
            SNAPSHOT_DATE: snapshotDate
        };
    },

    async endDayProcess(customDate = null) {
        try {
            // Calculate current metrics based on the last snapshot available
            const metrics = await this._calculateMetricsFromLastSnapshot();
            const rmMetrics = await this.getRawMaterialMetrics();
            
            const timestamp = customDate || _getNowDateTime();
            
            const payload = {
                DATE: timestamp,
                OPENING_BALANCE: metrics.STOCK,
                "250ML": metrics.STOCK_DETAILS["250ML"],
                "500ML": metrics.STOCK_DETAILS["500ML"],
                "1LTR": metrics.STOCK_DETAILS["1LTR"],
                "2LTR": metrics.STOCK_DETAILS["2LTR"],
                "5LTR": metrics.STOCK_DETAILS["5LTR"],
                "20LTR": metrics.STOCK_DETAILS["20LTR"],
                "BAGS": metrics.STOCK_DETAILS["BAGS"]
            };
            
            return await _supabase.from('DASHBOARD').insert([payload]);
        } catch (e) {
            console.error("END DAY ERR", e);
            return { error: e };
        }
    },

    async saveProduction(data) {
        data.DATE = _getNowDateTime();
        return await _supabase.from('PRODUCTION').insert([data]);
    },

    async saveSales(data) {
        if (data.TYPE === 'LINE') {
            const active = await this.getTodaysDispatches();
            const existing = active.find(d => d.VEHICLE_NO === data.VEHICLE_NO);
            
            if (existing) {
                const updates = {};
                ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"].forEach(k => {
                    updates[k] = parseInt(existing[k] || 0) + parseInt(data[k] || 0);
                });
                const { error } = await _supabase.from('SALES').update(updates).eq('id', existing.id);
                return { success: !error, id: existing.id, error, merged: true };
            }
        }

        data.DATE = _getNowDateTime();
        const { data: resp, error } = await _supabase.from('SALES').insert([data]).select();
        
        if (!error && resp && resp.length > 0) {
            const saved = resp[0];
            if ((data.TYPE === 'DEALER' || data.TYPE === 'COUNTER') && parseFloat(data.PAID_AMOUNT || 0) > 0) {
                await this.saveCashEntry({
                    VEHICLE_NO: data.TYPE === 'DEALER' ? 'DEALER_PAYMENT' : 'COUNTER_PAYMENT',
                    DRIVER: data.DRIVER || data.CUSTOMER_NAME,
                    total_amount: data.TOTAL_AMOUNT,
                    cash_received: data.PAID_AMOUNT,
                    paid_by_customer: data.PAID_AMOUNT,
                    SALES_ID: String(saved.id)
                });
            }
        }
        return { success: !error, id: resp ? resp[0].id : null, error, merged: false };
    },

    async saveCashEntry(data) {
        const payload = {
            DATE: _getNowDateTime(),
            VEHICLE_NO: data.VEHICLE_NO || data.vehicle_no,
            DRIVER: data.DRIVER || data.driver,
            TOTAL_AMOUNT: parseFloat(data.total_amount || 0),
            PAID_BY_CUSTOMER: parseFloat(data.paid_by_customer || 0),
            EXPENSES: parseFloat(data.expenses || 0),
            CASH_RECEIVED: parseFloat(data.cash_received || 0),
            SALES_ID: String(data.SALES_ID),
            "250ML": parseInt(data["250ML"] || data["250ml"] || 0),
            "500ML": parseInt(data["500ML"] || data["500ml"] || 0),
            "1LTR": parseInt(data["1LTR"] || data["1ltr"] || 0),
            "2LTR": parseInt(data["2LTR"] || data["2ltr"] || 0), 
            "5LTR": parseInt(data["5LTR"] || data["5ltr"] || 0),
            "20LTR": parseInt(data["20LTR"] || data["20ltr"] || 0),
            "BAGS": parseInt(data.BAGS || data.bags || 0)
        };
        return await _supabase.from('CASH').insert([payload]);
    },

    async saveRawMaterialTx(data) {
        data.DATE = _getNowDateTime();
        return await _supabase.from('RAW_MATERIAL_TX').insert([data]);
    },

    async saveCounterSale(data) {
        data.DATE = _getNowDateTime();
        data.TYPE = 'COUNTER';
        // Map CUSTOMER_NAME to DRIVER field for consistency with existing report filters if needed
        data.DRIVER = data.CUSTOMER_NAME; 
        return await _supabase.from('SALES').insert([data]);
    },

    async getRawMaterialMetrics(dateRange = null) {
        try {
            const products = [
                'PB_2LTR', 'PB_1LTR', 'PB_500ML', 'PB_250ML',
                'LR_2LTR', 'LR_1LTR', 'LR_500ML', 'LR_250ML',
                'SR_LP', 'SR_LW', 'SR_SP', 'SR_SW',
                'GUM_PACKETS', 'CAP_BOXES', 'HANDLES_2LTR', 'POUCH_ROLLS', 'GUNNIES', 'THREADS', 'CAPS_20LTR'
            ];

            let metrics = { OB: {}, RECEIVED: {}, USED: {}, CB: {} };
            products.forEach(k => {
                metrics.OB[k] = 0;
                metrics.RECEIVED[k] = 0;
                metrics.USED[k] = 0;
            });

            // If dateRange is provided, calculate OB from all history before start
            if (dateRange && dateRange.start) {
                const { data: historyBefore } = await _supabase.from('RAW_MATERIAL_TX').select('*').lt('DATE', dateRange.start);
                if (historyBefore) {
                    historyBefore.forEach(row => {
                        products.forEach(k => {
                            metrics.OB[k] += (parseInt(row[`${k}_R`] || 0) - parseInt(row[`${k}_U`] || 0));
                        });
                    });
                }
            }

            // Calculate RECEIVED and USED within the range (or all if no range)
            let q = _supabase.from('RAW_MATERIAL_TX').select('*');
            if (dateRange) {
                if (dateRange.start) q = q.gte('DATE', dateRange.start);
                if (dateRange.end) q = q.lte('DATE', dateRange.end);
            }

            const { data: txData } = await q;
            if (txData) {
                txData.forEach(row => {
                    products.forEach(k => {
                        metrics.RECEIVED[k] += parseInt(row[`${k}_R`] || 0);
                        metrics.USED[k] += parseInt(row[`${k}_U`] || 0);
                    });
                });
            }

            products.forEach(k => {
                metrics.CB[k] = metrics.OB[k] + metrics.RECEIVED[k] - metrics.USED[k];
            });

            return metrics;
        } catch (e) { console.error("RM METRICS ERR", e); return null; }
    },

    async saveCustomerSales(rows) {
        return await _supabase.from('LINE_CUSTOMER_SALES').insert(rows);
    },

    async getDriverDues() {
        try {
            const { data, error } = await _supabase.from('CASH').select('*');
            if (error) throw error;
            return (data || [])
                .filter(row => parseFloat(row.DUE || 0) > 0)
                .map(row => ({
                    ...row,
                    DRIVER_DUE: parseFloat(row.DUE || 0)
                }));
        } catch(e) { 
            console.error("GET DUES ERR", e);
            throw e;
        }
    },

    async payDriverDue(id, amount) {
        try {
            const { data: current } = await _supabase.from('CASH').select('DUE').eq('id', id).single();
            const newDue = Math.max(0, parseFloat(current.DUE || 0) - amount);
            const { error } = await _supabase.from('CASH').update({ DUE: newDue.toFixed(2) }).eq('id', id);
            return { success: !error, error };
        } catch (e) { return { error: e }; }
    },

    async getDriversWithSummary() {
        try {
            const { data: salesDrivers } = await _supabase.from('SALES').select('DRIVER').eq('TYPE', 'LINE');
            const drivers = [...new Set((salesDrivers || []).map(d => d.DRIVER))].filter(Boolean);
            const { data: cashDues } = await _supabase.from('CASH').select('DRIVER, DUE');
            const duesMap = {};
            (cashDues || []).forEach(row => {
                if (!duesMap[row.DRIVER]) duesMap[row.DRIVER] = 0;
                duesMap[row.DRIVER] += parseFloat(row.DUE || 0);
            });
            return drivers.map(name => ({ NAME: name, TOTAL_DUE: duesMap[name] || 0 }));
        } catch (e) { console.error("DRIVERS SUMMARY ERR", e); return []; }
    },

    async paySalary(driverName, baseSalary, dueDeduction, netPaid) {
        try {
            const salaryEntry = {
                HEAD_NAME: 'Salary',
                PURPOSE: `Monthly Salary Payment - ${driverName} (Base: ${baseSalary}, Due Ded: ${dueDeduction})`,
                CREDIT: 0,
                DEBIT: netPaid,
                TO_BE_PAID: 0,
                DATE: _getNowDateTime()
            };
            const { error: txError } = await _supabase.from('ACCOUNT_TRANSACTIONS').insert([salaryEntry]);
            if (txError) throw txError;
            if (dueDeduction > 0) {
                const { error: dueError } = await _supabase.from('CASH').update({ DUE: "0.00" }).eq('DRIVER', driverName);
                if (dueError) throw dueError;
            }
            return { success: true };
        } catch (e) {
            console.error("PAY SALARY ERR", e);
            return { error: e };
        }
    },

    async getVehicles() { const { data } = await _supabase.from('VEHICLES').select('VEHICLE_NO'); return data || []; },
    async getRoutes() { const { data } = await _supabase.from('ROUTES').select('ROUTE'); return data || []; },
    async addRoute(name) { return await _supabase.from('ROUTES').insert([{ ROUTE: name }]); },

    async getTodaysDispatches() {
        const dateLimit = new Date(); dateLimit.setDate(dateLimit.getDate() - 7);
        const dateStr = _normalizeDate(dateLimit.toISOString()) + ' 00:00:00';
        const { data: settled } = await _supabase.from('CASH').select('SALES_ID');
        const settledIds = (settled || []).map(item => String(item.SALES_ID)).filter(id => id);
        const { data: sales } = await _supabase.from('SALES').select('*').eq('TYPE', 'LINE').gte('DATE', dateStr).order('DATE', { ascending: false });
        return (sales || []).filter(d => !settledIds.includes(String(d.id)));
    },

    async getDealers() { const { data } = await _supabase.from('DEALERS').select('*').order('NAME'); return data || []; },
    async addDealer(data) { return await _supabase.from('DEALERS').insert([data]); },
    async updateDealerPrices(name, prices) { return await _supabase.from('DEALERS').update(prices).eq('NAME', name); },

    async getAccountHeads() { const { data } = await _supabase.from('ACCOUNT_HEADS').select('*').order('NAME'); return data || []; },
    async addAccountHead(name) { return await _supabase.from('ACCOUNT_HEADS').insert([{ NAME: name }]); },
    async saveAccountTransaction(data) {
        data.DATE = _getNowDateTime();
        return await _supabase.from('ACCOUNT_TRANSACTIONS').insert([data]);
    },

    async getReportData(type, timeframe, filter, specificDate, customRange) {
        let start = new Date();
        if (timeframe === 'daily') start.setHours(0, 0, 0, 0);
        else if (timeframe === 'weekly') start.setDate(start.getDate() - 7);
        else if (timeframe === 'monthly') start.setDate(start.getDate() - 30);
        
        let startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')} 00:00:00`;
        let endStr = _getTodayDate() + " 23:59:59";

        if (customRange && customRange.start && customRange.end) {
            startStr = customRange.start + " 00:00:00";
            endStr = customRange.end + " 23:59:59";
        }

        if (type === "All Transactions") {
            const date = specificDate || _getTodayDate();
            const pattern = `${date}%`;
            
            let q1 = _supabase.from('CASH').select('DATE, VEHICLE_NO, DRIVER, TOTAL_AMOUNT, CASH_RECEIVED, DUE, EXPENSES, "250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", BAGS');
            let q2 = _supabase.from('PRODUCTION').select('DATE, "250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", BAGS');
            let q3 = _supabase.from('ACCOUNT_TRANSACTIONS').select('DATE, HEAD_NAME, PURPOSE, CREDIT, DEBIT');

            if (customRange?.start && customRange?.end) {
                q1 = q1.gte('DATE', startStr).lte('DATE', endStr);
                q2 = q2.gte('DATE', startStr).lte('DATE', endStr);
                q3 = q3.gte('DATE', startStr).lte('DATE', endStr);
            } else {
                q1 = q1.ilike('DATE', pattern); q2 = q2.ilike('DATE', pattern); q3 = q3.ilike('DATE', pattern);
            }

            const [cash, prod, ledger] = await Promise.all([q1, q2, q3]);
            let all = []; const prods = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"];
            (cash.data || []).forEach(r => { let row = { DATE: r.DATE, TYPE: 'SALE', DESCRIPTION: `${r.VEHICLE_NO} - ${r.DRIVER}` }; prods.forEach(k => row[k] = r[k] || 0); row.AMOUNT = r.TOTAL_AMOUNT; row.PAID = r.CASH_RECEIVED; row.DUE = r.DUE; all.push(row); });
            (prod.data || []).forEach(r => { let row = { DATE: r.DATE, TYPE: 'PROD', DESCRIPTION: 'Production Entry' }; prods.forEach(k => row[k] = r[k] || 0); row.AMOUNT = 0; row.PAID = 0; row.DUE = 0; all.push(row); });
            (ledger.data || []).forEach(r => { let row = { DATE: r.DATE, TYPE: 'LEDG', DESCRIPTION: `${r.HEAD_NAME}: ${r.PURPOSE}` }; prods.forEach(k => row[k] = 0); row.AMOUNT = r.DEBIT; row.PAID = r.CREDIT; row.DUE = 0; all.push(row); });
            return all.sort((a, b) => new Date(a.DATE) - new Date(b.DATE));
        }

        if (type === "Production") {
            const { data } = await _supabase.from('PRODUCTION').select('*').gte('DATE', startStr).lte('DATE', endStr).order('DATE', { ascending: false });
            return (data || []).map(r => { delete r.id; return r; });
        } else if (type === "Sales") {
            let q = _supabase.from('LINE_CUSTOMER_SALES').select('*').gte('DATE', startStr).lte('DATE', endStr);
            if (filter && filter !== 'All Vehicles') q = q.eq('VEHICLE_NO', filter);
            const { data } = await q.order('DATE', { ascending: false });
            return (data || []).map(r => {
                delete r.id; delete r.SALES_ID; 
                return r;
            });
        } else if (type === "Detailed Line Sales") {
            let q = _supabase.from('LINE_CUSTOMER_SALES').select('*').gte('DATE', startStr).lte('DATE', endStr);
            if (filter && filter !== 'All Vehicles') q = q.eq('VEHICLE_NO', filter);
            const { data } = await q.order('DATE', { ascending: false });
            return (data || []).map(r => { delete r.id; delete r.SALES_ID; return r; });
        } else if (type === "Account Ledger") {
            let q = _supabase.from('ACCOUNT_TRANSACTIONS').select('*').gte('DATE', startStr).lte('DATE', endStr);
            if (filter && filter !== "All Heads") q = q.eq('HEAD_NAME', filter);
            const { data } = await q.order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Salary") {
            const { data } = await _supabase.from('ACCOUNT_TRANSACTIONS').select('*').eq('HEAD_NAME', 'Salary').gte('DATE', startStr).lte('DATE', endStr).order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Driver Dues") {
            const { data } = await _supabase.from('CASH').select('*').order('DATE', { ascending: false });
            return (data || []).filter(row => parseFloat(row.DUE || 0) > 0);
        } else if (type === "Counter Sales") {
            const { data } = await _supabase.from('SALES').select('*').eq('TYPE', 'COUNTER').gte('DATE', startStr).lte('DATE', endStr).order('DATE', { ascending: false });
            return (data || []).map(r => { delete r.id; delete r.TYPE; return r; });
        } else if (type === "Dues Report") {
            const [driver, salesDues, dealers] = await Promise.all([
                _supabase.from('CASH').select('*'),
                _supabase.from('SALES').select('*'),
                _supabase.from('DEALERS').select('*')
            ]);

            const allDues = [];
            (driver.data || []).forEach(r => {
                const dAmt = parseFloat(r.DUE || 0);
                if (dAmt > 0) {
                    allDues.push({ DATE: r.DATE, CATEGORY: 'DRIVER', NAME: `${r.DRIVER} (${r.VEHICLE_NO})`, DUE: dAmt });
                }
            });
            
            (salesDues.data || []).forEach(r => {
                if (r.TYPE === 'LINE') return;
                const category = r.TYPE || 'DEALER';
                const name = r.CUSTOMER_NAME || r.DRIVER || 'Unknown';
                
                let tot = parseFloat(r.TOTAL_AMOUNT || 0);
                // Fallback for bill calculation if missing
                if (tot <= 0 && r.TYPE === 'DEALER') {
                    const dl = (dealers.data || []).find(x => x.NAME === r.DRIVER) || {};
                    const products = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"];
                    products.forEach(k => {
                        tot += (parseInt(r[k] || 0) * parseFloat(dl[`PR_${k}`] || 0));
                    });
                }

                let dueVal = parseFloat(r.DUE || 0);
                if (dueVal <= 0 && tot > 0) {
                    dueVal = tot - parseFloat(r.PAID_AMOUNT || 0);
                }

                if (dueVal > 0) {
                    allDues.push({ DATE: r.DATE, CATEGORY: category, NAME: name, DUE: dueVal });
                }
            });
            
            return allDues.sort((a,b) => new Date(b.DATE) - new Date(a.DATE));
        } else if (type === "Average Analysis") {
            const products = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"];
            const start = customRange?.start || specificDate;
            const end = customRange?.end || specificDate;
            if(!start || !end) return [{ ERROR: "Please select From and To dates" }];

            const startStr = start + " 00:00:00"; const endStr = end + " 23:59:59";
            let q;
            const actorKey = filter.type === 'DRIVER' ? 'VEHICLE_NO' : 'DRIVER';
            if (filter.type === 'DRIVER') {
                q = _supabase.from('CASH').select('*').gte('DATE', startStr).lte('DATE', endStr);
                if (filter.name !== 'All Vehicles') q = q.eq('VEHICLE_NO', filter.name);
            } else {
                q = _supabase.from('SALES').select('*').eq('TYPE', 'DEALER').gte('DATE', startStr).lte('DATE', endStr);
                if (filter.name !== 'All Dealers') q = q.eq('DRIVER', filter.name);
            }

            const { data } = await q;
            const d1 = new Date(start); const d2 = new Date(end);
            const days = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
            
            // Group data by actor
            const groups = {};
            (data || []).forEach(r => {
                const name = r[actorKey];
                if (!groups[name]) groups[name] = { NAME: name, PERIOD: `${start} to ${end}`, DAYS: days, totals: {} };
                products.forEach(p => {
                    groups[name].totals[p] = (groups[name].totals[p] || 0) + parseInt(r[p] || 0);
                });
            });

            return Object.values(groups).map(g => {
                const row = { NAME: g.NAME, PERIOD: g.PERIOD, DAYS: g.DAYS };
                products.forEach(p => {
                    row[`AVG_${p}`] = ((g.totals[p] || 0) / days).toFixed(1);
                });
                return row;
            });
        } else if (type === "Raw Material") {
            const { data } = await _supabase.from('RAW_MATERIAL_TX').select('*').gte('DATE', startStr).order('DATE', { ascending: false });
            if (!data) return [];
            const products = ['PB_2LTR', 'PB_1LTR', 'PB_500ML', 'PB_250ML', 'LR_2LTR', 'LR_1LTR', 'LR_500ML', 'LR_250ML', 'SR_LP', 'SR_LW', 'SR_SP', 'SR_SW', 'GUM_PACKETS', 'CAP_BOXES', 'HANDLES_2LTR', 'POUCH_ROLLS', 'GUNNIES', 'THREADS', 'CAPS_20LTR'];
            return data.map(row => { let r = { DATE: row.DATE }; products.forEach(p => { if (filter === 'Received' || filter === 'Both') r[`${p}_Received`] = row[`${p}_R`] || 0; if (filter === 'Used' || filter === 'Both') r[`${p}_Used`] = row[`${p}_U`] || 0; }); return r; });
        }
        return [];
    },

    async fetchDealerDispatches(date) {
        const { data: sales } = await _supabase.from('SALES').select('*').eq('TYPE', 'DEALER').ilike('DATE', `${date}%`).order('DATE', { ascending: false });
        if (!sales) return [];
        
        // Fetch dealers for fallback price calculation if TOTAL_AMOUNT is missing (legacy records)
        const { data: dealers } = await _supabase.from('DEALERS').select('*');
        
        for (let d of sales) {
            const { data: cash } = await _supabase.from('CASH').select('PAID_BY_CUSTOMER').eq('SALES_ID', String(d.id));
            const cashSum = (cash || []).reduce((acc, row) => acc + parseFloat(row.PAID_BY_CUSTOMER || 0), 0);
            d.PAID_AMOUNT = cashSum;

            // Fallback for older records where TOTAL_AMOUNT wasn't recorded at save-time
            if (!d.TOTAL_AMOUNT || parseFloat(d.TOTAL_AMOUNT) === 0) {
                const dl = (dealers || []).find(x => x.NAME === d.DRIVER) || {};
                let bill = 0;
                ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"].forEach(k => {
                    bill += (parseInt(d[k] || 0) * parseFloat(dl[`PR_${k}`] || 0));
                });
                d.TOTAL_AMOUNT = bill;
            }
        }
        return sales;
    },

    async updateDealerPayment(sales_id, dealer_name, total_amount, amount_paid) {
        const data = { 
            vehicle_no: "DEALER_PAYMENT", 
            driver: dealer_name, 
            total_amount: total_amount, 
            paid_by_customer: amount_paid, 
            cash_received: amount_paid, 
            SALES_ID: String(sales_id) 
        };
        return await this.saveCashEntry(data);
    },

    async getTrendData(startDate, endDate) {
        try {
            const products = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"];
            const rmItems = ['PB_2LTR', 'PB_1LTR', 'PB_500ML', 'PB_250ML', 'LR_2LTR', 'LR_1LTR', 'LR_500ML', 'LR_250ML', 'SR_LP', 'SR_LW', 'SR_SP', 'SR_SW', 'GUM_PACKETS', 'CAP_BOXES', 'HANDLES_2LTR', 'POUCH_ROLLS', 'GUNNIES', 'THREADS', 'CAPS_20LTR'];
            const startStr = startDate + " 00:00:00"; const endStr = endDate + " 23:59:59";
            
            const [prod, lineSales, dealerSales, rm] = await Promise.all([
                _supabase.from('PRODUCTION').select('*').gte('DATE', startStr).lte('DATE', endStr),
                _supabase.from('CASH').select('*').gte('DATE', startStr).lte('DATE', endStr),
                _supabase.from('SALES').select('*').eq('TYPE', 'DEALER').gte('DATE', startStr).lte('DATE', endStr),
                _supabase.from('RAW_MATERIAL_TX').select('*').gte('DATE', startStr).lte('DATE', endStr)
            ]);

            const d1 = new Date(startDate); const d2 = new Date(endDate);
            const days = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
            
            const allSales = [...(lineSales.data || []), ...(dealerSales.data || [])];
            const averages = { production: {}, sales: {}, rm: {}, dayCount: days };
            
            products.forEach(p => { 
                averages.production[p] = (((prod.data || []).reduce((sum, row) => sum + parseInt(row[p] || 0), 0)) / days).toFixed(1); 
            });
            
            products.forEach(p => { 
                averages.sales[p] = ((allSales.reduce((sum, row) => sum + parseInt(row[p] || 0), 0)) / days).toFixed(1); 
            });
            
            rmItems.forEach(k => { 
                averages.rm[k] = { 
                    received: (((rm.data || []).reduce((sum, row) => sum + parseInt(row[`${k}_R`] || 0), 0)) / days).toFixed(1), 
                    used: (((rm.data || []).reduce((sum, row) => sum + parseInt(row[`${k}_U`] || 0), 0)) / days).toFixed(1) 
                }; 
            });
            
            return averages;
        } catch (e) { console.error("TREND DATA ERR", e); return null; }
    },

    exportToCSV(data, filename) {
        if (!data || !data.length) return;
        const headers = Object.keys(data[0]);
        const csvContent = [headers.join(','), ...data.map(row => headers.map(fieldName => `"${row[fieldName] || ''}"`).join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url); link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden'; document.body.appendChild(link);
            link.click(); document.body.removeChild(link);
        }
    }
};
