
import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../App';
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
import { CheckCircle, Loader2, Upload, AlertTriangle, Save, FolderOpen, Trash2, ChevronDown, Video, Image as ImageIcon, Sparkles, Wand2 } from 'lucide-react';
import { AdvantagePlusConfig } from '../types';

interface Template {
    id: string;
    name: string;
    data: any;
}

// TOGGLE SWITCH COMPONENT
const ToggleSwitch = ({ checked, onChange, label, subtext }: { checked: boolean, onChange: (val: boolean) => void, label: string, subtext?: string }) => (
    <div className="flex items-center justify-between py-2 group">
        <div className="flex flex-col">
            <span className={`text-sm font-medium transition-colors ${checked ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
            {subtext && <span className="text-[10px] text-slate-400">{subtext}</span>}
        </div>
        <button
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`}
        >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
    </div>
);

// STEP PROGRESS COMPONENT - Rapid Ads Style
const STEPS = [
    { id: 1, label: 'Setup', icon: '📋' },
    { id: 2, label: 'Upload', icon: '📤' },
    { id: 3, label: 'Build', icon: '🔧' },
    { id: 4, label: 'Launch', icon: '🚀' }
];

const StepProgress = ({ currentStep, processingMessage }: { currentStep: number; processingMessage?: string }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${currentStep > step.id
                            ? 'bg-green-500 text-white'
                            : currentStep === step.id
                                ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                                : 'bg-slate-100 text-slate-400'
                            }`}>
                            {currentStep > step.id ? '✓' : step.icon}
                        </div>
                        <span className={`text-xs mt-1.5 font-medium ${currentStep >= step.id ? 'text-slate-700' : 'text-slate-400'
                            }`}>{step.label}</span>
                        {currentStep === step.id && processingMessage && (
                            <span className="text-[10px] text-indigo-500 mt-0.5 animate-pulse">{processingMessage}</span>
                        )}
                    </div>
                    {index < STEPS.length - 1 && (
                        <div className={`flex-1 h-1 mx-2 rounded-full transition-all ${currentStep > step.id ? 'bg-green-500' : 'bg-slate-100'
                            }`} />
                    )}
                </div>
            ))}
        </div>
    </div>
);

const CreateCampaign: React.FC = () => {
    const { settings, globalProcess, setGlobalProcess } = useSettings();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [templates, setTemplates] = useState<Template[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);
    const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [existingCampaigns, setExistingCampaigns] = useState<any[]>([]);
    const [existingAdSets, setExistingAdSets] = useState<any[]>([]);
    const [userPages, setUserPages] = useState<any[]>([]);
    const [userPixels, setUserPixels] = useState<any[]>([]);

    const [campaignMode, setCampaignMode] = useState<'new' | 'existing'>('new');
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    const [newCampaignName, setNewCampaignName] = useState('');
    const [objective, setObjective] = useState('OUTCOME_TRAFFIC');

    const [adSetMode, setAdSetMode] = useState<'new' | 'existing'>('new');
    const [selectedAdSetId, setSelectedAdSetId] = useState('');
    const [newAdSetName, setNewAdSetName] = useState('');
    const [dailyBudget, setDailyBudget] = useState(50);
    const [optimizationGoal, setOptimizationGoal] = useState('LINK_CLICKS');
    const [selectedPixelId, setSelectedPixelId] = useState('');

    const [selectedPageId, setSelectedPageId] = useState('');
    const [adName, setAdName] = useState('');
    const [primaryText, setPrimaryText] = useState('');
    const [headline, setHeadline] = useState('');
    const [description, setDescription] = useState('');
    const [destinationUrl, setDestinationUrl] = useState('');
    const [callToAction, setCallToAction] = useState('LEARN_MORE');

    // ADVANTAGE+ CREATIVE STATE - Default OFF to disable all enhancements
    const [advPlusConfig, setAdvPlusConfig] = useState<AdvantagePlusConfig>({
        enabled: false, // Default OFF - user can enable if wanted
        visualTouchups: false,
        textOptimizations: false,
        mediaCropping: false,
        music: false
    });

    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState(1); // Progress tracking

    const lastPublishTime = useRef<number>(0);

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
                    if (pixels.length > 0) setSelectedPixelId(prev => prev || (pixels[0] ? pixels[0].id : ''));
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
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (objective === 'OUTCOME_SALES') {
            setOptimizationGoal('OFFSITE_CONVERSIONS');
        } else if (objective === 'OUTCOME_TRAFFIC') {
            setOptimizationGoal('LINK_CLICKS');
        }
    }, [objective]);

    useEffect(() => {
        if (selectedCampaignId && campaignMode === 'existing') {
            const loadAdSets = async () => {
                try {
                    const adsets = await getAdSets(selectedCampaignId, settings.fbAccessToken);
                    setExistingAdSets(adsets);
                } catch (e) { console.error(e); }
            };
            loadAdSets();
        }
    }, [selectedCampaignId, campaignMode, settings.fbAccessToken]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setMediaFile(file);
            if (file.type.startsWith('video/') || file.name.endsWith('.avi')) {
                setMediaType('video');
            } else {
                setMediaType('image');
            }
            if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.avi')) {
                setFilePreview(null);
            } else {
                setFilePreview(URL.createObjectURL(file));
            }
        }
    };

    const handleSaveTemplate = () => {
        if (!templateName) return alert("Enter a template name");
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
                adSetMode, newAdSetName, dailyBudget, optimizationGoal, selectedPixelId,
                selectedPageId,
                adName,
                primaryText, headline, description, destinationUrl, callToAction,
                advPlusConfig // Save Adv+ Config
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
        if (d.newAdSetName) setNewAdSetName(d.newAdSetName);
        if (d.dailyBudget) setDailyBudget(d.dailyBudget);
        if (d.optimizationGoal) setOptimizationGoal(d.optimizationGoal);
        if (d.selectedPixelId) setSelectedPixelId(d.selectedPixelId);
        if (d.selectedPageId) setSelectedPageId(d.selectedPageId);
        if (d.adName) setAdName(d.adName);
        if (d.primaryText) setPrimaryText(d.primaryText);
        if (d.headline) setHeadline(d.headline);
        if (d.description) setDescription(d.description);
        if (d.destinationUrl) setDestinationUrl(d.destinationUrl);
        if (d.callToAction) setCallToAction(d.callToAction);
        if (d.advPlusConfig) setAdvPlusConfig(d.advPlusConfig); // Load Adv+ Config
        setShowTemplatesDropdown(false);
    };

    const deleteTemplate = (id: string, e: any) => {
        e.stopPropagation();
        const updated = templates.filter(t => t.id !== id);
        setTemplates(updated);
        localStorage.setItem('ar_templates', JSON.stringify(updated));
    };

    const handleSubmit = async () => {
        if (campaignMode === 'new' && !newCampaignName) return setError("Enter campaign name");
        if (campaignMode === 'existing' && !selectedCampaignId) return setError("Select a campaign");
        if (adSetMode === 'new' && !newAdSetName) return setError("Enter Ad Set Name");
        if (adSetMode === 'existing' && !selectedAdSetId) return setError("Select an Ad Set");
        if (!adName || !primaryText || !headline || !destinationUrl) return setError("Fill all ad details");
        if (!selectedPageId) return setError("Select a Facebook Page");
        if (!mediaFile) return setError("Upload an image or video");

        const now = Date.now();
        if (now - lastPublishTime.current < 5000) {
            return setError("Please wait a few seconds before publishing again.");
        }
        lastPublishTime.current = now;

        setLoading(true);
        setError('');
        setCurrentStep(2); // Upload step

        setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Initializing...", type: "CAMPAIGN_CREATION" });

        try {
            const { adAccountId, fbAccessToken } = settings;

            let finalCampaignId = selectedCampaignId;
            if (campaignMode === 'new') {
                setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Creating Campaign Structure...", type: "CAMPAIGN_CREATION" });
                const res = await createMetaCampaign(adAccountId, newCampaignName, objective, fbAccessToken);
                finalCampaignId = res.id;
            }

            let finalAdSetId = selectedAdSetId;
            if (adSetMode === 'new') {
                setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Configuring Ad Set...", type: "CAMPAIGN_CREATION" });
                const pixelToUse = (objective === 'OUTCOME_SALES' && optimizationGoal === 'OFFSITE_CONVERSIONS') ? selectedPixelId : null;
                const res = await createMetaAdSet(adAccountId, finalCampaignId, newAdSetName, dailyBudget, optimizationGoal, pixelToUse, fbAccessToken);
                finalAdSetId = res.id;
            }

            let assetId = '';
            let thumbnailHash: string | undefined = undefined;

            if (mediaType === 'image') {
                setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Uploading Image Asset...", type: "CAMPAIGN_CREATION" });
                assetId = await uploadAdImage(adAccountId, mediaFile!, fbAccessToken);
            } else {
                // For video: Extract thumbnail first, then upload video
                setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Generating Thumbnail...", type: "CAMPAIGN_CREATION" });
                const thumbnailBlob = await extractVideoThumbnail(mediaFile!);
                thumbnailHash = await uploadAdImageBlob(adAccountId, thumbnailBlob, fbAccessToken);

                setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Uploading Video (0%)...", type: "CAMPAIGN_CREATION" });
                const videoId = await uploadAdVideo(
                    adAccountId,
                    mediaFile!,
                    fbAccessToken,
                    (percent) => setGlobalProcess({ active: true, name: "Creating Campaign...", message: `Uploading Video (${percent}%)...`, type: "CAMPAIGN_CREATION" })
                );

                // Skip waiting for video processing - video will process in background
                assetId = videoId;
            }

            setCurrentStep(3); // Build step
            setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Finalizing Creative...", type: "CAMPAIGN_CREATION" });
            const creativeId = await createMetaCreative(
                adAccountId,
                adName,
                selectedPageId,
                assetId,
                primaryText,
                headline,
                destinationUrl,
                fbAccessToken,
                mediaType,
                callToAction,
                description,
                advPlusConfig,
                thumbnailHash // Pass thumbnail for video ads
            );

            setCurrentStep(4); // Launch step
            setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Publishing Final Ad...", type: "CAMPAIGN_CREATION" });
            await createMetaAd(adAccountId, finalAdSetId, adName, creativeId, fbAccessToken);

            setSuccessMsg("Campaign Created Successfully! Check your Dashboard.");
            setCurrentStep(1); // Reset
            window.scrollTo(0, 0);

            // Log campaign to Vercel KV for admin tracking
            try {
                // Get FB user info
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

                await fetch('/api/log-campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fbUserId: fbUser.id,
                        fbUserName: fbUser.name,
                        campaignName: campaignMode === 'new' ? newCampaignName : existingCampaigns.find(c => c.id === selectedCampaignId)?.name || 'Unknown',
                        objective,
                        mediaType: mediaType.toUpperCase(),
                        adAccountId: settings.adAccountId
                    })
                });
                console.log('Campaign logged to admin tracking');
            } catch (logErr) {
                console.warn('Failed to log campaign (non-critical):', logErr);
            }

            setTimeout(() => {
                setGlobalProcess({ active: false, name: "", message: "", type: "NONE" });
            }, 2000);

        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to create campaign. Check parameters.");
            window.scrollTo(0, 0);
            setGlobalProcess({ active: false, name: "", message: "", type: "NONE" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-20">
            {/* Progress Bar - Always Visible (Rapid Ads Style) */}
            <StepProgress currentStep={currentStep} processingMessage={loading ? globalProcess.message : undefined} />

            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-800">Create New Campaign</h1>

                <div className="flex gap-2 relative">
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setShowTemplatesDropdown(!showTemplatesDropdown)}
                            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 shadow-sm"
                        >
                            <FolderOpen size={16} /> Templates <ChevronDown size={14} />
                        </button>
                        {showTemplatesDropdown && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 animate-fadeIn">
                                {templates.length === 0 ? (
                                    <div className="p-3 text-xs text-slate-400">No templates saved.</div>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {templates.map(t => (
                                            <div key={t.id} onClick={() => handleLoadTemplate(t)} className="px-4 py-3 hover:bg-slate-50 text-sm cursor-pointer flex justify-between items-center text-slate-600 border-b border-slate-100 last:border-0">
                                                <span className="truncate max-w-[140px] font-medium">{t.name}</span>
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
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-100 border border-indigo-200 font-medium"
                    >
                        <Save size={16} /> Save Config
                    </button>
                </div>
            </div>

            {showSaveTemplate && (
                <div className="mb-6 bg-white p-4 rounded-xl border border-indigo-100 shadow-sm flex gap-2 animate-fadeIn items-center">
                    <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Template Name (e.g. Winning Scale Setup)"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <button onClick={handleSaveTemplate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md shadow-indigo-200 hover:bg-indigo-700">Save</button>
                    <button onClick={() => setShowSaveTemplate(false)} className="text-slate-500 px-2 text-sm hover:text-slate-800">Cancel</button>
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-3 shadow-sm animate-fadeIn">
                    <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-red-500" />
                    <div>
                        <p className="font-bold mb-1">Error Creating Campaign</p>
                        <p className="text-sm opacity-90">{error}</p>
                    </div>
                </div>
            )}

            {successMsg && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 flex items-center gap-2 animate-fadeIn shadow-sm">
                    <CheckCircle size={20} className="text-green-500" /> <span className="font-medium">{successMsg}</span>
                </div>
            )}

            <div className="space-y-6">

                {/* --- SECTION 1: CAMPAIGN --- */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">1. Campaign Settings</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <label className="text-sm font-semibold text-slate-500">Campaign Mode</label>
                            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                <button onClick={() => setCampaignMode('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${campaignMode === 'new' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Create New</button>
                                <button onClick={() => setCampaignMode('existing')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${campaignMode === 'existing' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Use Existing</button>
                            </div>
                        </div>

                        {campaignMode === 'new' ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Campaign Name</label>
                                    <input type="text" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all" placeholder="e.g. Raya Promo" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Objective</label>
                                    <select value={objective} onChange={(e) => setObjective(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 outline-none focus:border-indigo-500">
                                        <option value="OUTCOME_TRAFFIC">Traffic (Link Clicks)</option>
                                        <option value="OUTCOME_SALES">Sales (Conversions)</option>
                                        <option value="OUTCOME_AWARENESS">Awareness</option>
                                    </select>
                                </div>
                            </>
                        ) : (
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">Select Campaign</label>
                                <select value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 outline-none focus:border-indigo-500">
                                    <option value="">-- Select Campaign --</option>
                                    {existingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- SECTION 2: AD SET --- */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">2. Ad Set Settings</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <label className="text-sm font-semibold text-slate-500">Ad Set Mode</label>
                            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                <button onClick={() => setAdSetMode('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${adSetMode === 'new' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Create New</button>
                                <button onClick={() => setAdSetMode('existing')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${adSetMode === 'existing' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>Use Existing</button>
                            </div>
                        </div>

                        {adSetMode === 'new' ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Ad Set Name</label>
                                    <input type="text" value={newAdSetName} onChange={(e) => setNewAdSetName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all" placeholder="e.g. Broad Targeting" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Daily Budget (RM)</label>
                                    <input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(parseFloat(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Optimization</label>
                                    <select value={optimizationGoal} onChange={(e) => setOptimizationGoal(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 outline-none focus:border-indigo-500">
                                        <option value="LINK_CLICKS">Link Clicks</option>
                                        <option value="OFFSITE_CONVERSIONS">Conversions (Sales)</option>
                                        <option value="IMPRESSIONS">Impressions</option>
                                    </select>
                                </div>

                                {objective === 'OUTCOME_SALES' && (
                                    <div className="animate-fadeIn">
                                        <label className="block text-sm font-semibold text-green-600 mb-1.5">Pixel (Required for Sales)</label>
                                        {userPixels.length > 0 ? (
                                            <select value={selectedPixelId} onChange={(e) => setSelectedPixelId(e.target.value)} className="w-full bg-slate-50 border border-green-200 rounded-lg px-4 py-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500">
                                                {userPixels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        ) : (
                                            <p className="text-xs text-red-600 bg-red-50 p-3 rounded border border-red-200">No Pixels found. Please create one in Events Manager.</p>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">Select Ad Set</label>
                                <select value={selectedAdSetId} onChange={(e) => setSelectedAdSetId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 outline-none focus:border-indigo-500">
                                    <option value="">-- Select Ad Set --</option>
                                    {existingAdSets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- SECTION 3: CREATIVE --- */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">3. Ad Creative</h2>
                    <div className="grid md:grid-cols-2 gap-6">

                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Facebook Page</label>
                            {userPages.length > 0 ? (
                                <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 outline-none focus:border-indigo-500">
                                    <option value="">-- Select Page --</option>
                                    {userPages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            ) : (
                                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">No Pages found. Re-login with 'Manage Pages' access.</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Ad Name</label>
                            <input type="text" value={adName} onChange={(e) => setAdName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all" placeholder="Ad Name" />
                        </div>

                        <div className="md:col-span-2">
                            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 hover:border-indigo-400 transition-all cursor-pointer relative overflow-hidden group">
                                <input
                                    type="file"
                                    accept="image/*,video/mp4,video/x-m4v,video/*,.heic,.avi"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />

                                {mediaFile ? (
                                    <div className="flex flex-col items-center justify-center">
                                        {filePreview ? (
                                            mediaType === 'image' ? (
                                                <img src={filePreview} className="h-40 object-contain rounded-lg mb-3 shadow-sm border border-slate-200" alt="Preview" />
                                            ) : (
                                                <video src={filePreview} className="h-40 rounded-lg mb-3 shadow-sm border border-slate-200" controls muted />
                                            )
                                        ) : (
                                            <div className="h-24 w-32 flex items-center justify-center bg-slate-100 rounded-lg mb-3 border border-slate-200">
                                                {mediaType === 'image' ? <ImageIcon size={32} className="text-slate-400" /> : <Video size={32} className="text-slate-400" />}
                                            </div>
                                        )}
                                        <p className="text-indigo-600 text-sm font-bold">{mediaFile.name}</p>
                                        <p className="text-xs text-slate-500 font-medium">{mediaType === 'video' ? 'Video File (Chunked Upload)' : 'Image File'}</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3 text-indigo-500 group-hover:scale-110 transition-transform">
                                            <Upload size={24} />
                                        </div>
                                        <p className="text-slate-700 text-sm font-bold">Click to upload Media</p>
                                        <p className="text-xs text-slate-400 mt-1">Supports Images (JPG, PNG) & Videos (MP4)</p>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Primary Text (Caption)</label>
                            <textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 h-24 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none resize-none" placeholder="The main ad copy above the creative..." />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Headline</label>
                            <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all" placeholder="Bold Headline" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Call To Action</label>
                            <select value={callToAction} onChange={(e) => setCallToAction(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 outline-none focus:border-indigo-500">
                                <option value="LEARN_MORE">Learn More</option>
                                <option value="SHOP_NOW">Shop Now</option>
                                <option value="WHATSAPP_MESSAGE">Send WhatsApp Message</option>
                                <option value="SIGN_UP">Sign Up</option>
                                <option value="GET_OFFER">Get Offer</option>
                                <option value="CONTACT_US">Contact Us</option>
                                <option value="ORDER_NOW">Order Now</option>
                                <option value="WATCH_MORE">Watch More</option>
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Link Description (Optional)</label>
                            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all" placeholder="Small text below headline (e.g. 50% Off Today)" />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Destination URL</label>
                            <input type="text" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all" placeholder="https://..." />
                        </div>

                    </div>
                </div>

                {/* --- ADVANTAGE+ CREATIVE SECTION --- */}
                <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-100 p-6 shadow-sm relative overflow-hidden">
                    {/* Decorative Background Icon */}
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                        <Wand2 size={100} className="text-indigo-600" />
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Advantage+ Creative</h2>
                            <p className="text-xs text-slate-500">Automatically optimize creative for each person.</p>
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                        <ToggleSwitch
                            label="Enable Advantage+ Creative"
                            checked={advPlusConfig.enabled}
                            onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, enabled: val })}
                            subtext="Allow Meta to automatically improve creative performance."
                        />

                        {advPlusConfig.enabled && (
                            <div className="pl-4 ml-2 border-l-2 border-indigo-100 space-y-1 animate-fadeIn">
                                <ToggleSwitch
                                    label="Visual Touchups"
                                    checked={advPlusConfig.visualTouchups}
                                    onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, visualTouchups: val })}
                                    subtext="Adjust brightness, contrast and aspect ratio."
                                />
                                <ToggleSwitch
                                    label="Text Optimizations"
                                    checked={advPlusConfig.textOptimizations}
                                    onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, textOptimizations: val })}
                                    subtext="Swap text between headline, primary, and description."
                                />
                                <ToggleSwitch
                                    label="Media Cropping"
                                    checked={advPlusConfig.mediaCropping}
                                    onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, mediaCropping: val })}
                                    subtext="Auto-crop images/videos for stories and reels."
                                />
                                {mediaType === 'video' && (
                                    <ToggleSwitch
                                        label="Music"
                                        checked={advPlusConfig.music}
                                        onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, music: val })}
                                        subtext="Automatically add music to video ads."
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-green-200 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed transition-all transform hover:scale-[1.005]"
                    >
                        {loading && <Loader2 className="animate-spin" size={24} />}
                        {loading ? 'Creating Campaign...' : 'PUBLISH CAMPAIGN NOW'}
                    </button>
                    <p className="text-center text-xs text-slate-400 mt-3 font-medium">This will create the campaign in your Ads Manager. Default status: PAUSED.</p>
                </div>

            </div>
        </div>
    );
};

export default CreateCampaign;
