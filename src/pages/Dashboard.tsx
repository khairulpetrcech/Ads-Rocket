import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { AdCampaign, AdSet, Ad, CommentTemplate, LayoutContextType } from '../types';
import { useSettings } from '../App';
import { useToast } from '../contexts/ToastContext';
import {
    getRealCampaigns,
    initFacebookSdk,
    getAdSets,
    getAds,
    updateEntityStatus,
    updateEntityBudget,
    refreshFacebookToken
} from '../services/metaService';
import { MOCK_CAMPAIGNS } from '../services/mockData';
import {
    TrendingUp, DollarSign, MousePointer, Loader2, RefreshCw,
    Filter, Calendar, Briefcase, ChevronDown, ChevronRight, Image as ImageIcon,
    Edit2, ExternalLink, MessageCircle, ShoppingCart, MessageSquarePlus, Send, X, Check, Layers, ArrowRight, ChevronLeft, Sparkles
} from 'lucide-react';
import AnalysisSettingsDialog from '../components/AnalysisSettingsDialog';
import BudgetEditDialog from '../components/BudgetEditDialog';

const formatMYR = (amount: number) => {
    return new Intl.NumberFormat('en-MY', {
        style: 'currency',
        currency: 'MYR',
        minimumFractionDigits: 2
    }).format(amount);
};

// --- HELPER: CONSTRUCT FB POST URL ---
const getPostLink = (storyId?: string) => {
    if (!storyId) return '#';
    // If format is PAGEID_POSTID, split it
    if (storyId.includes('_')) {
        const [pageId, postId] = storyId.split('_');
        // Using business.facebook.com is often more reliable for Admins viewing Dark Posts
        return `https://business.facebook.com/${pageId}/posts/${postId}`;
    }
    // Fallback for single IDs
    return `https://www.facebook.com/${storyId}`;
};

// --- COMPONENTS ---

const StatusToggle = ({ status, onToggle, loading }: { status: string, onToggle: () => void, loading: boolean }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        disabled={loading}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-300'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
);

const LoadingSkeleton = () => (
    <div className="w-full space-y-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-white rounded-lg border border-slate-200"></div>
        ))}
    </div>
);

// --- VISUAL CALENDAR COMPONENT ---
interface CalendarPickerProps {
    startDate: string;
    endDate: string;
    onChange: (start: string, end: string) => void;
    onClose: () => void;
}

