
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
import { CheckCircle, Loader2, Upload, AlertTriangle, Save, FolderOpen, Trash2, ChevronDown, Video, Image as ImageIcon, Sparkles, Wand2, ArrowRight, ArrowLeft, Zap } from 'lucide-react';
import { AdvantagePlusConfig } from '../types';

interface Template {
    id: string;
    name: string;
    data: any;
}

// ============================================================
// RAPID ADS STYLE STEP PROGRESS BAR
// ============================================================
const STEPS = [
    { id: 1, label: 'Campaign', desc: 'Setup campaign & budget' },
    { id: 2, label: 'Creative', desc: 'Add media & text' },
    { id: 3, label: 'Launch', desc: 'Review & publish' }
];

const StepProgressBar = ({ currentStep, onStepClick }: { currentStep: number; onStepClick?: (step: number) => void }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm">
        <div className="flex items-center justify-between relative">
            {/* Background Line */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-100 mx-16" />
            <div
                className="absolute top-5 left-0 h-0.5 bg-blue-500 mx-16 transition-all duration-500"
                style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * (100 - 20)}%` }}
            />

            {STEPS.map((step) => (
                <div
                    key={step.id}
                    className="flex flex-col items-center z-10 cursor-pointer group"
                    onClick={() => onStepClick && step.id < currentStep && onStepClick(step.id)}
                >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${currentStep > step.id
                            ? 'bg-green-500 text-white'
                            : currentStep === step.id
                                ? 'bg-blue-600 text-white ring-4 ring-blue-100 scale-110'
                                : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                        }`}>
                        {currentStep > step.id ? '✓' : step.id}
                    </div>
                    <span className={`text-sm font-semibold mt-2 ${currentStep >= step.id ? 'text-slate-800' : 'text-slate-400'
                        }`}>{step.label}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 hidden md:block">{step.desc}</span>
                </div>
            ))}
        </div>
    </div>
);

