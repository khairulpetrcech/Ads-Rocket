import React, { useState } from 'react';
import { BarChart2, DollarSign, TrendingUp, Calendar, AlertCircle, ShoppingCart } from 'lucide-react';

const Report: React.FC = () => {
    // Mock data for the UI
    const [mockData] = useState([
        { date: '19/04/2026', spend: 450.20, sales: 1200.00, purchases: 12 },
        { date: '18/04/2026', spend: 380.00, sales: 950.00, purchases: 8 },
        { date: '17/04/2026', spend: 410.50, sales: 1550.00, purchases: 15 },
        { date: '16/04/2026', spend: 390.80, sales: 880.00, purchases: 7 },
        { date: '15/04/2026', spend: 520.00, sales: 2100.00, purchases: 20 },
    ]);

    const totalSpend = mockData.reduce((acc, curr) => acc + curr.spend, 0);
    const totalSales = mockData.reduce((acc, curr) => acc + curr.sales, 0);
    const totalPurchases = mockData.reduce((acc, curr) => acc + curr.purchases, 0);
    const trueRoas = totalSpend > 0 ? (totalSales / totalSpend).toFixed(2) : '0.00';
    const cpa = totalPurchases > 0 ? (totalSpend / totalPurchases).toFixed(2) : '0.00';

    const formatMYR = (amount: number) => {
        return new Intl.NumberFormat('en-MY', {
            style: 'currency',
            currency: 'MYR'
        }).format(amount);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Performance Report</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Combined view of Meta Ads Spend vs Google Sheets Sales
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                        <Calendar size={16} className="text-slate-400" />
                        <span>Last 7 Days</span>
                    </button>
                    <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm cursor-not-allowed opacity-50" title="Coming soon">
                        Sync Sheets Data
                    </button>
                </div>
            </div>

            {/* Google Sheets Integration Banner (Placeholder) */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                <div>
                    <h3 className="text-sm font-bold text-amber-800">Google Sheets Not Connected</h3>
                    <p className="text-sm text-amber-700 mt-0.5 opacity-90">
                        This is a mockup UI. In the future, you will connect your Google Service Account here to fetch actual sales data.
                    </p>
                </div>
            </div>

            {/* True ROAS Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Spend (Meta)</span>
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                            <TrendingUp size={16} className="text-red-500" />
                        </div>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-800">{formatMYR(totalSpend)}</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sales (Sheets)</span>
                        <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                            <DollarSign size={16} className="text-green-600" />
                        </div>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-800">{formatMYR(totalSales)}</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">True ROAS</span>
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                            <BarChart2 size={16} className="text-indigo-600" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-extrabold text-slate-800">{trueRoas}x</div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">True CPA</span>
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                            <ShoppingCart size={16} className="text-blue-500" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-extrabold text-slate-800 mb-0.5">RM {cpa}</div>
                        <div className="text-xs text-slate-400 font-medium tracking-wide">/ PURCHASE</div>
                    </div>
                </div>
            </div>

            {/* Minimalist Data Table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-800">Daily Breakdown</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">Date</th>
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 text-right">Meta Spend</th>
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 text-right">Actual Sales</th>
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 text-right">Purchases</th>
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 text-right">True ROAS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {mockData.map((row, idx) => {
                                const dailyRoas = (row.sales / row.spend).toFixed(2);
                                return (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">
                                            {row.date}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right font-mono">
                                            {formatMYR(row.spend)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium text-right font-mono">
                                            {formatMYR(row.sales)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right font-medium">
                                            {row.purchases}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${parseFloat(dailyRoas) >= 3 ? 'bg-green-100 text-green-700' :
                                                    parseFloat(dailyRoas) >= 1.5 ? 'bg-blue-100 text-blue-700' :
                                                        'bg-slate-100 text-slate-600'
                                                }`}>
                                                {dailyRoas}x
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Report;
