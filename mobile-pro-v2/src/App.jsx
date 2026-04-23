import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutGrid, 
  CreditCard, 
  BarChart3, 
  LogOut, 
  Factory, 
  ShoppingCart, 
  Box, 
  Wallet,
  RefreshCw,
  Search,
  ChevronRight,
  TrendingUp,
  User,
  AlertCircle
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';

// Chart Registration
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

const App = () => {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('suguna_user')));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [dues, setDues] = useState([]);
  const [rmMetrics, setRmMetrics] = useState(null);
  const [recentProd, setRecentProd] = useState([]);
  const [trendAverages, setTrendAverages] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dueFilter, setDueFilter] = useState('all');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) fetchInitialData();
    else setLoading(false);
  }, [user]);

  const fetchInitialData = async () => {
    if (!window.SupabaseService) {
        setError("Initializing connection...");
        setTimeout(fetchInitialData, 1000);
        return;
    }

    setLoading(true);
    try {
      const today = new Date().toLocaleDateString('en-CA');
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
      
      const [m, rm, p, d, t] = await Promise.all([
        window.SupabaseService.getDashboardMetrics(),
        window.SupabaseService.getRawMaterialMetrics(),
        window.SupabaseService.getReportData('Production', 'weekly'),
        window.SupabaseService.getReportData('Dues Report'),
        window.SupabaseService.getTrendData(lastWeek, today)
      ]);
      
      setMetrics(m);
      setRmMetrics(rm);
      setRecentProd(p.slice(0, 10));
      setDues(d);
      setTrendAverages(t);
      setError(null);
    } catch (err) {
      console.error("Data Fetch Error:", err);
      setError("Sync failed. Please check internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('suguna_user');
    setUser(null);
    window.location.reload();
  };

  if (error && !metrics) return <ErrorView message={error} onRetry={fetchInitialData} />;
  if (!user) return <LoginView onLogin={(u) => setUser(u)} />;
  if (loading && !metrics) return <Splash />;

  const productKeys = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"];
  
  // Complete Raw Material list from database schema
  const rmKeys = [
    'PB_2LTR', 'PB_1LTR', 'PB_500ML', 'PB_250ML', 
    'LR_1LTR', 'LR_500ML', 'LR_250ML',
    'SR_LP', 'SR_LW', 'SR_SP', 'SR_SW', 
    'GUM_PACKETS', 'CAP_BOXES', 'HANDLES_2LTR', 
    'POUCH_ROLLS', 'GUNNIES', 'THREADS', 'CAPS_20LTR'
  ];

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-slate-100">
      {/* Header */}
      <header className="safe-top bg-[#0f172a]/80 backdrop-blur-3xl border-b border-white/5 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div>
          <h1 className="text-lg font-black tracking-tight text-white uppercase">SAI SUGUNA <span className="text-primary">AQUA</span></h1>
          <p className="text-[8px] uppercase tracking-[0.3em] text-primary font-black">{activeTab}</p>
        </div>
        <button onClick={handleLogout} className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 active:bg-primary/20 transition-all">
          <LogOut size={18} />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 pt-6 pb-40 no-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && metrics && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Top Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                <MetricCard icon={<Factory size={16}/>} label="Production" value={metrics.PRODUCTION} color="text-primary" bg="bg-primary/10" details={metrics.PROD_DETAILS} />
                <MetricCard icon={<ShoppingCart size={16}/>} label="Total Sales" value={metrics.SALES} color="text-success" bg="bg-success/10" details={metrics.SALES_DETAILS} />
                <MetricCard icon={<Wallet size={16}/>} label="Cash Balance" value={`₹${Math.round(metrics.CASH_ON_HAND).toLocaleString()}`} color="text-rose-400" bg="bg-rose-400/10" />
                <MetricCard icon={<Box size={16}/>} label="Current Stock" value={metrics.STOCK} color="text-amber-400" bg="bg-amber-400/10" details={metrics.STOCK_DETAILS} />
              </div>

              {/* Finished Goods Stock Breakout (Combined Fix) */}
              <div>
                <SectionHeader title="Finished Goods Stock" />
                <div className="bg-white/5 border border-white/10 rounded-[32px] overflow-hidden grid grid-cols-2">
                  {productKeys.map(k => (
                    <div key={k} className="p-5 border-b border-r border-white/5 flex justify-between items-center last:border-b-0">
                      <span className="text-[10px] font-bold text-slate-500">{k}</span>
                      <span className="text-sm font-black text-white">{(metrics.STOCK_DETAILS?.[k] || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Complete Raw Material Inventory */}
              <div>
                <SectionHeader title="Raw Material Inventory" action={<button onClick={fetchInitialData} className="p-2 active:rotate-180 transition-transform duration-500"><RefreshCw size={14}/></button>} />
                <div className="bg-white/5 border border-white/10 rounded-[32px] overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto no-scrollbar">
                    {rmMetrics && rmKeys.map(k => {
                      const val = rmMetrics.CB[k];
                      if (val === undefined) return null;
                      return <InventoryItem key={k} label={k.replace('_', ' ')} value={val} />;
                    })}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <SectionHeader title="Recent Production" />
                <div className="space-y-3">
                  {recentProd.map((p, i) => (
                    <ProductionRow key={i} data={p} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'dues' && (
            <motion.div
              key="dues"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
                {['all', 'line', 'dealer'].map(f => (
                  <button 
                    key={f}
                    onClick={() => setDueFilter(f)}
                    className={`px-6 py-3 rounded-full text-[10px] font-black tracking-widest transition-all whitespace-nowrap uppercase ${dueFilter === f ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-slate-500 border border-white/5'}`}
                  >
                    {f} Dues
                  </button>
                ))}
              </div>

              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="text" 
                  placeholder="Filter collections..." 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-12 pr-4 text-sm outline-none focus:border-primary/50 text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                {dues.length === 0 ? (
                  <div className="bg-white/5 border border-white/5 p-12 rounded-[32px] text-center">
                    <p className="text-slate-500 font-bold italic">Checking records...</p>
                  </div>
                ) : (
                  dues
                    .filter(d => {
                      const matchesSearch = d.NAME.toLowerCase().includes(searchTerm.toLowerCase());
                      if (dueFilter === 'all') return matchesSearch;
                      if (dueFilter === 'line') return matchesSearch && d.CATEGORY === 'DRIVER';
                      if (dueFilter === 'dealer') return matchesSearch && d.CATEGORY === 'DEALER';
                      return matchesSearch;
                    })
                    .map((due, i) => (
                      <DueCard key={i} data={due} />
                    ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'trends' && (
            <motion.div
              key="trends"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Trends Statistics Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-[28px] p-5">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Weekly Average Prod</p>
                    <p className="text-2xl font-black text-primary">
                        {trendAverages ? Object.values(trendAverages.production).reduce((s,v) => s + parseFloat(v), 0).toFixed(0) : '--'}
                    </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-[28px] p-5">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Weekly Average Sales</p>
                    <p className="text-2xl font-black text-success">
                        {trendAverages ? Object.values(trendAverages.sales).reduce((s,v) => s + parseFloat(v), 0).toFixed(0) : '--'}
                    </p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-[32px] p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-[10px] uppercase tracking-widest text-slate-400">Weekly Performance</h3>
                  <TrendingUp size={16} className="text-primary" />
                </div>
                <div className="h-[200px]">
                  <TrendChart 
                    label="Production" 
                    color="#38bdf8" 
                    data={trendAverages ? Object.values(trendAverages.production).map(v => parseFloat(v)) : [65, 59, 80, 81, 56, 55, 70]} 
                  />
                </div>
              </div>

              {/* Numerical Breakdown for Trends */}
              <div>
                <SectionHeader title="Daily Averages (Last 7 Days)" />
                <div className="bg-white/5 border border-white/10 rounded-[32px] p-2">
                    {trendAverages && productKeys.map(k => (
                        <div key={k} className="flex justify-between items-center p-5 border-b border-white/5 last:border-0">
                            <div>
                                <p className="text-xs font-bold text-white">{k}</p>
                                <p className="text-[9px] text-slate-500 font-black uppercase">Average Daily Flow</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-primary">{trendAverages.production[k] || 0} Prod</p>
                                <p className="text-[10px] font-bold text-success">{trendAverages.sales[k] || 0} Sales</p>
                            </div>
                        </div>
                    ))}
                </div>
              </div>

              {/* RM Usage numbers */}
              <div>
                <SectionHeader title="RM Usage (Average/Day)" />
                <div className="bg-white/5 border border-white/10 rounded-[32px] p-2">
                    {trendAverages && ['PB_1LTR', 'PB_500ML', 'LR_1LTR', 'GUM_PACKETS', 'CAP_BOXES'].map(k => (
                        <div key={k} className="flex justify-between items-center p-5 border-b border-white/5 last:border-0">
                            <span className="text-xs font-bold text-slate-300">{k.replace('_', ' ')}</span>
                            <div className="text-right">
                                <span className="text-xs font-black text-rose-500">-{trendAverages.rm[k]?.used || 0} used</span>
                                <span className="text-[9px] block text-success font-bold">+{trendAverages.rm[k]?.received || 0} rcvd</span>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Nav Bar */}
      <nav className="fixed bottom-8 left-6 right-6 h-20 bg-[#0f172a]/95 backdrop-blur-2xl rounded-[32px] border border-white/10 flex items-center justify-around px-4 z-50 shadow-2xl">
        <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutGrid size={22}/>} label="Home" />
        <NavButton active={activeTab === 'dues'} onClick={() => setActiveTab('dues')} icon={<CreditCard size={22}/>} label="Collections" />
        <NavButton active={activeTab === 'trends'} onClick={() => setActiveTab('trends')} icon={<BarChart3 size={22}/>} label="Analysis" />
      </nav>
    </div>
  );
};

// UI Components
const MetricCard = ({ icon, label, value, color, bg, details }) => {
    const [showDetails, setShowDetails] = useState(false);
    return (
        <div onClick={() => details && setShowDetails(!showDetails)} className="bg-white/5 border border-white/10 rounded-[28px] p-5 active:bg-white/10 transition-all">
            <div className={`w-10 h-10 ${bg} ${color} rounded-xl flex items-center justify-center mb-4`}>{icon}</div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-base font-black ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {showDetails && details && (
                <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-1 animate-in fade-in slide-in-from-top-2 duration-300">
                    {Object.entries(details).slice(0, 4).map(([k, v]) => (
                        <div key={k} className="text-[8px] font-bold text-slate-500"><span className="text-white">{v}</span> {k}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

const SectionHeader = ({ title, action }) => (
  <div className="flex justify-between items-center mb-4 px-2">
    <h2 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{title}</h2>
    <div className="text-primary">{action}</div>
  </div>
);

const InventoryItem = ({ label, value }) => (
  <div className="flex items-center justify-between p-5 border-b border-white/5 last:border-0 active:bg-white/5">
    <div className="flex items-center gap-4">
      <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
      <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider">{label}</span>
    </div>
    <span className="text-xs font-black text-white">{value.toLocaleString()}</span>
  </div>
);

const ProductionRow = ({ data }) => {
  const total = (parseInt(data['1LTR']||0) + parseInt(data['500ML']||0) + parseInt(data['250ML']||0) + parseInt(data['20LTR']||0));
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between active:bg-white/10 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-inner">
          <Factory size={16} />
        </div>
        <div>
          <p className="text-xs font-bold text-white">Batch {new Date(data.DATE).toLocaleDateString()}</p>
          <p className="text-[9px] text-slate-500 font-bold uppercase">{new Date(data.DATE).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
        </div>
      </div>
      <span className="text-sm font-black text-primary">+{total}</span>
    </div>
  );
};

const DueCard = ({ data }) => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center justify-between active:bg-white/10 transition-all shadow-lg">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 border border-rose-500/20">
        <User size={20} />
      </div>
      <div>
        <p className="text-sm font-black text-white">{data.NAME}</p>
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{data.CATEGORY} • {new Date(data.DATE).toLocaleDateString()}</p>
      </div>
    </div>
    <div className="text-right">
      <p className="text-base font-black text-rose-500">₹{parseFloat(data.DUE).toLocaleString()}</p>
      <ChevronRight size={14} className="text-slate-600 inline ml-1" />
    </div>
  </div>
);

const NavButton = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 px-6 transition-all duration-500 ${active ? 'text-primary scale-110' : 'text-slate-500'}`}>
    <div className={`transition-all duration-500 ${active ? 'translate-y-[-4px]' : ''}`}>{icon}</div>
    <span className={`text-[8px] font-black uppercase tracking-widest transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-30'}`}>{label}</span>
  </button>
);

const LoginView = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!window.SupabaseService) return alert("System initializing...");
    setBusy(true);
    try {
        const res = await window.SupabaseService.verifyUser(username, password);
        if (res.success) {
          localStorage.setItem('suguna_user', JSON.stringify(res.user));
          onLogin(res.user);
        } else alert(res.message);
    } catch (err) { alert("Network Error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="h-screen bg-[#030712] flex flex-col justify-center px-10 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-80 h-80 bg-primary/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-rose-500/10 rounded-full blur-[120px]" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <h1 className="text-4xl font-black text-white mb-2 leading-none tracking-tighter italic uppercase">SAI SUGUNA<br/><span className="text-primary not-italic">AQUA PRODUCTS</span></h1>
        <p className="text-slate-500 text-[10px] mb-12 font-black tracking-[0.4em] uppercase opacity-70">Admin Management Portal</p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <input type="text" className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 outline-none focus:border-primary/50 text-white" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input type="password" className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 outline-none focus:border-primary/50 text-white" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={busy} className="w-full bg-primary text-white font-black py-5 rounded-2xl shadow-2xl shadow-primary/30 active:scale-95 transition-all tracking-widest uppercase text-xs mt-8">
            {busy ? 'Authenticating...' : 'Access Portal'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const Splash = () => (
  <div className="h-screen bg-[#030712] flex flex-col items-center justify-center">
    <div className="w-12 h-12 bg-primary rounded-full animate-pulse mb-6 shadow-[0_0_40px_rgba(56,189,248,0.5)]" />
    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">Syncing System</p>
  </div>
);

const ErrorView = ({ message, onRetry }) => (
    <div className="h-screen bg-[#030712] flex flex-col items-center justify-center px-10 text-center text-slate-500">
      <AlertCircle size={48} className="mb-6 opacity-50" />
      <p className="text-sm mb-8">{message}</p>
      <button onClick={onRetry} className="px-10 py-5 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold uppercase tracking-widest text-white active:scale-95 transition-all">Retry Sync</button>
    </div>
);

const TrendChart = ({ label, color, data }) => {
  const chartData = {
    labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
    datasets: [{
      label,
      data,
      borderColor: color,
      backgroundColor: color + '20',
      fill: true,
      tension: 0.4,
      borderWidth: 3,
      pointRadius: 0,
    }],
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#475569', font: { size: 9, weight: 'bold' } } }
    }
  };
  return <Line data={chartData} options={options} />;
};

export default App;
