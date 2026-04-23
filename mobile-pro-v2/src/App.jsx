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
  const [recentProd, setRecentProd] = useState([]);
  const [busy, setBusy] = useState(false);
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
      const [m, p] = await Promise.all([
        window.SupabaseService.getDashboardMetrics(),
        window.SupabaseService.getReportData('Production', 'weekly')
      ]);
      
      setMetrics(m);
      setRecentProd(p.slice(0, 10));
      setError(null);
    } catch (err) {
      console.error("Data Fetch Error:", err);
      setError("Sync failed. Please check internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduction = async (data) => {
    setBusy(true);
    try {
        const res = await window.SupabaseService.saveProduction(data);
        if (res.error) throw res.error;
        alert("Production data saved successfully!");
        setActiveTab('dashboard');
        fetchInitialData();
    } catch (err) {
        alert("Error saving data: " + err.message);
    } finally {
        setBusy(false);
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

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-slate-100">
      {/* Header */}
      <header className="safe-top bg-[#0f172a]/80 backdrop-blur-3xl border-b border-white/5 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div>
          <h1 className="text-lg font-black tracking-tight text-white uppercase">SAI SUGUNA <span className="text-primary">AQUA</span></h1>
          <p className="text-[8px] uppercase tracking-[0.3em] text-primary font-black">Production Portal</p>
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
              {/* Production Overview */}
              <div className="grid grid-cols-1 gap-4">
                <MetricCard 
                    icon={<Factory size={24}/>} 
                    label="Today's Total Production" 
                    value={metrics.PRODUCTION} 
                    color="text-primary" 
                    bg="bg-primary/10" 
                    details={metrics.PROD_DETAILS} 
                    large={true}
                />
              </div>

              {/* Product-wise Breakdown */}
              <div>
                <SectionHeader title="Production Breakdown" />
                <div className="bg-white/5 border border-white/10 rounded-[32px] overflow-hidden grid grid-cols-2">
                  {productKeys.map(k => (
                    <div key={k} className="p-5 border-b border-r border-white/5 flex justify-between items-center last:border-b-0">
                      <span className="text-[10px] font-bold text-slate-500">{k}</span>
                      <span className="text-sm font-black text-white">{(metrics.PROD_DETAILS?.[k] || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <SectionHeader title="Recent Batches" action={<button onClick={fetchInitialData} className="p-2"><RefreshCw size={14}/></button>} />
                <div className="space-y-3">
                  {recentProd.length > 0 ? recentProd.map((p, i) => (
                    <ProductionRow key={i} data={p} />
                  )) : (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                        <p className="text-slate-500 text-xs font-bold italic">No recent production recorded</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'update' && (
            <ProductionEntryView onSave={handleSaveProduction} busy={busy} />
          )}
        </AnimatePresence>
      </main>

      {/* Nav Bar */}
      <nav className="fixed bottom-8 left-6 right-6 h-20 bg-[#0f172a]/95 backdrop-blur-2xl rounded-[32px] border border-white/10 flex items-center justify-around px-4 z-50 shadow-2xl">
        <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutGrid size={22}/>} label="Dashboard" />
        <NavButton active={activeTab === 'update'} onClick={() => setActiveTab('update')} icon={<Box size={22}/>} label="Update Prod" />
      </nav>
    </div>
  );
};

// UI Components
const MetricCard = ({ icon, label, value, color, bg, details, large }) => {
    return (
        <div className={`bg-white/5 border border-white/10 rounded-[32px] ${large ? 'p-8' : 'p-5'} transition-all`}>
            <div className={`${large ? 'w-16 h-16' : 'w-10 h-10'} ${bg} ${color} rounded-2xl flex items-center justify-center mb-6`}>{icon}</div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</p>
            <p className={`${large ? 'text-4xl' : 'text-base'} font-black ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {details && (
                <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
                    {Object.entries(details).filter(([_, v]) => v > 0).map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{k}</span>
                            <span className="text-xs font-black text-white">{v}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const SectionHeader = ({ title, action }) => (
  <div className="flex justify-between items-center mb-4 px-2">
    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{title}</h2>
    <div className="text-primary">{action}</div>
  </div>
);

const ProductionRow = ({ data }) => {
  const total = ["250ML", "500ML", "1LTR", "2LTR", "5LTR", "20LTR", "BAGS"].reduce((sum, k) => sum + parseInt(data[k]||0), 0);
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

const NavButton = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 px-6 transition-all duration-500 ${active ? 'text-primary scale-110' : 'text-slate-500'}`}>
    <div className={`transition-all duration-500 ${active ? 'translate-y-[-4px]' : ''}`}>{icon}</div>
    <span className={`text-[8px] font-black uppercase tracking-widest transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-30'}`}>{label}</span>
  </button>
);

const ProductionEntryView = ({ onSave, busy }) => {
    const [formData, setFormData] = useState({
      "250ML": "", "500ML": "", "1LTR": "", "2LTR": "", "5LTR": "", "20LTR": "", "BAGS": ""
    });
  
    const handleChange = (key, val) => {
      setFormData(prev => ({ ...prev, [key]: val }));
    };
  
    const handleSubmit = (e) => {
      e.preventDefault();
      const data = {};
      let hasData = false;
      Object.entries(formData).forEach(([k, v]) => {
          if (v) {
              data[k] = parseInt(v);
              hasData = true;
          } else {
              data[k] = 0;
          }
      });
      if (!hasData) return alert("Please enter at least one quantity");
      onSave(data);
    };
  
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
        <SectionHeader title="Record New Production" />
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {Object.keys(formData).map(k => (
              <div key={k} className="bg-white/5 border border-white/10 rounded-[24px] p-5 focus-within:border-primary/50 transition-colors">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">{k}</label>
                <input 
                  type="number" 
                  inputMode="numeric"
                  className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-white/10" 
                  placeholder="0"
                  value={formData[k]}
                  onChange={(e) => handleChange(k, e.target.value)}
                />
              </div>
            ))}
          </div>
          <button 
            type="submit" 
            disabled={busy}
            className="w-full bg-primary text-white font-black py-6 rounded-[24px] shadow-2xl shadow-primary/30 active:scale-95 transition-all tracking-[0.2em] uppercase text-xs mt-6 flex items-center justify-center gap-3"
          >
            {busy ? <RefreshCw size={18} className="animate-spin" /> : <Box size={18} />}
            {busy ? 'Saving...' : 'Save Production'}
          </button>
        </form>
      </motion.div>
    );
  };

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
        <p className="text-slate-500 text-[11px] mb-12 font-black tracking-[0.4em] uppercase opacity-70 border-l-2 border-primary pl-4">Employee Login</p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <input type="text" className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 outline-none focus:border-primary/50 text-white" placeholder="Employee ID" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input type="password" className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 outline-none focus:border-primary/50 text-white" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={busy} className="w-full bg-primary text-white font-black py-5 rounded-2xl shadow-2xl shadow-primary/30 active:scale-95 transition-all tracking-widest uppercase text-xs mt-8">
            {busy ? 'Authenticating...' : 'Login to Dashboard'}
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

export default App;
