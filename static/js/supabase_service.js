const SUPABASE_URL = "https://mggcskkkricnmkjqdqai.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZ2Nza2trcmljbm1ranFkcWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNjk4MjQsImV4cCI6MjA3ODc0NTgyNH0.Z74XcwusKBcVr82QWU5UxKBRgwyAILwKXiVgyTg5SaQ";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'suguna_aqua' }
});

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
            const today = new Date().toISOString().split('T')[0];
            const { data: dashData } = await _supabase.from('DASHBOARD').select('*').order('DATE', { ascending: false }).order('id', { ascending: false }).limit(1);
            
            let metrics = { OPENING_BALANCE: 0, OPENING_DETAILS: { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 }, CASH_SNAPSHOT: 0, SNAPSHOT_DATE: '1900-01-01 00:00:00' };
            if (dashData && dashData.length > 0) {
                const row = dashData[0];
                metrics.OPENING_BALANCE = parseInt(row.OPENING_BALANCE || 0);
                metrics.CASH_SNAPSHOT = parseFloat(row.CASH_ON_HAND || 0);
                metrics.SNAPSHOT_DATE = row.DATE;
                Object.keys(metrics.OPENING_DETAILS).forEach(k => { metrics.OPENING_DETAILS[k] = parseInt(row[k] || 0); });
            }

            const { data: prodData } = await _supabase.from('PRODUCTION').select('*').gte('DATE', today + " 00:00:00");
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

            const { data: lineCashData } = await _supabase.from('CASH').select('*').neq('VEHICLE_NO', 'DEALER_SALE').gte('DATE', today + ' 00:00:00');
            const { data: dealerSalesData } = await _supabase.from('SALES').select('*').eq('TYPE', 'DEALER').gte('DATE', today + ' 00:00:00');
            let salesDetails = { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 };
            let salesTotal = 0;
            [...(lineCashData || []), ...(dealerSalesData || [])].forEach(row => {
                Object.keys(salesDetails).forEach(k => {
                    let val = parseInt(row[k] || 0);
                    salesDetails[k] += val; salesTotal += val;
                });
            });

            // Cumulative Cash Balance: Snapshot + Transactions after snapshot
            const { data: newCashRecs } = await _supabase.from('CASH').select('CASH_RECEIVED').gt('DATE', metrics.SNAPSHOT_DATE);
            let additionalCash = (newCashRecs || []).reduce((acc, row) => acc + parseFloat(row.CASH_RECEIVED || 0), 0);
            
            const { data: newLedgerData } = await _supabase.from('ACCOUNT_TRANSACTIONS').select('CREDIT, DEBIT').gt('DATE', metrics.SNAPSHOT_DATE);
            let ledgerCredit = (newLedgerData || []).reduce((acc, row) => acc + parseFloat(row.CREDIT || 0), 0);
            let ledgerDebit = (newLedgerData || []).reduce((acc, row) => acc + parseFloat(row.DEBIT || 0), 0);

            let stockDetails = {};
            Object.keys(prodDetails).forEach(k => { stockDetails[k] = metrics.OPENING_DETAILS[k] + prodDetails[k] - salesDetails[k]; });

            return {
                OPENING_BALANCE: metrics.OPENING_BALANCE, OPENING_DETAILS: metrics.OPENING_DETAILS,
                PRODUCTION: prodTotal, PROD_DETAILS: prodDetails,
                SALES: salesTotal, SALES_DETAILS: salesDetails,
                STOCK: metrics.OPENING_BALANCE + prodTotal - salesTotal, STOCK_DETAILS: stockDetails,
                CASH_ON_HAND: metrics.CASH_SNAPSHOT + additionalCash + ledgerCredit - ledgerDebit
            };
        } catch (e) {
            console.error("METRICS ERROR", e);
            const v = { "250ML":0,"500ML":0,"1LTR":0,"2LTR":0,"5LTR":0,"20LTR":0,"BAGS":0 };
            return { OPENING_BALANCE: 0, OPENING_DETAILS: v, PRODUCTION: 0, PROD_DETAILS: v, SALES: 0, SALES_DETAILS: v, STOCK: 0, STOCK_DETAILS: v, CASH_ON_HAND: 0 };
        }
    },

    async endDayProcess() {
        try {
            const metrics = await this.getDashboardMetrics();
            const rmMetrics = await this.getRawMaterialMetrics();
            const today = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ');
            const payload = {
                DATE: today,
                OPENING_BALANCE: metrics.STOCK,
                CASH_ON_HAND: metrics.CASH_ON_HAND,
                "250ML": metrics.STOCK_DETAILS["250ML"],
                "500ML": metrics.STOCK_DETAILS["500ML"],
                "1LTR": metrics.STOCK_DETAILS["1LTR"],
                "2LTR": metrics.STOCK_DETAILS["2LTR"],
                "5LTR": metrics.STOCK_DETAILS["5LTR"],
                "20LTR": metrics.STOCK_DETAILS["20LTR"],
                "BAGS": metrics.STOCK_DETAILS["BAGS"]
            };
            
            // Include RM Stock in Dashboard Snapshot
            if (rmMetrics && rmMetrics.CB) {
                Object.keys(rmMetrics.CB).forEach(k => {
                    payload[k] = rmMetrics.CB[k];
                });
            }

            return await _supabase.from('DASHBOARD').insert([payload]);
        } catch (e) {
            console.error("END DAY ERR", e);
            return { error: e };
        }
    },

    async saveProduction(data) {
        data.DATE = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ');
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

        data.DATE = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ');
        const { data: resp, error } = await _supabase.from('SALES').insert([data]).select();
        return { success: !error, id: resp ? resp[0].id : null, error, merged: false };
    },

    async saveCashEntry(data) {
        const payload = {
            DATE: new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' '),
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
            "BAGS": parseInt(data["BAGS"] || data["bags"] || 0)
        };
        
        // Capture rates (prices) for the summary entry
        ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"].forEach(k => {
            payload[`RATE_${k}`] = parseFloat(data[`RATE_${k}`] || 0);
        });

        // Driver Due = Total Bill - Trip Expenses - Cash Handed Over to Office
        payload.DUE = Math.max(0, (payload.TOTAL_AMOUNT - payload.EXPENSES) - payload.CASH_RECEIVED).toFixed(2);
        return await _supabase.from('CASH').insert([payload]);
    },

    async saveRawMaterialTx(data) {
        data.DATE = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ');
        return await _supabase.from('RAW_MATERIAL_TX').insert([data]);
    },

    async getRawMaterialMetrics() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const products = [
                'PB_2LTR', 'PB_1LTR', 'PB_500ML', 'PB_250ML',
                'LR_2LTR', 'LR_1LTR', 'LR_500ML', 'LR_250ML',
                'SR_LP', 'SR_LW', 'SR_SP', 'SR_SW',
                'GUM_PACKETS', 'CAP_BOXES', 'HANDLES_2LTR', 'POUCH_ROLLS', 'GUNNIES', 'THREADS', 'CAPS_20LTR'
            ];

            const { data: dashData } = await _supabase.from('DASHBOARD').select('*').order('DATE', { ascending: false }).limit(1);
            let metrics = { OB: {}, RECEIVED: {}, USED: {}, CB: {} };
            
            const snapshot = dashData && dashData[0] ? dashData[0] : {};
            products.forEach(k => {
                metrics.OB[k] = parseInt(snapshot[k] || 0);
                metrics.RECEIVED[k] = 0;
                metrics.USED[k] = 0;
            });

            const { data: txData } = await _supabase.from('RAW_MATERIAL_TX').select('*').gte('DATE', today + ' 00:00:00');
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
                DATE: new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ')
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
        const dateStr = dateLimit.toISOString().split('T')[0] + ' 00:00:00';
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
        data.DATE = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ');
        return await _supabase.from('ACCOUNT_TRANSACTIONS').insert([data]);
    },

    async getReportData(type, timeframe, filter, specificDate) {
        let start = new Date();
        if (timeframe === 'daily') start.setHours(0, 0, 0, 0);
        else if (timeframe === 'weekly') start.setDate(start.getDate() - 7);
        else if (timeframe === 'monthly') start.setDate(start.getDate() - 30);
        const startStr = start.toISOString().split('T')[0] + " 00:00:00";

        if (type === "All Transactions") {
            const date = specificDate || new Date().toISOString().split('T')[0];
            const pattern = `${date}%`;
            const [cash, prod, ledger] = await Promise.all([
                _supabase.from('CASH').select('DATE, VEHICLE_NO, DRIVER, TOTAL_AMOUNT, CASH_RECEIVED, DUE, EXPENSES, "250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", BAGS').ilike('DATE', pattern),
                _supabase.from('PRODUCTION').select('DATE, "250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", BAGS').ilike('DATE', pattern),
                _supabase.from('ACCOUNT_TRANSACTIONS').select('DATE, HEAD_NAME, PURPOSE, CREDIT, DEBIT').ilike('DATE', pattern)
            ]);
            let all = []; const prods = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"];
            (cash.data || []).forEach(r => { let row = { DATE: r.DATE, TYPE: 'SALE', DESCRIPTION: `${r.VEHICLE_NO} - ${r.DRIVER}` }; prods.forEach(k => row[k] = r[k] || 0); row.AMOUNT = r.TOTAL_AMOUNT; row.PAID = r.CASH_RECEIVED; row.DUE = r.DUE; all.push(row); });
            (prod.data || []).forEach(r => { let row = { DATE: r.DATE, TYPE: 'PROD', DESCRIPTION: 'Production Entry' }; prods.forEach(k => row[k] = r[k] || 0); row.AMOUNT = 0; row.PAID = 0; row.DUE = 0; all.push(row); });
            (ledger.data || []).forEach(r => { let row = { DATE: r.DATE, TYPE: 'LEDG', DESCRIPTION: `${r.HEAD_NAME}: ${r.PURPOSE}` }; prods.forEach(k => row[k] = 0); row.AMOUNT = r.DEBIT; row.PAID = r.CREDIT; row.DUE = 0; all.push(row); });
            return all.sort((a, b) => new Date(a.DATE) - new Date(b.DATE));
        }

        if (type === "Production") {
            const { data } = await _supabase.from('PRODUCTION').select('*').gte('DATE', startStr).order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Sales") {
            let q = _supabase.from('CASH').select('*').gte('DATE', startStr);
            if (filter && filter !== 'All Vehicles') q = q.eq('VEHICLE_NO', filter);
            const { data } = await q.order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Detailed Line Sales") {
            let q = _supabase.from('LINE_CUSTOMER_SALES').select('*').gte('DATE', startStr);
            if (filter && filter !== 'All Vehicles') q = q.eq('VEHICLE_NO', filter);
            const { data } = await q.order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Account Ledger") {
            let q = _supabase.from('ACCOUNT_TRANSACTIONS').select('*').gte('DATE', startStr);
            if (filter && filter !== "All Heads") q = q.eq('HEAD_NAME', filter);
            const { data } = await q.order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Salary") {
            const { data } = await _supabase.from('ACCOUNT_TRANSACTIONS').select('*').eq('HEAD_NAME', 'Salary').gte('DATE', startStr).order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Driver Dues") {
            const { data } = await _supabase.from('CASH').select('*').order('DATE', { ascending: false });
            return (data || []).filter(row => parseFloat(row.DUE || 0) > 0);
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
        const { data: dealers } = await _supabase.from('DEALERS').select('*');
        if (!sales) return [];
        for (let d of sales) {
            const dl = dealers.find(x => x.NAME === d.DRIVER) || {};
            let bill = 0; ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"].forEach(k => { bill += (parseInt(d[k] || 0) * parseFloat(dl[`PR_${k}`] || 0)); });
            d.TOTAL_AMOUNT = bill;
            const { data: cash } = await _supabase.from('CASH').select('PAID_BY_CUSTOMER').eq('SALES_ID', String(d.id));
            d.PAID_AMOUNT = (cash || []).reduce((acc, row) => acc + parseFloat(row.PAID_BY_CUSTOMER || 0), 0);
        }
        return sales;
    },

    async updateDealerPayment(sales_id, dealer_name, total_amount, amount_paid) {
        const data = { VEHICLE_NO: "DEALER_PAYMENT", DRIVER: dealer_name, TOTAL_AMOUNT: total_amount, PAID_BY_CUSTOMER: amount_paid, EXPENSES: 0, CASH_RECEIVED: amount_paid, SALES_ID: String(sales_id) };
        return await this.saveCashEntry(data);
    },

    async getTrendData(startDate, endDate) {
        try {
            const products = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"];
            const rmItems = ['PB_2LTR', 'PB_1LTR', 'PB_500ML', 'PB_250ML', 'LR_2LTR', 'LR_1LTR', 'LR_500ML', 'LR_250ML', 'SR_LP', 'SR_LW', 'SR_SP', 'SR_SW', 'GUM_PACKETS', 'CAP_BOXES', 'HANDLES_2LTR', 'POUCH_ROLLS', 'GUNNIES', 'THREADS', 'CAPS_20LTR'];
            const startStr = startDate + " 00:00:00"; const endStr = endDate + " 23:59:59";
            const [prod, sales, rm] = await Promise.all([
                _supabase.from('PRODUCTION').select('*').gte('DATE', startStr).lte('DATE', endStr),
                _supabase.from('CASH').select('*').gte('DATE', startStr).lte('DATE', endStr),
                _supabase.from('RAW_MATERIAL_TX').select('*').gte('DATE', startStr).lte('DATE', endStr)
            ]);
            const d1 = new Date(startDate); const d2 = new Date(endDate);
            const days = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
            const averages = { production: {}, sales: {}, rm: {}, dayCount: days };
            products.forEach(p => { averages.production[p] = (((prod.data || []).reduce((sum, row) => sum + parseInt(row[p] || 0), 0)) / days).toFixed(1); });
            products.forEach(p => { averages.sales[p] = (((sales.data || []).reduce((sum, row) => sum + parseInt(row[p] || 0), 0)) / days).toFixed(1); });
            rmItems.forEach(k => { averages.rm[k] = { received: (((rm.data || []).reduce((sum, row) => sum + parseInt(row[`${k}_R`] || 0), 0)) / days).toFixed(1), used: (((rm.data || []).reduce((sum, row) => sum + parseInt(row[`${k}_U`] || 0), 0)) / days).toFixed(1) }; });
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
