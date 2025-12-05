
import React, { useState, useEffect, useMemo } from 'react';
import { AdCampaign, AiAnalysisResult } from '../types';
import { analyzeCampaign } from '../services/aiService';
import { useSettings } from '../App';
import { getRealCampaigns, initFacebookSdk } from '../services/metaService';
import { MOCK_CAMPAIGNS } from '../services/mockData';
import { 
  TrendingUp, 
  DollarSign, 
  MousePointer, 
  Eye, 
  BrainCircuit, 
  Loader2,
  RefreshCw,
  Filter,
  ArrowUpDown,
  Calendar,
  Briefcase
} from 'lucide-react';

// Helper for RM Currency
const formatMYR = (amount: number) => {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2
  }).format(amount);
};

// Metric Card Component
const MetricCard = ({ title, value, subtext, icon: Icon, trend }: any) => (
  <div className="bg-[#1e293b] p-5 rounded-xl border border-slate-700 relative overflow-hidden group">
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
      <Icon size={40} className="text-indigo-400" />
    </div>
    <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wide">{title}</p>
    <h3 className="text-2xl font-bold text-white tracking-tight">{value}</h3>
    <div className="flex items-center mt-2 gap-2">
       {trend && (
         <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${trend === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {trend === 'up' ? '+' : ''}Trend
         </span>
       )}
       <p className="text-[10px] text-slate-500">{subtext}</p>
    </div>
  </div>
);

type DateRange = 'today' | 'yesterday' | 'last_3d' | 'last_7d' | 'maximum';
type SortOption = 'status' | 'spend' | 'roas';

const Dashboard: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaign | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  
  // Filters & Sorting State - DEFAULT TO TODAY
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [sortBy, setSortBy] = useState<SortOption>('spend');

  // Fetch campaigns logic
  useEffect(() => {
    const fetchData = async () => {
      setLoadingCampaigns(true);
      setFetchError('');
      
      try {
        if (settings.fbAccessToken === 'dummy_token' || (settings.fbAccessToken && settings.adAccountId)) {
          
          if (settings.fbAccessToken === 'dummy_token') {
             // Mock Data Load (Simulation)
             await new Promise(r => setTimeout(r, 600)); // Fake delay
             setCampaigns(MOCK_CAMPAIGNS);
          } else {
             // Real Meta API Load
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

  // Sorting Logic
  const sortedCampaigns = useMemo(() => {
    const sorted = [...campaigns];
    if (sortBy === 'spend') {
        return sorted.sort((a, b) => b.metrics.spend - a.metrics.spend);
    }
    if (sortBy === 'roas') {
        return sorted.sort((a, b) => b.metrics.roas - a.metrics.roas);
    }
    if (sortBy === 'status') {
        return sorted.sort((a, b) => (a.status === 'ACTIVE' ? -1 : 1));
    }
    return sorted;
  }, [campaigns, sortBy]);

  // Totals
  const totalSpend = campaigns.reduce((acc, c) => acc + c.metrics.spend, 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + c.metrics.revenue, 0);
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgCtr = campaigns.length > 0 ? campaigns.reduce((acc, c) => acc + c.metrics.ctr, 0) / campaigns.length : 0;
  const totalLpViews = campaigns.reduce((acc, c) => acc + c.metrics.landingPageViews, 0);

  const handleAnalyze = async (campaign: AdCampaign) => {
    setSelectedCampaign(campaign);
    setAnalysis(null);
    setAnalyzing(true);

    const result = await analyzeCampaign(
      campaign, 
      settings.selectedAiProvider,
      settings.apiKey,
      settings.selectedModel
    );
    
    setAnalysis(result);
    setAnalyzing(false);
  };

  const closeAnalysis = () => {
    setSelectedCampaign(null);
    setAnalysis(null);
  };

  const handleAccountSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAccountId = e.target.value;
    const newAccount = settings.availableAccounts.find(a => a.id === newAccountId);
    if (newAccount) {
      updateSettings({ 
        adAccountId: newAccount.id,
        businessName: newAccount.name
      });
      // Logic to clear old campaigns/refresh handled by useEffect dependency on adAccountId
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0"> {/* Extra padding bottom for mobile nav */}
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="w-full md:w-auto">
            <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Dashboard</h1>
            
            {/* Account Switcher */}
            <div className="flex items-center gap-2">
              <Briefcase size={14} className="text-slate-400" />
              <div className="relative group">
                {settings.availableAccounts && settings.availableAccounts.length > 0 ? (
                  <select 
                    value={settings.adAccountId}
                    onChange={handleAccountSwitch}
                    className="appearance-none bg-transparent text-indigo-400 font-semibold text-sm focus:outline-none pr-6 cursor-pointer hover:text-indigo-300 transition-colors"
                  >
                    {settings.availableAccounts.map(acc => (
                      <option key={acc.id} value={acc.id} className="bg-slate-800 text-white">
                        {acc.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-indigo-400 font-semibold text-sm">{settings.businessName}</span>
                )}
                {/* Custom arrow only if select is active */}
                {settings.availableAccounts && settings.availableAccounts.length > 0 && (
                   <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400">
                     <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                   </div>
                )}
              </div>
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Date Picker */}
            <div className="relative flex-1 md:flex-none">
                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <select 
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as DateRange)}
                    className="w-full md:w-auto bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs md:text-sm text-white focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last_3d">Last 3 Days</option>
                    <option value="last_7d">Last 7 Days</option>
                    <option value="maximum">All Time</option>
                </select>
            </div>

            {/* Sort Picker */}
            <div className="relative flex-1 md:flex-none">
                <ArrowUpDown className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="w-full md:w-auto bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs md:text-sm text-white focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                    <option value="spend">Sort: Spend (High)</option>
                    <option value="roas">Sort: ROAS (High)</option>
                    <option value="status">Sort: Status</option>
                </select>
            </div>

            {/* Status Badge */}
            <div className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${loadingCampaigns ? 'bg-indigo-900/20 border-indigo-800 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
               {loadingCampaigns ? <RefreshCw size={12} className="animate-spin" /> : <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
               <span className="hidden md:inline">{loadingCampaigns ? 'Syncing...' : 'Live'}</span>
            </div>
        </div>
      </div>

      {fetchError && (
        <div className="text-xs text-yellow-500 bg-yellow-900/20 px-4 py-2 rounded-lg border border-yellow-800 flex items-center gap-2">
            <Filter size={14} /> {fetchError}
        </div>
      )}

      {/* Top Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard 
            title="Total Spend" 
            value={formatMYR(totalSpend)} 
            subtext="Ad Spend"
            icon={DollarSign}
            trend="up"
        />
        <MetricCard 
            title="Total ROAS" 
            value={totalRoas.toFixed(2)} 
            subtext="Return on Spend"
            icon={TrendingUp}
            trend={totalRoas > 2 ? 'up' : 'down'}
        />
        <MetricCard 
            title="Avg. CTR" 
            value={`${avgCtr.toFixed(2)}%`} 
            subtext="Click Through"
            icon={MousePointer}
            trend={avgCtr > 1 ? 'up' : 'down'}
        />
        <MetricCard 
            title="LP Views" 
            value={totalLpViews.toLocaleString()} 
            subtext="Traffic Volume"
            icon={Eye}
            trend="up"
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Campaigns List - Mobile Optimized */}
        <div className="lg:col-span-2 flex flex-col h-auto lg:h-[600px]">
            <div className="bg-[#1e293b] rounded-t-xl border border-slate-700 p-4 flex justify-between items-center">
                <h3 className="font-semibold text-white">Active Campaigns</h3>
                <span className="text-xs text-slate-500">{campaigns.length} Items</span>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-[#1e293b] rounded-b-xl border-x border-b border-slate-700 overflow-hidden flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#1e293b]">
                        <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase">
                            <th className="p-4 font-medium">Campaign</th>
                            <th className="p-4 font-medium">Spend</th>
                            <th className="p-4 font-medium">ROAS</th>
                            <th className="p-4 font-medium">CPA</th>
                            <th className="p-4 font-medium">AI Insight</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {sortedCampaigns.map((campaign) => (
                            <tr key={campaign.id} className="text-sm text-slate-300 hover:bg-slate-800/30 transition-colors">
                                <td className="p-4 font-medium text-white">
                                    <div className="flex items-center gap-2">
                                        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${campaign.status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-500'}`}></span>
                                        <span className="truncate max-w-[180px]" title={campaign.name}>{campaign.name}</span>
                                    </div>
                                </td>
                                <td className="p-4">{formatMYR(campaign.metrics.spend)}</td>
                                <td className="p-4 font-bold">
                                    <span className={`${campaign.metrics.roas >= 2 ? 'text-green-400' : campaign.metrics.roas > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                        {campaign.metrics.roas.toFixed(2)}x
                                    </span>
                                </td>
                                <td className="p-4">{formatMYR(campaign.metrics.costPerPurchase)}</td>
                                <td className="p-4">
                                    <button 
                                        onClick={() => handleAnalyze(campaign)}
                                        className="flex items-center gap-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md transition-colors"
                                    >
                                        <BrainCircuit size={14} /> Analyze
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3 bg-slate-900 pt-2">
                {sortedCampaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-[#1e293b] p-4 rounded-xl border border-slate-700 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${campaign.status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-500'}`}></span>
                                <h4 className="text-sm font-semibold text-white truncate">{campaign.name}</h4>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${campaign.metrics.roas >= 2 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                                {campaign.metrics.roas.toFixed(2)} ROAS
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase">Spend</p>
                                <p className="text-sm font-medium text-white">{formatMYR(campaign.metrics.spend)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase">Revenue</p>
                                <p className="text-sm font-medium text-white">{formatMYR(campaign.metrics.revenue)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase">CPA</p>
                                <p className="text-sm font-medium text-slate-300">{formatMYR(campaign.metrics.costPerPurchase)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase">Purchases</p>
                                <p className="text-sm font-medium text-slate-300">{campaign.metrics.purchases}</p>
                            </div>
                        </div>

                        <button 
                            onClick={() => handleAnalyze(campaign)}
                            className="w-full flex items-center justify-center gap-2 text-sm bg-indigo-600 active:bg-indigo-700 text-white py-2.5 rounded-lg font-medium transition-colors"
                        >
                            <BrainCircuit size={16} /> Analyze with AI
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {/* AI Insight Panel - Responsive Overlay on Mobile */}
        {selectedCampaign && (
           <div className={`
              fixed inset-0 z-50 lg:static lg:z-auto lg:col-span-1 lg:h-[600px] flex items-end lg:block
              ${!selectedCampaign ? 'pointer-events-none' : ''}
           `}>
                {/* Mobile Backdrop */}
                <div className="absolute inset-0 bg-black/80 lg:hidden" onClick={closeAnalysis}></div>

                {/* Content Panel */}
                <div className="bg-[#1e293b] w-full lg:rounded-xl border-t lg:border border-indigo-500/50 shadow-2xl lg:shadow-indigo-900/20 overflow-hidden flex flex-col h-[80vh] lg:h-full relative rounded-t-2xl animate-slideUp lg:animate-none">
                    <div className="p-4 bg-indigo-900/20 border-b border-indigo-500/30 flex justify-between items-center flex-shrink-0">
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-indigo-300 flex items-center gap-2">
                                <BrainCircuit size={18} />
                                AI Analysis
                            </h3>
                            <span className="text-xs text-indigo-400/70 truncate max-w-[200px]">{selectedCampaign.name}</span>
                        </div>
                        <button onClick={closeAnalysis} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">&times;</button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#1e293b]">
                        {analyzing ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4 text-indigo-300">
                                <Loader2 size={32} className="animate-spin" />
                                <p className="text-sm animate-pulse">
                                  Consulting Expert AI...
                                </p>
                            </div>
                        ) : analysis ? (
                            <div className="space-y-6 animate-fadeIn">
                                <div>
                                    <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Executive Summary</h4>
                                    <p className="text-sm text-slate-300 leading-relaxed bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                        {analysis.summary}
                                    </p>
                                </div>

                                <div>
                                    <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Optimization Plan</h4>
                                    <ul className="space-y-3">
                                        {analysis.actionPlan.map((step, idx) => (
                                            <li key={idx} className="flex gap-3 text-sm text-slate-300 bg-slate-800/30 p-2 rounded-lg">
                                                <span className="flex-shrink-0 w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-[10px] font-bold border border-indigo-500/30 mt-0.5">
                                                    {idx + 1}
                                                </span>
                                                {step}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className={`px-3 py-3 rounded-lg text-center text-xs font-bold uppercase tracking-wider border flex justify-center items-center gap-2 ${
                                    analysis.sentiment === 'POSITIVE' ? 'bg-green-900/20 border-green-700 text-green-400' : 
                                    analysis.sentiment === 'NEGATIVE' ? 'bg-red-900/20 border-red-700 text-red-400' :
                                    'bg-yellow-900/20 border-yellow-700 text-yellow-400'
                                }`}>
                                    {analysis.sentiment === 'POSITIVE' ? <TrendingUp size={14} /> : <Filter size={14} />}
                                    Outlook: {analysis.sentiment}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
           </div>
        )}
        
        {/* Placeholder for Desktop Right Column when no campaign selected */}
        {!selectedCampaign && (
            <div className="hidden lg:flex lg:col-span-1 bg-[#1e293b] rounded-xl border border-slate-700 p-6 flex-col items-center justify-center h-full text-center opacity-50">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <BrainCircuit size={32} className="text-slate-500" />
                </div>
                <h3 className="text-white font-medium mb-2">AI Expert Ready</h3>
                <p className="text-slate-400 text-sm">Select a campaign to receive optimization strategies.</p>
            </div>
        )}
        
      </div>
    </div>
  );
};

export default Dashboard;
