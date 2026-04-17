import React, { useState, useEffect, useRef } from 'react';
import { getHourlyPurchaseData, HourlyPurchaseData, getDateRangeParams } from '../services/metaService';
import { ShoppingCart, Loader2 } from 'lucide-react';

interface PurchaseHeatmapProps {
    adAccountId: string;
    accessToken: string;
    datePreset: string | { start: string; end: string };
}

// Format hour label: 0 → "12am", 12 → "12pm", 13 → "1pm" etc.
const formatHour = (h: number): string => {
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
};

// Map purchase count to Tailwind colour class (grey → light blue → dark blue)
const getColor = (count: number, max: number): string => {
    if (count === 0 || max === 0) return 'bg-slate-100 border-slate-200';
    const ratio = count / max;
    if (ratio <= 0.15) return 'bg-blue-100 border-blue-200';
    if (ratio <= 0.35) return 'bg-blue-200 border-blue-300';
    if (ratio <= 0.55) return 'bg-blue-400 border-blue-400';
    if (ratio <= 0.75) return 'bg-blue-600 border-blue-600';
    return 'bg-blue-800 border-blue-800';
};

const getTextColor = (count: number, max: number): string => {
    if (count === 0 || max === 0) return 'text-slate-300';
    const ratio = count / max;
    if (ratio <= 0.35) return 'text-blue-700';
    return 'text-white';
};

