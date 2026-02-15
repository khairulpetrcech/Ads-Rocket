
import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../App';
import { useToast } from '../contexts/ToastContext';
import {
    getRealCampaigns,
    getAdSets,
    createMetaCampaign,
    createMetaAdSet,
    createMetaAd,
    uploadAdImage,
    uploadAdVideo,
    createMetaCreative,
    getPages,
    getPixels,
    extractVideoThumbnail,
    uploadAdImageBlob
} from '../services/metaService';
import { CheckCircle, Loader2, Upload, AlertTriangle, Save, FolderOpen, Trash2, ChevronDown, ChevronUp, Video, Image as ImageIcon, Sparkles, Zap, Copy, Plus, X } from 'lucide-react';
import { AdvantagePlusConfig } from '../types';

interface Template {
    id: string;
    name: string;
    data: any;
}

// Interface for individual ad data
interface AdData {
    id: string;
    adName: string;
    primaryText: string;
    headline: string;
    description: string;
    destinationUrl: string;
    callToAction: string;
    mediaFile: File | null;
    mediaType: 'image' | 'video';
    filePreview: string | null;
    advPlusConfig: AdvantagePlusConfig;
}

// Interface for adset with multiple ads
interface AdSetData {
    id: string;
    name: string;
    dailyBudget: number;
    optimizationGoal: string;
    selectedPixelId: string;
    ads: AdData[];
    isExpanded: boolean;
}

// ============================================================
// INPUT COMPONENTS
// ============================================================
const InputField = ({ label, value, onChange, placeholder, type = 'text', required = false }: any) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-400"
        />
    </div>
);

const SelectField = ({ label, value, onChange, options, required = false }: any) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all appearance-none cursor-pointer"
        >
            {options.map((opt: any) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </div>
);

const TextAreaField = ({ label, value, onChange, placeholder, rows = 3 }: any) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            style={{ willChange: 'height' }}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none resize-y min-h-[80px] placeholder:text-slate-400"
        />
    </div>
);

