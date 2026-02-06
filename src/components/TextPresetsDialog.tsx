import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Type, Heading, GripVertical, Loader2, Layout, Trash2, Rocket, Plus, CheckCircle, Cloud } from 'lucide-react';
import { useSettings } from '../App';
import { AdTemplate } from '../types';
import { useToast } from '../contexts/ToastContext';

interface TextPresetsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    currentSettings?: Partial<AdTemplate>;
    onLoadTemplate?: (template: AdTemplate) => void;
}

interface PresetItem {
    name: string;
    text: string;
}

const MAX_PRESETS = 30;
const MIN_PRESETS = 5;

const TextPresetsDialog: React.FC<TextPresetsDialogProps> = ({ isOpen, onClose, currentSettings, onLoadTemplate }) => {
    const { settings, updateSettings } = useSettings();
    const { showToast } = useToast();
    const [primaryPresets, setPrimaryPresets] = useState<PresetItem[]>(Array(MIN_PRESETS).fill(null).map(() => ({ name: '', text: '' })));
    const [headlinePresets, setHeadlinePresets] = useState<PresetItem[]>(Array(MIN_PRESETS).fill(null).map(() => ({ name: '', text: '' })));
    const [adTemplates, setAdTemplates] = useState<AdTemplate[]>(settings.adTemplates || []);
    const [activeTab, setActiveTab] = useState<'TEXT' | 'TEMPLATE'>('TEXT');
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [leftWidth, setLeftWidth] = useState(50);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [showSaveNaming, setShowSaveNaming] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    // Load presets from API on open
    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsAnimating(true);
                });
            });

            // Helper to load presets with a given fbId
            const loadPresetsWithId = (fbId: string) => {
                console.log('[TextPresets] Loading from cloud with fbId:', fbId);
                setLoading(true);
                fetch(`/api/presets-api?fbId=${fbId}`)
                    .then(res => res.json())
                    .then(data => {
                        console.log('[TextPresets] API response:', data);
                        console.log('[TextPresets] primaryTexts:', data.primaryTexts);
                        console.log('[TextPresets] headlines:', data.headlines);

                        if (!data.error) {
                            // Load from cloud data with dynamic length
                            const cloudPrimaryCount = Math.max(MIN_PRESETS, data.primaryTexts?.length || 0);
                            const loadedPrimary: PresetItem[] = [];
                            for (let i = 0; i < cloudPrimaryCount; i++) {
                                loadedPrimary.push({
                                    name: data.primaryTextNames?.[i] || '',
                                    text: data.primaryTexts?.[i] || ''
                                });
                            }
                            // Only update if cloud has actual data
                            const hasCloudPrimaryData = data.primaryTexts?.some((t: string) => t && t.trim() !== '');
                            if (hasCloudPrimaryData) {
                                console.log('[TextPresets] Setting primary presets from cloud:', loadedPrimary.length);
                                setPrimaryPresets(loadedPrimary);
                            } else {
                                console.log('[TextPresets] Cloud primary texts empty, using local');
                            }

                            const cloudHeadlineCount = Math.max(MIN_PRESETS, data.headlines?.length || 0);
                            const loadedHeadlines: PresetItem[] = [];
                            for (let i = 0; i < cloudHeadlineCount; i++) {
                                loadedHeadlines.push({
                                    name: data.headlineNames?.[i] || '',
                                    text: data.headlines?.[i] || ''
                                });
                            }
                            // Only update if cloud has actual data
                            const hasCloudHeadlineData = data.headlines?.some((t: string) => t && t.trim() !== '');
                            if (hasCloudHeadlineData) {
                                console.log('[TextPresets] Setting headline presets from cloud:', loadedHeadlines.length);
                                setHeadlinePresets(loadedHeadlines);
                            } else {
                                console.log('[TextPresets] Cloud headlines empty, using local');
                            }

                            if (data.adTemplates && data.adTemplates.length > 0) {
                                console.log('[TextPresets] Setting ad templates from cloud:', data.adTemplates.length);
                                setAdTemplates(data.adTemplates);
                            } else {
                                // Fallback to local if cloud is empty
                                console.log('[TextPresets] Cloud ad templates empty, using local');
                                if (settings.adTemplates) setAdTemplates(settings.adTemplates);
                            }
                        } else {
                            console.log('[TextPresets] API returned error:', data.error);
                            // Error in data, fallback
                            loadFromLocalSettings();
                        }
                    })
                    .catch(err => {
                        console.error('[TextPresets] Failed to load:', err);
                        loadFromLocalSettings();
                    })
                    .finally(() => setLoading(false));
            };

            // Try to get identifier: userId first, then adAccountId as fallback
            let fbId = settings.userId || settings.adAccountId;
            console.log('[TextPresets] Using identifier:', fbId);
            console.log('[TextPresets] settings.userId:', settings.userId);
            console.log('[TextPresets] settings.adAccountId:', settings.adAccountId);

            if (fbId) {
                loadPresetsWithId(fbId);
            } else {
                // No identifier available, use localStorage only
                console.log('[TextPresets] No identifier available, using local storage');
                loadFromLocalSettings();
            }
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const loadFromLocalSettings = () => {
        const loadedPrimary: PresetItem[] = [];
        const primaryCount = Math.max(MIN_PRESETS, settings.presetPrimaryTexts?.length || 0);
        for (let i = 0; i < primaryCount; i++) {
            loadedPrimary.push({
                name: settings.presetPrimaryTextNames?.[i] || '',
                text: settings.presetPrimaryTexts?.[i] || ''
            });
        }
        setPrimaryPresets(loadedPrimary);

        const loadedHeadlines: PresetItem[] = [];
        const headlineCount = Math.max(MIN_PRESETS, settings.presetHeadlines?.length || 0);
        for (let i = 0; i < headlineCount; i++) {
            loadedHeadlines.push({
                name: settings.presetHeadlineNames?.[i] || '',
                text: settings.presetHeadlines?.[i] || ''
            });
        }
        setHeadlinePresets(loadedHeadlines);

        if (settings.adTemplates) {
            setAdTemplates(settings.adTemplates);
        }
    };

    // Add new preset slot
    const addPrimaryPreset = () => {
        if (primaryPresets.length >= MAX_PRESETS) {
            showToast(`Maksimum ${MAX_PRESETS} presets sahaja.`, 'error');
            return;
        }
        setPrimaryPresets(prev => [...prev, { name: '', text: '' }]);
    };

    const addHeadlinePreset = () => {
        if (headlinePresets.length >= MAX_PRESETS) {
            showToast(`Maksimum ${MAX_PRESETS} presets sahaja.`, 'error');
            return;
        }
        setHeadlinePresets(prev => [...prev, { name: '', text: '' }]);
    };

    // Delete preset slot
    const deletePrimaryPreset = (idx: number) => {
        if (primaryPresets.length <= MIN_PRESETS) {
            // Just clear the content instead of deleting
            const newArr = [...primaryPresets];
            newArr[idx] = { name: '', text: '' };
            setPrimaryPresets(newArr);
            return;
        }
        setPrimaryPresets(prev => prev.filter((_, i) => i !== idx));
    };

    const deleteHeadlinePreset = (idx: number) => {
        if (headlinePresets.length <= MIN_PRESETS) {
            // Just clear the content instead of deleting
            const newArr = [...headlinePresets];
            newArr[idx] = { name: '', text: '' };
            setHeadlinePresets(newArr);
            return;
        }
        setHeadlinePresets(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSave = async () => {
        const presetsData = {
            presetPrimaryTexts: primaryPresets.map(p => p.text),
            presetHeadlines: headlinePresets.map(p => p.text),
            presetPrimaryTextNames: primaryPresets.map(p => p.name),
            presetHeadlineNames: headlinePresets.map(p => p.name),
            adTemplates: adTemplates
        };

        // Always update local settings for cache
        updateSettings(presetsData);

        // Helper to save to cloud
        const saveToCloud = async (fbId: string) => {
            console.log('[TextPresets] Saving to cloud with fbId:', fbId);
            setSaving(true);
            try {
                const res = await fetch('/api/presets-api', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fbId,
                        primaryTexts: presetsData.presetPrimaryTexts,
                        primaryTextNames: presetsData.presetPrimaryTextNames,
                        headlines: presetsData.presetHeadlines,
                        headlineNames: presetsData.presetHeadlineNames,
                        adTemplates: adTemplates
                    })
                });

                if (res.ok) {
                    showToast('Settings disave ke Cloud! ✔️', 'success');
                } else {
                    const errorData = await res.json().catch(() => ({}));
                    console.error('[TextPresets] Cloud save failing:', errorData);
                    showToast(`Gagal save ke Cloud: ${errorData.error || 'Server error'}`, 'error');
                }
            } catch (err) {
                console.error('[TextPresets] Failed to save:', err);
                showToast('Gagal connect ke server.', 'error');
            } finally {
                setSaving(false);
            }
        };

        // Try to get identifier: userId first, then adAccountId as fallback
        let fbId = settings.userId || settings.adAccountId;
        console.log('[TextPresets] Saving with identifier:', fbId);

        if (fbId) {
            await saveToCloud(fbId);
        } else {
            console.log('[TextPresets] No identifier available, saved locally only');
        }

        onClose();
    };

    const handleSaveCurrentAsTemplate = async () => {
        if (!currentSettings || !newTemplateName.trim()) return;

        const newTemplate: AdTemplate = {
            id: Math.random().toString(36).substring(2, 9),
            name: newTemplateName,
            timestamp: new Date().toISOString(),
            campaign: currentSettings.campaign as any,
            adSet: currentSettings.adSet as any,
            ads: currentSettings.ads || [],
            config: currentSettings.config
        };

        const updatedTemplates = [newTemplate, ...adTemplates];
        setAdTemplates(updatedTemplates);
        setNewTemplateName('');
        setShowSaveNaming(false);

        // Auto save to cloud
        updateSettings({ adTemplates: updatedTemplates });
        let fbId = settings.userId || settings.adAccountId;
        if (fbId) {
            try {
                const res = await fetch('/api/presets-api', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fbId,
                        adTemplates: updatedTemplates,
                        // Preserve existing presets
                        primaryTexts: primaryPresets.map(p => p.text),
                        primaryTextNames: primaryPresets.map(p => p.name),
                        headlines: headlinePresets.map(p => p.text),
                        headlineNames: headlinePresets.map(p => p.name)
                    })
                });
                if (res.ok) {
                    showToast('Template disave ke Cloud! ☁️', 'success');
                } else {
                    const errorData = await res.json().catch(() => ({}));
                    console.error('Cloud save failing:', errorData);
                    showToast(`Gagal save ke Cloud: ${errorData.error || 'Server error'}`, 'error');
                }
            } catch (e) {
                console.error('Failed to save template to cloud', e);
                showToast('Gagal connect ke server.', 'error');
            }
        } else {
            showToast('Tiada ID akaun. Sila reconnect FB.', 'error');
        }
    };

    const handleDeleteTemplate = (id: string) => {
        const updated = adTemplates.filter(t => t.id !== id);
        setAdTemplates(updated);
        updateSettings({ adTemplates: updated });

        // Save to cloud if possible
        let fbId = settings.userId || settings.adAccountId;
        if (fbId) {
            fetch('/api/presets-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fbId,
                    adTemplates: updated,
                    primaryTexts: primaryPresets.map(p => p.text),
                    primaryTextNames: primaryPresets.map(p => p.name),
                    headlines: headlinePresets.map(p => p.text),
                    headlineNames: headlinePresets.map(p => p.name)
                })
            }).catch(console.error);
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
        setLeftWidth(Math.max(30, Math.min(70, newWidth)));
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            <div className={`relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform ${isAnimating ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'}`}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{activeTab === 'TEXT' ? 'Text Presets' : 'Ad Templates'}</h2>
                        <p className="text-sm text-slate-500">
                            {activeTab === 'TEXT'
                                ? 'Save commonly used ad copy. Synced to cloud.'
                                : 'Simpan dan guna semula konfigurasi kempen anda.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex h-[70vh]">
                    {/* Left Sidebar Tabs (Yellow boxes from screenshot) */}
                    <div className="w-16 border-r border-slate-100 flex flex-col items-center py-6 gap-6 bg-slate-50/30">
                        <button
                            onClick={() => setActiveTab('TEXT')}
                            title="Text Presets"
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'TEXT' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-400 hover:text-indigo-600 border border-slate-100'}`}
                        >
                            <Type size={20} />
                        </button>
                        <button
                            onClick={() => setActiveTab('TEMPLATE')}
                            title="Ad Templates"
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'TEMPLATE' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-400 hover:text-indigo-600 border border-slate-100'}`}
                        >
                            <Layout size={20} />
                        </button>
                    </div>

                    <div ref={containerRef} className="flex-1 p-6 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="animate-spin text-slate-400 mr-2" size={24} />
                                <span className="text-slate-500">Loading components...</span>
                            </div>
                        ) : activeTab === 'TEXT' ? (
                            <div className="flex relative">
                                {/* Primary Texts Column */}
                                <div style={{ width: `${leftWidth}%` }} className="pr-4 space-y-4 flex-shrink-0">
                                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white py-2 z-10">
                                        <div className="p-1.5 bg-blue-100 rounded text-blue-600">
                                            <Type size={16} />
                                        </div>
                                        <h3 className="font-bold text-slate-700">Primary Text Presets</h3>
                                    </div>
                                    {primaryPresets.map((preset, idx) => (
                                        <div key={`pt-${idx}`} className="group space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors relative">
                                            {/* Delete button */}
                                            <button
                                                onClick={() => deletePrimaryPreset(idx)}
                                                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Padam preset"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            <input
                                                type="text"
                                                value={preset.name}
                                                onChange={(e) => {
                                                    const newArr = [...primaryPresets];
                                                    newArr[idx] = { ...newArr[idx], name: e.target.value };
                                                    setPrimaryPresets(newArr);
                                                }}
                                                placeholder={`Preset #${idx + 1} Name...`}
                                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all pr-8"
                                            />
                                            <textarea
                                                value={preset.text}
                                                onChange={(e) => {
                                                    const newArr = [...primaryPresets];
                                                    newArr[idx] = { ...newArr[idx], text: e.target.value };
                                                    setPrimaryPresets(newArr);
                                                }}
                                                placeholder={`Enter Primary Text content...`}
                                                rows={3}
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all resize-y min-h-[60px]"
                                            />
                                        </div>
                                    ))}
                                    {/* Add Primary Preset Button */}
                                    {primaryPresets.length < MAX_PRESETS && (
                                        <button
                                            onClick={addPrimaryPreset}
                                            className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl text-slate-400 hover:text-blue-600 text-sm font-medium flex items-center justify-center gap-2 transition-all hover:bg-blue-50"
                                        >
                                            <Plus size={16} /> Tambah Preset ({primaryPresets.length}/{MAX_PRESETS})
                                        </button>
                                    )}
                                </div>

                                {/* Resizable Divider */}
                                <div
                                    onMouseDown={handleMouseDown}
                                    className="w-2 flex-shrink-0 flex items-center justify-center cursor-col-resize group hover:bg-blue-50 rounded transition-colors z-20"
                                >
                                    <div className="w-1 h-16 bg-slate-200 group-hover:bg-blue-400 rounded-full transition-colors flex items-center justify-center">
                                        <GripVertical size={10} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>

                                {/* Headlines Column */}
                                <div style={{ width: `${100 - leftWidth}%` }} className="pl-4 space-y-4 flex-shrink-0">
                                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white py-2 z-10">
                                        <div className="p-1.5 bg-purple-100 rounded text-purple-600">
                                            <Heading size={16} />
                                        </div>
                                        <h3 className="font-bold text-slate-700">Headline Presets</h3>
                                    </div>
                                    {headlinePresets.map((preset, idx) => (
                                        <div key={`hl-${idx}`} className="group space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-purple-200 transition-colors relative">
                                            {/* Delete button */}
                                            <button
                                                onClick={() => deleteHeadlinePreset(idx)}
                                                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Padam preset"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            <input
                                                type="text"
                                                value={preset.name}
                                                onChange={(e) => {
                                                    const newArr = [...headlinePresets];
                                                    newArr[idx] = { ...newArr[idx], name: e.target.value };
                                                    setHeadlinePresets(newArr);
                                                }}
                                                placeholder={`Preset #${idx + 1} Name...`}
                                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10 outline-none transition-all pr-8"
                                            />
                                            <input
                                                type="text"
                                                value={preset.text}
                                                onChange={(e) => {
                                                    const newArr = [...headlinePresets];
                                                    newArr[idx] = { ...newArr[idx], text: e.target.value };
                                                    setHeadlinePresets(newArr);
                                                }}
                                                placeholder={`Enter Headline content...`}
                                                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10 outline-none transition-all"
                                            />
                                        </div>
                                    ))}
                                    {/* Add Headline Preset Button */}
                                    {headlinePresets.length < MAX_PRESETS && (
                                        <button
                                            onClick={addHeadlinePreset}
                                            className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-purple-400 rounded-xl text-slate-400 hover:text-purple-600 text-sm font-medium flex items-center justify-center gap-2 transition-all hover:bg-purple-50"
                                        >
                                            <Plus size={16} /> Tambah Preset ({headlinePresets.length}/{MAX_PRESETS})
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Template Management View */}
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h3 className="font-bold text-slate-800">Template Iklan Saya</h3>
                                        <p className="text-xs text-slate-500">Pilih template untuk load setting sedia ada.</p>
                                    </div>
                                    {!showSaveNaming ? (
                                        <button
                                            onClick={() => setShowSaveNaming(true)}
                                            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
                                        >
                                            <Plus size={14} /> Save Current Settings
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 animate-in slide-in-from-right-4">
                                            <input
                                                type="text"
                                                placeholder="Nama Template..."
                                                value={newTemplateName}
                                                onChange={(e) => setNewTemplateName(e.target.value)}
                                                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                                                autoFocus
                                            />
                                            <button
                                                onClick={handleSaveCurrentAsTemplate}
                                                className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                            >
                                                <CheckCircle size={14} />
                                            </button>
                                            <button
                                                onClick={() => setShowSaveNaming(false)}
                                                className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {adTemplates.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                                        <Rocket className="text-slate-300 mb-3" size={40} />
                                        <p className="text-slate-500 text-sm font-medium">Tiada template dijumpai.</p>
                                        <p className="text-slate-400 text-xs">Simpan setting konfigurasi anda sekarang sebagai template.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        {adTemplates.map(template => (
                                            <div key={template.id} className="group p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5 transition-all">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">{template.name}</h4>
                                                        <p className="text-[10px] text-slate-400 uppercase font-semibold">{template.campaign.objective} • {template.adSet.targeting}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteTemplate(template.id)}
                                                        className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                                <div className="space-y-1.5 mb-4">
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                                                        <span className="truncate">Campaign: {template.campaign.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                                                        <span className="truncate">AdSet: {template.adSet.name}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (onLoadTemplate) onLoadTemplate(template);
                                                        onClose();
                                                    }}
                                                    className="w-full py-2 bg-slate-50 group-hover:bg-indigo-600 text-slate-600 group-hover:text-white text-xs font-bold rounded-xl transition-all"
                                                >
                                                    Guna Template
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-black shadow-lg shadow-slate-900/20 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save Presets'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TextPresetsDialog;
