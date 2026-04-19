import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    Link2, Check, X, ChevronLeft, ChevronRight, ChevronUp
} from 'lucide-react';

const formatMYR = (amount: number) =>
    new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);

const formatDisplayDate = (d: string) => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ── Reusable CalendarPicker (same as Dashboard) ──────────────────────────────
interface CalendarPickerProps {
    startDate: string;
    endDate: string;
    onChange: (start: string, end: string) => void;
    onClose: () => void;
}

const CalendarPicker: React.FC<CalendarPickerProps> = ({ startDate, endDate, onChange, onClose }) => {
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
        const clicked = new Date(year, month, day);
        const y = clicked.getFullYear();
        const m = String(clicked.getMonth() + 1).padStart(2, '0');
        const d = String(clicked.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        if (!tempStart || (tempStart && tempEnd)) {
            setTempStart(dateStr); setTempEnd('');
        } else {
            if (new Date(dateStr) < new Date(tempStart)) {
                setTempEnd(tempStart); setTempStart(dateStr);
            } else { setTempEnd(dateStr); }
        }
    };

    const fmt = (day: number) => {
        const d = new Date(year, month, day);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const isSelected = (day: number) => { const s = fmt(day); return s === tempStart || s === tempEnd; };
    const isInRange = (day: number) => {
        if (!tempStart || !tempEnd) return false;
        const d = new Date(year, month, day);
        return d > new Date(tempStart) && d < new Date(tempEnd);
    };
    const apply = () => {
        if (tempStart && tempEnd) { onChange(tempStart, tempEnd); onClose(); }
        else if (tempStart) { onChange(tempStart, tempStart); onClose(); }
    };

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
        <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50 w-72">
            <div className="flex justify-between items-center mb-4">
                <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded"><ChevronLeft size={16} /></button>
                <span className="font-bold text-slate-700 text-sm">{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] font-bold text-slate-400 uppercase">
                <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-sm mb-4">
                {blanks.map(x => <div key={`b-${x}`} />)}
                {days.map(d => (
                    <div key={d} onClick={() => handleDayClick(d)}
                        className={`h-8 flex items-center justify-center rounded-full cursor-pointer text-xs font-medium transition-colors
                        ${isSelected(d) ? 'bg-indigo-600 text-white' : isInRange(d) ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-100 text-slate-700'}`}>
                        {d}
                    </div>
                ))}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2">Batal</button>
                <button onClick={apply} disabled={!tempStart} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50">Guna</button>
            </div>
        </div>
    );
};

// ── Date preset options ───────────────────────────────────────────────────────
const DATE_PRESETS = [
    { label: 'Hari Ini', value: 'today' },
    { label: 'Semalam', value: 'yesterday' },
    { label: '7 Hari', value: 'last_7d' },
    { label: '14 Hari', value: 'last_14d' },
    { label: '30 Hari', value: 'last_30d' },
    { label: 'Kalendar...', value: 'custom' },
];

