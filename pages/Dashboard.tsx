
import React, { useState, useEffect, useMemo } from 'react';
import { AdCampaign, AiAnalysisResult, AdSet, Ad } from '../types';
import { analyzeCampaign } from '../services/aiService';
import { useSettings } from '../App';
import { 
    getRealCampaigns, 
    initFacebookSdk, 
    getAdSets, 
    getAds, 
    updateEntityStatus,
    updateEntityBudget
} from '../services/metaService';
import { MOCK_CAMPAIGNS } from '../services/mockData';
import { 
  TrendingUp, DollarSign, MousePointer, Eye, BrainCircuit, Loader2, RefreshCw, 
  Filter, ArrowUpDown, Calendar, Briefcase, ChevronDown, ChevronRight, Image as ImageIcon,
  PlayCircle, PauseCircle, Edit2
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
  
  // Loading States for Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null); // ID of entity being acted upon

  // AI Analysis
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaign | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  
  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [sortBy, setSortBy] = useState<SortOption>('spend');
  const [fetchError, setFetchError] = useState('');

  // --- FETCH DATA ---

  useEffect(() => {
    const fetchData = async () => {
      setLoadingCampaigns(true);
      setFetchError('');
      // Reset expansions on date change for cleaner view
      setExpandedCampaigns(new Set());
      setExpandedAdSets(new Set());
      
      try {
        if (settings.fbAccessToken === 'dummy_token' || (settings.fbAccessToken && settings.adAccountId)) {
          if (settings.fbAccessToken === 'dummy_token') {
             await new Promise(r => setTimeout(r, 600)); 
             setCampaigns(MOCK_CAMPAIGNS);
          } else {
             await initFacebookSdk(settings.fbAppId);
             const realData = await getRealCampaigns(settings.adAccountId, settings.fbAccessToken, dateRange);
             setCampaigns(realData);
          }
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

  // --- ACTIONS ---

  const toggleExpandCampaign = async (campaignId: string) => {
      const newSet = new Set(expandedCampaigns);
      if (newSet.has(campaignId)) {
          newSet.delete(campaignId);
      } else {
          newSet.add(campaignId);
          // Fetch Ad Sets if not present
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
          // Fetch Ads if not present
          if (!adsData[adSetId] && settings.fbAccessToken !== 'dummy_token') {
              try {
                  const data = await getAds(adSetId, settings.fbAccessToken, dateRange);
                  setAdsData(prev => ({ ...prev, [adSetId]: data }));
              } catch (e) { console.error(e); }
          }
      }
      setExpandedAdSets(newSet);
  };

  const handleStatusToggle = async (id: string, currentStatus: string, type: 'campaign' | 'adset' | 'ad') => {
      if (settings.fbAccessToken === 'dummy_token') return alert("Simulation Mode: Status toggled!");
      
      const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      setActionLoading(id);
      try {
          const success = await updateEntityStatus(id, newStatus, settings.fbAccessToken);
          if (success) {
              // Update Local State
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

  const handleAnalyze = async (campaign: AdCampaign) => {
    setSelectedCampaign(campaign);
    setAnalysis(null);
    setAnalyzing(true);
    const result = await analyzeCampaign(campaign, settings.selectedAiProvider, settings.apiKey, settings.selectedModel);
    setAnalysis(result);
    setAnalyzing(false);
  };

  // --- RENDER HELPERS ---

  const renderMetrics = (metrics: any) => (
      <>
        <td className="p-3 text-right whitespace-nowrap">{formatMYR(metrics.spend)}</td>
        <td className="p-3 text-right font-bold text-white whitespace-nowrap">
            <span className={metrics.roas >= 2 ? 'text-green-400' : metrics.roas > 0 ? 'text-red-400' : 'text-slate-500'}>
                {metrics.roas.toFixed(2)}x
            </span>
        </td>
        <td className="p-3 text-right whitespace-nowrap">{formatMYR(metrics.costPerPurchase)}</td>
        <td className="p-3 text-right whitespace-nowrap">{metrics.ctr.toFixed(2)}%</td>
        <td className="p-3 text-right whitespace-nowrap">{metrics.purchases}</td>
      </>
  );

  // --- SORTING & FILTERING ---
  const sortedCampaigns = useMemo(() => {
    const sorted = [...campaigns];
    if (sortBy === 'spend') sorted.sort((a, b) => b.metrics.spend - a.metrics.spend);
    else if (sortBy === 'roas') sorted.sort((a, b) => b.metrics.roas - a.metrics.roas);
    else if (sortBy === 'status') sorted.sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    return sorted;
  }, [campaigns, sortBy]);

  // Primary: Active OR Spend > 0
  const primaryCampaigns = useMemo(() => {
      return sortedCampaigns.filter(c => c.status === 'ACTIVE' || c.metrics.spend > 0);
  }, [sortedCampaigns]);

  // Secondary: Not Active AND Spend 0
  const secondaryCampaigns = useMemo(() => {
      return sortedCampaigns.filter(c => c.status !== 'ACTIVE' && c.metrics.spend === 0);
  }, [sortedCampaigns]);

  const campaignsToShow = showAllCampaigns ? sortedCampaigns : primaryCampaigns;

  // Totals
  const totalSpend = campaigns.reduce((acc, c) => acc + c.metrics.spend, 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + c.metrics.revenue, 0);
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      
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
                        className="bg-transparent focus:outline-none cursor-pointer hover:text-indigo-300"
                    >
                        {settings.availableAccounts.map(acc => (
                            <option key={acc.id} value={acc.id} className="bg-slate-800">{acc.name}</option>
                        ))}
                    </select>
                ) : <span>{settings.businessName}</span>}
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
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
        {[
            { label: 'Spend', val: formatMYR(totalSpend), icon: DollarSign },
            { label: 'ROAS', val: totalRoas.toFixed(2), icon: TrendingUp, color: totalRoas > 2 ? 'text-green-400' : 'text-slate-200' },
            { label: 'Revenue', val: formatMYR(totalRevenue), icon: DollarSign },
            { label: 'Purchases', val: campaigns.reduce((a, c) => a + c.metrics.purchases, 0), icon: MousePointer }
        ].map((m, i) => (
            <div key={i} className="bg-[#1e293b] p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs text-slate-400 uppercase">{m.label}</span>
                    <m.icon size={16} className="text-slate-500" />
                </div>
                <div className={`text-xl font-bold ${m.color || 'text-white'}`}>{m.val}</div>
            </div>
        ))}
      </div>

      {loadingCampaigns && campaigns.length === 0 ? (
          <LoadingSkeleton />
      ) : (
        <>
            {/* NESTED LIST VIEW */}
            <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-700">
                            <th className="p-4 w-[35%]">Name</th>
                            <th className="p-3 text-right">Spend</th>
                            <th className="p-3 text-right">ROAS</th>
                            <th className="p-3 text-right">CPA</th>
                            <th className="p-3 text-right">CTR</th>
                            <th className="p-3 text-right">Purchases</th>
                            <th className="p-3 w-10">AI</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {campaignsToShow.map(camp => (
                            <React.Fragment key={camp.id}>
                                {/* Level 1: Campaign */}
                                <tr className="bg-[#1e293b] hover:bg-slate-800/30 text-sm transition-colors group">
                                    <td className="p-4">
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
                                            <div className="min-w-0">
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
                                    <td className="p-3">
                                        <button onClick={() => handleAnalyze(camp)} className="text-indigo-400 hover:text-white">
                                            <BrainCircuit size={16} />
                                        </button>
                                    </td>
                                </tr>

                                {/* Level 2: Ad Sets */}
                                {expandedCampaigns.has(camp.id) && (
                                    <>
                                        {adSetsData[camp.id]?.map(adset => (
                                            <React.Fragment key={adset.id}>
                                                <tr className="bg-slate-900/50 text-sm hover:bg-slate-800/20">
                                                    <td className="p-4 pl-12 border-l-4 border-indigo-500/20">
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
                                                            <div className="min-w-0">
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
                                                    <td></td>
                                                </tr>

                                                {/* Level 3: Ads Container */}
                                                {expandedAdSets.has(adset.id) && (
                                                    <tr className="bg-slate-950/30">
                                                        <td colSpan={7} className="p-0 border-b border-slate-800">
                                                            {/* SCROLLABLE ADS AREA */}
                                                            <div className="max-h-[350px] overflow-y-auto custom-scrollbar border-y border-slate-700/50 bg-slate-950/50">
                                                                <table className="w-full">
                                                                    <tbody>
                                                                    {adsData[adset.id] ? (
                                                                        adsData[adset.id].map(ad => (
                                                                            <tr key={ad.id} className="text-xs hover:bg-slate-900/50 border-b border-slate-800/50 last:border-0">
                                                                                <td className="p-3 pl-20 w-[35%] flex items-center gap-3">
                                                                                    <div className="w-10 h-10 bg-slate-800 rounded overflow-hidden flex-shrink-0 border border-slate-700">
                                                                                        {ad.creative.thumbnail_url || ad.creative.image_url ? (
                                                                                            <img src={ad.creative.thumbnail_url || ad.creative.image_url} className="w-full h-full object-cover" alt="" />
                                                                                        ) : (
                                                                                            <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon size={14} /></div>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="min-w-0">
                                                                                        <div className="flex items-center gap-2 mb-1">
                                                                                            <StatusToggle 
                                                                                                status={ad.status} 
                                                                                                loading={actionLoading === ad.id}
                                                                                                onToggle={() => handleStatusToggle(ad.id, ad.status, 'ad')} 
                                                                                            />
                                                                                            <span className="text-slate-400 truncate max-w-[150px]" title={ad.name}>{ad.name}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                {renderMetrics(ad.metrics)}
                                                                                <td className="p-3 w-10"></td>
                                                                            </tr>
                                                                        ))
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
                                        {/* Loading State for Ad Sets */}
                                        {!adSetsData[camp.id] && (
                                            <tr><td colSpan={7} className="text-center py-4 text-xs text-slate-500"><Loader2 className="animate-spin inline mr-2" size={14}/> Loading Ad Sets...</td></tr>
                                        )}
                                    </>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination / Show More */}
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

      {/* AI Modal (Same as before) */}
      {selectedCampaign && (
           <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${!selectedCampaign ? 'pointer-events-none' : ''}`}>
                <div className="absolute inset-0 bg-black/80" onClick={() => setSelectedCampaign(null)}></div>
                <div className="bg-[#1e293b] w-full max-w-lg rounded-2xl border border-indigo-500/30 shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="p-4 bg-indigo-900/20 border-b border-indigo-500/30 flex justify-between items-center">
                        <h3 className="font-semibold text-indigo-300 flex items-center gap-2">
                            <BrainCircuit size={18} /> AI Analysis
                        </h3>
                        <button onClick={() => setSelectedCampaign(null)} className="text-slate-400 hover:text-white">&times;</button>
                    </div>
                    <div className="p-6 overflow-y-auto custom-scrollbar">
                        {analyzing ? (
                            <div className="text-center py-10 text-indigo-300">
                                <Loader2 size={32} className="animate-spin mx-auto mb-4" />
                                <p className="animate-pulse">Analyzing Data...</p>
                            </div>
                        ) : analysis && (
                            <div className="space-y-4">
                                <div className="p-3 bg-slate-800 rounded-lg text-sm text-slate-300">{analysis.summary}</div>
                                <ul className="space-y-2">
                                    {analysis.actionPlan.map((step, i) => (
                                        <li key={i} className="flex gap-2 text-sm text-slate-300">
                                            <span className="text-indigo-400 font-bold">{i+1}.</span> {step}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
           </div>
      )}

    </div>
  );
};

export default Dashboard;
