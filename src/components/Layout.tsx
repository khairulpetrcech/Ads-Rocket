import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, Zap, Loader2, ChevronDown, ChevronUp, Play, PlusCircle, MessageSquareText, Menu, X, Minimize2, Maximize2, CheckCircle, Image, Activity } from 'lucide-react';
import { useSettings } from '../App';
import { getTopAdsForAccount, publishComment } from '../services/metaService';
import { analyzeAccountPerformance } from '../services/aiService';
import { Ad, CommentTemplate } from '../types';

const APP_VERSION = "0.91";

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const { settings, logout, reselectApiKey, globalProcess } = useSettings();
  
  const [aiStatus, setAiStatus] = useState<string[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isAiExpanded, setIsAiExpanded] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- GLOBAL COMMENT SESSION STATE ---
  const [commentSession, setCommentSession] = useState<{
    active: boolean;
    minimized: boolean;
    adName: string;
    total: number;
    current: number;
    status: string;
    complete: boolean;
  }>({
    active: false,
    minimized: false,
    adName: '',
    total: 0,
    current: 0,
    status: '',
    complete: false
  });

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
        } catch (e: any) {
            const errStr = (e.message || "").toLowerCase();
            if (errStr.includes("api key not valid") || errStr.includes("api_key_invalid") || errStr.includes("requested entity was not found")) {
                await reselectApiKey();
            }
            setAiStatus(["Could not analyze ads at this time."]);
        } finally {
            setLoadingAi(false);
        }
  };

  const launchCommentSession = async (ad: Ad, template: CommentTemplate) => {
      if (!ad.creative.effective_object_story_id) return alert("Invalid Ad Post ID");
      
      const items = template.items || [];
      if (items.length === 0) return;

      // Initialize Session
      setCommentSession({
          active: true,
          minimized: false,
          adName: ad.name,
          total: items.length,
          current: 0,
          status: 'Initializing...',
          complete: false
      });

      try {
          for (let i = 0; i < items.length; i++) {
              setCommentSession(prev => ({
                  ...prev,
                  current: i + 1,
                  status: `Posting comment ${i + 1} of ${items.length}...`
              }));

              await publishComment(
                  ad.creative.effective_object_story_id,
                  items[i].message,
                  items[i].imageBase64,
                  settings.fbAccessToken
              );

              // Delay logic
              if (i < items.length - 1) {
                  const delayMs = Math.floor(Math.random() * 5000) + 10000; // 10-15s
                  const delaySec = Math.ceil(delayMs / 1000);
                  
                  for (let s = delaySec; s > 0; s--) {
                      setCommentSession(prev => ({ ...prev, status: `Waiting ${s}s to prevent spam detection...` }));
                      await new Promise(r => setTimeout(r, 1000));
                  }
              }
          }
          
          // Complete
          setCommentSession(prev => ({ ...prev, status: 'All comments posted successfully!', complete: true }));
          
          // Save to published list in local storage (handled here globally)
          const savedPub = localStorage.getItem('ar_published_comments');
          const pubSet = savedPub ? new Set(JSON.parse(savedPub)) : new Set();
          pubSet.add(ad.id);
          localStorage.setItem('ar_published_comments', JSON.stringify(Array.from(pubSet)));

          // Auto close after 3s
          setTimeout(() => {
             setCommentSession(prev => ({ ...prev, active: false }));
          }, 3000);

      } catch (e: any) {
          setCommentSession(prev => ({ 
              ...prev, 
              status: `Error: ${e.message}`,
              complete: true // Stop but keep open to show error
          }));
      }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) => 
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
        isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
    }`;

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
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 overflow-hidden bg-white flex-shrink-0">
             <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Ads Rocket" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 leading-none">
                Ads Rocket
            </div>
            <div className="text-[10px] font-bold mt-1 bg-gradient-to-r from-[#FBF5B7] via-[#BF953F] to-[#AA771C] text-transparent bg-clip-text">
                Jom Automasi 100% Pemasaran Anda.
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavLink to="/" className={navLinkClass}>
            <LayoutDashboard size={20} /><span>Dashboard</span>
          </NavLink>

          <NavLink to="/create-campaign" className={navLinkClass}>
            <PlusCircle size={20} /><span>Buat Campaign</span>
          </NavLink>

          <NavLink to="/epic-poster" className={navLinkClass}>
            <Image size={20} /><span>Epic Poster</span>
          </NavLink>
          
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
            
            {/* VERSION DISPLAY */}
            <div className="mt-4 text-center">
                <p className="text-[10px] text-slate-600 font-mono">Ads Rocket Version : {APP_VERSION}</p>
            </div>
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
                          <div className="w-10 h-10 rounded-xl bg-white shadow-lg overflow-hidden flex-shrink-0">
                             <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Logo" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <div className="text-xl font-extrabold text-white tracking-tight leading-none">Ads Rocket</div>
                            <div className="text-[10px] font-bold mt-1 bg-gradient-to-r from-[#FBF5B7] via-[#BF953F] to-[#AA771C] text-transparent bg-clip-text">
                                Jom Automasi 100% Pemasaran Anda.
                            </div>
                          </div>
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

                      <NavLink to="/create-campaign" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                        <PlusCircle size={22} /><span>Buat Campaign</span>
                      </NavLink>

                      <NavLink to="/epic-poster" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                        <Image size={22} /><span>Epic Poster</span>
                      </NavLink>
                      
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
                      
                      {/* VERSION DISPLAY MOBILE */}
                      <div className="mt-4 text-center">
                        <p className="text-[10px] text-slate-600 font-mono">Ads Rocket Version : {APP_VERSION}</p>
                      </div>
                  </div>
              </aside>
          </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative pt-16 md:pt-0">
        <div className="p-4 md:p-6 max-w-7xl mx-auto pb-24">
            <Outlet context={{ launchCommentSession }} />
        </div>
      </main>
      
      {/* --- GLOBAL BACKGROUND PROCESS BAR (MINI) --- */}
      {globalProcess.active && (
        <div className="fixed bottom-24 right-6 md:bottom-6 md:right-6 z-50 animate-fadeIn">
          <div className="bg-[#1e293b] border border-indigo-500/50 shadow-2xl rounded-xl p-3 flex items-center gap-4 w-72 md:w-80 backdrop-blur-md">
            <div className="relative flex items-center justify-center w-10 h-10 bg-indigo-900/30 rounded-full flex-shrink-0">
               <Loader2 className="animate-spin text-indigo-400" size={20} />
            </div>
            <div className="flex-1 min-w-0">
               <div className="flex justify-between items-center mb-0.5">
                   <h4 className="text-white text-sm font-bold truncate">{globalProcess.name || "Processing..."}</h4>
                   <Activity size={12} className="text-indigo-400 animate-pulse" />
               </div>
               <p className="text-xs text-indigo-300 truncate">{globalProcess.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL COMMENT WIDGET --- */}
      {commentSession.active && (
          commentSession.minimized ? (
              // MINIMIZED WIDGET
              <div 
                  className="fixed bottom-6 right-6 bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl p-4 w-72 z-50 animate-fadeIn cursor-pointer hover:border-indigo-500 transition-colors"
                  onClick={() => setCommentSession(prev => ({ ...prev, minimized: false }))}
              >
                  <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-white font-bold text-sm">
                          {commentSession.complete ? <CheckCircle size={16} className="text-green-500"/> : <Loader2 size={16} className="animate-spin text-indigo-400"/>}
                          <span className="truncate max-w-[150px]">{commentSession.adName}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setCommentSession(prev => ({ ...prev, minimized: false })); }}
                        className="text-slate-400 hover:text-white"
                      >
                          <Maximize2 size={14} />
                      </button>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1 overflow-hidden">
                      <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${(commentSession.current / commentSession.total) * 100}%` }}></div>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{commentSession.status}</p>
              </div>
          ) : (
              // FULL MODAL
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                  <div className="bg-[#1e293b] w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl p-6 relative animate-fadeIn">
                      <div className="flex justify-between items-start mb-6">
                          <div>
                            <h2 className="text-xl font-bold text-white">Posting Comments</h2>
                            <p className="text-sm text-slate-400">Target: <span className="text-indigo-400">{commentSession.adName}</span></p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                                onClick={() => setCommentSession(prev => ({ ...prev, minimized: true }))}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                title="Minimize to background"
                            >
                                <Minimize2 size={20} />
                            </button>
                            {commentSession.complete && (
                                <button 
                                    onClick={() => setCommentSession(prev => ({ ...prev, active: false }))}
                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                                >
                                    <X size={20} />
                                </button>
                            )}
                          </div>
                      </div>

                      <div className="flex flex-col items-center justify-center py-4 space-y-4">
                          <div className="relative w-24 h-24 flex items-center justify-center">
                              {commentSession.complete ? (
                                  <div className="bg-green-500/20 p-4 rounded-full animate-pulse">
                                    <CheckCircle size={48} className="text-green-500" />
                                  </div>
                              ) : (
                                  <>
                                    <svg className="absolute w-full h-full transform -rotate-90">
                                        <circle cx="48" cy="48" r="40" stroke="#334155" strokeWidth="6" fill="transparent" />
                                        <circle cx="48" cy="48" r="40" stroke="#6366f1" strokeWidth="6" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * commentSession.current / commentSession.total)} className="transition-all duration-500" />
                                    </svg>
                                    <span className="text-xl font-bold text-white">{commentSession.current}/{commentSession.total}</span>
                                  </>
                              )}
                          </div>
                          
                          <p className="text-center text-indigo-300 font-medium animate-pulse">{commentSession.status}</p>
                          
                          {!commentSession.complete && (
                             <p className="text-xs text-slate-500 text-center max-w-[80%]">
                                You can minimize this window. The process will continue in the background.
                             </p>
                          )}
                      </div>
                  </div>
              </div>
          )
      )}

    </div>
  );
};

export default Layout;