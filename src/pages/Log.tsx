import React, { useState, useEffect } from 'react';
import { useSettings } from '../App';
import { Send, RefreshCw, Check, X, Loader2 } from 'lucide-react';

const Log: React.FC = () => {
    const { settings } = useSettings();
    const [telegramJobs, setTelegramJobs] = useState<any[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(false);

    const fetchTelegramJobs = async () => {
        const fbId = settings.userId || settings.adAccountId;
        if (!fbId) return;
        setLoadingJobs(true);
        try {
            const res = await fetch(`/api/admin-api?action=telegram-jobs&fbId=${fbId}`);
            const data = await res.json();
            setTelegramJobs(data.jobs || []);
        } catch (e) {
            console.error('Failed to fetch telegram jobs:', e);
        } finally {
            setLoadingJobs(false);
        }
    };

    useEffect(() => {
        fetchTelegramJobs();
    }, []);

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                    <Send size={22} className="text-indigo-500" /> Campaign Log
                </h1>
                <button
                    onClick={fetchTelegramJobs}
                    disabled={loadingJobs}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={14} className={loadingJobs ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {telegramJobs.length === 0 && !loadingJobs && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                    <Send size={40} className="text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">Tiada log lagi</p>
                    <p className="text-sm text-slate-400 mt-1">Campaign jobs dari Telegram akan dipaparkan di sini.</p>
                </div>
            )}

            {loadingJobs && telegramJobs.length === 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                    <Loader2 size={32} className="animate-spin text-indigo-500 mx-auto mb-3" />
                    <p className="text-slate-500">Loading...</p>
                </div>
            )}

            {telegramJobs.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200 font-semibold">
                                <th className="p-4">Template / Command</th>
                                <th className="p-4 text-center">Media</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 text-right">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {telegramJobs.map(job => (
                                <tr key={job.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                                    <td className="p-4">
                                        <div className="font-bold text-slate-800">{job.template_name || 'Manual Launch'}</div>
                                        <div className="text-[10px] text-slate-500 italic mt-1 truncate max-w-[300px]" title={job.command_text}>"{job.command_text}"</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${job.media_type === 'video' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {job.media_type}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                            job.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                                                'bg-amber-100 text-amber-700'
                                            }`}>
                                            {job.status === 'COMPLETED' ? <Check size={12} /> : job.status === 'FAILED' ? <X size={12} /> : <Loader2 size={12} className="animate-spin" />}
                                            {job.status}
                                        </span>
                                        {job.error_message && job.status === 'FAILED' && (
                                            <div className="text-[10px] text-red-500 mt-1 max-w-[150px] truncate" title={job.error_message}>{job.error_message}</div>
                                        )}
                                    </td>
                                    <td className="p-4 text-right text-slate-500 text-xs">
                                        {new Date(job.created_at).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default Log;