const CalendarPicker: React.FC<CalendarPickerProps> = ({ startDate, endDate, onChange, onClose }) => {
    // Current view state
    const [currentDate, setCurrentDate] = useState(startDate ? new Date(startDate) : new Date());
    const [tempStart, setTempStart] = useState<string>(startDate);
    const [tempEnd, setTempEnd] = useState<string>(endDate);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const handleDayClick = (day: number) => {
        const clickedDate = new Date(year, month, day);
        // Correct timezone offset issue by manually formatting
        const y = clickedDate.getFullYear();
        const m = String(clickedDate.getMonth() + 1).padStart(2, '0');
        const d = String(clickedDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        if (!tempStart || (tempStart && tempEnd)) {
            // New selection
            setTempStart(dateStr);
            setTempEnd('');
        } else if (tempStart && !tempEnd) {
            // Complete selection
            if (new Date(dateStr) < new Date(tempStart)) {
                setTempEnd(tempStart);
                setTempStart(dateStr);
            } else {
                setTempEnd(dateStr);
            }
        }
    };

    const isSelected = (day: number) => {
        const d = new Date(year, month, day);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const full = `${y}-${m}-${dayStr}`;
        return full === tempStart || full === tempEnd;
    };

    const isInRange = (day: number) => {
        if (!tempStart || !tempEnd) return false;
        const d = new Date(year, month, day);
        return d > new Date(tempStart) && d < new Date(tempEnd);
    };

    const apply = () => {
        if (tempStart && tempEnd) {
            onChange(tempStart, tempEnd);
            onClose();
        } else if (tempStart) {
            onChange(tempStart, tempStart); // Single day
            onClose();
        }
    };

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
        <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50 animate-fadeIn ring-1 ring-black/5 w-72">
            <div className="flex justify-between items-center mb-4">
                <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded"><ChevronLeft size={16} /></button>
                <span className="font-bold text-slate-700">{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded"><ChevronRight size={16} /></button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-bold text-slate-400 uppercase">
                <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-sm mb-4">
                {blanks.map(x => <div key={`blank-${x}`} />)}
                {days.map(d => {
                    const selected = isSelected(d);
                    const inRange = isInRange(d);
                    return (
                        <div
                            key={d}
                            onClick={() => handleDayClick(d)}
                            className={`
                                h-8 flex items-center justify-center rounded-full cursor-pointer text-xs font-medium transition-colors
                                ${selected ? 'bg-indigo-600 text-white' : inRange ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-100 text-slate-700'}
                            `}
                        >
                            {d}
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2">Cancel</button>
                <button onClick={apply} disabled={!tempStart} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50">Apply</button>
            </div>
        </div>
    );
};

// --- MAIN DASHBOARD ---

type DateRange = 'today' | 'yesterday' | 'last_3d' | 'last_4d' | 'last_7d' | 'maximum' | 'custom';
type SortOption = 'status' | 'spend' | 'roas' | 'cpa' | 'ctr' | 'frequency' | 'purchases' | 'lpv';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'SALES' | 'TRAFFIC';

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { settings, updateSettings, logout } = useSettings();
    const { launchCommentSession } = useOutletContext<LayoutContextType>();
    const { showToast } = useToast();

    // Data State
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [adSetsData, setAdSetsData] = useState<Record<string, AdSet[]>>({});
    const [adsData, setAdsData] = useState<Record<string, Ad[]>>({});

    // UI State
    const [loadingCampaigns, setLoadingCampaigns] = useState(false);

    // Budget Dialog State
    const [budgetDialog, setBudgetDialog] = useState<{
        isOpen: boolean;
        id: string;
        currentBudget: number;
        type: 'campaign' | 'adset';
        entityName?: string;
    }>({
        isOpen: false,
        id: '',
        currentBudget: 0,
        type: 'campaign',
        entityName: ''
    });
    const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
    const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
    const [showAllCampaigns, setShowAllCampaigns] = useState(false);
    const [showHiddenAdSets, setShowHiddenAdSets] = useState<Set<string>>(new Set());

    // View Control - Auto-detected based on campaign objectives
    const [viewMode, setViewMode] = useState<ViewMode>('TRAFFIC');

    // Loading States for Actions
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Filters
    const [dateRange, setDateRange] = useState<DateRange>('today');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);

    const [sortBy, setSortBy] = useState<SortOption>('spend');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [fetchError, setFetchError] = useState('');
    const [authError, setAuthError] = useState(false);

    // Account Dropdown State
    const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);

    // Comment Modal State
    const [commentModalOpen, setCommentModalOpen] = useState(false);
    const [selectedAdForComment, setSelectedAdForComment] = useState<Ad | null>(null);
    const [templates, setTemplates] = useState<CommentTemplate[]>([]);

    const [publishedComments, setPublishedComments] = useState<Map<string, number>>(() => {
        const saved = localStorage.getItem('ar_published_comments_v2');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return new Map(Object.entries(parsed));
            } catch {
                return new Map();
            }
        }
        return new Map();
    });

    // Telegram AI Alert State
    const [telegramSending, setTelegramSending] = useState(false);
    const [showAnalysisSettings, setShowAnalysisSettings] = useState(false);

    const handleSendToTelegram = async () => {
        if (!settings.telegramBotToken || !settings.telegramChatId) {
            showToast('Telegram not configured. Go to Settings.', 'error');
            return;
        }

        if (!settings.adAccountId || !settings.fbAccessToken) {
            showToast('Please connect your Meta Ads account first.', 'error');
            return;
        }

        // Check daily usage limit (3 per day)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const usageKey = 'ar_ai_analysis_usage';
        const storedUsage = localStorage.getItem(usageKey);
        let dailyUsage = { date: today, count: 0 };

        if (storedUsage) {
            const parsed = JSON.parse(storedUsage);
            if (parsed.date === today) {
                dailyUsage = parsed;
            }
        }

        if (dailyUsage.count >= 3) {
            // Check for exemption (khai)
            const isExempt = (settings.businessName || '').toLowerCase().includes('khai');

            if (!isExempt) {
                showToast('Had 3 analisa sehari dicapai. Cuba lagi esok!', 'error');
                return;
            }
        }

        setTelegramSending(true);
        try {
            const response = await fetch('/api/analyze-telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adAccountId: settings.adAccountId,
                    fbAccessToken: settings.fbAccessToken,
                    telegramChatId: settings.telegramChatId,
                    telegramBotToken: settings.telegramBotToken,
                    dailyUsageCount: dailyUsage.count,
                    fbName: settings.businessName || ''
                })
            });

            const data = await response.json();

            if (response.status === 429) {
                showToast(data.message || 'Had analisa harian dicapai.', 'error');
                return;
            }

            if (data.success) {
                // Increment daily usage on success
                dailyUsage.count += 1;
                localStorage.setItem(usageKey, JSON.stringify(dailyUsage));

                const remaining = 3 - dailyUsage.count;
                showToast(`Analisis dihantar! (${remaining} analisa lagi hari ini)`, 'success');
            } else {
                showToast(`Failed: ${data.error || 'Unknown error'}`, 'error');
            }
        } catch (err: any) {
            showToast(`Error: ${err.message}`, 'error');
        } finally {
            setTelegramSending(false);
        }
    };

    // Re-load published comments when modal closes or when custom event fires
    useEffect(() => {
        const loadComments = () => {
            const saved = localStorage.getItem('ar_published_comments_v2');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    setPublishedComments(new Map(Object.entries(parsed)));
                } catch {
                    // ignore parse errors
                }
            }
        };

        loadComments();

        // Listen for custom event from Layout.tsx when comment session completes
        const handleCommentsUpdated = () => loadComments();
        window.addEventListener('ar_comments_updated', handleCommentsUpdated);

        return () => {
            window.removeEventListener('ar_comments_updated', handleCommentsUpdated);
        };
    }, [commentModalOpen]);

    const isTrafficOrLeads = (obj: string) => {
        if (!obj) return false;
        const upper = obj.toUpperCase();
        const trafficLeadsTargets = [
            'OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_AWARENESS',
            'TRAFFIC', 'LEAD_GENERATION', 'MESSAGES', 'LINK_CLICKS', 'BRAND_AWARENESS', 'REACH', 'POST_ENGAGEMENT', 'VIDEO_VIEWS', 'APP_INSTALLS'
        ];
        return trafficLeadsTargets.includes(upper);
    };

    // --- FETCH DATA ---

    const fetchData = async () => {
        if (dateRange === 'custom') {
            if (!customStartDate || !customEndDate) {
                return;
            }
        }

        setLoadingCampaigns(true);
        setFetchError('');
        setAuthError(false);

        setExpandedCampaigns(new Set());
        setExpandedAdSets(new Set());
        setShowHiddenAdSets(new Set());
        setShowAllCampaigns(false);

        // Clear cached ads and adsets data when date range changes
        setAdSetsData({});
        setAdsData({});

        try {
            if (settings.fbAccessToken === 'dummy_token' || (settings.fbAccessToken && settings.adAccountId)) {
                let realData: AdCampaign[] = [];
                if (settings.fbAccessToken === 'dummy_token') {
                    await new Promise(r => setTimeout(r, 600));
                    realData = MOCK_CAMPAIGNS;
                } else {
                    await initFacebookSdk(settings.fbAppId);
                    const presetParam = dateRange === 'custom'
                        ? { start: customStartDate, end: customEndDate }
                        : dateRange;
                    realData = await getRealCampaigns(settings.adAccountId, settings.fbAccessToken, presetParam);
                }
                setCampaigns(realData);
            } else {
                setCampaigns(MOCK_CAMPAIGNS);
            }
        } catch (err: any) {
            console.error("Fetch Error", err);
            // AUTO REFRESH LOGIC: If Session expired, try to refresh first
            if (err.message === "SESSION_EXPIRED" || (err.message || "").toLowerCase().includes("session")) {
                console.log("Session expired, attempting silent refresh...");

                // Step 1: Try to re-initialize Facebook SDK (important for desktop idle tabs)
                try {
                    await initFacebookSdk(settings.fbAppId);
                    console.log("FB SDK re-initialized after idle.");
                } catch (sdkErr) {
                    console.warn("FB SDK re-init failed:", sdkErr);
                }

                // Step 2: Try to get a fresh token silently
                const newToken = await refreshFacebookToken();
                if (newToken && newToken !== settings.fbAccessToken) {
                    console.log("Session refreshed successfully.");
                    updateSettings({ fbAccessToken: newToken });
                    // The updateSettings will trigger the useEffect below, restarting fetchData automatically
                    return;
                }

                // Step 3: If refresh failed, show reconnect prompt (no mock data)
                console.warn("Session refresh failed. Showing reconnect prompt.");
                setAuthError(true);
                setFetchError("Meta session expired. Please reconnect your account.");
                return;
            } else {
                setFetchError("Data sync failed. Please try again.");
            }
        } finally {
            setLoadingCampaigns(false);
        }
    };

    useEffect(() => {
        if (dateRange !== 'custom') {
            fetchData();
        } else if (customStartDate && customEndDate && !isCustomDateModalOpen) {
            fetchData();
        }
    }, [settings.fbAccessToken, settings.adAccountId, settings.fbAppId, dateRange, customStartDate, customEndDate, isCustomDateModalOpen]);

    const handleDateRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as DateRange;
        if (val === 'custom') {
            setDateRange('custom');
            setIsCustomDateModalOpen(true);
        } else {
            setDateRange(val);
            setIsCustomDateModalOpen(false);
        }
    };

    // --- VIEW MODE AUTO-DETECTION ---
    // Auto-detect based on actual METRICS, not objectives
    // Because Meta returns OUTCOME_SALES for both online purchases AND Whatsapp/Lead campaigns
    useEffect(() => {
        if (campaigns.length > 0) {
            // Sum up total leads vs total purchases across all campaigns
            let totalLeadsSum = 0;
            let totalPurchasesSum = 0;

            campaigns.forEach(c => {
                totalLeadsSum += c.metrics.totalLeads || 0;
                totalPurchasesSum += c.metrics.purchases || 0;
            });

            // If more leads than purchases, use TRAFFIC mode (Leads view)
            // If more purchases OR both zero, check objectives as fallback
            let detectedMode: ViewMode;

            if (totalLeadsSum > 0 || totalPurchasesSum > 0) {
                // We have actual data - use metrics
                detectedMode = totalLeadsSum >= totalPurchasesSum ? 'TRAFFIC' : 'SALES';
            } else {
                // No conversions yet - fallback to objective-based detection
                let trafficCount = 0;
                let salesCount = 0;
                campaigns.forEach(c => {
                    if (isTrafficOrLeads(c.objective)) trafficCount++;
                    else salesCount++;
                });
                detectedMode = trafficCount >= salesCount ? 'TRAFFIC' : 'SALES';
            }

            setViewMode(detectedMode);
            console.log(`[Auto-Detect] Leads: ${totalLeadsSum}, Purchases: ${totalPurchasesSum} => Mode: ${detectedMode}`);
        }
    }, [campaigns]);

    useEffect(() => {
        const fetchCommentTemplates = async () => {
            const fbId = settings.userId || settings.adAccountId;

            if (fbId) {
                try {
                    const res = await fetch(`/api/comment-templates-api?fbId=${fbId}`);
                    const data = await res.json();
                    if (data.templates && data.templates.length > 0) {
                        setTemplates(data.templates);
                        return;
                    }
                } catch (e) {
                    console.error('Fetch templates error:', e);
                }
            }

            // Fallback to localStorage
            const saved = localStorage.getItem('ar_comment_templates');
            if (saved) {
                try {
                    setTemplates(JSON.parse(saved));
                } catch (e) { setTemplates([]); }
            }
        };

        fetchCommentTemplates();
    }, [commentModalOpen, settings.userId, settings.adAccountId]);



    const toggleExpandCampaign = async (campaignId: string) => {
        const newSet = new Set(expandedCampaigns);
        if (newSet.has(campaignId)) {
            newSet.delete(campaignId);
        } else {
            newSet.add(campaignId);
            if (!adSetsData[campaignId] && settings.fbAccessToken !== 'dummy_token') {
                try {
                    const presetParam = dateRange === 'custom' ? { start: customStartDate, end: customEndDate } : dateRange;
                    const data = await getAdSets(campaignId, settings.fbAccessToken, presetParam);
                    setAdSetsData(prev => ({ ...prev, [campaignId]: data }));
                } catch (e) { console.error(e); }
            }
        }
        setExpandedCampaigns(newSet);
    };

    const toggleExpandAdSet = async (adSetId: string) => {
        const newSet = new Set(expandedAdSets);
        if (newSet.has(adSetId)) {
            newSet.delete(adSetId);
        } else {
            newSet.add(adSetId);
            if (!adsData[adSetId] && settings.fbAccessToken !== 'dummy_token') {
                try {
                    const presetParam = dateRange === 'custom' ? { start: customStartDate, end: customEndDate } : dateRange;
                    const data = await getAds(adSetId, settings.fbAccessToken, presetParam);
                    setAdsData(prev => ({ ...prev, [adSetId]: data }));
                } catch (e) { console.error(e); }
            }
        }
        setExpandedAdSets(newSet);
    };

    const toggleHiddenAdSetsForCampaign = (campId: string) => {
        const newSet = new Set(showHiddenAdSets);
        if (newSet.has(campId)) {
            newSet.delete(campId);
        } else {
            newSet.add(campId);
        }
        setShowHiddenAdSets(newSet);
    };

    const handleStatusToggle = async (id: string, currentStatus: string, type: 'campaign' | 'adset' | 'ad') => {
        if (settings.fbAccessToken === 'dummy_token') return alert("Simulation Mode: Status toggled!");

        const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        setActionLoading(id);
        try {
            const success = await updateEntityStatus(id, newStatus, settings.fbAccessToken);
            if (success) {
                if (type === 'campaign') {
                    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
                } else if (type === 'adset') {
                    setAdSetsData(prev => {
                        const newData = { ...prev };
                        Object.keys(newData).forEach(key => {
                            newData[key] = newData[key].map(a => a.id === id ? { ...a, status: newStatus } : a);
                        });
                        return newData;
                    });
                } else {
                    setAdsData(prev => {
                        const newData = { ...prev };
                        Object.keys(newData).forEach(key => {
                            newData[key] = newData[key].map(a => a.id === id ? { ...a, status: newStatus } : a);
                        });
                        return newData;
                    });
                }
            }
        } catch (e) {
            alert("Failed to update status.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleBudgetEdit = (id: string, currentBudget: number, type: 'campaign' | 'adset', name?: string) => {
        if (settings.fbAccessToken === 'dummy_token') return alert("Simulation Mode: Budget updated!");

        setBudgetDialog({
            isOpen: true,
            id,
            currentBudget,
            type,
            entityName: name || (type === 'campaign' ? 'Selected Campaign' : 'Selected Ad Set')
        });
    };

    const handleSaveBudget = async (newBudget: number) => {
        const { id, type } = budgetDialog;

        setActionLoading(id);
        try {
            const success = await updateEntityBudget(id, newBudget, settings.fbAccessToken);
            if (success) {
                if (type === 'campaign') {
                    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, dailyBudget: newBudget } : c));
                } else {
                    setAdSetsData(prev => {
                        const newData = { ...prev };
                        Object.keys(newData).forEach(key => {
                            newData[key] = newData[key].map(a => a.id === id ? { ...a, dailyBudget: newBudget } : a);
                        });
                        return newData;
                    });
                }
            }
        } catch (e) {
            alert("Failed to update budget.");
        } finally {
            setActionLoading(null);
        }
    };

    const openCommentModal = (ad: Ad) => {
        setSelectedAdForComment(ad);
        setCommentModalOpen(true);
    };

    const handleTriggerCommentSession = (template: CommentTemplate) => {
        if (selectedAdForComment) {
            launchCommentSession(selectedAdForComment, template);
            setCommentModalOpen(false);
        }
    };

    // --- RENDER HELPERS ---

    const renderTableHeader = () => {
        if (viewMode === 'TRAFFIC') {
            return (
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                    <th className="p-4 w-[35%] font-semibold">Name</th>
                    <th className="p-3 text-right w-[11%] font-semibold">Spend</th>
                    <th className="p-3 text-right w-[11%] font-semibold">Lead</th>
                    <th className="p-3 text-right w-[11%] font-semibold">Cost/Lead</th>
                    <th className="p-3 text-right w-[11%] font-semibold">CTR (All)</th>
                    <th className="p-3 text-right w-[11%] font-semibold">CTR (Link)</th>
                    <th className="p-3 text-right w-[10%] font-semibold"></th>
                </tr>
            );
        }
        const SortHeader = ({ field, label, width }: { field: SortOption; label: string; width: string }) => (
            <th
                className={`p-3 text-right font-semibold cursor-pointer hover:bg-slate-100 transition-colors select-none ${width}`}
                onClick={() => {
                    if (sortBy === field) {
                        setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
                    } else {
                        setSortBy(field);
                        setSortDirection('desc');
                    }
                }}
            >
                <span className="inline-flex items-center gap-1">
                    {label}
                    {sortBy === field && (
                        <span className="text-indigo-500">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                </span>
            </th>
        );

        return (
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                <th className="p-4 w-[40%] font-semibold">Name</th>
                <SortHeader field="spend" label="Spend" width="w-[10%]" />
                <SortHeader field="roas" label="ROAS" width="w-[7%]" />
                <SortHeader field="cpa" label="CPA" width="w-[7%]" />
                <SortHeader field="ctr" label="CTR" width="w-[6%]" />
                <SortHeader field="frequency" label="Freq" width="w-[6%]" />
                <SortHeader field="lpv" label="LPV/(CPLV)" width="w-[12%]" />
                <SortHeader field="purchases" label="Purchases" width="w-[12%]" />
            </tr>
        );
    };

    const renderMetrics = (metrics: any) => {
        if (viewMode === 'TRAFFIC') {
            return (
                <>
                    <td className="p-3 text-right whitespace-nowrap text-slate-700">{formatMYR(metrics.spend)}</td>
                    <td className="p-3 text-right whitespace-nowrap text-indigo-600 font-bold">
                        {metrics.totalLeads}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap text-slate-700">{formatMYR(metrics.costPerResult)}</td>
                    <td className="p-3 text-right whitespace-nowrap text-slate-700">{metrics.ctr.toFixed(2)}%</td>
                    <td className="p-3 text-right whitespace-nowrap text-indigo-600 font-medium">{metrics.inline_link_click_ctr.toFixed(2)}%</td>
                    <td className="p-3 text-right whitespace-nowrap"></td>
                </>
            );
        }
        return (
            <>
                <td className="p-3 text-right whitespace-nowrap text-slate-700">{formatMYR(metrics.spend)}</td>
                <td className="p-3 text-right font-bold whitespace-nowrap">
                    <span className={metrics.roas >= 2 ? 'text-green-600' : metrics.roas > 0 ? 'text-red-500' : 'text-slate-400'}>
                        {metrics.roas.toFixed(2)}x
                    </span>
                </td>
                <td className="p-3 text-right whitespace-nowrap text-slate-700">{formatMYR(metrics.costPerPurchase)}</td>
                <td className="p-3 text-right whitespace-nowrap text-slate-700">{metrics.ctr.toFixed(2)}%</td>
                <td className="p-3 text-right whitespace-nowrap text-slate-500">{(metrics.frequency || 0).toFixed(2)}</td>
                <td className="p-3 text-right whitespace-nowrap text-slate-700">
                    <span className="text-slate-900 font-medium">{metrics.landingPageViews}</span>
                    <span className="text-xs text-slate-400 ml-1">({formatMYR(metrics.costPerLandingPageView)})</span>
                </td>
                <td className="p-3 text-right whitespace-nowrap text-slate-700">{metrics.purchases}</td>
            </>
        );
    };

    // --- SORTING & FILTERING ---
    const sortedCampaigns = useMemo(() => {
        const sorted = [...campaigns];
        const multiplier = sortDirection === 'desc' ? 1 : -1;

        sorted.sort((a, b) => {
            let diff = 0;
            switch (sortBy) {
                case 'spend': diff = b.metrics.spend - a.metrics.spend; break;
                case 'roas': diff = b.metrics.roas - a.metrics.roas; break;
                case 'cpa': diff = b.metrics.costPerPurchase - a.metrics.costPerPurchase; break;
                case 'ctr': diff = b.metrics.ctr - a.metrics.ctr; break;
                case 'frequency': diff = (b.metrics.frequency || 0) - (a.metrics.frequency || 0); break;
                case 'purchases': diff = b.metrics.purchases - a.metrics.purchases; break;
                case 'lpv': diff = b.metrics.landingPageViews - a.metrics.landingPageViews; break;
                case 'status': return a.status === 'ACTIVE' ? -1 : 1;
                default: diff = 0;
            }
            return diff * multiplier;
        });

        return sorted;
    }, [campaigns, sortBy, sortDirection]);

    const primaryCampaigns = useMemo(() => {
        return sortedCampaigns.filter(c => c.status === 'ACTIVE' && c.metrics.spend > 0);
    }, [sortedCampaigns]);

    const secondaryCampaigns = useMemo(() => {
        return sortedCampaigns.filter(c => !(c.status === 'ACTIVE' && c.metrics.spend > 0));
    }, [sortedCampaigns]);

    const campaignsToShow = showAllCampaigns ? sortedCampaigns : primaryCampaigns;

    const totalSpend = campaigns.reduce((acc, c) => acc + c.metrics.spend, 0);
    const totalRevenue = campaigns.reduce((acc, c) => acc + c.metrics.revenue, 0);
    const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const totalResults = campaigns.reduce((acc, c) => acc + c.metrics.results, 0);

    return (
        <>
            <div className="space-y-6 relative">

                {/* Header & Controls */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {/* Header removed - cleaner UI */}
                            {/* CLICKABLE LIVE BUTTON */}
                            <button
                                onClick={() => fetchData()}
                                className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-all shadow-sm border ${loadingCampaigns ? 'bg-indigo-100 text-indigo-700 border-indigo-200 cursor-wait' : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'}`}
                            >
                                {loadingCampaigns ? <RefreshCw size={10} className="animate-spin" /> : null}
                                {loadingCampaigns ? 'Syncing...' : 'LIVE'}
                            </button>
                            {/* TELEGRAM AI ANALYSIS BUTTON (ICON ONLY + TOOLTIP) */}
                            <div className="relative group">
                                <button
                                    onClick={() => setShowAnalysisSettings(true)}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm border bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50`}
                                >
                                    <Sparkles size={14} />
                                </button>
                                {/* Tooltip on hover - iOS Glassmorphism Style */}
                                <div className="absolute top-full left-0 mt-2 px-4 py-3 backdrop-blur-xl bg-white/80 text-slate-700 text-xs rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/60 w-[260px] text-left leading-relaxed">
                                    <div className="absolute bottom-full left-4 border-[6px] border-transparent border-b-white/80" style={{ filter: 'drop-shadow(0 -1px 1px rgba(0,0,0,0.05))' }}></div>
                                    <span className="font-semibold text-slate-800 text-sm">AI Analysis Settings</span>
                                    <p className="mt-1 text-slate-600">Tetapan jadual analisis automatik dan hantar ke Telegram.</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                            {/* PREVIEW BUTTON (STACKING TEST) */}


                            <Briefcase size={14} />
                            {settings.availableAccounts?.length > 0 ? (
                                <div className="relative">
                                    <button
                                        onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                                        className="flex items-center gap-2 max-w-[280px] truncate font-medium text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer"
                                    >
                                        <span className="truncate">{settings.businessName}</span>
                                        <ChevronDown size={14} className={`transition-transform ${isAccountDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Glassmorphism Dropdown */}
                                    {isAccountDropdownOpen && (
                                        <>
                                            {/* Backdrop to close dropdown */}
                                            <div
                                                className="fixed inset-0 z-40"
                                                onClick={() => setIsAccountDropdownOpen(false)}
                                            />
                                            <div className="absolute top-full left-0 mt-2 z-50 w-[320px] max-h-[400px] overflow-y-auto backdrop-blur-xl bg-white/90 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/60 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                                {settings.availableAccounts.map((acc, index) => (
                                                    <button
                                                        key={acc.id}
                                                        onClick={() => {
                                                            updateSettings({ adAccountId: acc.id, businessName: acc.name });
                                                            setIsAccountDropdownOpen(false);
                                                        }}
                                                        className={`w-full text-left px-4 py-3 text-sm transition-all ${settings.adAccountId === acc.id
                                                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                                                            : 'text-slate-700 hover:bg-slate-50'
                                                            } ${index === 0 ? 'rounded-t-lg' : ''} ${index === settings.availableAccounts.length - 1 ? 'rounded-b-lg' : ''}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {settings.adAccountId === acc.id && (
                                                                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                                            )}
                                                            <span className={settings.adAccountId !== acc.id ? 'ml-5' : ''}>{acc.name}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : <span>{settings.businessName}</span>}
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-end md:items-center gap-2">

                        {dateRange === 'custom' && customStartDate && customEndDate && (
                            <button
                                onClick={() => setIsCustomDateModalOpen(true)}
                                className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-indigo-200 hover:border-indigo-500 text-indigo-600 shadow-sm transition-all group"
                            >
                                <Calendar size={14} />
                                <span className="text-xs font-bold">
                                    {new Date(customStartDate).toLocaleDateString()} - {new Date(customEndDate).toLocaleDateString()}
                                </span>
                                <Edit2 size={12} className="text-indigo-300 group-hover:text-indigo-600" />
                            </button>
                        )}

                        <div className="flex items-center gap-2">

                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                                <select
                                    value={dateRange}
                                    onChange={handleDateRangeChange}
                                    className="bg-white border border-slate-200 shadow-sm rounded-lg pl-9 pr-8 py-2 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-50 transition-colors"
                                >
                                    <option value="today">Today</option>
                                    <option value="yesterday">Yesterday</option>
                                    <option value="last_3d">Last 3 Days</option>
                                    <option value="last_4d">Last 4 Days</option>
                                    <option value="last_7d">Last 7 Days</option>
                                    <option value="maximum">All Time</option>
                                    <option value="custom">Custom Calendar...</option>
                                </select>

                                {/* VISUAL CALENDAR PICKER POPUP */}
                                {isCustomDateModalOpen && (
                                    <CalendarPicker
                                        startDate={customStartDate}
                                        endDate={customEndDate}
                                        onChange={(s, e) => {
                                            setCustomStartDate(s);
                                            setCustomEndDate(e);
                                        }}
                                        onClose={() => setIsCustomDateModalOpen(false)}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Session Expired - Reconnect Prompt */}
                {
                    authError && (
                        <div className="bg-red-50 border border-red-200 px-4 py-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                    <RefreshCw size={18} className="text-red-500" />
                                </div>
                                <div>
                                    <p className="text-red-800 font-bold text-sm">Meta Session Expired</p>
                                    <p className="text-red-600 text-xs">Please reconnect your account to continue viewing real data.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/connect')}
                                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2 shadow-sm"
                            >
                                <ArrowRight size={14} /> Reconnect Meta Account
                            </button>
                        </div>
                    )
                }

                {/* Other fetch errors (non-session) */}
                {
                    fetchError && !authError && (
                        <div className="text-xs text-amber-700 bg-amber-50 px-4 py-3 rounded-lg border border-amber-200 flex items-center justify-between gap-2 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Filter size={14} className="text-amber-500" /> {fetchError}
                            </div>
                            <button onClick={() => fetchData()} className="px-3 py-1 bg-white hover:bg-amber-100 text-amber-700 rounded text-xs border border-amber-300 transition-colors flex items-center gap-1 font-semibold">
                                <RefreshCw size={10} /> Retry Sync
                            </button>
                        </div>
                    )
                }

                {/* Metric Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Card 1: Spend / Sales (Same for both) */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Spent / Sales</span>
                            <DollarSign size={16} className="text-slate-300" />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                            <span className="text-2xl font-extrabold text-slate-900">{formatMYR(totalSpend)}</span>
                            <span className="text-base sm:text-lg font-bold text-green-600">/ RM{Math.round(totalRevenue)}</span>
                        </div>
                    </div>

                    {/* Card 2: ROAS (Conversion) or Lead (Lead/Traffic) */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        {viewMode === 'SALES' ? (
                            <>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ROAS</span>
                                    <TrendingUp size={16} className="text-slate-300" />
                                </div>
                                <div className={`text-2xl font-extrabold ${totalRoas > 2 ? 'text-green-600' : 'text-slate-900'}`}>{totalRoas.toFixed(2)}x</div>
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lead</span>
                                    <MessageCircle size={16} className="text-slate-300" />
                                </div>
                                <div className="text-2xl font-extrabold text-slate-900">{totalResults}</div>
                            </>
                        )}
                    </div>

                    {/* Card 3: CPA (Conversion) or Cost/Lead (Lead/Traffic) */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        {viewMode === 'SALES' ? (
                            <>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CPA</span>
                                    <DollarSign size={16} className="text-slate-300" />
                                </div>
                                {(() => {
                                    const totalPurchases = campaigns.reduce((a, c) => a + c.metrics.purchases, 0);
                                    const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
                                    return (
                                        <div className={`text-2xl font-extrabold ${cpa > 0 && cpa < 24 ? 'text-green-600' : cpa >= 24 ? 'text-red-600' : 'text-slate-900'}`}>
                                            {formatMYR(cpa)}
                                        </div>
                                    );
                                })()}
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cost/Lead</span>
                                    <DollarSign size={16} className="text-slate-300" />
                                </div>
                                {(() => {
                                    const costPerLead = totalResults > 0 ? totalSpend / totalResults : 0;
                                    return (
                                        <div className={`text-2xl font-extrabold ${costPerLead > 0 && costPerLead <= 5 ? 'text-green-600' : costPerLead > 5 ? 'text-red-600' : 'text-slate-900'}`}>
                                            {formatMYR(costPerLead)}
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </div>

                    {/* Card 4: LPV/(CPLV) (Conversion) or CTR (All) (Lead/Traffic) */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        {viewMode === 'SALES' ? (
                            <>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">LPV/(CPLV)</span>
                                    <MousePointer size={16} className="text-slate-300" />
                                </div>
                                <div className="text-2xl font-extrabold text-slate-900">
                                    {(() => {
                                        const totalLpv = campaigns.reduce((a, c) => a + (c.metrics.landingPageViews || 0), 0);
                                        const cplv = totalLpv > 0 ? totalSpend / totalLpv : 0;
                                        const cplvColor = cplv > 0 && cplv <= 3 ? 'text-green-600' : cplv > 3 ? 'text-red-600' : 'text-slate-400';
                                        return <><span>{totalLpv}</span><span className={`text-sm ml-1 ${cplvColor}`}>({formatMYR(cplv)})</span></>;
                                    })()}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CTR (All)</span>
                                    <MousePointer size={16} className="text-slate-300" />
                                </div>
                                {(() => {
                                    const totalImpressions = campaigns.reduce((a, c) => a + (c.metrics.impressions || 0), 0);
                                    const totalClicks = campaigns.reduce((a, c) => a + (c.metrics.clicks || 0), 0);
                                    const ctrAll = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
                                    return (
                                        <div className={`text-2xl font-extrabold ${ctrAll >= 4 ? 'text-green-600' : ctrAll > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                            {ctrAll.toFixed(2)}%
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </div>
                </div>

                {
                    loadingCampaigns && campaigns.length === 0 ? (
                        <LoadingSkeleton />
                    ) : (
                        <>
                            {/* NESTED LIST VIEW */}
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[1000px] text-left border-collapse table-fixed">
                                        <thead>
                                            {renderTableHeader()}
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {campaignsToShow.map(camp => {
                                                const allAdSets = adSetsData[camp.id] || [];
                                                const primaryAdSets = allAdSets.filter(a => a.status === 'ACTIVE' && a.metrics.spend > 0);
                                                const secondaryAdSets = allAdSets.filter(a => !(a.status === 'ACTIVE' && a.metrics.spend > 0));
                                                const showHidden = showHiddenAdSets.has(camp.id);
                                                const adSetsToShow = showHidden ? allAdSets : primaryAdSets;

                                                return (
                                                    <React.Fragment key={camp.id}>
                                                        {/* Level 1: Campaign */}
                                                        <tr className="bg-white hover:bg-slate-50 text-sm transition-colors group">
                                                            <td className="p-4 w-[45%]">
                                                                <div className="flex items-center gap-3">
                                                                    <button
                                                                        onClick={() => toggleExpandCampaign(camp.id)}
                                                                        className="text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 p-1 rounded hover:bg-indigo-50"
                                                                    >
                                                                        {expandedCampaigns.has(camp.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                    </button>
                                                                    <StatusToggle
                                                                        status={camp.status}
                                                                        loading={actionLoading === camp.id}
                                                                        onToggle={() => handleStatusToggle(camp.id, camp.status, 'campaign')}
                                                                    />
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-bold text-slate-800 truncate max-w-[260px] lg:max-w-[350px] text-sm" title={camp.name}>{camp.name}</span>
                                                                            {/* Objective Pill Badge */}
                                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${camp.objective?.includes('TRAFFIC') ? 'bg-blue-100 text-blue-600' :
                                                                                camp.objective?.includes('SALES') ? 'bg-green-100 text-green-600' :
                                                                                    camp.objective?.includes('LEADS') ? 'bg-amber-100 text-amber-600' :
                                                                                        camp.objective?.includes('AWARENESS') ? 'bg-purple-100 text-purple-600' :
                                                                                            camp.objective?.includes('ENGAGEMENT') ? 'bg-pink-100 text-pink-600' :
                                                                                                'bg-slate-100 text-slate-500'
                                                                                }`}>
                                                                                {camp.objective?.replace('OUTCOME_', '') || 'N/A'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 group-hover:text-slate-700 transition-colors">
                                                                            <span className="uppercase font-semibold tracking-wider">Budget: {formatMYR(camp.dailyBudget)}</span>
                                                                            <button onClick={() => handleBudgetEdit(camp.id, camp.dailyBudget, 'campaign', camp.name)} className="text-indigo-500 hover:text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                <Edit2 size={10} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {renderMetrics(camp.metrics)}
                                                        </tr>

                                                        {/* Level 2: Ad Sets */}
                                                        {expandedCampaigns.has(camp.id) && (
                                                            <>
                                                                {!adSetsData[camp.id] && (
                                                                    <tr><td colSpan={8} className="text-center py-4 text-xs text-slate-400"><Loader2 className="animate-spin inline mr-2" size={14} /> Loading Ad Sets...</td></tr>
                                                                )}

                                                                {adSetsToShow.map(adset => (
                                                                    <React.Fragment key={adset.id}>
                                                                        <tr className="bg-slate-50/50 text-sm hover:bg-slate-50 border-l-4 border-indigo-500/0 hover:border-indigo-500 transition-all">
                                                                            <td className="p-3 pl-12 w-[35%]">
                                                                                <div className="flex items-center gap-3">
                                                                                    <button
                                                                                        onClick={() => toggleExpandAdSet(adset.id)}
                                                                                        className="text-slate-400 hover:text-indigo-600"
                                                                                    >
                                                                                        {expandedAdSets.has(adset.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                                    </button>
                                                                                    <StatusToggle
                                                                                        status={adset.status}
                                                                                        loading={actionLoading === adset.id}
                                                                                        onToggle={() => handleStatusToggle(adset.id, adset.status, 'adset')}
                                                                                    />
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="text-slate-700 font-medium truncate max-w-[180px]">{adset.name}</div>
                                                                                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                                                            <span>Budget: {formatMYR(adset.dailyBudget)}</span>
                                                                                            <button onClick={() => handleBudgetEdit(adset.id, adset.dailyBudget, 'adset', adset.name)} className="text-indigo-500 hover:text-indigo-700">
                                                                                                <Edit2 size={10} />
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                            {renderMetrics(adset.metrics)}
                                                                        </tr>

                                                                        {/* Level 3: Ads */}
                                                                        {expandedAdSets.has(adset.id) && (
                                                                            <tr className="bg-slate-50">
                                                                                <td colSpan={8} className="p-0 border-b border-slate-100">
                                                                                    <div className="max-h-[350px] overflow-y-auto custom-scrollbar border-y border-slate-200 bg-slate-50/80">
                                                                                        <table className="w-full table-fixed">
                                                                                            <colgroup>
                                                                                                {viewMode === 'TRAFFIC' ? (
                                                                                                    <>
                                                                                                        <col style={{ width: '35%' }} />
                                                                                                        <col style={{ width: '11%' }} />
                                                                                                        <col style={{ width: '11%' }} />
                                                                                                        <col style={{ width: '11%' }} />
                                                                                                        <col style={{ width: '11%' }} />
                                                                                                        <col style={{ width: '11%' }} />
                                                                                                        <col style={{ width: '10%' }} />
                                                                                                    </>
                                                                                                ) : (
                                                                                                    <>
                                                                                                        <col style={{ width: '40%' }} />
                                                                                                        <col style={{ width: '10%' }} />
                                                                                                        <col style={{ width: '7%' }} />
                                                                                                        <col style={{ width: '7%' }} />
                                                                                                        <col style={{ width: '6%' }} />
                                                                                                        <col style={{ width: '6%' }} />
                                                                                                        <col style={{ width: '12%' }} />
                                                                                                        <col style={{ width: '12%' }} />
                                                                                                    </>
                                                                                                )}
                                                                                            </colgroup>
                                                                                            <tbody>
                                                                                                {adsData[adset.id] ? (
                                                                                                    adsData[adset.id].filter(ad => ad.status === 'ACTIVE').length > 0 ? (
                                                                                                        adsData[adset.id].filter(ad => ad.status === 'ACTIVE').map(ad => {
                                                                                                            const commentCount = publishedComments.get(ad.id) || 0;
                                                                                                            // Color states: 0=default, 1=green, 2=blue, 3+=red
                                                                                                            const getCommentButtonStyle = (count: number) => {
                                                                                                                if (count >= 3) return "bg-red-100 text-red-600 border-red-200 hover:bg-red-200";
                                                                                                                if (count === 2) return "bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-200";
                                                                                                                if (count === 1) return "bg-green-100 text-green-600 border-green-200 hover:bg-green-200";
                                                                                                                return "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600";
                                                                                                            };
                                                                                                            return (
                                                                                                                <tr key={ad.id} className="text-xs hover:bg-white border-b border-slate-100 last:border-0 group/ad transition-colors">
                                                                                                                    <td className="p-3 pl-16">
                                                                                                                        <div className="flex items-center gap-3">
                                                                                                                            <div className="w-10 h-10 bg-white rounded overflow-hidden flex-shrink-0 border border-slate-200 shadow-sm">
                                                                                                                                {ad.creative.thumbnail_url || ad.creative.image_url ? (
                                                                                                                                    <img src={ad.creative.thumbnail_url || ad.creative.image_url} className="w-full h-full object-cover" alt="" />
                                                                                                                                ) : (
                                                                                                                                    <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={14} /></div>
                                                                                                                                )}
                                                                                                                            </div>
                                                                                                                            <div className="min-w-0 flex-1">
                                                                                                                                <div className="flex flex-col mb-1">
                                                                                                                                    <div className="flex items-center gap-2">
                                                                                                                                        <StatusToggle
                                                                                                                                            status={ad.status}
                                                                                                                                            loading={actionLoading === ad.id}
                                                                                                                                            onToggle={() => handleStatusToggle(ad.id, ad.status, 'ad')}
                                                                                                                                        />
                                                                                                                                        <span className="text-slate-600 font-medium truncate max-w-[150px]" title={ad.name}>{ad.name}</span>
                                                                                                                                    </div>

                                                                                                                                    <div className="flex items-center gap-3 mt-1">
                                                                                                                                        {ad.creative.effective_object_story_id && (
                                                                                                                                            <a
                                                                                                                                                href={getPostLink(ad.creative.effective_object_story_id)}
                                                                                                                                                target="_blank"
                                                                                                                                                rel="noopener noreferrer"
                                                                                                                                                className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1 font-medium"
                                                                                                                                            >
                                                                                                                                                View Post <ExternalLink size={8} />
                                                                                                                                            </a>
                                                                                                                                        )}

                                                                                                                                        {/* COMPACT 'C' COMMENT BUTTON - 3 STATE COLORS */}
                                                                                                                                        {ad.creative.effective_object_story_id && (
                                                                                                                                            <div className="relative group/tooltip">
                                                                                                                                                <button
                                                                                                                                                    onClick={() => openCommentModal(ad)}
                                                                                                                                                    title={`Launch Comment (${commentCount}x initiated)`}
                                                                                                                                                    className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold border transition-colors ${getCommentButtonStyle(commentCount)}`}
                                                                                                                                                >
                                                                                                                                                    {commentCount > 0 ? commentCount : "C"}
                                                                                                                                                </button>
                                                                                                                                            </div>
                                                                                                                                        )}
                                                                                                                                    </div>
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        </div>
                                                                                                                    </td>
                                                                                                                    {renderMetrics(ad.metrics)}
                                                                                                                </tr>
                                                                                                            )
                                                                                                        })
                                                                                                    ) : (
                                                                                                        <tr>
                                                                                                            <td colSpan={8} className="text-center py-6 text-xs text-slate-400 italic">
                                                                                                                No active ads in this ad set.
                                                                                                            </td>
                                                                                                        </tr>
                                                                                                    )
                                                                                                ) : (
                                                                                                    <tr>
                                                                                                        <td colSpan={8} className="text-center py-6 text-xs text-slate-400">
                                                                                                            <Loader2 className="animate-spin inline mr-2 text-indigo-500" size={14} /> Loading Ads...
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                )}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                    </React.Fragment>
                                                                ))}

                                                                {secondaryAdSets.length > 0 && (
                                                                    <tr className="bg-slate-50/30">
                                                                        <td colSpan={8} className="text-center py-2 border-b border-slate-100">
                                                                            <button
                                                                                onClick={() => toggleHiddenAdSetsForCampaign(camp.id)}
                                                                                className="text-[10px] text-slate-400 hover:text-indigo-600 uppercase tracking-wide font-bold"
                                                                            >
                                                                                {showHidden ? `Hide ${secondaryAdSets.length} inactive Ad Sets` : `Show ${secondaryAdSets.length} inactive/low-spend Ad Sets`}
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </>
                                                        )}
                                                    </React.Fragment>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {secondaryCampaigns.length > 0 && (
                                <div className="text-center pt-6">
                                    <button
                                        onClick={() => setShowAllCampaigns(!showAllCampaigns)}
                                        className="text-xs text-slate-500 hover:text-indigo-600 font-medium underline underline-offset-4"
                                    >
                                        {showAllCampaigns ? 'Show Less' : `Show ${secondaryCampaigns.length} other campaigns (Paused/Inactive)`}
                                    </button>
                                </div>
                            )}
                        </>
                    )
                }

                {/* COMMENT MODAL */}
                {
                    commentModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                            <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-2xl p-6 relative">
                                <button onClick={() => setCommentModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                                <h2 className="text-lg font-bold text-slate-800 mb-2">Launch Comment</h2>
                                <p className="text-sm text-slate-500 mb-6">Posting to: <span className="text-indigo-600 font-medium">{selectedAdForComment?.name}</span></p>

                                {templates.length === 0 ? (
                                    <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-100 text-slate-500">
                                        <p>No templates found.</p>
                                        <button onClick={() => navigate('/comment-templates')} className="text-indigo-600 text-sm font-bold mt-2 hover:underline">Create a Template</button>
                                    </div>
                                ) : (
                                    <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                        {templates.map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => handleTriggerCommentSession(t)}
                                                className="w-full text-left bg-white hover:bg-indigo-50 p-4 rounded-xl border border-slate-200 hover:border-indigo-200 transition-all group shadow-sm hover:shadow-md"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <h3 className="text-slate-800 font-bold flex items-center gap-2 group-hover:text-indigo-700 transition-colors">
                                                                {t.name}
                                                            </h3>
                                                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-500 font-semibold border border-slate-200 flex items-center gap-1">
                                                                <Layers size={10} /> {(t.items || []).length}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 line-clamp-1">{(t.items || [])[0]?.message}</p>
                                                        {(t.items || []).length > 1 && <p className="text-[10px] text-slate-400 mt-0.5 font-medium">+{(t.items || []).length - 1} more comments</p>}
                                                    </div>
                                                    <div className="text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity pl-3">
                                                        <ArrowRight size={18} />
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

            </div >

            {/* AI Analysis Settings Dialog */}
            < AnalysisSettingsDialog
                isOpen={showAnalysisSettings}
                onClose={() => setShowAnalysisSettings(false)}
            />

            <BudgetEditDialog
                isOpen={budgetDialog.isOpen}
                onClose={() => setBudgetDialog(prev => ({ ...prev, isOpen: false }))}
                onSave={handleSaveBudget}
                currentBudget={budgetDialog.currentBudget}
                entityName={budgetDialog.entityName}
            />

            <BudgetEditDialog
                isOpen={budgetDialog.isOpen}
                onClose={() => setBudgetDialog(prev => ({ ...prev, isOpen: false }))}
                onSave={handleSaveBudget}
                currentBudget={budgetDialog.currentBudget}
                entityName={budgetDialog.entityName}
            />
        </>
    );
};

export default Dashboard;
