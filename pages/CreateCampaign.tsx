
import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../App';
import { 
    getRealCampaigns, 
    getAdSets, 
    createMetaCampaign, 
    createMetaAdSet, 
    createMetaAd, 
    uploadAdImage,
    uploadAdVideo, // New
    waitForVideoReady, // New
    createMetaCreative,
    getPages,
    getPixels
} from '../services/metaService';
import { CheckCircle, Loader2, Upload, AlertTriangle, Save, FolderOpen, Trash2, ChevronDown, Video, Image as ImageIcon } from 'lucide-react';

interface Template {
    id: string;
    name: string;
    data: any;
}

const CreateCampaign: React.FC = () => {
    const { settings } = useSettings();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // --- TEMPLATES ---
    const [templates, setTemplates] = useState<Template[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);
    const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // --- DATA STATE ---
    const [existingCampaigns, setExistingCampaigns] = useState<any[]>([]);
    const [existingAdSets, setExistingAdSets] = useState<any[]>([]);
    const [userPages, setUserPages] = useState<any[]>([]);
    const [userPixels, setUserPixels] = useState<any[]>([]);

    // --- FORM STATE ---
    // Campaign
    const [campaignMode, setCampaignMode] = useState<'new' | 'existing'>('new');
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    const [newCampaignName, setNewCampaignName] = useState('');
    const [objective, setObjective] = useState('OUTCOME_TRAFFIC');

    // Ad Set
    const [adSetMode, setAdSetMode] = useState<'new' | 'existing'>('new');
    const [selectedAdSetId, setSelectedAdSetId] = useState('');
    const [newAdSetName, setNewAdSetName] = useState('');
    const [dailyBudget, setDailyBudget] = useState(50);
    const [optimizationGoal, setOptimizationGoal] = useState('LINK_CLICKS');
    const [selectedPixelId, setSelectedPixelId] = useState('');

    // Creative
    const [selectedPageId, setSelectedPageId] = useState('');
    const [adName, setAdName] = useState('');
    const [primaryText, setPrimaryText] = useState('');
    const [headline, setHeadline] = useState('');
    const [destinationUrl, setDestinationUrl] = useState('');
    
    // MEDIA STATE
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
    const [filePreview, setFilePreview] = useState<string | null>(null);

    // RATE LIMITING REF
    const lastPublishTime = useRef<number>(0);

    // Initial Data Load
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
                    if (pixels.length > 0) setSelectedPixelId(pixels[0].id);
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

    // Handle File Selection & Preview
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setMediaFile(file);
            
            // Determine type
            if (file.type.startsWith('video/') || file.name.endsWith('.avi')) {
                setMediaType('video');
            } else {
                setMediaType('image');
            }

            // Create Preview
            if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.avi')) {
                setFilePreview(null); // No browser preview for HEIC/AVI usually
            } else {
                setFilePreview(URL.createObjectURL(file));
            }
        }
    };

    // --- TEMPLATE HANDLERS ---
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
                selectedPageId, primaryText, headline, destinationUrl
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
        if (d.primaryText) setPrimaryText(d.primaryText);
        if (d.headline) setHeadline(d.headline);
        if (d.destinationUrl) setDestinationUrl(d.destinationUrl);
        setShowTemplatesDropdown(false);
    };

    const deleteTemplate = (id: string, e: any) => {
        e.stopPropagation();
        const updated = templates.filter(t => t.id !== id);
        setTemplates(updated);
        localStorage.setItem('ar_templates', JSON.stringify(updated));
    };

    // --- SUBMIT HANDLER ---

    const handleSubmit = async () => {
        // Validation
        if (campaignMode === 'new' && !newCampaignName) return setError("Enter campaign name");
        if (campaignMode === 'existing' && !selectedCampaignId) return setError("Select a campaign");
        if (adSetMode === 'new' && !newAdSetName) return setError("Enter Ad Set Name");
        if (adSetMode === 'existing' && !selectedAdSetId) return setError("Select an Ad Set");
        if (!adName || !primaryText || !headline || !destinationUrl) return setError("Fill all ad details");
        if (!selectedPageId) return setError("Select a Facebook Page");
        if (!mediaFile) return setError("Upload an image or video");

        // RATE LIMITING
        const now = Date.now();
        if (now - lastPublishTime.current < 5000) {
            return setError("Please wait a few seconds before publishing again.");
        }
        lastPublishTime.current = now;

        setLoading(true);
        setError('');
        try {
            const { adAccountId, fbAccessToken } = settings;
            
            // 1. Resolve Campaign ID
            let finalCampaignId = selectedCampaignId;
            if (campaignMode === 'new') {
                const res = await createMetaCampaign(adAccountId, newCampaignName, objective, fbAccessToken);
                finalCampaignId = res.id;
            }

            // 2. Resolve Ad Set ID
            let finalAdSetId = selectedAdSetId;
            if (adSetMode === 'new') {
                const pixelToUse = (objective === 'OUTCOME_SALES' && optimizationGoal === 'OFFSITE_CONVERSIONS') 
                    ? selectedPixelId 
                    : null;

                const res = await createMetaAdSet(
                    adAccountId, 
                    finalCampaignId, 
                    newAdSetName, 
                    dailyBudget, 
                    optimizationGoal, 
                    pixelToUse,
                    fbAccessToken
                );
                finalAdSetId = res.id;
            }

            // 3. Upload Asset (Image or Video)
            let assetId = '';
            if (mediaType === 'image') {
                assetId = await uploadAdImage(adAccountId, mediaFile!, fbAccessToken);
            } else {
                // Video Process
                const videoId = await uploadAdVideo(adAccountId, mediaFile!, fbAccessToken);
                // Wait for processing
                const isReady = await waitForVideoReady(videoId, fbAccessToken);
                if (!isReady) throw new Error("Video processing timed out. Try smaller file.");
                assetId = videoId;
            }

            // 4. Create Creative
            const creativeId = await createMetaCreative(
                adAccountId,
                adName,
                selectedPageId,
                assetId,
                primaryText,
                headline,
                destinationUrl,
                fbAccessToken,
                mediaType // 'image' or 'video'
            );

            // 5. Create Ad
            await createMetaAd(adAccountId, finalAdSetId, adName, creativeId, fbAccessToken);

            setSuccessMsg("Campaign Created Successfully! Check your Dashboard.");
            window.scrollTo(0, 0);
            
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to create campaign. Check parameters.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Create New Campaign</h1>
                
                <div className="flex gap-2 relative">
                    {/* Load Template Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button 
                            onClick={() => setShowTemplatesDropdown(!showTemplatesDropdown)}
                            className="flex items-center gap-2 bg-slate-800 text-slate-300 px-3 py-2 rounded-lg hover:bg-slate-700"
                        >
                            <FolderOpen size={16} /> Templates <ChevronDown size={14} />
                        </button>
                        {showTemplatesDropdown && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 animate-fadeIn">
                                {templates.length === 0 ? (
                                    <div className="p-3 text-xs text-slate-500">No templates saved.</div>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {templates.map(t => (
                                            <div key={t.id} onClick={() => handleLoadTemplate(t)} className="px-4 py-3 hover:bg-slate-700 text-sm cursor-pointer flex justify-between items-center text-slate-300 border-b border-slate-700 last:border-0">
                                                <span className="truncate max-w-[140px]">{t.name}</span>
                                                <Trash2 size={14} className="hover:text-red-400 text-slate-600" onClick={(e) => deleteTemplate(t.id, e)} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                        className="flex items-center gap-2 bg-indigo-600/20 text-indigo-300 px-3 py-2 rounded-lg hover:bg-indigo-600/30 border border-indigo-500/30"
                    >
                        <Save size={16} /> Save Config
                    </button>
                </div>
            </div>

            {/* Save Template Modal */}
            {showSaveTemplate && (
                <div className="mb-6 bg-slate-800 p-4 rounded-xl border border-indigo-500/30 flex gap-2 animate-fadeIn">
                    <input 
                        type="text" 
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Template Name (e.g. Winning Scale Setup)"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none"
                    />
                    <button onClick={handleSaveTemplate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">Save</button>
                    <button onClick={() => setShowSaveTemplate(false)} className="text-slate-400 px-2">Cancel</button>
                </div>
            )}

            {/* Error / Success Messages */}
            {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-xl text-red-400 flex items-center gap-2">
                    <AlertTriangle size={20}/> {error}
                </div>
            )}
            
            {successMsg && (
                <div className="mb-6 p-4 bg-green-900/20 border border-green-800 rounded-xl text-green-400 flex items-center gap-2">
                    <CheckCircle size={20}/> {successMsg}
                </div>
            )}

            <div className="space-y-6">
                
                {/* --- SECTION 1: CAMPAIGN --- */}
                <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-700 pb-2">1. Campaign Settings</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                         <div className="space-y-4">
                            <label className="text-sm text-slate-400">Campaign Mode</label>
                            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                                <button onClick={() => setCampaignMode('new')} className={`flex-1 py-2 text-sm rounded-md transition-colors ${campaignMode === 'new' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Create New</button>
                                <button onClick={() => setCampaignMode('existing')} className={`flex-1 py-2 text-sm rounded-md transition-colors ${campaignMode === 'existing' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Use Existing</button>
                            </div>
                         </div>

                         {campaignMode === 'new' ? (
                             <>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Campaign Name</label>
                                    <input type="text" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 outline-none" placeholder="e.g. Raya Promo"/>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Objective</label>
                                    <select value={objective} onChange={(e) => setObjective(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none">
                                        <option value="OUTCOME_TRAFFIC">Traffic (Link Clicks)</option>
                                        <option value="OUTCOME_SALES">Sales (Conversions)</option>
                                        <option value="OUTCOME_AWARENESS">Awareness</option>
                                    </select>
                                </div>
                             </>
                         ) : (
                             <div className="md:col-span-2">
                                <label className="block text-sm text-slate-400 mb-1">Select Campaign</label>
                                <select value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none">
                                    <option value="">-- Select Campaign --</option>
                                    {existingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                             </div>
                         )}
                    </div>
                </div>

                {/* --- SECTION 2: AD SET --- */}
                <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-700 pb-2">2. Ad Set Settings</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <label className="text-sm text-slate-400">Ad Set Mode</label>
                            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                                <button onClick={() => setAdSetMode('new')} className={`flex-1 py-2 text-sm rounded-md transition-colors ${adSetMode === 'new' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Create New</button>
                                <button onClick={() => setAdSetMode('existing')} className={`flex-1 py-2 text-sm rounded-md transition-colors ${adSetMode === 'existing' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Use Existing</button>
                            </div>
                         </div>

                         {adSetMode === 'new' ? (
                             <>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Ad Set Name</label>
                                    <input type="text" value={newAdSetName} onChange={(e) => setNewAdSetName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 outline-none" placeholder="e.g. Broad Targeting"/>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Daily Budget (RM)</label>
                                    <input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 outline-none"/>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Optimization</label>
                                    <select value={optimizationGoal} onChange={(e) => setOptimizationGoal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none">
                                        <option value="LINK_CLICKS">Link Clicks</option>
                                        <option value="OFFSITE_CONVERSIONS">Conversions (Sales)</option>
                                        <option value="IMPRESSIONS">Impressions</option>
                                    </select>
                                </div>
                                
                                {objective === 'OUTCOME_SALES' && (
                                    <div className="animate-fadeIn">
                                        <label className="block text-sm text-slate-400 mb-1 text-green-400 font-semibold">Pixel (Required for Sales)</label>
                                        {userPixels.length > 0 ? (
                                            <select value={selectedPixelId} onChange={(e) => setSelectedPixelId(e.target.value)} className="w-full bg-slate-900 border border-green-800 rounded-lg px-4 py-2 text-white outline-none focus:ring-1 focus:ring-green-500">
                                                {userPixels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        ) : (
                                            <p className="text-xs text-red-400 bg-red-900/10 p-2 rounded">No Pixels found. Please create one in Events Manager.</p>
                                        )}
                                    </div>
                                )}
                             </>
                         ) : (
                             <div className="md:col-span-2">
                                <label className="block text-sm text-slate-400 mb-1">Select Ad Set</label>
                                <select value={selectedAdSetId} onChange={(e) => setSelectedAdSetId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none">
                                    <option value="">-- Select Ad Set --</option>
                                    {existingAdSets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                             </div>
                         )}
                    </div>
                </div>

                {/* --- SECTION 3: CREATIVE --- */}
                <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-700 pb-2">3. Ad Creative</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Facebook Page</label>
                            {userPages.length > 0 ? (
                                <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none">
                                    <option value="">-- Select Page --</option>
                                    {userPages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            ) : (
                                <p className="text-xs text-yellow-500">No Pages found. Re-login with 'Manage Pages' access.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Ad Name</label>
                            <input type="text" value={adName} onChange={(e) => setAdName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none" placeholder="Ad Name"/>
                        </div>
                        
                        <div className="md:col-span-2">
                             <div className="border border-dashed border-slate-600 rounded-xl p-6 text-center hover:bg-slate-800 transition-colors cursor-pointer relative overflow-hidden group">
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
                                                <img src={filePreview} className="h-32 object-contain rounded-lg mb-2" alt="Preview" />
                                             ) : (
                                                <video src={filePreview} className="h-32 rounded-lg mb-2" controls muted />
                                             )
                                         ) : (
                                             <div className="h-24 w-full flex items-center justify-center bg-slate-900 rounded-lg mb-2 border border-slate-700">
                                                 {mediaType === 'image' ? <ImageIcon size={32} /> : <Video size={32} />}
                                             </div>
                                         )}
                                         <p className="text-green-400 text-sm font-medium">{mediaFile.name}</p>
                                         <p className="text-xs text-slate-500">{mediaType === 'video' ? 'Video File' : 'Image File'}</p>
                                     </div>
                                 ) : (
                                     <>
                                        <Upload className="mx-auto text-slate-400 mb-2 group-hover:text-white" />
                                        <p className="text-slate-300 text-sm font-medium">Click to upload Media</p>
                                        <p className="text-xs text-slate-500 mt-1">Supports Images (JPG, PNG, HEIC) & Videos (MP4, AVI)</p>
                                     </>
                                 )}
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm text-slate-400 mb-1">Primary Text</label>
                            <textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white h-24 outline-none" placeholder="Main Copy..."/>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Headline</label>
                            <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none" placeholder="Bold Headline"/>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Destination URL</label>
                            <input type="text" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none" placeholder="https://..."/>
                        </div>
                    </div>
                </div>

                {/* PUBLISH BUTTON */}
                <div className="pt-6 border-t border-slate-700">
                     <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-500 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-green-900/30 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.01]"
                    >
                        {loading && <Loader2 className="animate-spin" size={24}/>}
                        {loading ? 'Publishing to Meta... (Video may take time)' : 'PUBLISH CAMPAIGN NOW'}
                    </button>
                    <p className="text-center text-xs text-slate-500 mt-3">This will create the campaign in your Ads Manager. Default status: PAUSED.</p>
                </div>

            </div>
        </div>
    );
};

export default CreateCampaign;