
import React, { useState, useEffect, useMemo } from 'react';
import { AdCampaign, AdSet, Ad, CommentTemplate } from '../types';
import { useSettings } from '../App';
import { 
    getRealCampaigns, 
    initFacebookSdk, 
    getAdSets, 
    getAds, 
    updateEntityStatus,
    updateEntityBudget,
    publishComment
} from '../services/metaService';
import { MOCK_CAMPAIGNS } from '../services/mockData';
import { 
  TrendingUp, DollarSign, MousePointer, Loader2, RefreshCw, 
  Filter, Calendar, Briefcase, ChevronDown, ChevronRight, Image as ImageIcon,
  Edit2, ExternalLink, MessageCircle, ShoppingCart, MessageSquarePlus, Send, X, Check, Layers
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
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-600'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
);

const LoadingSkeleton = () => (
    <div className="w-full space-y-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-[#1e293b]/50 rounded-lg border border-slate-800"></div>
        ))}
    </div>
);

// --- MAIN DASHBOARD ---

type DateRange = 'today' | 'yesterday' | 'last_3d' | 'last_4d' | 'last_7d' | 'maximum';
type SortOption = 'status' | 'spend' | 'roas';
type ViewMode = 'SALES' | 'TRAFFIC';

const Dashboard: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  
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
  const [sortBy, setSortBy] = useState<SortOption>('spend');
  const [fetchError, setFetchError] = useState('');

  // Comment Modal State
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [selectedAdForComment, setSelectedAdForComment] = useState<Ad | null>(null);
  const [templates, setTemplates] = useState<CommentTemplate[]>([]);
  const [sendingComment, setSendingComment] = useState(false);
  const [progressText, setProgressText] = useState('');
  
  // Track published comments (Ad IDs)
  const [publishedComments, setPublishedComments] = useState<Set<string>>(() => {
      const saved = localStorage.getItem('ar_published_comments');
      return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Helper to detect objective type
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

  useEffect(() => {
    const fetchData = async () => {
      setLoadingCampaigns(true);
      setFetchError('');
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
             realData = await getRealCampaigns(settings.adAccountId, settings.fbAccessToken, dateRange);
          }
          setCampaigns(realData);

          // Note: View Mode detection is now handled in a separate useEffect below
          // to prevent state update loops inside the fetch cycle.

        } else {
          setCampaigns(MOCK_CAMPAIGNS);
        }
      } catch (err: any) {
        console.error("Fetch Error", err);
        setFetchError("Data sync failed. Using offline data.");
        setCampaigns(MOCK_CAMPAIGNS);
      } finally {
        setLoadingCampaigns(false);
      }
    };
    fetchData();
  }, [settings.fbAccessToken, settings.adAccountId, settings.fbAppId, dateRange]);

  // --- SEPARATE EFFECT FOR VIEW MODE DETECTION ---
  useEffect(() => {
    if (campaigns.length > 0 && !settings.dashboardViewMode) {
        let trafficCount = 0;
        let salesCount = 0;
        campaigns.forEach(c => {
            if (c.status === 'ACTIVE' || c.metrics.spend > 0) {
                if (isTrafficOrLeads(c.objective)) trafficCount++;
                else salesCount++;
            }
        });
        const detectedMode = trafficCount > salesCount ? 'TRAFFIC' : 'SALES';
        
        // Only update if different
        if (viewMode !== detectedMode) {
             setViewMode(detectedMode);
             // Update settings asynchronously to avoid render interrupt
             setTimeout(() => updateSettings({ dashboardViewMode: detectedMode }), 0);
        }
    } else if (settings.dashboardViewMode && viewMode !== settings.dashboardViewMode) {
        // Sync local state with settings if settings exist
        setViewMode(settings.dashboardViewMode);
    }
  }, [campaigns, settings.dashboardViewMode]);


  // Load Templates for Modal
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
                  const data = await getAdSets(campaignId, settings.fbAccessToken, dateRange);
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
                  const data = await getAds(adSetId, settings.fbAccessToken, dateRange);
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
      setProgressText('');
      setCommentModalOpen(true);
  };

  const handleLaunchComment = async (template: CommentTemplate) => {
      if (!selectedAdForComment?.creative?.effective_object_story_id) return alert("No valid post found for this ad.");
      
      setSendingComment(true);
      
      try {
          // Iterate through all items in the template
          const items = template.items || [];
          if(items.length === 0) throw new Error("This template is empty.");

          for (let i = 0; i < items.length; i++) {
              const item = items[i];
              setProgressText(`Posting comment ${i + 1} of ${items.length}...`);
              
              await publishComment(
                  selectedAdForComment.creative.effective_object_story_id,
                  item.message,
                  item.imageBase64,
                  settings.fbAccessToken
              );
              
              // Small delay between posts to be safe
              if (i < items.length - 1) {
                  await new Promise(r => setTimeout(r, 500)); 
              }
          }
          
          // Mark as published after ALL are done
          if (selectedAdForComment) {
              const newSet = new Set(publishedComments);
              newSet.add(selectedAdForComment.id);
              setPublishedComments(newSet);
              localStorage.setItem('ar_published_comments', JSON.stringify(Array.from(newSet)));
          }

          alert(`Successfully posted ${items.length} comments!`);
          setCommentModalOpen(false);
      } catch (e: any) {
          alert("Failed to post: " + e.message);
      } finally {
          setSendingComment(false);
          setProgressText('');
      }
  };

  // --- RENDER HELPERS ---

  const renderTableHeader = () => {
      if (viewMode === 'TRAFFIC') {
        return (
            <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-700">
                <th className="p-4 w-[35%]">Name</th>
                <th className="p-3 text-right w-[12%]">Spend</th>
                <th className="p-3 text-right w-[12%]">Results</th>
                <th className="p-3 text-right w-[12%]">Cost/Res</th>
                <th className="p-3 text-right w-[10%]">CTR (All)</th>
                <th className="p-3 text-right w-[10%]">CTR (Link)</th>
                <th className="p-3 text-right w-[9%]"></th>
            </tr>
        );
      }
      return (
        <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-700">
            <th className="p-4 w-[35%]">Name</th>
            <th className="p-3 text-right w-[12%]">Spend</th>
            <th className="p-3 text-right w-[10%]">ROAS</th>
            <th className="p-3 text-right w-[12%]">CPA</th>
            <th className="p-3 text-right w-[10%]">CTR</th>
            <th className="p-3 text-right w-[11%]">LPV/(CPLV)</th>
            <th className="p-3 text-right w-[10%]">Purchases</th>
        </tr>
      );
  };

  const renderMetrics = (metrics: any) => {
      if (viewMode === 'TRAFFIC') {
          return (
            <>
                <td className="p-3 text-right whitespace-nowrap w-[12%]">{formatMYR(metrics.spend)}</td>
                <td className="p-3 text-right font-bold text-white whitespace-nowrap w-[12%]">
                    {metrics.results}
                </td>
                <td className="p-3 text-right whitespace-nowrap w-[12%]">{formatMYR(metrics.costPerResult)}</td>
                <td className="p-3 text-right whitespace-nowrap w-[10%]">{metrics.ctr.toFixed(2)}%</td>
                <td className="p-3 text-right whitespace-nowrap w-[10%] text-indigo-300">{metrics.inline_link_click_ctr.toFixed(2)}%</td>
                <td className="p-3 text-right whitespace-nowrap w-[9%]"></td>
            </>
          );
      }
      return (
        <>
            <td className="p-3 text-right whitespace-nowrap w-[12%]">{formatMYR(metrics.spend)}</td>
            <td className="p-3 text-right font-bold text-white whitespace-nowrap w-[10%]">
                <span className={metrics.roas >= 2 ? 'text-green-400' : metrics.roas > 0 ? 'text-red-400' : 'text-slate-500'}>
                    {metrics.roas.toFixed(2)}x
                </span>
            </td>
            <td className="p-3 text-right whitespace-nowrap w-[12%]">{formatMYR(metrics.costPerPurchase)}</td>
            <td className="p-3 text-right whitespace-nowrap w-[10%]">{metrics.ctr.toFixed(2)}%</td>
            <td className="p-3 text-right whitespace-nowrap w-[11%]">
                <span className="text-white">{metrics.landingPageViews}</span>
                <span className="text-xs text-slate-400 ml-1">({formatMYR(metrics.costPerLandingPageView)})</span>
            </td>
            <td className="p-3 text-right whitespace-nowrap w-[10%]">{metrics.purchases}</td>
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

  // Totals
  const totalSpend = campaigns.reduce((acc, c) => acc + c.metrics.spend, 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + c.metrics.revenue, 0);
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const totalResults = campaigns.reduce((acc, c) => acc + c.metrics.results, 0);

  return (
    <div className="space-y-6 pb-20 md:pb-0 relative">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Dashboard</h1>
            <div className="flex items-center gap-2 text-indigo-400 text-sm font-semibold">
                <Briefcase size={14} />
                {settings.availableAccounts?.length > 0 ? (
                    <select 
                        value={settings.adAccountId}
                        onChange={(e) => {
                            const acc = settings.availableAccounts.find(a => a.id === e.target.value);
                            if (acc) updateSettings({ adAccountId: acc.id, businessName: acc.name });
                        }}
                        className="bg-transparent focus:outline-none cursor-pointer hover:text-indigo-300 max-w-[200px] truncate"
                    >
                        {settings.availableAccounts.map(acc => (
                            <option key={acc.id} value={acc.id} className="bg-slate-800">{acc.name}</option>
                        ))}
                    </select>
                ) : <span>{settings.businessName}</span>}
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
            {/* VIEW MODE TOGGLE */}
            <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex mr-2">
                <button 
                    onClick={() => handleViewModeToggle('SALES')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${viewMode === 'SALES' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <ShoppingCart size={12} /> Sales
                </button>
                <button 
                    onClick={() => handleViewModeToggle('TRAFFIC')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${viewMode === 'TRAFFIC' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <MessageCircle size={12} /> Leads
                </button>
            </div>

            <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <select 
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as DateRange)}
                    className="bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs text-white focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last_3d">Last 3 Days</option>
                    <option value="last_4d">Last 4 Days</option>
                    <option value="last_7d">Last 7 Days</option>
                    <option value="maximum">All Time</option>
                </select>
            </div>
            
            <div className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${loadingCampaigns ? 'bg-indigo-900/20 border-indigo-800 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
               {loadingCampaigns ? <RefreshCw size={12} className="animate-spin" /> : <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
               <span>{loadingCampaigns ? 'Syncing...' : 'Live'}</span>
            </div>
        </div>
      </div>

      {fetchError && (
        <div className="text-xs text-yellow-500 bg-yellow-900/20 px-4 py-2 rounded-lg border border-yellow-800 flex items-center gap-2">
            <Filter size={14} /> {fetchError}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#1e293b] p-4 rounded-xl border border-slate-700">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-slate-400 uppercase">Spend</span>
                <DollarSign size={16} className="text-slate-500" />
            </div>
            <div className="text-xl font-bold text-white">{formatMYR(totalSpend)}</div>
        </div>

        <div className="bg-[#1e293b] p-4 rounded-xl border border-slate-700">
             {viewMode === 'SALES' ? (
                 <>
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-slate-400 uppercase">ROAS</span>
                        <TrendingUp size={16} className="text-slate-500" />
                    </div>
                    <div className={`text-xl font-bold ${totalRoas > 2 ? 'text-green-400' : 'text-slate-200'}`}>{totalRoas.toFixed(2)}x</div>
                 </>
             ) : (
                 <>
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-slate-400 uppercase">Results</span>
                        <MessageCircle size={16} className="text-slate-500" />
                    </div>
                    <div className="text-xl font-bold text-white">{totalResults}</div>
                 </>
             )}
        </div>

        <div className="bg-[#1e293b] p-4 rounded-xl border border-slate-700">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-slate-400 uppercase">Revenue</span>
                <DollarSign size={16} className="text-slate-500" />
            </div>
            <div className="text-xl font-bold text-white">{formatMYR(totalRevenue)}</div>
        </div>

        <div className="bg-[#1e293b] p-4 rounded-xl border border-slate-700">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-slate-400 uppercase">Purchases</span>
                <MousePointer size={16} className="text-slate-500" />
            </div>
            <div className="text-xl font-bold text-white">{campaigns.reduce((a, c) => a + c.metrics.purchases, 0)}</div>
        </div>
      </div>

      {loadingCampaigns && campaigns.length === 0 ? (
          <LoadingSkeleton />
      ) : (
        <>
            {/* NESTED LIST VIEW */}
            <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left border-collapse table-fixed">
                    <thead>
                        {renderTableHeader()}
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {campaignsToShow.map(camp => {
                            const allAdSets = adSetsData[camp.id] || [];
                            const primaryAdSets = allAdSets.filter(a => a.status === 'ACTIVE' && a.metrics.spend > 0);
                            const secondaryAdSets = allAdSets.filter(a => !(a.status === 'ACTIVE' && a.metrics.spend > 0));
                            const showHidden = showHiddenAdSets.has(camp.id);
                            const adSetsToShow = showHidden ? allAdSets : primaryAdSets;

                            return (
                            <React.Fragment key={camp.id}>
                                {/* Level 1: Campaign */}
                                <tr className="bg-[#1e293b] hover:bg-slate-800/30 text-sm transition-colors group">
                                    <td className="p-4 w-[35%]">
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => toggleExpandCampaign(camp.id)}
                                                className="text-slate-500 hover:text-white transition-colors"
                                            >
                                                {expandedCampaigns.has(camp.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </button>
                                            <StatusToggle 
                                                status={camp.status} 
                                                loading={actionLoading === camp.id} 
                                                onToggle={() => handleStatusToggle(camp.id, camp.status, 'campaign')} 
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-white truncate max-w-[200px] lg:max-w-xs" title={camp.name}>{camp.name}</div>
                                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 group-hover:opacity-100 transition-opacity">
                                                    <span>Budget: {formatMYR(camp.dailyBudget)}</span>
                                                    <button onClick={() => handleBudgetEdit(camp.id, camp.dailyBudget, 'campaign')} className="text-indigo-400 hover:text-white">
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
                                            <tr><td colSpan={7} className="text-center py-4 text-xs text-slate-500"><Loader2 className="animate-spin inline mr-2" size={14}/> Loading Ad Sets...</td></tr>
                                        )}

                                        {adSetsToShow.map(adset => (
                                            <React.Fragment key={adset.id}>
                                                <tr className="bg-slate-900/50 text-sm hover:bg-slate-800/20">
                                                    <td className="p-4 pl-12 border-l-4 border-indigo-500/20 w-[35%]">
                                                        <div className="flex items-center gap-3">
                                                            <button 
                                                                onClick={() => toggleExpandAdSet(adset.id)}
                                                                className="text-slate-500 hover:text-white"
                                                            >
                                                                {expandedAdSets.has(adset.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                            </button>
                                                            <StatusToggle 
                                                                status={adset.status} 
                                                                loading={actionLoading === adset.id}
                                                                onToggle={() => handleStatusToggle(adset.id, adset.status, 'adset')} 
                                                            />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-slate-300 truncate max-w-[180px]">{adset.name}</div>
                                                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                                                    <span>Ad Set Budget: {formatMYR(adset.dailyBudget)}</span>
                                                                    <button onClick={() => handleBudgetEdit(adset.id, adset.dailyBudget, 'adset')} className="text-indigo-400 hover:text-white">
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
                                                    <tr className="bg-slate-950/30">
                                                        <td colSpan={7} className="p-0 border-b border-slate-800">
                                                            <div className="max-h-[350px] overflow-y-auto custom-scrollbar border-y border-slate-700/50 bg-slate-950/50">
                                                                <table className="w-full table-fixed">
                                                                    <tbody>
                                                                    {adsData[adset.id] ? (
                                                                        adsData[adset.id].filter(ad => ad.status === 'ACTIVE').length > 0 ? (
                                                                            adsData[adset.id].filter(ad => ad.status === 'ACTIVE').map(ad => {
                                                                                const isCommented = publishedComments.has(ad.id);
                                                                                return (
                                                                                <tr key={ad.id} className="text-xs hover:bg-slate-900/50 border-b border-slate-800/50 last:border-0 group/ad">
                                                                                    <td className="p-3 pl-20 w-[35%]">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <div className="w-10 h-10 bg-slate-800 rounded overflow-hidden flex-shrink-0 border border-slate-700">
                                                                                                {ad.creative.thumbnail_url || ad.creative.image_url ? (
                                                                                                    <img src={ad.creative.thumbnail_url || ad.creative.image_url} className="w-full h-full object-cover" alt="" />
                                                                                                ) : (
                                                                                                    <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon size={14} /></div>
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
                                                                                                        <span className="text-slate-400 truncate max-w-[150px]" title={ad.name}>{ad.name}</span>
                                                                                                    </div>
                                                                                                    
                                                                                                    <div className="flex items-center gap-3 mt-1">
                                                                                                        {ad.creative.effective_object_story_id && (
                                                                                                            <a 
                                                                                                                href={`https://facebook.com/${ad.creative.effective_object_story_id}`} 
                                                                                                                target="_blank" 
                                                                                                                rel="noopener noreferrer"
                                                                                                                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 opacity-80 hover:opacity-100"
                                                                                                            >
                                                                                                                View Post <ExternalLink size={8} />
                                                                                                            </a>
                                                                                                        )}

                                                                                                        {/* LAUNCH COMMENT BUTTON */}
                                                                                                        {ad.creative.effective_object_story_id && (
                                                                                                            <button 
                                                                                                                onClick={() => openCommentModal(ad)}
                                                                                                                disabled={isCommented}
                                                                                                                className={isCommented
                                                                                                                    ? "text-[10px] text-slate-600 flex items-center gap-1 cursor-not-allowed border border-slate-700/50 px-1.5 py-0.5 rounded bg-slate-800/50"
                                                                                                                    : "text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 opacity-80 hover:opacity-100 border border-green-500/30 px-1.5 py-0.5 rounded"
                                                                                                                }
                                                                                                            >
                                                                                                                {isCommented ? <Check size={10} /> : <MessageSquarePlus size={10} />}
                                                                                                                {isCommented ? 'Sent' : 'Message'}
                                                                                                            </button>
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
                                                                                <td colSpan={7} className="text-center py-8 text-xs text-slate-500">
                                                                                    No active ads in this ad set.
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    ) : (
                                                                        <tr>
                                                                            <td colSpan={7} className="text-center py-8 text-xs text-slate-500">
                                                                                <Loader2 className="animate-spin inline mr-2" size={14}/> Loading Ads...
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
                                            <tr className="bg-slate-900/30">
                                                <td colSpan={7} className="text-center py-2 border-b border-slate-800">
                                                    <button 
                                                        onClick={() => toggleHiddenAdSetsForCampaign(camp.id)}
                                                        className="text-[10px] text-slate-500 hover:text-indigo-400 uppercase tracking-wide font-semibold"
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

            {/* Pagination / Show More Campaigns */}
            {secondaryCampaigns.length > 0 && (
                <div className="text-center pt-4">
                    <button 
                        onClick={() => setShowAllCampaigns(!showAllCampaigns)}
                        className="text-xs text-slate-500 hover:text-white underline underline-offset-4"
                    >
                        {showAllCampaigns ? 'Show Less' : `Show ${secondaryCampaigns.length} other campaigns (Paused/Inactive)`}
                    </button>
                </div>
            )}
        </>
      )}

      {/* COMMENT MODAL */}
      {commentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-slate-800 w-full max-w-lg rounded-xl border border-slate-700 shadow-2xl p-6 relative">
                  <button onClick={() => setCommentModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20} /></button>
                  <h2 className="text-lg font-bold text-white mb-2">Launch Comment</h2>
                  <p className="text-sm text-slate-400 mb-6">Posting to: <span className="text-indigo-400 font-medium">{selectedAdForComment?.name}</span></p>

                  {templates.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                          No templates found. <br/> Go to "Comment Templates" to create one.
                      </div>
                  ) : (
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                          {templates.map(t => (
                              <button 
                                key={t.id}
                                onClick={() => handleLaunchComment(t)}
                                disabled={sendingComment}
                                className="w-full text-left bg-slate-700 hover:bg-slate-600 p-4 rounded-lg border border-slate-600 hover:border-indigo-500 transition-all group"
                              >
                                  <div className="flex justify-between items-start">
                                      <div className="flex-1">
                                          <div className="flex justify-between items-center mb-1">
                                            <h3 className="text-white font-medium flex items-center gap-2">
                                                {t.name}
                                            </h3>
                                            <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-400 border border-slate-800 flex items-center gap-1">
                                                <Layers size={10} /> {(t.items || []).length}
                                            </span>
                                          </div>
                                          <p className="text-xs text-slate-400 line-clamp-1">{(t.items || [])[0]?.message}</p>
                                          {(t.items || []).length > 1 && <p className="text-[10px] text-slate-500 mt-0.5">+{(t.items || []).length - 1} more comments</p>}
                                      </div>
                                      <div className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity pl-3">
                                          {sendingComment ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                      </div>
                                  </div>
                              </button>
                          ))}
                      </div>
                  )}

                  {sendingComment && progressText && (
                      <div className="mt-4 text-center">
                          <p className="text-xs text-indigo-300 animate-pulse">{progressText}</p>
                      </div>
                  )}
              </div>
          </div>
      )}

    </div>
  );
};

export default Dashboard;
