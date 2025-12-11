
import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { AdCampaign, AdSet, Ad, CommentTemplate, LayoutContextType } from '../types';
import { useSettings } from '../App';
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
  Edit2, ExternalLink, MessageCircle, ShoppingCart, MessageSquarePlus, Send, X, Check, Layers, ArrowRight, ChevronLeft
} from 'lucide-react';

const formatMYR = (amount: number) => {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2
  }).format(amount);
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
type SortOption = 'status' | 'spend' | 'roas';
type ViewMode = 'SALES' | 'TRAFFIC';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings, logout } = useSettings();
  const { launchCommentSession } = useOutletContext<LayoutContextType>();
  
  // Data State
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [adSetsData, setAdSetsData] = useState<Record<string, AdSet[]>>({});
  const [adsData, setAdsData] = useState<Record<string, Ad[]>>({});

  // UI State
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  const [showHiddenAdSets, setShowHiddenAdSets] = useState<Set<string>>(new Set()); 
  
  // View Control
  const [viewMode, setViewMode] = useState<ViewMode>(settings.dashboardViewMode || 'SALES');
  
  // Loading States for Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  
  const [sortBy, setSortBy] = useState<SortOption>('spend');
  const [fetchError, setFetchError] = useState('');
  const [authError, setAuthError] = useState(false); 

  // Comment Modal State
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [selectedAdForComment, setSelectedAdForComment] = useState<Ad | null>(null);
  const [templates, setTemplates] = useState<CommentTemplate[]>([]);
  
  const [publishedComments, setPublishedComments] = useState<Set<string>>(() => {
      const saved = localStorage.getItem('ar_published_comments');
      return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
      const saved = localStorage.getItem('ar_published_comments');
      if (saved) setPublishedComments(new Set(JSON.parse(saved)));
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
          // Try to get a fresh token silently
          const newToken = await refreshFacebookToken();
          if (newToken && newToken !== settings.fbAccessToken) {
              console.log("Session refreshed successfully.");
              updateSettings({ fbAccessToken: newToken });
              // The updateSettings will trigger the useEffect below, restarting fetchData automatically
              return; 
          }
          
          // If refresh failed, then redirect
          setAuthError(true);
          navigate('/connect');
          return;
      } else {
          setFetchError("Data sync failed. Using offline data.");
      }
      setCampaigns(MOCK_CAMPAIGNS);
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
  useEffect(() => {
    if (campaigns.length > 0) {
        let trafficCount = 0;
        let salesCount = 0;
        
        // Prioritize ACTIVE campaigns for decision making
        const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
        const targetList = activeCampaigns.length > 0 ? activeCampaigns : campaigns;

        targetList.forEach(c => {
            if (isTrafficOrLeads(c.objective)) trafficCount++;
            else salesCount++;
        });
        
        // Auto-switch based on majority
        const detectedMode = trafficCount >= salesCount ? 'TRAFFIC' : 'SALES';
        
        if (viewMode !== detectedMode) {
             setViewMode(detectedMode);
             // Update settings to remember preference, but allow auto-detect to override next time if data changes significantly
             updateSettings({ dashboardViewMode: detectedMode });
        }
    }
  }, [campaigns]); 

  useEffect(() => {
      const saved = localStorage.getItem('ar_comment_templates');
      if (saved) {
          try {
             setTemplates(JSON.parse(saved));
          } catch(e) { setTemplates([]); }
      }
  }, [commentModalOpen]);

  // --- ACTIONS ---

  const handleViewModeToggle = (mode: ViewMode) => {
      setViewMode(mode);
      updateSettings({ dashboardViewMode: mode });
  };

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

  const handleBudgetEdit = async (id: string, currentBudget: number, type: 'campaign' | 'adset') => {
      if (settings.fbAccessToken === 'dummy_token') return alert("Simulation Mode: Budget updated!");

      const newBudgetStr = prompt("Enter new daily budget (RM):", currentBudget.toString());
      if (!newBudgetStr) return;
      const newBudget = parseFloat(newBudgetStr);
      if (isNaN(newBudget) || newBudget <= 0) return alert("Invalid amount");

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
                <th className="p-3 text-right w-[12%] font-semibold">Spend</th>
                <th className="p-3 text-right w-[12%] font-semibold">Results</th>
                <th className="p-3 text-right w-[12%] font-semibold">Cost/Res</th>
                <th className="p-3 text-right w-[10%] font-semibold">CTR (All)</th>
                <th className="p-3 text-right w-[10%] font-semibold">CTR (Link)</th>
                <th className="p-3 text-right w-[9%] font-semibold"></th>
            </tr>
        );
      }
      return (
        <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
            <th className="p-4 w-[35%] font-semibold">Name</th>
            <th className="p-3 text-right w-[12%] font-semibold">Spend</th>
            <th className="p-3 text-right w-[10%] font-semibold">ROAS</th>
            <th className="p-3 text-right w-[12%] font-semibold">CPA</th>
            <th className="p-3 text-right w-[10%] font-semibold">CTR</th>
            <th className="p-3 text-right w-[11%] font-semibold">LPV/(CPLV)</th>
            <th className="p-3 text-right w-[10%] font-semibold">Purchases</th>
        </tr>
      );
  };

  const renderMetrics = (metrics: any) => {
      if (viewMode === 'TRAFFIC') {
          return (
            <>
                <td className="p-3 text-right whitespace-nowrap text-slate-700">{formatMYR(metrics.spend)}</td>
                <td className="p-3 text-right font-bold text-slate-900 whitespace-nowrap">
                    {metrics.results}
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
    if (sortBy === 'spend') sorted.sort((a, b) => b.metrics.spend - a.metrics.spend);
    else if (sortBy === 'roas') sorted.sort((a, b) => b.metrics.roas - a.metrics.roas);
    else if (sortBy === 'status') sorted.sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    return sorted;
  }, [campaigns, sortBy]);

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
    <div className="space-y-6 relative">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
            <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Performance Overview</h1>
                {/* CLICKABLE LIVE BUTTON */}
                <button 
                    onClick={() => fetchData()}
                    className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-all shadow-sm border ${loadingCampaigns ? 'bg-indigo-100 text-indigo-700 border-indigo-200 cursor-wait' : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'}`}
                >
                    {loadingCampaigns ? <RefreshCw size={10} className="animate-spin" /> : null}
                    {loadingCampaigns ? 'Syncing...' : 'LIVE'}
                </button>
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Briefcase size={14} />
                {settings.availableAccounts?.length > 0 ? (
                    <select 
                        value={settings.adAccountId}
                        onChange={(e) => {
                            const acc = settings.availableAccounts.find(a => a.id === e.target.value);
                            if (acc) updateSettings({ adAccountId: acc.id, businessName: acc.name });
                        }}
                        className="bg-transparent focus:outline-none cursor-pointer hover:text-indigo-600 max-w-[200px] truncate font-medium text-slate-700"
                    >
                        {settings.availableAccounts.map(acc => (
                            <option key={acc.id} value={acc.id} className="bg-white">{acc.name}</option>
                        ))}
                    </select>
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
                <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex mr-2">
                    <button 
                        onClick={() => handleViewModeToggle('SALES')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all ${viewMode === 'SALES' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <ShoppingCart size={14} /> Sales
                    </button>
                    <button 
                        onClick={() => handleViewModeToggle('TRAFFIC')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all ${viewMode === 'TRAFFIC' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <MessageCircle size={14} /> Leads
                    </button>
                </div>

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

      {fetchError && (
        <div className="text-xs text-amber-700 bg-amber-50 px-4 py-3 rounded-lg border border-amber-200 flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
                <Filter size={14} className="text-amber-500"/> {fetchError}
            </div>
             <button onClick={() => fetchData()} className="px-3 py-1 bg-white hover:bg-amber-100 text-amber-700 rounded text-xs border border-amber-300 transition-colors flex items-center gap-1 font-semibold">
                <RefreshCw size={10} /> Retry Sync
            </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Spend</span>
                <DollarSign size={16} className="text-slate-300" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{formatMYR(totalSpend)}</div>
        </div>

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
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Results</span>
                        <MessageCircle size={16} className="text-slate-300" />
                    </div>
                    <div className="text-2xl font-extrabold text-slate-900">{totalResults}</div>
                 </>
             )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Revenue</span>
                <DollarSign size={16} className="text-slate-300" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{formatMYR(totalRevenue)}</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Purchases</span>
                <MousePointer size={16} className="text-slate-300" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{campaigns.reduce((a, c) => a + c.metrics.purchases, 0)}</div>
        </div>
      </div>

      {loadingCampaigns && campaigns.length === 0 ? (
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
                                        <td className="p-4 w-[35%]">
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
                                                    <div className="font-bold text-slate-800 truncate max-w-[200px] lg:max-w-xs text-sm" title={camp.name}>{camp.name}</div>
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 group-hover:text-slate-700 transition-colors">
                                                        <span className="uppercase font-semibold tracking-wider">Budget: {formatMYR(camp.dailyBudget)}</span>
                                                        <button onClick={() => handleBudgetEdit(camp.id, camp.dailyBudget, 'campaign')} className="text-indigo-500 hover:text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                                <tr><td colSpan={7} className="text-center py-4 text-xs text-slate-400"><Loader2 className="animate-spin inline mr-2" size={14}/> Loading Ad Sets...</td></tr>
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
                                                                        <button onClick={() => handleBudgetEdit(adset.id, adset.dailyBudget, 'adset')} className="text-indigo-500 hover:text-indigo-700">
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
                                                            <td colSpan={7} className="p-0 border-b border-slate-100">
                                                                <div className="max-h-[350px] overflow-y-auto custom-scrollbar border-y border-slate-200 bg-slate-50/80">
                                                                    <table className="w-full table-fixed">
                                                                        <tbody>
                                                                        {adsData[adset.id] ? (
                                                                            adsData[adset.id].filter(ad => ad.status === 'ACTIVE').length > 0 ? (
                                                                                adsData[adset.id].filter(ad => ad.status === 'ACTIVE').map(ad => {
                                                                                    const isCommented = publishedComments.has(ad.id);
                                                                                    return (
                                                                                    <tr key={ad.id} className="text-xs hover:bg-white border-b border-slate-100 last:border-0 group/ad transition-colors">
                                                                                        <td className="p-3 pl-20 w-[35%]">
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
                                                                                                                    href={`https://facebook.com/${ad.creative.effective_object_story_id}`} 
                                                                                                                    target="_blank" 
                                                                                                                    rel="noopener noreferrer"
                                                                                                                    className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1 font-medium"
                                                                                                                >
                                                                                                                    View Post <ExternalLink size={8} />
                                                                                                                </a>
                                                                                                            )}

                                                                                                            {/* COMPACT 'C' COMMENT BUTTON */}
                                                                                                            {ad.creative.effective_object_story_id && (
                                                                                                                <div className="relative group/tooltip">
                                                                                                                    <button 
                                                                                                                        onClick={() => openCommentModal(ad)}
                                                                                                                        disabled={isCommented}
                                                                                                                        title="Launch Comment"
                                                                                                                        className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold border transition-colors ${
                                                                                                                            isCommented 
                                                                                                                            ? "bg-green-100 text-green-600 border-green-200 cursor-not-allowed" 
                                                                                                                            : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600"
                                                                                                                        }`}
                                                                                                                    >
                                                                                                                        {isCommented ? <Check size={10} /> : "C"}
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
                                                                                )})
                                                                            ) : (
                                                                                <tr>
                                                                                    <td colSpan={7} className="text-center py-6 text-xs text-slate-400 italic">
                                                                                        No active ads in this ad set.
                                                                                    </td>
                                                                                </tr>
                                                                            )
                                                                        ) : (
                                                                            <tr>
                                                                                <td colSpan={7} className="text-center py-6 text-xs text-slate-400">
                                                                                    <Loader2 className="animate-spin inline mr-2 text-indigo-500" size={14}/> Loading Ads...
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
                                                    <td colSpan={7} className="text-center py-2 border-b border-slate-100">
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
                            )})}
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
      )}

      {/* COMMENT MODAL */}
      {commentModalOpen && (
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
      )}

    </div>
  );
};

export default Dashboard;
