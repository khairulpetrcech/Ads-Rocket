
import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, Rocket, Loader2, ChevronDown, ChevronUp, Play, PlusCircle, MessageSquareText, Menu, X, Minimize2, Maximize2, CheckCircle, Image, Activity, Search, HelpCircle, Bell, Users, FileText, Video, Bot } from 'lucide-react';
import { useSettings } from '../App';
import { getTopAdsForAccount, publishComment } from '../services/metaService';
import { analyzeAccountPerformance } from '../services/aiService';
import { Ad, CommentTemplate } from '../types';
import { useToast } from '../contexts/ToastContext';

const APP_VERSION = "0.91";

const Layout: React.FC = () => {
    const navigate = useNavigate();
    const { settings, logout, reselectApiKey, globalProcess } = useSettings();
    const { showToast } = useToast();

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

    // Helper: Check and update comment rate limit (10 per 24 hours)
    const checkCommentRateLimit = (commentCount: number): { allowed: boolean; remaining: number; resetTime: string } => {
        const LIMIT = 10;
        const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours in ms

        const now = Date.now();
        const savedData = localStorage.getItem('ar_comment_rate_limit');
        let rateData: { timestamps: number[] } = { timestamps: [] };

        if (savedData) {
            rateData = JSON.parse(savedData);
            // Filter out timestamps older than 24 hours
            rateData.timestamps = rateData.timestamps.filter(ts => now - ts < WINDOW_MS);
        }

        const currentCount = rateData.timestamps.length;
        const remaining = LIMIT - currentCount;

        // Calculate reset time (oldest timestamp + 24h)
        let resetTime = '';
        if (currentCount >= LIMIT && rateData.timestamps.length > 0) {
            const oldestTs = Math.min(...rateData.timestamps);
            const resetDate = new Date(oldestTs + WINDOW_MS);
            resetTime = resetDate.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
        }

        if (currentCount + commentCount > LIMIT) {
            return { allowed: false, remaining, resetTime };
        }

        return { allowed: true, remaining: remaining - commentCount, resetTime };
    };

    const recordComments = (count: number) => {
        const now = Date.now();
        const savedData = localStorage.getItem('ar_comment_rate_limit');
        let rateData: { timestamps: number[] } = { timestamps: [] };

        if (savedData) {
            rateData = JSON.parse(savedData);
            // Filter out timestamps older than 24 hours
            rateData.timestamps = rateData.timestamps.filter(ts => now - ts < 24 * 60 * 60 * 1000);
        }

        // Add new timestamps
        for (let i = 0; i < count; i++) {
            rateData.timestamps.push(now);
        }

        localStorage.setItem('ar_comment_rate_limit', JSON.stringify(rateData));
    };

    const launchCommentSession = async (ad: Ad, template: CommentTemplate) => {
        if (!ad.creative.effective_object_story_id) return alert("Invalid Ad Post ID");

        const items = template.items || [];
        if (items.length === 0) return;

        // Check rate limit before starting
        const rateCheck = checkCommentRateLimit(items.length);
        if (!rateCheck.allowed) {
            showToast(
                `Had limit komentar tercapai!\n\nUntuk mengelakkan spam detection oleh Meta, anda hanya boleh post maksimum 10 komen dalam 24 jam.\n\nBaki komen anda: ${rateCheck.remaining} komen\nMahu post: ${items.length} komen\n\n${rateCheck.resetTime ? `Limit akan reset sekitar: ${rateCheck.resetTime}` : 'Sila cuba lagi kemudian.'}`,
                'warning'
            );
            return;
        }

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

                // Record this comment to rate limit tracker
                recordComments(1);

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
            const finalCheck = checkCommentRateLimit(0);
            setCommentSession(prev => ({
                ...prev,
                status: `All comments posted! (${finalCheck.remaining} komen baki hari ini)`,
                complete: true
            }));

            // Save to published list in local storage (handled here globally) - V2: track count
            const savedPub = localStorage.getItem('ar_published_comments_v2');
            let pubMap: Record<string, number> = {};
            if (savedPub) {
                try {
                    pubMap = JSON.parse(savedPub);
                } catch {
                    pubMap = {};
                }
            }
            pubMap[ad.id] = (pubMap[ad.id] || 0) + 1;
            localStorage.setItem('ar_published_comments_v2', JSON.stringify(pubMap));

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
        `flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`;

    // Minimal Mobile Link Class (Mirrors Desktop)
    const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-sm font-medium ${isActive
            ? 'bg-indigo-50 text-indigo-700 font-semibold'
            : 'text-slate-600 hover:bg-slate-50'
        }`;

    return (
        <div className="flex h-screen bg-white text-slate-800 overflow-hidden relative">

            {/* --- DESKTOP SIDEBAR --- */}
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
                {/* Logo Area */}
                <div className="p-4 px-6 flex items-center gap-2 border-b border-transparent">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm">
                        <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Ads Rocket" className="w-full h-full object-cover rounded-lg opacity-90" />
                    </div>
                    <div className="flex items-center gap-1 cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors -ml-1 pr-2">
                        <span className="text-sm font-bold text-slate-800 uppercase tracking-tight">ADS ROCKET</span>
                        <ChevronDown size={14} className="text-slate-400" />
                    </div>
                </div>



                {/* Navigation */}
                <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar pt-2">
                    <div className="px-3 py-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">General</p>
                        <div className="space-y-1">
                            <NavLink to="/" className={navLinkClass}>
                                <LayoutDashboard size={18} /><span>Dashboard</span>
                            </NavLink>

                            {/* Hidden for now
                            <NavLink to="/create-campaign" className={navLinkClass}>
                                <PlusCircle size={18} /><span>Create Campaign</span>
                            </NavLink>
                            */}

                            <NavLink to="/rapid" className={navLinkClass}>
                                <Rocket size={18} /><span>Rapid Campaign</span>
                            </NavLink>

                            <NavLink to="/epic-poster" className={navLinkClass}>
                                <Image size={18} /><span>Epic Poster</span>
                            </NavLink>

                            <NavLink to="/epic-video" className={navLinkClass}>
                                <Video size={18} /><span>Epic Video</span>
                            </NavLink>

                            <NavLink to="/comment-templates" className={navLinkClass}>
                                <MessageSquareText size={18} /><span>Comment Templates</span>
                            </NavLink>

                            {/* Hidden for now
                            <NavLink to="/assistant" className={navLinkClass}>
                                <Bot size={18} /><span>AI Assistant</span>
                            </NavLink>
                            */}
                        </div>
                    </div>

                    <div className="px-3 py-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Settings</p>
                        <div className="space-y-1">
                            <NavLink to="/settings" className={navLinkClass}>
                                <Settings size={18} /><span>Configuration</span>
                            </NavLink>
                            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 cursor-not-allowed opacity-60">
                                <Users size={18} /> <span>Members</span>
                            </div>
                            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 cursor-not-allowed opacity-60">
                                <Bell size={18} /> <span>Notifications</span>
                            </div>
                        </div>
                    </div>
                </nav>

                {/* Bottom Section */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50">


                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">A</div>
                            <span className="text-xs font-semibold text-slate-700">Admin User</span>
                        </div>
                        <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors" title="Sign Out">
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* --- MOBILE HEADER --- */}
            <div className="md:hidden fixed top-0 w-full bg-white border-b border-slate-200 z-40 px-4 py-3 flex items-center justify-between shadow-sm">
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <Menu size={24} />
                </button>

                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-indigo-600 shadow-sm">
                        <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Ads Rocket" className="w-full h-full object-cover" />
                    </div>
                    <span className="font-bold text-lg text-slate-800">Ads Rocket</span>
                </div>

                <div className="w-10"></div> {/* Spacer for balance */}
            </div>

            {/* --- MOBILE SLIDE-IN MENU --- */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fadeIn"
                        onClick={() => setIsMobileMenuOpen(false)}
                    ></div>

                    {/* Sidebar Content */}
                    <aside className="relative w-[85%] max-w-[320px] h-full bg-white shadow-2xl flex flex-col animate-slide-in">
                        <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-indigo-600 shadow-md overflow-hidden flex-shrink-0">
                                    <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Logo" className="w-full h-full object-cover" />
                                </div>
                                <div>
                                    <div className="text-lg font-extrabold text-slate-800 tracking-tight leading-none">Ads Rocket</div>
                                    <div className="text-[10px] font-semibold text-indigo-500 mt-0.5">Mobile Console</div>
                                </div>
                            </div>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                <X size={22} />
                            </button>
                        </div>

                        <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
                            {/* GENERAL SECTION */}
                            <div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-4">General</p>
                                <div className="space-y-1">
                                    <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                                        <LayoutDashboard size={20} /><span>Dashboard</span>
                                    </NavLink>

                                    {/* Hidden for now
                                    <NavLink to="/create-campaign" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                                        <PlusCircle size={20} /><span>Create Campaign</span>
                                    </NavLink>
                                    */}

                                    <NavLink to="/rapid" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                                        <Rocket size={20} /><span>Rapid Campaign</span>
                                    </NavLink>

                                    <NavLink to="/epic-poster" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                                        <Image size={20} /><span>Epic Poster</span>
                                    </NavLink>

                                    <NavLink to="/epic-video" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                                        <Video size={20} /><span>Epic Video</span>
                                    </NavLink>

                                    <NavLink to="/comment-templates" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                                        <MessageSquareText size={20} /><span>Comment Templates</span>
                                    </NavLink>

                                    {/* Hidden for now
                                    <NavLink to="/assistant" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                                        <Bot size={20} /><span>AI Assistant</span>
                                    </NavLink>
                                    */}
                                </div>
                            </div>

                            {/* SETTINGS SECTION */}
                            <div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-4">Settings</p>
                                <div className="space-y-1">
                                    <NavLink to="/settings" onClick={() => setIsMobileMenuOpen(false)} className={mobileNavLinkClass}>
                                        <Settings size={20} /><span>Configuration</span>
                                    </NavLink>
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-400 cursor-not-allowed opacity-60">
                                        <Users size={20} /> <span>Members</span>
                                    </div>
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-400 cursor-not-allowed opacity-60">
                                        <Bell size={20} /> <span>Notifications</span>
                                    </div>
                                </div>
                            </div>
                        </nav>

                        <div className="p-4 border-t border-slate-100 bg-slate-50">
                            <button
                                onClick={handleLogout}
                                className="flex items-center justify-center gap-2 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-all font-semibold border border-transparent hover:border-red-100"
                            >
                                <LogOut size={18} /><span>Sign Out</span>
                            </button>

                            <div className="mt-2 text-center">
                                <p className="text-[10px] text-slate-400 font-mono">v{APP_VERSION}</p>
                            </div>
                        </div>
                    </aside>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto relative pt-16 md:pt-0 bg-[#f8fafc]">


                <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24">
                    <Outlet context={{ launchCommentSession }} />
                </div>
            </main>

            {/* --- GLOBAL BACKGROUND PROCESS BAR (MINI) --- */}
            {globalProcess.active && (
                <div className="fixed bottom-24 right-6 md:bottom-6 md:right-6 z-50 animate-fadeIn">
                    <div className="bg-white border border-indigo-200 shadow-xl rounded-xl p-3 flex items-center gap-4 w-72 md:w-80">
                        <div className="relative flex items-center justify-center w-10 h-10 bg-indigo-50 rounded-full flex-shrink-0 border border-indigo-100">
                            <Loader2 className="animate-spin text-indigo-600" size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                                <h4 className="text-slate-800 text-sm font-bold truncate">{globalProcess.name || "Processing..."}</h4>
                                <Activity size={12} className="text-indigo-600 animate-pulse" />
                            </div>
                            <p className="text-xs text-slate-500 truncate">{globalProcess.message}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* --- GLOBAL COMMENT WIDGET --- */}
            {commentSession.active && (
                commentSession.minimized ? (
                    // MINIMIZED WIDGET
                    <div
                        className="fixed bottom-6 right-6 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72 z-50 animate-fadeIn cursor-pointer hover:border-indigo-500 transition-colors"
                        onClick={() => setCommentSession(prev => ({ ...prev, minimized: false }))}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                                {commentSession.complete ? <CheckCircle size={16} className="text-green-500" /> : <Loader2 size={16} className="animate-spin text-indigo-600" />}
                                <span className="truncate max-w-[150px]">{commentSession.adName}</span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setCommentSession(prev => ({ ...prev, minimized: false })); }}
                                className="text-slate-400 hover:text-indigo-600"
                            >
                                <Maximize2 size={14} />
                            </button>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-1 overflow-hidden">
                            <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${(commentSession.current / commentSession.total) * 100}%` }}></div>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">{commentSession.status}</p>
                    </div>
                ) : (
                    // FULL MODAL
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                        <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-2xl p-6 relative animate-fadeIn">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">Posting Comments</h2>
                                    <p className="text-sm text-slate-500">Target: <span className="text-indigo-600 font-medium">{commentSession.adName}</span></p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCommentSession(prev => ({ ...prev, minimized: true }))}
                                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                        title="Minimize to background"
                                    >
                                        <Minimize2 size={20} />
                                    </button>
                                    {commentSession.complete && (
                                        <button
                                            onClick={() => setCommentSession(prev => ({ ...prev, active: false }))}
                                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                                        >
                                            <X size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center py-4 space-y-4">
                                <div className="relative w-24 h-24 flex items-center justify-center">
                                    {commentSession.complete ? (
                                        <div className="bg-green-100 p-4 rounded-full animate-pulse">
                                            <CheckCircle size={48} className="text-green-600" />
                                        </div>
                                    ) : (
                                        <>
                                            <svg className="absolute w-full h-full transform -rotate-90">
                                                <circle cx="48" cy="48" r="40" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                                                <circle cx="48" cy="48" r="40" stroke="#4f46e5" strokeWidth="6" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * commentSession.current / commentSession.total)} className="transition-all duration-500" />
                                            </svg>
                                            <span className="text-xl font-bold text-slate-800">{commentSession.current}/{commentSession.total}</span>
                                        </>
                                    )}
                                </div>

                                <p className="text-center text-indigo-600 font-medium animate-pulse">{commentSession.status}</p>

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
