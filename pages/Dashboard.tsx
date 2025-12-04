import React, { useState, useEffect } from 'react';
import { MOCK_CAMPAIGNS } from '../services/mockData';
import { AdCampaign, AiAnalysisResult } from '../types';
import { analyzeCampaign } from '../services/aiService';
import { useSettings } from '../App';
import { 
  TrendingUp, 
  DollarSign, 
  MousePointer, 
  Eye, 
  BrainCircuit, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';

// Metric Card Component
const MetricCard = ({ title, value, subtext, icon: Icon, trend }: any) => (
  <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700 relative overflow-hidden group">
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
      <Icon size={48} className="text-indigo-400" />
    </div>
    <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
    <h3 className="text-2xl font-bold text-white">{value}</h3>
    <div className="flex items-center mt-2 gap-2">
       {trend && (
         <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trend === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {trend === 'up' ? '+12.5%' : '-4.2%'}
         </span>
       )}
       <p className="text-xs text-slate-500">{subtext}</p>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const { settings } = useSettings();
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaign | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Totals for top cards
  const totalSpend = MOCK_CAMPAIGNS.reduce((acc, c) => acc + c.metrics.spend, 0);
  const totalRevenue = MOCK_CAMPAIGNS.reduce((acc, c) => acc + c.metrics.revenue, 0);
  const totalRoas = totalRevenue / totalSpend;

  const handleAnalyze = async (campaign: AdCampaign) => {
    setSelectedCampaign(campaign);
    setAnalysis(null);
    setAnalyzing(true);

    // Pass custom settings including apiKey
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

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400">Welcome back, {settings.businessName}</p>
        </div>
        <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300">
           Last Updated: Just now
        </div>
      </header>

      {/* Top Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
            title="Total Spend" 
            value={`$${totalSpend.toLocaleString()}`} 
            subtext="Last 7 Days"
            icon={DollarSign}
            trend="up"
        />
        <MetricCard 
            title="Total ROAS" 
            value={totalRoas.toFixed(2)} 
            subtext="Target: 2.0+"
            icon={TrendingUp}
            trend={totalRoas > 2 ? 'up' : 'down'}
        />
        <MetricCard 
            title="Avg. CTR" 
            value="1.8%" 
            subtext="All Campaigns"
            icon={MousePointer}
            trend="down"
        />
        <MetricCard 
            title="LP Views" 
            value="1,420" 
            subtext="Cost: $1.92"
            icon={Eye}
            trend="up"
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Campaigns Table - Spans 2 cols */}
        <div className="lg:col-span-2 bg-[#1e293b] rounded-xl border border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-semibold text-lg text-white">Active Campaigns</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-800/50 text-slate-400 text-sm uppercase">
                            <th className="p-4 font-medium">Campaign Name</th>
                            <th className="p-4 font-medium">Spend</th>
                            <th className="p-4 font-medium">ROAS</th>
                            <th className="p-4 font-medium">CPA</th>
                            <th className="p-4 font-medium">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {MOCK_CAMPAIGNS.map((campaign) => (
                            <tr key={campaign.id} className="text-sm text-slate-300 hover:bg-slate-800/30 transition-colors">
                                <td className="p-4 font-medium text-white flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${campaign.status === 'ACTIVE' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                                    {campaign.name}
                                </td>
                                <td className="p-4">${campaign.metrics.spend}</td>
                                <td className="p-4 font-bold text-white">
                                    <span className={`${campaign.metrics.roas >= 2 ? 'text-green-400' : 'text-red-400'}`}>
                                        {campaign.metrics.roas.toFixed(2)}x
                                    </span>
                                </td>
                                <td className="p-4">${campaign.metrics.costPerPurchase.toFixed(2)}</td>
                                <td className="p-4">
                                    <button 
                                        onClick={() => handleAnalyze(campaign)}
                                        className="flex items-center gap-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        <BrainCircuit size={14} /> Analyze
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* AI Insight Panel or Chart - Spans 1 col */}
        <div className="lg:col-span-1 space-y-6">
            
            {/* Context Sensitive Panel */}
            {selectedCampaign ? (
                <div className="bg-[#1e293b] rounded-xl border border-indigo-500/50 shadow-lg shadow-indigo-900/20 overflow-hidden h-full">
                    <div className="p-4 bg-indigo-900/20 border-b border-indigo-500/30 flex justify-between items-center">
                        <h3 className="font-semibold text-indigo-300 flex items-center gap-2">
                            <BrainCircuit size={18} />
                            AI Analysis
                        </h3>
                        <button onClick={closeAnalysis} className="text-slate-400 hover:text-white">&times;</button>
                    </div>
                    
                    <div className="p-6">
                        {analyzing ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4 text-indigo-300">
                                <Loader2 size={32} className="animate-spin" />
                                <p className="text-sm animate-pulse">
                                  Analyzing with {settings.selectedModel.split('/')[1] || settings.selectedModel.split('-')[0]}...
                                </p>
                            </div>
                        ) : analysis ? (
                            <div className="space-y-5 animate-fadeIn">
                                <div>
                                    <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Campaign</h4>
                                    <p className="text-white font-medium">{selectedCampaign.name}</p>
                                </div>

                                <div>
                                    <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Summary</h4>
                                    <p className="text-sm text-slate-300 leading-relaxed bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                        {analysis.summary}
                                    </p>
                                </div>

                                <div>
                                    <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Action Plan</h4>
                                    <ul className="space-y-2">
                                        {analysis.actionPlan.map((step, idx) => (
                                            <li key={idx} className="flex gap-3 text-sm text-slate-300">
                                                <span className="flex-shrink-0 w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-xs font-bold border border-indigo-500/30">
                                                    {idx + 1}
                                                </span>
                                                {step}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className={`px-3 py-2 rounded-lg text-center text-xs font-bold uppercase tracking-wider border ${
                                    analysis.sentiment === 'POSITIVE' ? 'bg-green-900/20 border-green-700 text-green-400' : 
                                    analysis.sentiment === 'NEGATIVE' ? 'bg-red-900/20 border-red-700 text-red-400' :
                                    'bg-yellow-900/20 border-yellow-700 text-yellow-400'
                                }`}>
                                    Outlook: {analysis.sentiment}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-6 flex flex-col items-center justify-center h-full text-center min-h-[400px]">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <BrainCircuit size={32} className="text-slate-500" />
                    </div>
                    <h3 className="text-white font-medium mb-2">Select a Campaign</h3>
                    <p className="text-slate-400 text-sm">Click "Analyze" on any campaign to get an AI-powered breakdown and tactical action plan.</p>
                </div>
            )}
        </div>
        
        {/* Performance Chart - Full Width */}
        <div className="lg:col-span-3 bg-[#1e293b] rounded-xl border border-slate-700 p-6">
             <h3 className="font-semibold text-lg text-white mb-6">Aggregate Performance (ROAS)</h3>
             <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={MOCK_CAMPAIGNS[0].history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{fontSize: 12}} />
                        <YAxis stroke="#94a3b8" tick={{fontSize: 12}} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                        />
                        <Line type="monotone" dataKey="roas" stroke="#6366f1" strokeWidth={3} dot={{r: 4, fill: '#6366f1'}} activeDot={{r: 6}} />
                    </LineChart>
                </ResponsiveContainer>
             </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;