import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../App';
import {
    getAdAccounts,
    getReportDailySpend,
    DailySpendRow,
} from '../services/metaService';
import { MetaAdAccount } from '../types';
import {
    BarChart2, DollarSign, TrendingUp, Calendar,
    ShoppingCart, Loader2, RefreshCw, ChevronDown,
    Link2, Check, X, CheckSquare, Square, ChevronUp
} from 'lucide-react';

const formatMYR = (amount: number) =>
    new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);

const formatDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const DATE_OPTIONS = [
    { label: 'Hari Ini', value: 'today' },
    { label: 'Semalam', value: 'yesterday' },
    { label: '7 Hari', value: 'last_7d' },
    { label: '14 Hari', value: 'last_14d' },
    { label: '30 Hari', value: 'last_30d' },
];

const Report: React.FC = () => {
    const { settings } = useSettings();
    const token = settings.fbAccessToken;

    // ---- State ----
    const [allAccounts, setAllAccounts] = useState<MetaAdAccount[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
    const [selectAll, setSelectAll] = useState(true);
    const [accountPickerOpen, setAccountPickerOpen] = useState(false);

    const [datePreset, setDatePreset] = useState<string>('last_7d');
    const [rows, setRows] = useState<DailySpendRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Google Sheets URL state (saved to localStorage)
    const [sheetsUrl, setSheetsUrl] = useState(() => localStorage.getItem('ar_report_sheets_url') || '');
    const [sheetsInput, setSheetsInput] = useState('');
    const [sheetsEditOpen, setSheetsEditOpen] = useState(false);

    // ---- Load all ad accounts on mount ----
    useEffect(() => {
        if (!token || token === 'dummy_token') return;
        getAdAccounts(token).then(accounts => {
            setAllAccounts(accounts);
            // Default: select all
            setSelectedAccountIds(new Set(accounts.map(a => a.id)));
        }).catch(console.error);
    }, [token]);

    // ---- Fetch live data ----
    const fetchData = useCallback(async () => {
        if (!token || token === 'dummy_token') return;
        const ids = selectAll
            ? allAccounts.map(a => a.id)
            : Array.from(selectedAccountIds);
        if (ids.length === 0) return;

        setLoading(true);
        setError('');
        try {
            const data = await getReportDailySpend(ids, token, datePreset);
            // Enrich with account names
            const nameMap = Object.fromEntries(allAccounts.map(a => [a.id, a.name]));
            data.forEach(r => { r.accountName = nameMap[r.accountId] || r.accountId; });
            setRows(data);
        } catch (e: any) {
            setError('Gagal memuatkan data. Cuba refresh.');
        } finally {
            setLoading(false);
        }
    }, [token, selectAll, selectedAccountIds, allAccounts, datePreset]);

    useEffect(() => {
        if (allAccounts.length > 0) fetchData();
    }, [allAccounts, datePreset, selectAll, selectedAccountIds]);

    // ---- Aggregate stats ----
    // Group by date (sum across accounts)
    const byDate: Record<string, { spend: number; purchases: number }> = {};
    rows.forEach(r => {
        if (!byDate[r.date]) byDate[r.date] = { spend: 0, purchases: 0 };
        byDate[r.date].spend += r.spend;
        byDate[r.date].purchases += r.purchases;
    });
    const dailyRows = Object.entries(byDate)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => b.date.localeCompare(a.date));

    const totalSpend = dailyRows.reduce((s, r) => s + r.spend, 0);
    const totalPurchases = dailyRows.reduce((s, r) => s + r.purchases, 0);
    const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;

    // ---- Account picker helpers ----
    const toggleAccount = (id: string) => {
        setSelectedAccountIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
        setSelectAll(false);
    };

    const handleSelectAll = () => {
        setSelectAll(true);
        setSelectedAccountIds(new Set(allAccounts.map(a => a.id)));
        setAccountPickerOpen(false);
    };

    const saveSheets = () => {
        localStorage.setItem('ar_report_sheets_url', sheetsInput);
        setSheetsUrl(sheetsInput);
        setSheetsEditOpen(false);
    };

    const clearSheets = () => {
        localStorage.removeItem('ar_report_sheets_url');
        setSheetsUrl('');
        setSheetsInput('');
    };

    const activeAccountCount = selectAll ? allAccounts.length : selectedAccountIds.size;

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Performance Report</h1>
                    <p className="text-sm text-slate-400 mt-0.5">Data langsung dari Meta Ads Manager</p>
                </div>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'Memuatkan...' : 'Refresh Data'}
                </button>
            </div>

            {/* ── Control Bar ── */}
            <div className="flex flex-wrap gap-3 items-center">

                {/* Date Picker */}
                <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    {DATE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setDatePreset(opt.value)}
                            className={`px-3 py-2 text-xs font-semibold transition-colors ${datePreset === opt.value
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Ads Manager Picker */}
                <div className="relative">
                    <button
                        onClick={() => setAccountPickerOpen(v => !v)}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
                    >
                        <BarChart2 size={15} className="text-indigo-500" />
                        {selectAll ? 'Semua Ads Manager' : `${activeAccountCount} Ads Manager`}
                        {accountPickerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {accountPickerOpen && (
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                            <div className="p-2 border-b border-slate-100">
                                <button
                                    onClick={handleSelectAll}
                                    className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${selectAll ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <CheckSquare size={15} className="text-indigo-500" />
                                    Semua Ads Manager
                                </button>
                            </div>
                            <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                                {allAccounts.length === 0 && (
                                    <p className="text-xs text-center text-slate-400 py-4">Tiada akaun dijumpai</p>
                                )}
                                {allAccounts.map(acc => {
                                    const isChecked = !selectAll && selectedAccountIds.has(acc.id);
                                    return (
                                        <button
                                            key={acc.id}
                                            onClick={() => toggleAccount(acc.id)}
                                            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors text-left ${isChecked ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                                {isChecked && <Check size={10} className="text-white" />}
                                            </div>
                                            <span className="truncate">{acc.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="p-2 border-t border-slate-100">
                                <button
                                    onClick={() => setAccountPickerOpen(false)}
                                    className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
                                >
                                    Guna Pilihan Ini
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Google Sheets connector */}
                {sheetsUrl ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">
                        <Check size={13} className="text-green-600" />
                        Google Sheet Tersambung
                        <button onClick={clearSheets} className="hover:text-red-500 transition-colors ml-1">
                            <X size={13} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => { setSheetsInput(sheetsUrl); setSheetsEditOpen(true); }}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-dashed border-slate-300 hover:border-green-400 hover:bg-green-50 rounded-lg text-xs font-semibold text-slate-500 hover:text-green-700 transition-all"
                    >
                        <Link2 size={14} />
                        Sambung Google Sheet
                    </button>
                )}
            </div>

            {/* ── Google Sheets Modal ── */}
            {sheetsEditOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-2xl p-6">
                        <h3 className="text-base font-bold text-slate-800 mb-1">Sambung Google Sheet</h3>
                        <p className="text-xs text-slate-400 mb-4">Paste URL Google Sheet yang mengandungi data jualan sebenar anda.</p>
                        <input
                            type="url"
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            value={sheetsInput}
                            onChange={e => setSheetsInput(e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                        />
                        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                            ⚠️ URL ini akan disimpan untuk konfigurasi Google Sheets API pada fasa seterusnya.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setSheetsEditOpen(false)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Batal</button>
                            <button onClick={saveSheets} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">Simpan</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jumlah Spend</span>
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                            <TrendingUp size={15} className="text-red-500" />
                        </div>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-800">
                        {loading ? <span className="text-slate-300 text-lg">—</span> : formatMYR(totalSpend)}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jumlah Purchase</span>
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                            <ShoppingCart size={15} className="text-blue-500" />
                        </div>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-800">
                        {loading ? <span className="text-slate-300 text-lg">—</span> : totalPurchases}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CPA (Cost / Purchase)</span>
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                            <DollarSign size={15} className="text-indigo-600" />
                        </div>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-800">
                        {loading ? <span className="text-slate-300 text-lg">—</span> : (cpa > 0 ? formatMYR(cpa) : '—')}
                    </div>
                </div>
            </div>

            {/* ── Daily Table ── */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-800">Pecahan Harian</h2>
                    {!loading && rows.length > 0 && (
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{activeAccountCount} Ads Manager · {dailyRows.length} hari</span>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
                        <Loader2 size={18} className="animate-spin" />
                        Memuatkan data dari Meta...
                    </div>
                ) : error ? (
                    <div className="text-center py-14 text-sm text-red-500">{error}</div>
                ) : dailyRows.length === 0 ? (
                    <div className="text-center py-14 text-sm text-slate-400">Tiada data untuk tempoh ini.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Tarikh</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Meta Spend</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Purchase</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">CPA</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Jualan Sebenar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dailyRows.map(row => {
                                    const dayCpa = row.purchases > 0 ? row.spend / row.purchases : 0;
                                    return (
                                        <tr key={row.date} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-3.5 text-sm font-medium text-slate-800">{formatDate(row.date)}</td>
                                            <td className="px-6 py-3.5 text-sm font-mono text-slate-700 text-right">{formatMYR(row.spend)}</td>
                                            <td className="px-6 py-3.5 text-sm text-slate-700 text-right font-medium">{row.purchases}</td>
                                            <td className="px-6 py-3.5 text-sm text-right">
                                                {dayCpa > 0
                                                    ? <span className="text-slate-700 font-mono">{formatMYR(dayCpa)}</span>
                                                    : <span className="text-slate-300">—</span>
                                                }
                                            </td>
                                            <td className="px-6 py-3.5 text-sm text-right">
                                                {sheetsUrl
                                                    ? <span className="text-amber-500 text-xs font-medium">Sheets belum aktif</span>
                                                    : <span className="text-slate-300 text-xs">—</span>
                                                }
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Report;
