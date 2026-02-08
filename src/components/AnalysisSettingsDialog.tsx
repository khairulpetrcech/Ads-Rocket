import React, { useState, useEffect } from 'react';
import { X, Clock, Send, Calendar, Sparkles, ChevronDown, Settings, AlertCircle } from 'lucide-react';
import { useSettings } from '../App';
import { useToast } from '../contexts/ToastContext';

interface AnalysisSettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

interface AnalysisSchedule {
    adAccountId: string;
    scheduleTime: string; // "HH:MM" format (Malaysia time)
    isEnabled: boolean;
}

const STORAGE_KEY = 'ar_analysis_schedule';
const USAGE_KEY = 'ar_analysis_usage';

// Get remaining analyses for today
const getRemainingAnalyses = (businessName: string): number => {
    const isExempt = (businessName || '').toLowerCase().includes('khai');
    if (isExempt) return 999; // Unlimited

    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(USAGE_KEY);

    if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === today) {
            return Math.max(0, 3 - parsed.count);
        }
    }
    return 3;
};

const AnalysisSettingsDialog: React.FC<AnalysisSettingsDialogProps> = ({ isOpen, onClose }) => {
    const { settings } = useSettings();
    const { showToast } = useToast();

    const [selectedAccount, setSelectedAccount] = useState(settings.adAccountId || '');
    const [isScheduleEnabled, setIsScheduleEnabled] = useState(false);

    // Fixed schedule time - Vercel Hobby only supports 1 cron/day at 8AM MYT
    const FIXED_SCHEDULE_TIME = '08:00';
    const [sending, setSending] = useState(false);
    const [testing, setTesting] = useState(false);

    // Get selected account name from available accounts
    const getSelectedAccountName = (): string => {
        if (settings.availableAccounts && settings.availableAccounts.length > 0) {
            const selected = settings.availableAccounts.find((acc: any) => acc.id === selectedAccount);
            return selected?.name || '';
        }
        return settings.businessName || '';
    };

    const selectedAccountName = getSelectedAccountName();
    const isUnlimited = selectedAccountName.toLowerCase().includes('khai');
    const remainingAnalyses = isUnlimited ? 999 : getRemainingAnalyses(selectedAccountName);

    // Load saved settings from Supabase
    useEffect(() => {
        const loadSchedule = async () => {
            // Try localStorage first for immediate display
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const schedule = JSON.parse(saved);
                    setSelectedAccount(schedule.adAccountId || settings.adAccountId || '');
                    setIsScheduleEnabled(schedule.isEnabled || false);
                } catch (e) {
                    console.error('Failed to load local schedule:', e);
                }
            }

            // Then fetch from Supabase for persistent data
            if (settings.userId) {
                try {
                    const res = await fetch(`/api/analyze-telegram?action=get-schedule&fbId=${settings.userId}`);
                    const data = await res.json();
                    if (data.success && data.schedule) {
                        setSelectedAccount(data.schedule.ad_account_id || settings.adAccountId || '');
                        setIsScheduleEnabled(data.schedule.is_enabled || false);
                    }
                } catch (e) {
                    console.error('Failed to load schedule from Supabase:', e);
                }
            }
        };

        if (isOpen) {
            loadSchedule();
        }
    }, [isOpen, settings.adAccountId, settings.userId]);

    // Save schedule settings to both localStorage and Supabase
    const saveSchedule = async () => {
        const schedule: AnalysisSchedule = {
            adAccountId: selectedAccount,
            scheduleTime: FIXED_SCHEDULE_TIME,
            isEnabled: isScheduleEnabled
        };

        // Save to localStorage for quick access
        localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));

        // Save to Supabase for persistence
        try {
            const res = await fetch('/api/analyze-telegram?action=save-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fbId: settings.userId || settings.fbAppId || 'default',
                    adAccountId: selectedAccount,
                    scheduleTime: FIXED_SCHEDULE_TIME,
                    isEnabled: isScheduleEnabled,
                    telegramBotToken: settings.telegramBotToken,
                    telegramChatId: settings.telegramChatId,
                    fbAccessToken: settings.fbAccessToken  // Include for cron job
                })
            });

            const data = await res.json();
            if (data.success) {
                showToast('Tetapan jadual disimpan!', 'success');
            } else {
                showToast('Disimpan locally (server error)', 'error');
            }
        } catch (e) {
            console.error('Failed to save to Supabase:', e);
            showToast('Disimpan locally sahaja', 'success');
        }
    };

    // Handle instant analysis
    const handleInstantAnalysis = async () => {
        if (remainingAnalyses <= 0 && !isUnlimited) {
            showToast('Had 3 analisa sehari dicapai. Cuba lagi esok!', 'error');
            return;
        }

        setSending(true);
        try {
            const response = await fetch('/api/analyze-telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adAccountId: selectedAccount || settings.adAccountId,
                    fbAccessToken: settings.fbAccessToken,
                    telegramChatId: settings.telegramChatId,
                    telegramBotToken: settings.telegramBotToken,
                    dailyUsageCount: 3 - remainingAnalyses,
                    fbName: settings.businessName || ''
                })
            });

            const data = await response.json();

            if (response.status === 429) {
                showToast(data.message || 'Had analisa harian dicapai.', 'error');
                return;
            }

            if (data.success) {
                // Increment daily usage
                const today = new Date().toISOString().split('T')[0];
                const stored = localStorage.getItem(USAGE_KEY);
                let usage = { date: today, count: 1 };

                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed.date === today) {
                        usage.count = parsed.count + 1;
                    }
                }
                localStorage.setItem(USAGE_KEY, JSON.stringify(usage));

                const remaining = isUnlimited ? '∞' : (3 - usage.count);
                showToast(`✅ Analisis dihantar! (${remaining} analisa lagi)`, 'success');
                onClose();
            } else {
                showToast(`Gagal: ${data.error || 'Unknown error'}`, 'error');
            }
        } catch (err: any) {
            showToast(`Error: ${err.message}`, 'error');
        } finally {
            setSending(false);
        }
    };

    // Handle test cron (admin only)
    const handleTestCron = async () => {
        setTesting(true);
        try {
            const response = await fetch('/api/cron-telegram');
            const data = await response.json();

            if (data.success) {
                showToast(`✅ Cron test berjaya! ${data.successful || 0} schedules diproses.`, 'success');
            } else if (data.message) {
                showToast(`ℹ️ ${data.message}`, 'success');
            } else {
                showToast(`❌ Gagal: ${data.error || 'Unknown error'}`, 'error');
            }
        } catch (err: any) {
            showToast(`Error: ${err.message}`, 'error');
        } finally {
            setTesting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scaleIn"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <h2 className="font-bold text-lg">AI Analysis</h2>
                                <p className="text-white/80 text-xs">Tetapan analisis automatik</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-5">

                    {/* Daily Usage Counter */}
                    <div className={`p-4 rounded-xl border ${isUnlimited ? 'bg-purple-50 border-purple-200' : remainingAnalyses > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-600">Analisa hari ini</span>
                            <span className={`text-lg font-bold ${isUnlimited ? 'text-purple-600' : remainingAnalyses > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {isUnlimited ? '∞ Unlimited' : `${remainingAnalyses}/3 lagi`}
                            </span>
                        </div>
                        {!isUnlimited && remainingAnalyses === 0 && (
                            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> Had harian dicapai. Cuba lagi esok!
                            </p>
                        )}
                    </div>

                    {/* Ad Account Selector */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            Ads Manager
                        </label>
                        <div className="relative">
                            <select
                                value={selectedAccount}
                                onChange={(e) => setSelectedAccount(e.target.value)}
                                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-10 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            >
                                {settings.availableAccounts && settings.availableAccounts.length > 0 ? (
                                    settings.availableAccounts.map((acc) => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.name} ({acc.id})
                                        </option>
                                    ))
                                ) : (
                                    <option value={settings.adAccountId}>
                                        {settings.businessName || settings.adAccountId || 'Default Account'}
                                    </option>
                                )}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Schedule Section */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-indigo-600" />
                                <span className="text-sm font-bold text-slate-700">Jadual Harian</span>
                            </div>
                            <button
                                onClick={() => setIsScheduleEnabled(!isScheduleEnabled)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isScheduleEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${isScheduleEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        {isScheduleEnabled && (
                            <div className="mt-3">
                                <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                                    <Clock size={16} className="text-indigo-600" />
                                    <span className="font-semibold text-indigo-700">8:00 AM</span>
                                    <span className="text-xs text-indigo-500">(Waktu Malaysia)</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">
                                    Analisis akan dihantar setiap hari pada 8 pagi.
                                </p>
                            </div>
                        )}
                    </div>

                </div>

                {/* Footer Buttons */}
                <div className="p-5 pt-0 space-y-3">
                    <div className="flex gap-3">
                        <button
                            onClick={saveSchedule}
                            disabled={!isScheduleEnabled}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Settings size={16} />
                            Simpan Jadual
                        </button>
                        <button
                            onClick={handleInstantAnalysis}
                            disabled={sending || (remainingAnalyses <= 0 && !isUnlimited)}
                            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Menghantar...
                                </>
                            ) : (
                                <>
                                    <Send size={16} />
                                    Analisa Sekarang
                                </>
                            )}
                        </button>
                    </div>

                    {/* Test Cron Button - Admin Only */}
                    {isUnlimited && (
                        <button
                            onClick={handleTestCron}
                            disabled={testing}
                            className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                        >
                            {testing ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-amber-400 border-t-amber-800 rounded-full animate-spin" />
                                    Testing Cron...
                                </>
                            ) : (
                                <>
                                    <Clock size={14} />
                                    🧪 Test Cron (Admin)
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnalysisSettingsDialog;
