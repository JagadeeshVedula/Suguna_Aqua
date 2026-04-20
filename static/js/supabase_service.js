
const SUPABASE_URL = "https://mggcskkkricnmkjqdqai.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZ2Nza2trcmljbm1ranFkcWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNjk4MjQsImV4cCI6MjA3ODc0NTgyNH0.Z74XcwusKBcVr82QWU5UxKBRgwyAILwKXiVgyTg5SaQ";

// Initialize Supabase Client with the specific schema
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'suguna_aqua' }
});

const SupabaseService = {
    // --- AUTHENTICATION ---
    async verifyUser(username, password) {
        try {
            const { data, error } = await _supabase
                .from('CRED')
                .select('*')
                .eq('USERNAME', username)
                .eq('PASSWORD', password)
                .single();

            if (error || !data) return { success: false, message: "Invalid Credentials" };
            return { success: true, user: data };
        } catch (e) {
            return { success: false, message: e.message };
        }
    },

    // --- DASHBOARD METRICS ---
    async getDashboardMetrics() {
        try {
            const today = new Date().toISOString().split('T')[0];

            // 1. Opening Balance
            const { data: dashData } = await _supabase
                .from('DASHBOARD')
                .select('*')
                .order('DATE', { ascending: false })
                .order('id', { ascending: false })
                .limit(1);

            let metrics = {
                OPENING_BALANCE: 0,
                OPENING_DETAILS: { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 },
                CASH_OPENING: 0
            };

            if (dashData && dashData.length > 0) {
                const row = dashData[0];
                metrics.OPENING_BALANCE = parseInt(row.OPENING_BALANCE || 0);
                metrics.CASH_OPENING = parseFloat(row.CASH_ON_HAND || 0);
                Object.keys(metrics.OPENING_DETAILS).forEach(k => {
                    metrics.OPENING_DETAILS[k] = parseInt(row[k] || 0);
                });
            }

            // 2. Production
            const { data: prodData } = await _supabase
                .from('PRODUCTION')
                .select('*')
                .gte('DATE', today + " 00:00:00");

            let prodDetails = { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 };
            let prodTotal = 0;
            if (prodData) {
                prodData.forEach(row => {
                    Object.keys(prodDetails).forEach(k => {
                        let val = parseInt(row[k] || 0);
                        prodDetails[k] += val;
                        prodTotal += val;
                    });
                });
            }

            // 3. Sales
            const { data: lineCashData } = await _supabase.from('CASH').select('*').neq('VEHICLE_NO', 'DEALER_SALE').gte('DATE', today + ' 00:00:00');
            const { data: dealerSalesData } = await _supabase.from('SALES').select('*').eq('TYPE', 'DEALER').gte('DATE', today + ' 00:00:00');

            let salesDetails = { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 };
            let salesTotal = 0;
            const allSales = [...(lineCashData || []), ...(dealerSalesData || [])];
            allSales.forEach(row => {
                Object.keys(salesDetails).forEach(k => {
                    let val = parseInt(row[k] || 0);
                    salesDetails[k] += val;
                    salesTotal += val;
                });
            });

            // 4. Cash Collections
            const { data: cashRecs } = await _supabase.from('CASH').select('CASH_RECEIVED').gte('DATE', today + ' 00:00:00');
            let todayCash = (cashRecs || []).reduce((acc, row) => acc + parseFloat(row.CASH_RECEIVED || 0), 0);

            // 5. Final Stock
            let stockDetails = {};
            Object.keys(prodDetails).forEach(k => {
                stockDetails[k] = metrics.OPENING_DETAILS[k] + prodDetails[k] - salesDetails[k];
            });
            let stockTotal = metrics.OPENING_BALANCE + prodTotal - salesTotal;

            // 6. Ledger
            const { data: ledgerData } = await _supabase.from('ACCOUNT_TRANSACTIONS').select('CREDIT, DEBIT').gte('DATE', today + ' 00:00:00');
            let ledgerCredit = (ledgerData || []).reduce((acc, row) => acc + parseFloat(row.CREDIT || 0), 0);
            let ledgerDebit = (ledgerData || []).reduce((acc, row) => acc + parseFloat(row.DEBIT || 0), 0);

            return {
                OPENING_BALANCE: metrics.OPENING_BALANCE, OPENING_DETAILS: metrics.OPENING_DETAILS,
                PRODUCTION: prodTotal, PROD_DETAILS: prodDetails,
                SALES: salesTotal, SALES_DETAILS: salesDetails,
                STOCK: stockTotal, STOCK_DETAILS: stockDetails,
                CASH_ON_HAND: metrics.CASH_OPENING + todayCash + ledgerCredit - ledgerDebit
            };
        } catch (e) {
            console.error("METRICS ERROR:", e);
            const v = { "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0 };
            return {
                OPENING_BALANCE: 0, OPENING_DETAILS: v,
                PRODUCTION: 0, PROD_DETAILS: v,
                SALES: 0, SALES_DETAILS: v,
                STOCK: 0, STOCK_DETAILS: v,
                CASH_ON_HAND: 0
            };
        }
    },

    // --- DATA SAVING ---
    async saveProduction(data) {
        data.DATE = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' '); // YYYY-MM-DD HH:MM:SS
        return await _supabase.from('PRODUCTION').insert([data]);
    },

    async saveSales(data) {
        data.DATE = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ');
        const { data: resp, error } = await _supabase.from('SALES').insert([data]).select();
        return { success: !error, id: resp ? resp[0].id : null, error };
    },

    async saveCashEntry(data) {
        data.DATE = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ');
        return await _supabase.from('CASH').insert([data]);
    },

    // --- LIST FETCHING ---
    async getVehicles() {
        const { data } = await _supabase.from('VEHICLES').select('VEHICLE_NO');
        return data || [];
    },

    async getRoutes() {
        const { data } = await _supabase.from('ROUTES').select('ROUTE');
        return data || [];
    },

    async addRoute(routeName) {
        return await _supabase.from('ROUTES').insert([{ ROUTE: routeName }]);
    },

    async getTodaysDispatches() {
        const today = new Date().toISOString().split('T')[0];
        const { data: settled } = await _supabase.from('CASH').select('SALES_ID');
        const settledIds = (settled || []).map(item => item.SALES_ID).filter(id => id);

        let query = _supabase.from('SALES')
            .select('*')
            .eq('TYPE', 'LINE')
            .gte('DATE', today + ' 00:00:00');

        if (settledIds.length > 0) {
            query = query.not('id', 'in', `(${settledIds.join(',')})`);
        }

        const { data } = await query.order('DATE', { ascending: false });
        return data || [];
    },

    async getDriverDues() {
        const { data } = await _supabase.from('CASH').select('DRIVER, DUE');
        let dues = {};
        if (data) {
            data.forEach(row => {
                const driver = row.DRIVER;
                const due = parseFloat(row.DUE || 0);
                dues[driver] = (dues[driver] || 0) + due;
            });
        }
        return dues;
    },

    // --- DEALERS ---
    async getDealers() {
        const { data } = await _supabase.from('DEALERS').select('*').order('NAME');
        return data || [];
    },

    async addDealer(data) {
        return await _supabase.from('DEALERS').insert([data]);
    },

    async updateDealerPrices(name, prices) {
        return await _supabase.from('DEALERS').update(prices).eq('NAME', name);
    },

    // --- LEDGER ---
    async getAccountHeads() {
        const { data } = await _supabase.from('ACCOUNT_HEADS').select('*').order('NAME');
        return data || [];
    },

    async addAccountHead(name) {
        return await _supabase.from('ACCOUNT_HEADS').insert([{ NAME: name }]);
    },

    async saveAccountTransaction(data) {
        data.DATE = new Date().toLocaleString('sv-SE').replace(' ', 'T').split('.')[0].replace('T', ' ');
        return await _supabase.from('ACCOUNT_TRANSACTIONS').insert([data]);
    },

    // --- REPORTS ---
    async getReportData(type, timeframe, dealerOrHead) {
        let start = new Date();
        if (timeframe === 'daily') start.setHours(0, 0, 0, 0);
        else if (timeframe === 'weekly') start.setDate(start.getDate() - 7);
        else if (timeframe === 'monthly') start.setDate(start.getDate() - 30);
        else if (timeframe === 'yearly') start.setDate(start.getDate() - 365);

        const startStr = start.toISOString().split('T')[0] + " 00:00:00";

        if (type === "Production") {
            const { data } = await _supabase.from('PRODUCTION').select('DATE, "250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", BAGS').gte('DATE', startStr).order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Sales") {
            const { data } = await _supabase.from('CASH').select('DATE, VEHICLE_NO, DRIVER, TOTAL_AMOUNT, PAID_BY_CUSTOMER, EXPENSES, CASH_RECEIVED, DUE, "250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", BAGS').neq('VEHICLE_NO', 'DEALER_PAYMENT').gte('DATE', startStr).order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Account Ledger") {
            let q = _supabase.from('ACCOUNT_TRANSACTIONS').select('DATE, HEAD_NAME, PURPOSE, CREDIT, DEBIT, TO_BE_PAID').gte('DATE', startStr);
            if (dealerOrHead && dealerOrHead !== "All Heads") q = q.eq('HEAD_NAME', dealerOrHead);
            const { data } = await q.order('DATE', { ascending: false });
            return data || [];
        } else if (type === "Dealer Sales") {
            const { data: dealers } = await _supabase.from('DEALERS').select('*');
            let q = _supabase.from('SALES').select('id, DATE, DRIVER, ROUTE, QUANTITY, "250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", BAGS').eq('TYPE', 'DEALER').gte('DATE', startStr);
            if (dealerOrHead && dealerOrHead !== "All Dealers") q = q.eq('DRIVER', dealerOrHead);
            const { data } = await q.order('DATE', { ascending: false });

            if (data) {
                for (let d of data) {
                    const dl = dealers.find(x => x.NAME === d.DRIVER) || {};
                    let bill = 0;
                    ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"].forEach(k => {
                        bill += (parseInt(d[k] || 0) * parseFloat(dl[`PR_${k}`] || 0));
                    });
                    d.BILL_AMOUNT = bill.toFixed(2);

                    const { data: cash } = await _supabase.from('CASH').select('PAID_BY_CUSTOMER').eq('SALES_ID', d.id.toString());
                    d.PAID_AMOUNT = (cash || []).reduce((acc, row) => acc + parseFloat(row.PAID_BY_CUSTOMER || 0), 0).toFixed(2);
                    d.PENDING = (bill - d.PAID_AMOUNT).toFixed(2);
                    delete d.id;
                }
            }
            return data || [];
        } else if (type === "Stock") {
            // Get the Dashboard's "Current Available Pool" math
            const metrics = await this.getDashboardMetrics();
            const row = {
                DATE: new Date().toISOString().split('T')[0],
                ...metrics.STOCK_DETAILS,
                CASH_ON_HAND: metrics.CASH_ON_HAND
            };
            return [row];
        }
        return [];
    },

    async fetchDealerDispatches(date) {
        const { data: sales } = await _supabase.from('SALES').select('*').eq('TYPE', 'DEALER').ilike('DATE', `${date}%`).order('DATE', { ascending: false });
        const { data: dealers } = await _supabase.from('DEALERS').select('*');
        if (!sales) return [];

        for (let d of sales) {
            const dl = dealers.find(x => x.NAME === d.DRIVER) || {};
            let bill = 0;
            ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"].forEach(k => {
                bill += (parseInt(d[k] || 0) * parseFloat(dl[`PR_${k}`] || 0));
            });
            d.TOTAL_AMOUNT = bill;

            const { data: cash } = await _supabase.from('CASH').select('PAID_BY_CUSTOMER').eq('SALES_ID', d.id.toString());
            d.PAID_AMOUNT = (cash || []).reduce((acc, row) => acc + parseFloat(row.PAID_BY_CUSTOMER || 0), 0);
        }
        return sales;
    },

    async updateDealerPayment(sales_id, dealer_name, total_amount, amount_paid) {
        const data = {
            VEHICLE_NO: "DEALER_PAYMENT",
            DRIVER: dealer_name,
            TOTAL_AMOUNT: total_amount,
            PAID_BY_CUSTOMER: amount_paid,
            EXPENSES: 0,
            CASH_RECEIVED: amount_paid,
            DUE: 0,
            SALES_ID: sales_id,
            "250ML": 0, "500ML": 0, "1LTR": 0, "2LTR": 0, "5LTR": 0, "20LTR": 0, "BAGS": 0
        };
        return await this.saveCashEntry(data);
    },

    exportToCSV(data, filename) {
        if (!data || !data.length) return;
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(row => Object.values(row).join(',')).join('\n');
        const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename + ".csv");
        document.body.appendChild(link);
        link.click();
    }
};