// ============================================================
// RAPID ADS STYLE INPUT COMPONENTS
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
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all resize-none placeholder:text-slate-400"
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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [currentStep, setCurrentStep] = useState(1);

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

    const [advPlusConfig, setAdvPlusConfig] = useState<AdvantagePlusConfig>({
        enabled: false,
        visualTouchups: false,
        textOptimizations: false,
        mediaCropping: false,
        music: false
    });

    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
    const [filePreview, setFilePreview] = useState<string | null>(null);

    const lastPublishTime = useRef<number>(0);

    // Effects
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
        return () => document.removeEventListener("mousedown", handleClickOutside);
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
                selectedPageId, adName, primaryText, headline, description, destinationUrl, callToAction, advPlusConfig
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
        if (d.advPlusConfig) setAdvPlusConfig(d.advPlusConfig);
        setShowTemplatesDropdown(false);
    };

    const deleteTemplate = (id: string, e: any) => {
        e.stopPropagation();
        const updated = templates.filter(t => t.id !== id);
        setTemplates(updated);
        localStorage.setItem('ar_templates', JSON.stringify(updated));
    };

    const validateStep = (step: number): boolean => {
        if (step === 1) {
            if (campaignMode === 'new' && !newCampaignName) { setError('Enter campaign name'); return false; }
            if (campaignMode === 'existing' && !selectedCampaignId) { setError('Select a campaign'); return false; }
            if (adSetMode === 'new' && !newAdSetName) { setError('Enter Ad Set name'); return false; }
            if (adSetMode === 'existing' && !selectedAdSetId) { setError('Select an Ad Set'); return false; }
        }
        if (step === 2) {
            if (!mediaFile) { setError('Upload an image or video'); return false; }
            if (!adName) { setError('Enter Ad name'); return false; }
            if (!primaryText) { setError('Enter Primary Text'); return false; }
            if (!headline) { setError('Enter Headline'); return false; }
            if (!destinationUrl) { setError('Enter Destination URL'); return false; }
            if (!selectedPageId) { setError('Select a Facebook Page'); return false; }
        }
        return true;
    };

    const handleNext = () => {
        setError('');
        if (validateStep(currentStep)) {
            setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
        }
    };

    const handleBack = () => {
        setError('');
        setCurrentStep(prev => Math.max(prev - 1, 1));
    };

    const handleSubmit = async () => {
        if (!validateStep(1) || !validateStep(2)) return;

        const now = Date.now();
        if (now - lastPublishTime.current < 5000) {
            return setError("Please wait a few seconds before publishing again.");
        }
        lastPublishTime.current = now;

        setLoading(true);
        setError('');

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
                setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Uploading Image...", type: "CAMPAIGN_CREATION" });
                assetId = await uploadAdImage(adAccountId, mediaFile!, fbAccessToken);
            } else {
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
                assetId = videoId;
            }

            setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Creating Ad Creative...", type: "CAMPAIGN_CREATION" });
            const creativeId = await createMetaCreative(
                adAccountId, adName, selectedPageId, assetId, primaryText, headline, destinationUrl,
                fbAccessToken, mediaType, callToAction, description, advPlusConfig, thumbnailHash
            );

            setGlobalProcess({ active: true, name: "Creating Campaign...", message: "Publishing Ad...", type: "CAMPAIGN_CREATION" });
            await createMetaAd(adAccountId, finalAdSetId, adName, creativeId, fbAccessToken);

            setSuccessMsg("🎉 Campaign Created Successfully!");
            setCurrentStep(1);
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
            } catch (logErr) {
                console.warn('Failed to log campaign:', logErr);
            }

            setTimeout(() => {
                setGlobalProcess({ active: false, name: "", message: "", type: "NONE" });
            }, 2000);

        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to create campaign.");
            window.scrollTo(0, 0);
            setGlobalProcess({ active: false, name: "", message: "", type: "NONE" });
        } finally {
            setLoading(false);
        }
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="max-w-3xl mx-auto pb-20">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Create Campaign</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Launch your ad in 3 simple steps</p>
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

            {/* Alerts */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
                    <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {successMsg && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 flex items-center gap-3">
                    <CheckCircle size={20} className="text-green-500" />
                    <span className="font-medium">{successMsg}</span>
                </div>
            )}

            {/* Progress Bar */}
            <StepProgressBar currentStep={currentStep} onStepClick={setCurrentStep} />

            {/* Loading Overlay */}
            {loading && (
                <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                    <Loader2 className="animate-spin text-blue-600 w-10 h-10 mx-auto mb-3" />
                    <p className="font-semibold text-blue-800">{globalProcess.message || 'Processing...'}</p>
                    <p className="text-sm text-blue-600 mt-1">Please wait, do not close this page</p>
                </div>
            )}

            {/* STEP 1: Campaign & Ad Set Settings */}
            {currentStep === 1 && !loading && (
                <div className="space-y-6 animate-fadeIn">
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
                                <>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <InputField label="Ad Set Name" value={newAdSetName} onChange={setNewAdSetName} placeholder="e.g. Broad Targeting" required />
                                        <InputField label="Daily Budget (RM)" value={dailyBudget} onChange={(v: string) => setDailyBudget(parseFloat(v) || 0)} type="number" />
                                    </div>
                                    <SelectField label="Optimization Goal" value={optimizationGoal} onChange={setOptimizationGoal} options={[
                                        { value: 'LINK_CLICKS', label: 'Link Clicks' },
                                        { value: 'OFFSITE_CONVERSIONS', label: 'Conversions' },
                                        { value: 'IMPRESSIONS', label: 'Impressions' }
                                    ]} />
                                    {objective === 'OUTCOME_SALES' && userPixels.length > 0 && (
                                        <SelectField label="Meta Pixel" value={selectedPixelId} onChange={setSelectedPixelId} options={userPixels.map(p => ({ value: p.id, label: p.name }))} />
                                    )}
                                </>
                            ) : (
                                <SelectField label="Select Ad Set" value={selectedAdSetId} onChange={setSelectedAdSetId} required options={[
                                    { value: '', label: '-- Select Ad Set --' },
                                    ...existingAdSets.map(a => ({ value: a.id, label: a.name }))
                                ]} />
                            )}
                        </div>
                    </div>

                    <button onClick={handleNext} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                        Continue <ArrowRight size={20} />
                    </button>
                </div>
            )}

            {/* STEP 2: Creative */}
            {currentStep === 2 && !loading && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
                            <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">3</span>
                            Ad Creative
                        </h2>

                        <div className="space-y-5">
                            {/* Media Upload */}
                            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer relative group">
                                <input
                                    type="file"
                                    accept="image/*,video/mp4,video/x-m4v,video/*,.heic,.avi"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                {mediaFile ? (
                                    <div className="flex flex-col items-center">
                                        {filePreview ? (
                                            mediaType === 'image' ? (
                                                <img src={filePreview} className="h-40 object-contain rounded-xl mb-3" alt="Preview" />
                                            ) : (
                                                <video src={filePreview} className="h-40 rounded-xl mb-3" controls muted />
                                            )
                                        ) : (
                                            <div className="h-24 w-32 flex items-center justify-center bg-slate-100 rounded-xl mb-3">
                                                {mediaType === 'image' ? <ImageIcon size={32} className="text-slate-400" /> : <Video size={32} className="text-slate-400" />}
                                            </div>
                                        )}
                                        <p className="text-blue-600 font-semibold">{mediaFile.name}</p>
                                        <p className="text-xs text-slate-500">{mediaType === 'video' ? 'Video' : 'Image'} • Click to change</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-blue-500 group-hover:scale-110 transition-transform">
                                            <Upload size={28} />
                                        </div>
                                        <p className="text-slate-800 font-semibold">Click to upload media</p>
                                        <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG, MP4</p>
                                    </>
                                )}
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <SelectField label="Facebook Page" value={selectedPageId} onChange={setSelectedPageId} required options={[
                                    { value: '', label: '-- Select Page --' },
                                    ...userPages.map(p => ({ value: p.id, label: p.name }))
                                ]} />
                                <InputField label="Ad Name" value={adName} onChange={setAdName} placeholder="My Ad" required />
                            </div>

                            <TextAreaField label="Primary Text (Caption)" value={primaryText} onChange={setPrimaryText} placeholder="Write your ad copy here..." rows={4} />

                            <div className="grid md:grid-cols-2 gap-4">
                                <InputField label="Headline" value={headline} onChange={setHeadline} placeholder="Catchy headline" required />
                                <SelectField label="Call To Action" value={callToAction} onChange={setCallToAction} options={[
                                    { value: 'LEARN_MORE', label: 'Learn More' },
                                    { value: 'SHOP_NOW', label: 'Shop Now' },
                                    { value: 'WHATSAPP_MESSAGE', label: 'WhatsApp Message' },
                                    { value: 'SIGN_UP', label: 'Sign Up' },
                                    { value: 'GET_OFFER', label: 'Get Offer' },
                                    { value: 'ORDER_NOW', label: 'Order Now' }
                                ]} />
                            </div>

                            <InputField label="Link Description (Optional)" value={description} onChange={setDescription} placeholder="e.g. Limited time offer" />
                            <InputField label="Destination URL" value={destinationUrl} onChange={setDestinationUrl} placeholder="https://..." required />
                        </div>
                    </div>

                    {/* Advantage+ */}
                    <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl border border-purple-100 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-purple-100 rounded-xl text-purple-600">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Advantage+ Creative</h3>
                                <p className="text-xs text-slate-500">Let Meta optimize your creative automatically</p>
                            </div>
                        </div>
                        <ToggleSwitch label="Enable Advantage+" checked={advPlusConfig.enabled} onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, enabled: val })} />
                        {advPlusConfig.enabled && (
                            <div className="pl-4 border-l-2 border-purple-100 mt-3 space-y-1">
                                <ToggleSwitch label="Visual Touchups" checked={advPlusConfig.visualTouchups} onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, visualTouchups: val })} />
                                <ToggleSwitch label="Text Optimizations" checked={advPlusConfig.textOptimizations} onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, textOptimizations: val })} />
                                <ToggleSwitch label="Media Cropping" checked={advPlusConfig.mediaCropping} onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, mediaCropping: val })} />
                                {mediaType === 'video' && (
                                    <ToggleSwitch label="Music" checked={advPlusConfig.music} onChange={(val) => setAdvPlusConfig({ ...advPlusConfig, music: val })} />
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={handleBack} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-lg font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                            <ArrowLeft size={20} /> Back
                        </button>
                        <button onClick={handleNext} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                            Continue <ArrowRight size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: Review & Launch */}
            {currentStep === 3 && !loading && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
                            <span className="w-7 h-7 bg-green-100 text-green-600 rounded-lg flex items-center justify-center text-sm font-bold">✓</span>
                            Review & Launch
                        </h2>

                        <div className="space-y-4">
                            {/* Summary Cards */}
                            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                <h4 className="font-semibold text-slate-700 text-sm">Campaign</h4>
                                <div className="text-sm text-slate-600">
                                    <span className="font-medium">{campaignMode === 'new' ? newCampaignName : 'Using Existing'}</span>
                                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full ml-2">
                                        {objective.replace('OUTCOME_', '')}
                                    </span>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                <h4 className="font-semibold text-slate-700 text-sm">Ad Set</h4>
                                <div className="text-sm text-slate-600">
                                    <span className="font-medium">{adSetMode === 'new' ? newAdSetName : 'Using Existing'}</span>
                                    {adSetMode === 'new' && <span className="text-xs text-slate-400 ml-2">RM{dailyBudget}/day</span>}
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-4">
                                <h4 className="font-semibold text-slate-700 text-sm mb-3">Creative Preview</h4>
                                <div className="flex gap-4">
                                    {filePreview && (
                                        <div className="w-20 h-20 flex-shrink-0">
                                            {mediaType === 'image' ? (
                                                <img src={filePreview} className="w-full h-full object-cover rounded-lg" alt="" />
                                            ) : (
                                                <video src={filePreview} className="w-full h-full object-cover rounded-lg" muted />
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-800 text-sm">{headline}</p>
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{primaryText}</p>
                                        <p className="text-xs text-blue-600 mt-2 truncate">{destinationUrl}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={handleBack} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-lg font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                            <ArrowLeft size={20} /> Edit
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex-[2] bg-green-600 hover:bg-green-700 text-white text-lg font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                        >
                            <Zap size={20} /> Launch Campaign
                        </button>
                    </div>

                    <p className="text-center text-xs text-slate-400">Campaign will be created with PAUSED status. You can activate it from Ads Manager.</p>
                </div>
            )}
        </div>
    );
};

export default CreateCampaign;
