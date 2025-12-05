
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, Zap, Loader2 } from 'lucide-react';
import { useSettings } from '../App';
import { getTopAdsForAccount } from '../services/metaService';
import { analyzeAccountPerformance } from '../services/aiService';

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  
  const [aiStatus, setAiStatus] = useState<string[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  const handleLogout = () => {
    // Clear credentials and connection state but KEEP the App ID
    updateSettings({
      isConnected: false,
      fbAccessToken: '',
      adAccountId: '',
      businessName: '',
      // We do NOT clear fbAppId so the user doesn't have to type it again
    });
    navigate('/connect');
  };

  // Run AI Analysis for Sidebar
  useEffect(() => {
    const runAnalysis = async () => {
        if (!settings.isConnected || !settings.adAccountId || !settings.fbAccessToken) return;

        // Skip if dummy token (unless you want to mock it, but usually we just skip real API calls)
        if (settings.fbAccessToken === 'dummy_token') {
             setAiStatus([
                 "Scale the 'Broad' audience ad set by 20%.",
                 "Create similar UGC video creatives for winning ads.",
                 "Retest the headline from Top Ad #1."
             ]);
             return;
        }

        setLoadingAi(true);
        try {
            // 1. Get Top 3 Ads
            const topAds = await getTopAdsForAccount(settings.adAccountId, settings.fbAccessToken);
            
            // 2. Analyze
            if (topAds.length > 0) {
                const actionPlan = await analyzeAccountPerformance(
                    topAds, 
                    settings.selectedAiProvider, 
                    settings.apiKey, 
                    settings.selectedModel
                );
                setAiStatus(actionPlan);
            } else {
                setAiStatus(["Not enough active ads to analyze."]);
            }
        } catch (e) {
            console.error("Sidebar AI Error", e);
            setAiStatus(["Could not analyze ads at this time."]);
        } finally {
            setLoadingAi(false);
        }
    };

    runAnalysis();
  }, [settings.adAccountId, settings.isConnected, settings.fbAccessToken]);

  return (
    <div className="flex h-screen bg-[#0f172a] text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1e293b] border-r border-slate-700 flex flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 overflow-hidden bg-white">
             <img src="https://i.postimg.cc/pLyD6HKz/adsrocket.jpg" alt="Ads Rocket" className="w-full h-full object-cover" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Ads Rocket
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Settings size={20} />
            <span>Configuration</span>
          </NavLink>
        </nav>

        <div className="p-4 border-t border-slate-700">
            <div className="bg-slate-800/50 rounded-lg p-4 mb-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-2 text-indigo-400">
                    <Zap size={16} />
                    <span className="text-xs font-semibold uppercase tracking-wider">AI Status</span>
                </div>
                {loadingAi ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Loader2 size={12} className="animate-spin" /> Analyzing Top Ads...
                    </div>
                ) : (
                    <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                        {aiStatus.length > 0 ? (
                            aiStatus.map((plan, i) => <li key={i}>{plan}</li>)
                        ) : (
                            <li>Ready to analyze campaigns.</li>
                        )}
                    </ul>
                )}
            </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span>Disconnect</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="p-6 max-w-7xl mx-auto pb-24">
            <Outlet />
        </div>
      </main>

      {/* Mobile Nav (Bottom) */}
      <div className="md:hidden fixed bottom-0 w-full bg-[#1e293b] border-t border-slate-700 flex justify-around p-3 z-50">
        <NavLink to="/" className={({isActive}) => isActive ? 'text-indigo-400' : 'text-slate-500'}><LayoutDashboard /></NavLink>
        <NavLink to="/settings" className={({isActive}) => isActive ? 'text-indigo-400' : 'text-slate-500'}><Settings /></NavLink>
        <button onClick={handleLogout} className="text-slate-500"><LogOut /></button>
      </div>
    </div>
  );
};

export default Layout;
