import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, Zap, Loader2, ChevronDown, ChevronUp, Play, PlusCircle, MessageSquareText, Menu, X } from 'lucide-react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const navLinkClass = ({ isActive }: { isActive: boolean }) => 
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
        isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
    }`;

  // Mobile Gradient Style
  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) => 
    `flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all duration-300 transform ${
        isActive 
        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30 scale-[1.02]' 
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="flex h-screen bg-[#0f172a] text-gray-100 overflow-hidden relative">
      
      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="w-64 bg-[#1e293b] border-r border-slate-700 flex flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 overflow-hidden bg-white">
             <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Ads Rocket" className="w-full h-full object-cover" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Ads Rocket
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavLink to="/" className={navLinkClass}>
            <LayoutDashboard size={20} /><span>Dashboard</span>
          </NavLink>

          {/* DISABLED / COMING SOON LINK */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 cursor-not-allowed opacity-60">
            <PlusCircle size={20} />
            <span className="flex-1">Buat Campaign</span>
            <span className="text-[9px] font-bold bg-red-600 text-white border border-red-700 px-1.5 py-0.5 rounded whitespace-nowrap">
              Akan Datang
            </span>
          </div>
          
          <NavLink to="/comment-templates" className={navLinkClass}>
            <MessageSquareText size={20} /><span>Comment Templates</span>
          </NavLink>

          <NavLink to="/settings" className={navLinkClass}>
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

      {/* --- MOBILE HEADER --- */}
      <div className="md:hidden fixed top-0 w-full bg-[#1e293b]/90 backdrop-blur-md border-b border-slate-700 z-40 px-4 py-3 flex items-center justify-between">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
              <Menu size={24} />
          </button>
          
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-lg overflow-hidden bg-white">
                <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Ads Rocket" className="w-full h-full object-cover" />
             </div>
             <span className="font-bold text-lg text-white">Ads Rocket</span>
          </div>

          <div className="w-10"></div> {/* Spacer for balance */}
      </div>

      {/* --- MOBILE SLIDE-IN MENU --- */}
      {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
              {/* Backdrop */}
              <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn"
                onClick={() => setIsMobileMenuOpen(false)}
              ></div>
              
              {/* Sidebar Content */}
              <aside className="relative w-[80%] max-w-[300px] h-full bg-[#1e293b] shadow-2xl flex flex-col animate-slide-in border-r border-slate-700">
                  <div className="p-6 flex items-center justify-between border-b border-slate-700">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white shadow-lg overflow-hidden">
                             <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Logo" className="w-full h-full object-cover" />
                          </div>
                          <span className="text-xl font-extrabold text-white tracking-tight">Ads Rocket</span>
                      </div>
                      <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
                          <X size={24} />
                      </button>
                  </div>

                  <nav className="flex-1 px-4 py-6 space-y-3 overflow-y-auto">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-4 mb-2">Menu Utama</p>
                      
                      <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                        <LayoutDashboard size={22} /><span>Dashboard</span>
                      </NavLink>

                      {/* DISABLED MOBILE LINK */}
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-slate-600 opacity-60">
                        <PlusCircle size={22} />
                        <span>Buat Campaign</span>
                        <span className="ml-auto text-[9px] bg-red-600 text-white border border-red-700 px-1.5 py-0.5 rounded">
                          Akan Datang
                        </span>
                      </div>
                      
                      <NavLink to="/comment-templates" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                        <MessageSquareText size={22} /><span>Comment Templates</span>
                      </NavLink>

                      <NavLink to="/settings" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                        <Settings size={22} /><span>Configuration</span>
                      </NavLink>
                  </nav>

                  <div className="p-4 border-t border-slate-700 bg-slate-900/30">
                      <button 
                        onClick={handleLogout} 
                        className="flex items-center justify-center gap-3 px-4 py-3 w-full text-red-400 hover:text-white hover:bg-red-600 rounded-xl transition-all font-semibold"
                      >
                          <LogOut size={20} /><span>Sign Out</span>
                      </button>
                  </div>
              </aside>
          </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative pt-16 md:pt-0">
        <div className="p-4 md:p-6 max-w-7xl mx-auto pb-24"><Outlet /></div>
      </main>

      <Chatbot />
    </div>
  );
};

export default Layout;