const PurchaseHeatmap: React.FC<PurchaseHeatmapProps> = ({ adAccountId, accessToken, datePreset }) => {
    const [data, setData] = useState<HourlyPurchaseData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tooltip, setTooltip] = useState<{ hour: number; count: number; x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Determine label to display for the date range
    const dateLabel = (() => {
        if (typeof datePreset === 'object') return `${datePreset.start} – ${datePreset.end}`;
        const labels: Record<string, string> = {
            today: 'Today',
            yesterday: 'Yesterday',
            last_3d: 'Last 3 Days',
            last_4d: 'Last 4 Days',
            last_7d: 'Last 7 Days',
            maximum: 'All Time',
        };
        return labels[datePreset] || datePreset;
    })();

    useEffect(() => {
        if (!adAccountId || !accessToken || accessToken === 'dummy_token') return;

        const fetchData = async () => {
            setLoading(true);
            setError('');
            try {
                const result = await getHourlyPurchaseData(adAccountId, accessToken, datePreset);
                setData(result);
            } catch (e: any) {
                setError('Gagal memuatkan data jam. Cuba lagi.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [adAccountId, accessToken, JSON.stringify(datePreset)]);

    const HOURS = Array.from({ length: 24 }, (_, i) => i);

    // Peak hours (top 3 hours by purchase count)
    const peakHours = data && data.totalPurchases > 0
        ? [...data.purchases]
            .map((count, hour) => ({ count, hour }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .filter(h => h.count > 0)
        : [];

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" ref={containerRef}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                        <ShoppingCart size={16} className="text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">Hourly Purchase Heatmap</h3>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{dateLabel}</p>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>Tiada</span>
                    <div className="flex gap-0.5">
                        <div className="w-4 h-4 rounded bg-slate-100 border border-slate-200" />
                        <div className="w-4 h-4 rounded bg-blue-100 border border-blue-200" />
                        <div className="w-4 h-4 rounded bg-blue-300 border border-blue-300" />
                        <div className="w-4 h-4 rounded bg-blue-500 border border-blue-500" />
                        <div className="w-4 h-4 rounded bg-blue-800 border border-blue-800" />
                    </div>
                    <span>Banyak</span>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-28 gap-2 text-slate-400 text-xs">
                    <Loader2 size={16} className="animate-spin" />
                    Memuatkan data jam...
                </div>
            ) : error ? (
                <div className="flex items-center justify-center h-28 text-slate-400 text-xs">
                    {error}
                </div>
            ) : (
                <>
                    {/* Heatmap Grid */}
                    <div className="relative">
                        {/* Tooltip */}
                        {tooltip && (
                            <div
                                className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full"
                                style={{ left: tooltip.x, top: tooltip.y - 8 }}
                            >
                                <div className="bg-slate-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap">
                                    <div className="font-bold">{formatHour(tooltip.hour)}</div>
                                    <div className="text-slate-300">{tooltip.count} purchase{tooltip.count !== 1 ? 's' : ''}</div>
                                </div>
                                <div className="w-2 h-2 bg-slate-800 rotate-45 mx-auto -mt-1" />
                            </div>
                        )}

                        {/* Hour cells */}
                        <div className="grid grid-cols-12 gap-1 mb-1">
                            {HOURS.slice(0, 12).map(hour => {
                                const count = data?.purchases[hour] ?? 0;
                                const max = data?.maxPurchases ?? 0;
                                return (
                                    <div
                                        key={hour}
                                        className={`relative h-12 rounded-lg border cursor-default transition-all hover:scale-110 hover:z-10 hover:shadow-md flex items-center justify-center ${getColor(count, max)}`}
                                        onMouseEnter={(e) => {
                                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                                            const parentRect = containerRef.current?.getBoundingClientRect();
                                            if (parentRect) {
                                                setTooltip({
                                                    hour,
                                                    count,
                                                    x: rect.left - parentRect.left + rect.width / 2,
                                                    y: rect.top - parentRect.top,
                                                });
                                            }
                                        }}
                                        onMouseLeave={() => setTooltip(null)}
                                    >
                                        {count > 0 && (
                                            <span className={`text-[11px] font-bold ${getTextColor(count, max)}`}>
                                                {count}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="grid grid-cols-12 gap-1 mb-1">
                            {HOURS.slice(12, 24).map(hour => {
                                const count = data?.purchases[hour] ?? 0;
                                const max = data?.maxPurchases ?? 0;
                                return (
                                    <div
                                        key={hour}
                                        className={`relative h-12 rounded-lg border cursor-default transition-all hover:scale-110 hover:z-10 hover:shadow-md flex items-center justify-center ${getColor(count, max)}`}
                                        onMouseEnter={(e) => {
                                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                                            const parentRect = containerRef.current?.getBoundingClientRect();
                                            if (parentRect) {
                                                setTooltip({
                                                    hour,
                                                    count,
                                                    x: rect.left - parentRect.left + rect.width / 2,
                                                    y: rect.top - parentRect.top,
                                                });
                                            }
                                        }}
                                        onMouseLeave={() => setTooltip(null)}
                                    >
                                        {count > 0 && (
                                            <span className={`text-[11px] font-bold ${getTextColor(count, max)}`}>
                                                {count}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Hour labels — 2 rows */}
                        <div className="grid grid-cols-12 gap-1 mb-0.5">
                            {HOURS.slice(0, 12).map(h => (
                                <div key={h} className="text-center text-[9px] text-slate-400 font-medium truncate">
                                    {formatHour(h)}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-12 gap-1">
                            {HOURS.slice(12, 24).map(h => (
                                <div key={h} className="text-center text-[9px] text-slate-400 font-medium truncate">
                                    {formatHour(h)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Summary row */}
                    {data && data.totalPurchases > 0 ? (
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-6 flex-wrap">
                            <div>
                                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Total Purchases</div>
                                <div className="text-lg font-extrabold text-slate-800">{data.totalPurchases}</div>
                            </div>
                            {peakHours.length > 0 && (
                                <div>
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Peak Hours</div>
                                    <div className="flex gap-2">
                                        {peakHours.map(({ hour, count }, i) => (
                                            <div key={hour} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${i === 0 ? 'bg-blue-800 text-white' : i === 1 ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                                {formatHour(hour)}
                                                <span className="opacity-75">({count})</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="ml-auto text-[10px] text-slate-400 italic">
                                Data mengikut Advertiser Time Zone
                            </div>
                        </div>
                    ) : !loading && data && data.totalPurchases === 0 ? (
                        <div className="mt-4 pt-3 border-t border-slate-100 text-center text-xs text-slate-400">
                            Tiada rekod purchase untuk tempoh ini.
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
};

export default PurchaseHeatmap;
