import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, Zap, Loader2, ChevronDown, ChevronUp, Play, PlusCircle, MessageSquareText } from 'lucide-react';
import { useSettings } from '../App';
import { getTopAdsForAccount } from '../services/metaService';
import { analyzeAccountPerformance } from '../services/aiService';
import Chatbot from './Chatbot';

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const { settings, logout } = useSettings();
  
  const [aiStatus, setAiStatus] = useState<string[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isAiExpanded, setIsAiExpanded] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Manual Trigger AI Analysis
  const handleAnalyze = async () => {
        if (!settings.isConnected || !settings.adAccountId || !settings.fbAccessToken) return;

        setLoadingAi(true);
        setIsAiExpanded(true);
        try {
            const topAds = await getTopAdsForAccount(settings.adAccountId, settings.fbAccessToken);
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
            setAiStatus(["Could not analyze ads at this time."]);
        } finally {
            setLoadingAi(false);
        }
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-gray-100 overflow-hidden relative">
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
          <NavLink to="/" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
            <LayoutDashboard size={20} /><span>Dashboard</span>
          </NavLink>

          <NavLink to="/create-campaign" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
            <PlusCircle size={20} /><span>Buat Campaign</span>
          </NavLink>
          
          <NavLink to="/comment-templates" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
            <MessageSquareText size={20} /><span>Comment Templates</span>
          </NavLink>

          <NavLink to="/settings" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
            <Settings size={20} /><span>Configuration</span>
          </NavLink>
        </nav>

        <div className="p-4 border-t border-slate-700">
            {/* AI Status Box */}
            <div className="bg-slate-800/50 rounded-lg p-4 mb-4 border border-slate-700 transition-all">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-indigo-400">
                        <Zap size={16} /> <span className="text-xs font-semibold uppercase">AI Status</span>
                    </div>
                    <button onClick={() => setIsAiExpanded(!isAiExpanded)} className="text-slate-500 hover:text-white">
                        {isAiExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
                {isAiExpanded && (
                    <div className="animate-fadeIn">
                        {loadingAi ? <div className="text-xs text-slate-400 py-2 flex gap-2"><Loader2 size={12} className="animate-spin"/> Analyzing...</div> : (
                            <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4 mb-3">
                                {aiStatus.length > 0 ? aiStatus.map((plan, i) => <li key={i}>{plan}</li>) : <li className="list-none italic text-slate-500">Ready to analyze.</li>}
                            </ul>
                        )}
                        <button onClick={handleAnalyze} disabled={loadingAi} className="w-full flex items-center justify-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs py-2 rounded border border-indigo-500/30">
                            <Play size={10} fill="currentColor" /> Analyze Now
                        </button>
                    </div>
                )}
            </div>
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                <LogOut size={20} /><span>Sign Out</span>
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="p-6 max-w-7xl mx-auto pb-24"><Outlet /></div>
      </main>

      <Chatbot />

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-0 w-full bg-[#1e293b] border-t border-slate-700 flex justify-around p-3 z-50">
        <NavLink to="/" className={({isActive}) => isActive ? 'text-indigo-400' : 'text-slate-500'}><LayoutDashboard /></NavLink>
        <NavLink to="/create-campaign" className={({isActive}) => isActive ? 'text-indigo-400' : 'text-slate-500'}><PlusCircle /></NavLink>
        <NavLink to="/comment-templates" className={({isActive}) => isActive ? 'text-indigo-400' : 'text-slate-500'}><MessageSquareText /></NavLink>
        <NavLink to="/settings" className={({isActive}) => isActive ? 'text-indigo-400' : 'text-slate-500'}><Settings /></NavLink>
      </div>
    </div>
  );
};

export default Layout;