const ToggleSwitch = ({ checked, onChange, label, subtext }: { checked: boolean, onChange: (val: boolean) => void, label: string, subtext?: string }) => (
    <div className="flex items-center justify-between py-2 group">
        <div className="flex flex-col">
            <span className={`text-sm font-medium transition-colors ${checked ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
            {subtext && <span className="text-[10px] text-slate-400">{subtext}</span>}
        </div>
        <button
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}
        >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);

// ============================================================
// MAIN COMPONENT
// ============================================================
const CreateCampaign: React.FC = () => {
    const { settings, globalProcess, setGlobalProcess } = useSettings();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    const [templates, setTemplates] = useState<Template[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);
    const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [existingCampaigns, setExistingCampaigns] = useState<any[]>([]);
    const [existingAdSetsFromMeta, setExistingAdSetsFromMeta] = useState<any[]>([]);
    const [userPages, setUserPages] = useState<any[]>([]);
    const [userPixels, setUserPixels] = useState<any[]>([]);

    const [campaignMode, setCampaignMode] = useState<'new' | 'existing'>('new');
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    const [newCampaignName, setNewCampaignName] = useState('');
    const [objective, setObjective] = useState('OUTCOME_TRAFFIC');

    // For existing adset mode
    const [adSetMode, setAdSetMode] = useState<'new' | 'existing'>('new');
    const [selectedAdSetId, setSelectedAdSetId] = useState('');

    const [selectedPageId, setSelectedPageId] = useState('');

    const lastPublishTime = useRef<number>(0);

    // Helper to create a default ad
    const createDefaultAd = (): AdData => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        adName: '',
        primaryText: '',
        headline: '',
        description: '',
        destinationUrl: '',
        callToAction: 'LEARN_MORE',
        mediaFile: null,
        mediaType: 'image',
        filePreview: null,
        advPlusConfig: {
            enabled: false,
            visualTouchups: false,
            textOptimizations: false,
            mediaCropping: false,
            music: false
        }
    });

    // Helper to create a default adset
    const createDefaultAdSet = (): AdSetData => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: '',
        dailyBudget: 50,
        optimizationGoal: 'LINK_CLICKS',
        selectedPixelId: '',
        ads: [createDefaultAd()],
        isExpanded: true
    });

    // State for multiple adsets (each with multiple ads)
    const [adSets, setAdSets] = useState<AdSetData[]>([createDefaultAdSet()]);

    // ============================================================
    // ADSET & AD MANAGEMENT FUNCTIONS
    // ============================================================
    const addAdSet = () => {
        setAdSets([...adSets, createDefaultAdSet()]);
    };

    const duplicateAdSet = (adSetId: string) => {
        const adSetToDuplicate = adSets.find(a => a.id === adSetId);
        if (!adSetToDuplicate) return;

        const duplicatedAds = adSetToDuplicate.ads.map(ad => ({
            ...ad,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            adName: ad.adName ? `${ad.adName} (Copy)` : ''
        }));

        const duplicatedAdSet: AdSetData = {
            ...adSetToDuplicate,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: adSetToDuplicate.name ? `${adSetToDuplicate.name} (Copy)` : '',
            ads: duplicatedAds,
            isExpanded: true
        };

        const index = adSets.findIndex(a => a.id === adSetId);
        const newAdSets = [...adSets];
        newAdSets.splice(index + 1, 0, duplicatedAdSet);
        setAdSets(newAdSets);
    };

    const removeAdSet = (adSetId: string) => {
        if (adSets.length <= 1) return;
        setAdSets(adSets.filter(a => a.id !== adSetId));
    };

    const updateAdSet = (adSetId: string, updates: Partial<AdSetData>) => {
        setAdSets(adSets.map(a => a.id === adSetId ? { ...a, ...updates } : a));
    };

    const toggleAdSetExpanded = (adSetId: string) => {
        setAdSets(adSets.map(a => a.id === adSetId ? { ...a, isExpanded: !a.isExpanded } : a));
    };

    const addAd = (adSetId: string) => {
        setAdSets(adSets.map(a =>
            a.id === adSetId ? { ...a, ads: [...a.ads, createDefaultAd()] } : a
        ));
    };

    const duplicateAd = (adSetId: string, adId: string) => {
        setAdSets(adSets.map(adSet => {
            if (adSet.id !== adSetId) return adSet;

            const adToDuplicate = adSet.ads.find(ad => ad.id === adId);
            if (!adToDuplicate) return adSet;

            const duplicatedAd: AdData = {
                ...adToDuplicate,
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                adName: adToDuplicate.adName ? `${adToDuplicate.adName} (Copy)` : ''
            };

            const index = adSet.ads.findIndex(ad => ad.id === adId);
            const newAds = [...adSet.ads];
            newAds.splice(index + 1, 0, duplicatedAd);

            return { ...adSet, ads: newAds };
        }));
    };

    const removeAd = (adSetId: string, adId: string) => {
        setAdSets(adSets.map(adSet => {
            if (adSet.id !== adSetId) return adSet;
            if (adSet.ads.length <= 1) return adSet;
            return { ...adSet, ads: adSet.ads.filter(ad => ad.id !== adId) };
        }));
    };

    const updateAd = (adSetId: string, adId: string, updates: Partial<AdData>) => {
        setAdSets(adSets.map(adSet => {
            if (adSet.id !== adSetId) return adSet;
            return {
                ...adSet,
                ads: adSet.ads.map(ad => ad.id === adId ? { ...ad, ...updates } : ad)
            };
        }));
    };

    const handleFileChange = (adSetId: string, adId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            let mediaType: 'image' | 'video' = 'image';
            if (file.type.startsWith('video/') || file.name.endsWith('.avi')) {
                mediaType = 'video';
            }
            let filePreview: string | null = null;
            if (!file.name.toLowerCase().endsWith('.heic') && !file.name.toLowerCase().endsWith('.avi')) {
                filePreview = URL.createObjectURL(file);
            }
            updateAd(adSetId, adId, { mediaFile: file, mediaType, filePreview });
        }
    };

    // ============================================================
    // EFFECTS
    // ============================================================
    useEffect(() => {
        if (globalProcess.type === 'CAMPAIGN_CREATION' && globalProcess.active) {
            setLoading(true);
        } else if (globalProcess.type === 'NONE' && loading) {
            setLoading(false);
        }
    }, [globalProcess]);

    useEffect(() => {
        if (!settings.adAccountId || !settings.fbAccessToken) return;
        const saved = localStorage.getItem('ar_templates');
        if (saved) setTemplates(JSON.parse(saved));
        const loadData = async () => {
            try {
                const campaigns = await getRealCampaigns(settings.adAccountId, settings.fbAccessToken);
                setExistingCampaigns(campaigns);
            } catch (e) { console.error(e); }
            try {
                if (settings.fbAccessToken !== 'dummy_token') {
                    const pages = await getPages(settings.fbAccessToken);
                    setUserPages(pages);
                    if (pages.length > 0) setSelectedPageId(pages[0].id);
                    const pixels = await getPixels(settings.adAccountId, settings.fbAccessToken);
                    setUserPixels(pixels);
                }
            } catch (e) { console.error(e); }
        };
        loadData();
    }, [settings.adAccountId, settings.fbAccessToken]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowTemplatesDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        // Update optimization goal for all adsets when objective changes
        if (objective === 'OUTCOME_SALES') {
            setAdSets(adSets.map(a => ({ ...a, optimizationGoal: 'OFFSITE_CONVERSIONS' })));
        } else if (objective === 'OUTCOME_TRAFFIC') {
            setAdSets(adSets.map(a => ({ ...a, optimizationGoal: 'LINK_CLICKS' })));
        }
    }, [objective]);

    useEffect(() => {
        if (selectedCampaignId && campaignMode === 'existing') {
            const loadAdSets = async () => {
                try {
                    const adsets = await getAdSets(selectedCampaignId, settings.fbAccessToken);
                    setExistingAdSetsFromMeta(adsets);
                } catch (e) { console.error(e); }
            };
            loadAdSets();
        }
    }, [selectedCampaignId, campaignMode, settings.fbAccessToken]);

    // ============================================================
    // TEMPLATE HANDLERS
    // ============================================================
    const handleSaveTemplate = () => {
        if (!templateName) { showToast("Enter a template name", 'error'); return; }
        let finalName = templateName;
        let counter = 1;
        while (templates.some(t => t.name === finalName)) {
            finalName = `${templateName} (${counter})`;
            counter++;
        }
        const newTemplate: Template = {
            id: Date.now().toString(),
            name: finalName,
            data: {
                campaignMode, newCampaignName, objective,
                adSetMode, selectedPageId, adSets
            }
        };
        const updated = [...templates, newTemplate];
        setTemplates(updated);
        localStorage.setItem('ar_templates', JSON.stringify(updated));
        setShowSaveTemplate(false);
        setTemplateName('');
    };

    const handleLoadTemplate = (t: Template) => {
        const d = t.data;
        if (d.campaignMode) setCampaignMode(d.campaignMode);
        if (d.newCampaignName) setNewCampaignName(d.newCampaignName);
        if (d.objective) setObjective(d.objective);
        if (d.adSetMode) setAdSetMode(d.adSetMode);
        if (d.selectedPageId) setSelectedPageId(d.selectedPageId);
        if (d.adSets && Array.isArray(d.adSets)) {
            // Note: mediaFile won't be restored from localStorage
            setAdSets(d.adSets.map((a: any) => ({
                ...a,
                ads: a.ads?.map((ad: any) => ({ ...ad, mediaFile: null, filePreview: null })) || [createDefaultAd()]
            })));
        }
        setShowTemplatesDropdown(false);
    };

    const deleteTemplate = (id: string, e: any) => {
        e.stopPropagation();
        const updated = templates.filter(t => t.id !== id);
        setTemplates(updated);
        localStorage.setItem('ar_templates', JSON.stringify(updated));
    };

    // ============================================================
    // VALIDATION & SUBMIT
    // ============================================================
    const validateForm = (): boolean => {
        if (campaignMode === 'new' && !newCampaignName) { showToast('Enter campaign name', 'error'); return false; }
        if (campaignMode === 'existing' && !selectedCampaignId) { showToast('Select a campaign', 'error'); return false; }

        if (adSetMode === 'new') {
            for (const adSet of adSets) {
                if (!adSet.name) { showToast('Enter Ad Set name for all Ad Sets', 'error'); return false; }
                for (const ad of adSet.ads) {
                    if (!ad.mediaFile) { showToast('Upload media for all ads', 'error'); return false; }
                    if (!ad.adName) { showToast('Enter Ad name for all ads', 'error'); return false; }
                    if (!ad.primaryText) { showToast('Enter Primary Text for all ads', 'error'); return false; }
                    if (!ad.headline) { showToast('Enter Headline for all ads', 'error'); return false; }
                    if (!ad.destinationUrl) { showToast('Enter Destination URL for all ads', 'error'); return false; }
                }
            }
        } else {
            if (!selectedAdSetId) { showToast('Select an Ad Set', 'error'); return false; }
            // For existing adset, validate ads in first adset
            const firstAdSet = adSets[0];
            for (const ad of firstAdSet.ads) {
                if (!ad.mediaFile) { showToast('Upload media for all ads', 'error'); return false; }
                if (!ad.adName) { showToast('Enter Ad name for all ads', 'error'); return false; }
                if (!ad.primaryText) { showToast('Enter Primary Text for all ads', 'error'); return false; }
                if (!ad.headline) { showToast('Enter Headline for all ads', 'error'); return false; }
                if (!ad.destinationUrl) { showToast('Enter Destination URL for all ads', 'error'); return false; }
            }
        }

        if (!selectedPageId) { showToast('Select a Facebook Page', 'error'); return false; }
        return true;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        const now = Date.now();
        if (now - lastPublishTime.current < 5000) {
            showToast("Please wait a few seconds before publishing again.", 'error');
            return;
        }
        lastPublishTime.current = now;

        setLoading(true);

        setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Initializing...", type: "CAMPAIGN_CREATION" });

        try {
            const { adAccountId, fbAccessToken } = settings;

            let finalCampaignId = selectedCampaignId;
            if (campaignMode === 'new') {
                setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Creating Campaign Structure...", type: "CAMPAIGN_CREATION" });
                const res = await createMetaCampaign(adAccountId, newCampaignName, objective, fbAccessToken);
                finalCampaignId = res.id;
            }

            const adSetsToProcess = adSetMode === 'new' ? adSets : [{ ...adSets[0], id: selectedAdSetId }];
            let totalAds = adSetsToProcess.reduce((sum, a) => sum + a.ads.length, 0);
            let processedAds = 0;

            for (const adSet of adSetsToProcess) {
                let finalAdSetId = adSet.id;

                if (adSetMode === 'new') {
                    setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Creating Ad Set: ${adSet.name}...`, type: "CAMPAIGN_CREATION" });
                    const pixelToUse = (objective === 'OUTCOME_SALES' && adSet.optimizationGoal === 'OFFSITE_CONVERSIONS') ? adSet.selectedPixelId : null;
                    const res = await createMetaAdSet(adAccountId, finalCampaignId, adSet.name, adSet.dailyBudget, adSet.optimizationGoal, pixelToUse, fbAccessToken);
                    finalAdSetId = res.id;
                } else {
                    finalAdSetId = selectedAdSetId;
                }

                for (const ad of adSet.ads) {
                    processedAds++;
                    setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Processing Ad ${processedAds}/${totalAds}: ${ad.adName}...`, type: "CAMPAIGN_CREATION" });

                    let assetId = '';
                    let thumbnailHash: string | undefined = undefined;

                    if (ad.mediaType === 'image') {
                        setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Uploading Image for ${ad.adName}...`, type: "CAMPAIGN_CREATION" });
                        assetId = await uploadAdImage(adAccountId, ad.mediaFile!, fbAccessToken);
                    } else {
                        setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Generating Thumbnail for ${ad.adName}...`, type: "CAMPAIGN_CREATION" });
                        const thumbnailBlob = await extractVideoThumbnail(ad.mediaFile!);
                        thumbnailHash = await uploadAdImageBlob(adAccountId, thumbnailBlob, fbAccessToken);

                        setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Uploading Video for ${ad.adName} (0%)...`, type: "CAMPAIGN_CREATION" });
                        const videoId = await uploadAdVideo(
                            adAccountId,
                            ad.mediaFile!,
                            fbAccessToken,
                            (percent) => setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Uploading Video for ${ad.adName} (${percent}%)...`, type: "CAMPAIGN_CREATION" })
                        );
                        assetId = videoId;
                    }

                    setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Creating Creative for ${ad.adName}...`, type: "CAMPAIGN_CREATION" });
                    const creativeId = await createMetaCreative(
                        adAccountId, ad.adName, selectedPageId, assetId, ad.primaryText, ad.headline, ad.destinationUrl,
                        fbAccessToken, ad.mediaType, ad.callToAction, ad.description, ad.advPlusConfig, thumbnailHash
                    );

                    setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Publishing ${ad.adName}...`, type: "CAMPAIGN_CREATION" });
                    await createMetaAd(adAccountId, finalAdSetId, ad.adName, creativeId, fbAccessToken);
                }
            }

            showToast(`🎉 Campaign Created Successfully! (${totalAds} ads created)`, 'success');
            window.scrollTo(0, 0);

            // Log campaign to admin tracking
            try {
                const fbUser = await new Promise<{ id: string; name: string }>((resolve, reject) => {
                    if (window.FB && window.FB.api) {
                        window.FB.api('/me', { fields: 'id,name' }, (response: any) => {
                            if (response && !response.error) resolve(response);
                            else reject('Failed to get user');
                        });
                    } else {
                        reject('FB SDK not available');
                    }
                });
                await fetch('/api/media-api?action=log-campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fbUserId: fbUser.id,
                        fbUserName: fbUser.name,
                        campaignName: campaignMode === 'new' ? newCampaignName : existingCampaigns.find(c => c.id === selectedCampaignId)?.name || 'Unknown',
                        objective,
                        mediaType: 'MIXED',
                        adAccountId: settings.adAccountId
                    })
                });
            } catch (logErr) {
                console.warn('Failed to log campaign:', logErr);
            }

            setTimeout(() => {
                setGlobalProcess({ active: false, name: "", message: "", type: "NONE" });
            }, 2000);

        } catch (e: any) {
            console.error(e);
            showToast(e.message || "Failed to create campaign.", 'error');
            window.scrollTo(0, 0);
            setGlobalProcess({ active: false, name: "", message: "", type: "NONE" });
        } finally {
            setLoading(false);
        }
    };

    // ============================================================
    // RENDER AD COMPONENT
    // ============================================================
    const renderAd = (adSet: AdSetData, ad: AdData, adIndex: number) => (
        <div key={ad.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            {/* Ad Header */}
            <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-5 h-5 bg-blue-500 text-white rounded text-xs flex items-center justify-center">{adIndex + 1}</span>
                    Ad {adIndex + 1}
                </h4>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => duplicateAd(adSet.id, ad.id)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Duplicate Ad"
                    >
                        <Copy size={14} />
                    </button>
                    {adSet.ads.length > 1 && (
                        <button
                            onClick={() => removeAd(adSet.id, ad.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove Ad"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Media Upload */}
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer relative group mb-4">
                <input
                    type="file"
                    accept="image/*,video/mp4,video/x-m4v,video/*,.heic,.avi"
                    onChange={(e) => handleFileChange(adSet.id, ad.id, e)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                {ad.mediaFile ? (
                    <div className="flex flex-col items-center">
                        {ad.filePreview ? (
                            ad.mediaType === 'image' ? (
                                <img src={ad.filePreview} className="h-24 object-contain rounded-lg mb-2" alt="Preview" />
                            ) : (
                                <video src={ad.filePreview} className="h-24 rounded-lg mb-2" controls muted />
                            )
                        ) : (
                            <div className="h-16 w-20 flex items-center justify-center bg-slate-200 rounded-lg mb-2">
                                {ad.mediaType === 'image' ? <ImageIcon size={24} className="text-slate-400" /> : <Video size={24} className="text-slate-400" />}
                            </div>
                        )}
                        <p className="text-blue-600 font-medium text-sm truncate max-w-full">{ad.mediaFile.name}</p>
                        <p className="text-xs text-slate-400">Click to change</p>
                    </div>
                ) : (
                    <>
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-2 text-blue-500">
                            <Upload size={20} />
                        </div>
                        <p className="text-slate-600 font-medium text-sm">Upload Media</p>
                        <p className="text-xs text-slate-400">JPG, PNG, MP4</p>
                    </>
                )}
            </div>

            {/* Ad Fields */}
            <div className="space-y-3">
                <InputField
                    label="Ad Name"
                    value={ad.adName}
                    onChange={(v: string) => updateAd(adSet.id, ad.id, { adName: v })}
                    placeholder="My Ad"
                    required
                />
                <TextAreaField
                    label="Primary Text"
                    value={ad.primaryText}
                    onChange={(v: string) => updateAd(adSet.id, ad.id, { primaryText: v })}
                    placeholder="Write your ad copy..."
                    rows={2}
                />
                <div className="grid grid-cols-2 gap-3">
                    <InputField
                        label="Headline"
                        value={ad.headline}
                        onChange={(v: string) => updateAd(adSet.id, ad.id, { headline: v })}
                        placeholder="Catchy headline"
                        required
                    />
                    <SelectField
                        label="CTA"
                        value={ad.callToAction}
                        onChange={(v: string) => updateAd(adSet.id, ad.id, { callToAction: v })}
                        options={[
                            { value: 'LEARN_MORE', label: 'Learn More' },
                            { value: 'SHOP_NOW', label: 'Shop Now' },
                            { value: 'WHATSAPP_MESSAGE', label: 'WhatsApp' },
                            { value: 'SIGN_UP', label: 'Sign Up' },
                            { value: 'ORDER_NOW', label: 'Order Now' }
                        ]}
                    />
                </div>
                <InputField
                    label="Destination URL"
                    value={ad.destinationUrl}
                    onChange={(v: string) => updateAd(adSet.id, ad.id, { destinationUrl: v })}
                    placeholder="https://..."
                    required
                />
                <InputField
                    label="Description (Optional)"
                    value={ad.description}
                    onChange={(v: string) => updateAd(adSet.id, ad.id, { description: v })}
                    placeholder="e.g. Limited time offer"
                />

                {/* Advantage+ for this ad */}
                <div className="bg-purple-50 rounded-lg p-3 mt-3">
                    <ToggleSwitch
                        label="Advantage+ Creative"
                        checked={ad.advPlusConfig.enabled}
                        onChange={(val) => updateAd(adSet.id, ad.id, { advPlusConfig: { ...ad.advPlusConfig, enabled: val } })}
                    />
                    {ad.advPlusConfig.enabled && (
                        <div className="pl-3 mt-2 space-y-1 border-l-2 border-purple-200">
                            <ToggleSwitch label="Visual Touchups" checked={ad.advPlusConfig.visualTouchups} onChange={(val) => updateAd(adSet.id, ad.id, { advPlusConfig: { ...ad.advPlusConfig, visualTouchups: val } })} />
                            <ToggleSwitch label="Text Optimizations" checked={ad.advPlusConfig.textOptimizations} onChange={(val) => updateAd(adSet.id, ad.id, { advPlusConfig: { ...ad.advPlusConfig, textOptimizations: val } })} />
                            <ToggleSwitch label="Media Cropping" checked={ad.advPlusConfig.mediaCropping} onChange={(val) => updateAd(adSet.id, ad.id, { advPlusConfig: { ...ad.advPlusConfig, mediaCropping: val } })} />
                            {ad.mediaType === 'video' && (
                                <ToggleSwitch label="Music" checked={ad.advPlusConfig.music} onChange={(val) => updateAd(adSet.id, ad.id, { advPlusConfig: { ...ad.advPlusConfig, music: val } })} />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="max-w-3xl mx-auto pb-20">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Create Campaign</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Launch your ad quickly</p>
                </div>
                <div className="flex gap-2" ref={dropdownRef}>
                    <div className="relative">
                        <button
                            onClick={() => setShowTemplatesDropdown(!showTemplatesDropdown)}
                            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-xl text-sm hover:bg-slate-50 transition-all"
                        >
                            <FolderOpen size={16} /> Templates <ChevronDown size={14} />
                        </button>
                        {showTemplatesDropdown && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50">
                                {templates.length === 0 ? (
                                    <div className="p-4 text-sm text-slate-400 text-center">No templates saved</div>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto">
                                        {templates.map(t => (
                                            <div key={t.id} onClick={() => handleLoadTemplate(t)} className="px-4 py-3 hover:bg-slate-50 text-sm cursor-pointer flex justify-between items-center border-b border-slate-100 last:border-0">
                                                <span className="truncate font-medium text-slate-700">{t.name}</span>
                                                <Trash2 size={14} className="hover:text-red-500 text-slate-400" onClick={(e) => deleteTemplate(t.id, e)} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                        className="flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-sm hover:bg-blue-100 transition-all font-medium"
                    >
                        <Save size={16} /> Save
                    </button>
                </div>
            </div>

            {/* Save Template Modal */}
            {showSaveTemplate && (
                <div className="mb-6 bg-white p-4 rounded-xl border border-blue-200 flex gap-2 items-center shadow-sm">
                    <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Template Name"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <button onClick={handleSaveTemplate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
                    <button onClick={() => setShowSaveTemplate(false)} className="text-slate-500 px-2 text-sm hover:text-slate-800">Cancel</button>
                </div>
            )}


            {/* Loading Overlay */}
            {loading && (
                <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                    <Loader2 className="animate-spin text-blue-600 w-10 h-10 mx-auto mb-3" />
                    <p className="font-semibold text-blue-800">{globalProcess.message || 'Processing...'}</p>
                    <p className="text-sm text-blue-600 mt-1">Please wait, do not close this page</p>
                </div>
            )}

            {!loading && (
                <div className="space-y-6">
                    {/* Campaign Settings */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
                            <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">1</span>
                            Campaign Settings
                        </h2>

                        <div className="space-y-4">
                            <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
                                <button onClick={() => setCampaignMode('new')} className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${campaignMode === 'new' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                                    Create New
                                </button>
                                <button onClick={() => setCampaignMode('existing')} className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${campaignMode === 'existing' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                                    Use Existing
                                </button>
                            </div>

                            {campaignMode === 'new' ? (
                                <div className="grid md:grid-cols-2 gap-4">
                                    <InputField label="Campaign Name" value={newCampaignName} onChange={setNewCampaignName} placeholder="e.g. Raya Sale 2025" required />
                                    <SelectField label="Objective" value={objective} onChange={setObjective} options={[
                                        { value: 'OUTCOME_TRAFFIC', label: '🔗 Traffic (Link Clicks)' },
                                        { value: 'OUTCOME_SALES', label: '💰 Sales (Conversions)' },
                                        { value: 'OUTCOME_AWARENESS', label: '👁️ Awareness' }
                                    ]} />
                                </div>
                            ) : (
                                <SelectField label="Select Campaign" value={selectedCampaignId} onChange={setSelectedCampaignId} required options={[
                                    { value: '', label: '-- Select Campaign --' },
                                    ...existingCampaigns.map(c => ({ value: c.id, label: c.name }))
                                ]} />
                            )}
                        </div>
                    </div>

                    {/* Ad Set Settings */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
                            <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">2</span>
                            Ad Set Settings
                        </h2>

                        <div className="space-y-4">
                            <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
                                <button onClick={() => setAdSetMode('new')} className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${adSetMode === 'new' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                                    Create New
                                </button>
                                <button onClick={() => setAdSetMode('existing')} className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${adSetMode === 'existing' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                                    Use Existing
                                </button>
                            </div>

                            {adSetMode === 'new' ? (
                                <div className="space-y-4">
                                    {adSets.map((adSet, adSetIndex) => (
                                        <div key={adSet.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                            {/* AdSet Header */}
                                            <div
                                                className="bg-slate-50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                                                onClick={() => toggleAdSetExpanded(adSet.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {adSet.isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                                    <span className="font-semibold text-slate-700">
                                                        Ad Set {adSetIndex + 1}: {adSet.name || '(untitled)'}
                                                    </span>
                                                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                                                        {adSet.ads.length} ad{adSet.ads.length > 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => duplicateAdSet(adSet.id)}
                                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                        title="Duplicate Ad Set"
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                    {adSets.length > 1 && (
                                                        <button
                                                            onClick={() => removeAdSet(adSet.id)}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                                            title="Remove Ad Set"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* AdSet Content */}
                                            {adSet.isExpanded && (
                                                <div className="p-4 space-y-4">
                                                    {/* AdSet Fields */}
                                                    <div className="grid md:grid-cols-2 gap-4">
                                                        <InputField
                                                            label="Ad Set Name"
                                                            value={adSet.name}
                                                            onChange={(v: string) => updateAdSet(adSet.id, { name: v })}
                                                            placeholder="e.g. Broad Targeting"
                                                            required
                                                        />
                                                        <InputField
                                                            label="Daily Budget (RM)"
                                                            value={adSet.dailyBudget}
                                                            onChange={(v: string) => updateAdSet(adSet.id, { dailyBudget: parseFloat(v) || 0 })}
                                                            type="number"
                                                        />
                                                    </div>
                                                    <SelectField
                                                        label="Optimization Goal"
                                                        value={adSet.optimizationGoal}
                                                        onChange={(v: string) => updateAdSet(adSet.id, { optimizationGoal: v })}
                                                        options={[
                                                            { value: 'LINK_CLICKS', label: 'Link Clicks' },
                                                            { value: 'OFFSITE_CONVERSIONS', label: 'Conversions' },
                                                            { value: 'IMPRESSIONS', label: 'Impressions' }
                                                        ]}
                                                    />
                                                    {objective === 'OUTCOME_SALES' && userPixels.length > 0 && (
                                                        <SelectField
                                                            label="Meta Pixel"
                                                            value={adSet.selectedPixelId}
                                                            onChange={(v: string) => updateAdSet(adSet.id, { selectedPixelId: v })}
                                                            options={userPixels.map(p => ({ value: p.id, label: p.name }))}
                                                        />
                                                    )}

                                                    {/* Ads */}
                                                    <div className="mt-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h4 className="font-semibold text-slate-700">Ads</h4>
                                                            <button
                                                                onClick={() => addAd(adSet.id)}
                                                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                                            >
                                                                <Plus size={14} /> Add Ad
                                                            </button>
                                                        </div>
                                                        <div className="space-y-4">
                                                            {adSet.ads.map((ad, adIndex) => renderAd(adSet, ad, adIndex))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Add AdSet Button */}
                                    <button
                                        onClick={addAdSet}
                                        className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 font-medium"
                                    >
                                        <Plus size={18} /> Add Ad Set
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <SelectField label="Select Ad Set" value={selectedAdSetId} onChange={setSelectedAdSetId} required options={[
                                        { value: '', label: '-- Select Ad Set --' },
                                        ...existingAdSetsFromMeta.map(a => ({ value: a.id, label: a.name }))
                                    ]} />

                                    {/* Ads for existing adset */}
                                    {selectedAdSetId && (
                                        <div className="mt-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-semibold text-slate-700">Ads to Create</h4>
                                                <button
                                                    onClick={() => addAd(adSets[0].id)}
                                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    <Plus size={14} /> Add Ad
                                                </button>
                                            </div>
                                            <div className="space-y-4">
                                                {adSets[0].ads.map((ad, adIndex) => renderAd(adSets[0], ad, adIndex))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Facebook Page Selection */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
                            <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">3</span>
                            Facebook Page
                        </h2>
                        <SelectField label="Select Facebook Page" value={selectedPageId} onChange={setSelectedPageId} required options={[
                            { value: '', label: '-- Select Page --' },
                            ...userPages.map(p => ({ value: p.id, label: p.name }))
                        ]} />
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700 text-white text-lg font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                    >
                        <Zap size={20} /> Launch Campaign
                    </button>

                    <p className="text-center text-xs text-slate-400">Campaign will be created with ACTIVE status. It will start running immediately.</p>
                </div>
            )}
        </div>
    );
};

export default CreateCampaign;