// ── Main Report Component ─────────────────────────────────────────────────────
const Report: React.FC = () => {
    const { settings } = useSettings();
    const token = settings.fbAccessToken;

    // Accounts
    const [allAccounts, setAllAccounts] = useState<MetaAdAccount[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [accountPickerOpen, setAccountPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // Date
    const [datePreset, setDatePreset] = useState<string>('last_7d');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [calendarOpen, setCalendarOpen] = useState(false);

    // Data
    const [rows, setRows] = useState<DailySpendRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Sheets
    const [sheetsUrl, setSheetsUrl] = useState(() => localStorage.getItem('ar_report_sheets_url') || '');
    const [sheetsInput, setSheetsInput] = useState('');
    const [sheetsEditOpen, setSheetsEditOpen] = useState(false);

    // ── Close picker on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setAccountPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Load all ad accounts
    useEffect(() => {
        if (!token || token === 'dummy_token') return;
        getAdAccounts(token).then(accounts => {
            setAllAccounts(accounts);
            setSelectedIds(new Set(accounts.map(a => a.id))); // default: all ticked
        }).catch(console.error);
    }, [token]);

    // ── Derived: are all selected?
    const allSelected = allAccounts.length > 0 && selectedIds.size === allAccounts.length;
    const noneSelected = selectedIds.size === 0;

    // ── Toggle "Semua Ads Manager"
    const handleToggleAll = () => {
        if (allSelected) {
            setSelectedIds(new Set()); // untick all
        } else {
            setSelectedIds(new Set(allAccounts.map(a => a.id))); // tick all
        }
    };

    // ── Toggle single account
    const handleToggleOne = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // ── Effective date param
    const effectiveDatePreset = datePreset === 'custom' && customStart && customEnd
        ? { start: customStart, end: customEnd }
        : datePreset;

    // ── Fetch live data
    const fetchData = useCallback(async () => {
        if (!token || token === 'dummy_token') return;
        const ids = Array.from(selectedIds);
        if (ids.length === 0) { setRows([]); return; }

        setLoading(true);
        setError('');
        try {
            const data = await getReportDailySpend(ids, token, effectiveDatePreset);
            const nameMap = Object.fromEntries(allAccounts.map(a => [a.id, a.name]));
            data.forEach(r => { r.accountName = nameMap[r.accountId] || r.accountId; });
            setRows(data);
        } catch (e: any) {
            setError('Gagal memuatkan data. Cuba refresh.');
        } finally {
            setLoading(false);
        }
    }, [token, selectedIds, allAccounts, effectiveDatePreset]);

    useEffect(() => {
        if (allAccounts.length > 0 && selectedIds.size > 0) fetchData();
    }, [allAccounts, datePreset, customStart, customEnd, selectedIds]);

    // ── Aggregate by date (sum across accounts)
    const byDate: Record<string, { spend: number; purchases: number; purchaseValue: number }> = {};
    rows.forEach(r => {
        if (!byDate[r.date]) byDate[r.date] = { spend: 0, purchases: 0, purchaseValue: 0 };
        byDate[r.date].spend += r.spend;
        byDate[r.date].purchases += r.purchases;
        byDate[r.date].purchaseValue += r.purchaseValue;
    });
    const dailyRows = Object.entries(byDate)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => b.date.localeCompare(a.date));

    const totalSpend = dailyRows.reduce((s, r) => s + r.spend, 0);
    const totalPurchases = dailyRows.reduce((s, r) => s + r.purchases, 0);
    const totalPurchaseValue = dailyRows.reduce((s, r) => s + r.purchaseValue, 0);
    const totalRoas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
    const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;

    // ── Label for account button
    const accountLabel = allSelected
        ? 'Semua Ads Manager'
        : noneSelected
            ? 'Tiada dipilih'
            : `${selectedIds.size} Ads Manager`;

    // ── Label for date button
    const dateLabel = datePreset === 'custom' && customStart && customEnd
        ? `${formatDisplayDate(customStart)} – ${formatDisplayDate(customEnd)}`
        : DATE_PRESETS.find(d => d.value === datePreset)?.label || datePreset;

    const saveSheets = () => {
        localStorage.setItem('ar_report_sheets_url', sheetsInput);
        setSheetsUrl(sheetsInput);
        setSheetsEditOpen(false);
    };
    const clearSheets = () => {
        localStorage.removeItem('ar_report_sheets_url');
        setSheetsUrl(''); setSheetsInput('');
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Performance Report</h1>
                    <p className="text-sm text-slate-400 mt-0.5">Data langsung dari Meta Ads Manager</p>
                </div>
                <button onClick={fetchData} disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all shadow-sm">
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'Memuatkan...' : 'Refresh Data'}
                </button>
            </div>

            {/* ── Control Bar ── */}
            <div className="flex flex-wrap gap-3 items-center">

                {/* Date selector */}
                <div className="relative">
                    <div className="flex bg-white border border-slate-200 rounded-lg overflow-visible shadow-sm">
                        {DATE_PRESETS.map(opt => (
                            <button key={opt.value}
                                onClick={() => {
                                    if (opt.value === 'custom') {
                                        setDatePreset('custom');
                                        setCalendarOpen(true);
                                    } else {
                                        setDatePreset(opt.value);
                                        setCalendarOpen(false);
                                    }
                                }}
                                className={`px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1
                                    ${datePreset === opt.value
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-500 hover:bg-slate-50'}`}>
                                {opt.value === 'custom' && <Calendar size={12} />}
                                {opt.value === 'custom' && customStart && customEnd && datePreset === 'custom'
                                    ? `${formatDisplayDate(customStart)} – ${formatDisplayDate(customEnd)}`
                                    : opt.label}
                            </button>
                        ))}
                    </div>
                    {calendarOpen && (
                        <CalendarPicker
                            startDate={customStart}
                            endDate={customEnd}
                            onChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
                            onClose={() => setCalendarOpen(false)}
                        />
                    )}
                </div>

                {/* Ads Manager Picker */}
                <div className="relative" ref={pickerRef}>
                    <button
                        onClick={() => setAccountPickerOpen(v => !v)}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
                        <BarChart2 size={15} className="text-indigo-500" />
                        {accountLabel}
                        {accountPickerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {accountPickerOpen && (
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                            {/* "Semua Ads Manager" toggle */}
                            <div className="p-2 border-b border-slate-100">
                                <button
                                    onClick={handleToggleAll}
                                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-slate-50">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors
                                        ${allSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                        {allSelected && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className={allSelected ? 'text-indigo-700' : 'text-slate-600'}>
                                        Semua Ads Manager
                                    </span>
                                </button>
                            </div>

                            {/* Individual accounts */}
                            <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                                {allAccounts.length === 0 && (
                                    <p className="text-xs text-center text-slate-400 py-4">Tiada akaun dijumpai</p>
                                )}
                                {allAccounts.map(acc => {
                                    const isChecked = selectedIds.has(acc.id);
                                    return (
                                        <button key={acc.id} onClick={() => handleToggleOne(acc.id)}
                                            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors text-left
                                                ${isChecked ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors
                                                ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                                {isChecked && <Check size={10} className="text-white" />}
                                            </div>
                                            <span className="truncate">{acc.name}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="p-2 border-t border-slate-100">
                                <button onClick={() => setAccountPickerOpen(false)}
                                    className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors">
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
                        <button onClick={clearSheets} className="hover:text-red-500 transition-colors ml-1"><X size={13} /></button>
                    </div>
                ) : (
                    <button onClick={() => { setSheetsInput(sheetsUrl); setSheetsEditOpen(true); }}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-dashed border-slate-300 hover:border-green-400 hover:bg-green-50 rounded-lg text-xs font-semibold text-slate-500 hover:text-green-700 transition-all">
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
                        <input type="url" placeholder="https://docs.google.com/spreadsheets/d/..."
                            value={sheetsInput} onChange={e => setSheetsInput(e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 mb-4" />
                        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                            ⚠️ URL ini akan digunakan untuk konfigurasi Google Sheets API pada fasa seterusnya.
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
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><TrendingUp size={15} className="text-red-500" /></div>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-800">{loading ? <span className="text-slate-300">—</span> : formatMYR(totalSpend)}</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ROAS (Meta)</span>
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center"><BarChart2 size={15} className="text-blue-500" /></div>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-800">
                        {loading ? <span className="text-slate-300">—</span> : totalRoas > 0 ? `${totalRoas.toFixed(2)}x` : '—'}
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CPA (Cost / Purchase)</span>
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center"><DollarSign size={15} className="text-indigo-600" /></div>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-800">{loading ? <span className="text-slate-300">—</span> : (cpa > 0 ? formatMYR(cpa) : '—')}</div>
                </div>
            </div>

            {/* ── Daily Table ── */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-800">Pecahan Harian</h2>
                    {!loading && rows.length > 0 && (
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{selectedIds.size} Ads Manager · {dailyRows.length} hari</span>
                    )}
                </div>
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
                        <Loader2 size={18} className="animate-spin" />Memuatkan data dari Meta...
                    </div>
                ) : error ? (
                    <div className="text-center py-14 text-sm text-red-500">{error}</div>
                ) : noneSelected ? (
                    <div className="text-center py-14 text-sm text-slate-400">Pilih sekurang-kurangnya 1 Ads Manager.</div>
                ) : dailyRows.length === 0 ? (
                    <div className="text-center py-14 text-sm text-slate-400">Tiada data untuk tempoh ini.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50/60 border-b border-slate-100">
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Tarikh</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Meta Spend</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">ROAS</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">CPA</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Jualan Sebenar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dailyRows.map(row => {
                                    const dayCpa = row.purchases > 0 ? row.spend / row.purchases : 0;
                                    return (
                                        <tr key={row.date} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-3.5 text-sm font-medium text-slate-800">{formatDisplayDate(row.date)}</td>
                                            <td className="px-6 py-3.5 text-sm font-mono text-slate-700 text-right">{formatMYR(row.spend)}</td>
                                            <td className="px-6 py-3.5 text-sm text-right font-medium">
                                                {row.spend > 0 && row.purchaseValue > 0
                                                    ? <span className={(row.purchaseValue / row.spend) >= 3 ? 'text-green-600 font-bold' : (row.purchaseValue / row.spend) >= 1.5 ? 'text-blue-600' : 'text-slate-600'}>
                                                        {(row.purchaseValue / row.spend).toFixed(2)}x
                                                      </span>
                                                    : <span className="text-slate-300">—</span>
                                                }
                                            </td>
                                            <td className="px-6 py-3.5 text-sm text-right">
                                                {dayCpa > 0 ? <span className="text-slate-700 font-mono">{formatMYR(dayCpa)}</span> : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-3.5 text-sm text-right">
                                                {sheetsUrl
                                                    ? <span className="text-amber-500 text-xs font-medium">Sheets belum aktif</span>
                                                    : <span className="text-slate-300 text-xs">—</span>}
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
