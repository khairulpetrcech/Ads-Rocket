
import React, { useState, useEffect } from 'react';
import { useSettings } from '../App';
import { 
    getRealCampaigns, 
    getAdSets, 
    createMetaCampaign, 
    createMetaAdSet, 
    createMetaAd, 
    uploadAdImage,
    createMetaCreative,
    getPages
} from '../services/metaService';
import { CheckCircle, Circle, ChevronRight, Loader2, Upload, AlertTriangle, RefreshCw } from 'lucide-react';

const CreateCampaign: React.FC = () => {
    const { settings } = useSettings();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // --- DATA STATE ---
    const [existingCampaigns, setExistingCampaigns] = useState<any[]>([]);
    const [existingAdSets, setExistingAdSets] = useState<any[]>([]);
    const [userPages, setUserPages] = useState<any[]>([]);

    // --- FORM STATE ---
    // Step 1: Campaign
    const [campaignMode, setCampaignMode] = useState<'new' | 'existing'>('new');
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    const [newCampaignName, setNewCampaignName] = useState('');
    const [objective, setObjective] = useState('OUTCOME_TRAFFIC'); // Default to safer option without pixel

    // Step 2: Ad Set
    const [adSetMode, setAdSetMode] = useState<'new' | 'existing'>('new');
    const [selectedAdSetId, setSelectedAdSetId] = useState('');
    const [newAdSetName, setNewAdSetName] = useState('');
    const [dailyBudget, setDailyBudget] = useState(50);
    const [optimizationGoal, setOptimizationGoal] = useState('LINK_CLICKS');

    // Step 3: Ad Creative
    const [selectedPageId, setSelectedPageId] = useState('');
    const [adName, setAdName] = useState('');
    const [primaryText, setPrimaryText] = useState('');
    const [headline, setHeadline] = useState('');
    const [destinationUrl, setDestinationUrl] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);

    // Initial Data Load
    useEffect(() => {
        if (!settings.adAccountId || !settings.fbAccessToken) return;

        const loadData = async () => {
            try {
                // Load Campaigns
                const campaigns = await getRealCampaigns(settings.adAccountId, settings.fbAccessToken);
                setExistingCampaigns(campaigns);

                // Load Pages
                if (settings.fbAccessToken !== 'dummy_token') {
                    const pages = await getPages(settings.fbAccessToken);
                    setUserPages(pages);
                    if (pages.length > 0) setSelectedPageId(pages[0].id);
                } else {
                    // Dummy Pages
                    setUserPages([{id: 'p1', name: 'Demo Page'}]);
                    setSelectedPageId('p1');
                }

            } catch (e) {
                console.error("Failed to load initial data", e);
            }
        };
        loadData();
    }, [settings.adAccountId, settings.fbAccessToken]);

    // Load AdSets when Campaign Changes
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

    // --- HANDLERS ---

    const handleNext = () => {
        if (step === 1) {
            if (campaignMode === 'new' && !newCampaignName) return setError("Enter campaign name");
            if (campaignMode === 'existing' && !selectedCampaignId) return setError("Select a campaign");
        }
        if (step === 2) {
             if (adSetMode === 'new') {
                 if (!newAdSetName) return setError("Enter Ad Set Name");
                 if (dailyBudget < 5) return setError("Min Budget is RM 5");
             }
             if (adSetMode === 'existing' && !selectedAdSetId) return setError("Select an Ad Set");
        }
        if (step === 3) {
            if (!adName || !primaryText || !headline || !destinationUrl) return setError("Fill all ad details");
            if (!selectedPageId) return setError("Select a Facebook Page");
            if (!imageFile) return setError("Upload an image");
        }

        setError('');
        setStep(prev => prev + 1);
    };

    const handleSubmit = async () => {
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
                const res = await createMetaAdSet(adAccountId, finalCampaignId, newAdSetName, dailyBudget, optimizationGoal, fbAccessToken);
                finalAdSetId = res.id;
            }

            // 3. Upload Image
            const imageHash = await uploadAdImage(adAccountId, imageFile!, fbAccessToken);

            // 4. Create Creative
            const creativeId = await createMetaCreative(
                adAccountId,
                adName,
                selectedPageId,
                imageHash,
                primaryText,
                headline,
                destinationUrl,
                fbAccessToken
            );

            // 5. Create Ad
            await createMetaAd(adAccountId, finalAdSetId, adName, creativeId, fbAccessToken);

            setSuccessMsg("Campaign Created Successfully! Check your Dashboard.");
            setStep(1); // Reset or stay
            
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to create campaign");
        } finally {
            setLoading(false);
        }
    };

    // --- RENDER HELPERS ---

    const renderStepIndicator = () => (
        <div className="flex items-center justify-center gap-4 mb-8">
            {[1, 2, 3, 4].map(s => (
                <div key={s} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                        {step > s ? <CheckCircle size={16}/> : s}
                    </div>
                    {s < 4 && <div className={`w-8 h-0.5 ${step > s ? 'bg-indigo-600' : 'bg-slate-700'}`}></div>}
                </div>
            ))}
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-6">Create New Campaign</h1>
            
            {renderStepIndicator()}

            <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-6 shadow-xl">
                
                {error && (
                    <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 flex items-center gap-2 text-sm">
                        <AlertTriangle size={16}/> {error}
                    </div>
                )}
                
                {successMsg && (
                    <div className="mb-4 p-3 bg-green-900/20 border border-green-800 rounded-lg text-green-400 flex items-center gap-2 text-sm">
                        <CheckCircle size={16}/> {successMsg}
                    </div>
                )}

                {/* STEP 1: CAMPAIGN */}
                {step === 1 && (
                    <div className="space-y-6 animate-fadeIn">
                        <h2 className="text-xl font-semibold text-white">Step 1: Campaign Details</h2>
                        
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setCampaignMode('new')}
                                className={`flex-1 py-3 rounded-lg border text-sm font-medium ${campaignMode === 'new' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            >
                                Create New
                            </button>
                            <button 
                                onClick={() => setCampaignMode('existing')}
                                className={`flex-1 py-3 rounded-lg border text-sm font-medium ${campaignMode === 'existing' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            >
                                Use Existing
                            </button>
                        </div>

                        {campaignMode === 'new' ? (
                            <>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Campaign Name</label>
                                    <input 
                                        type="text" 
                                        value={newCampaignName}
                                        onChange={(e) => setNewCampaignName(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                        placeholder="e.g. Raya Sale 2024"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Objective</label>
                                    <select 
                                        value={objective}
                                        onChange={(e) => setObjective(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none"
                                    >
                                        <option value="OUTCOME_TRAFFIC">Traffic (Link Clicks)</option>
                                        <option value="OUTCOME_SALES">Sales (Conversions - Requires Pixel)</option>
                                        <option value="OUTCOME_AWARENESS">Awareness</option>
                                    </select>
                                </div>
                            </>
                        ) : (
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Select Campaign</label>
                                <select 
                                    value={selectedCampaignId}
                                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none"
                                >
                                    <option value="">-- Select Campaign --</option>
                                    {existingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2: AD SET */}
                {step === 2 && (
                    <div className="space-y-6 animate-fadeIn">
                        <h2 className="text-xl font-semibold text-white">Step 2: Ad Set</h2>
                        
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setAdSetMode('new')}
                                className={`flex-1 py-3 rounded-lg border text-sm font-medium ${adSetMode === 'new' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            >
                                Create New
                            </button>
                            <button 
                                onClick={() => setAdSetMode('existing')}
                                className={`flex-1 py-3 rounded-lg border text-sm font-medium ${adSetMode === 'existing' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            >
                                Use Existing
                            </button>
                        </div>

                        {adSetMode === 'new' ? (
                            <>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Ad Set Name</label>
                                    <input 
                                        type="text" 
                                        value={newAdSetName}
                                        onChange={(e) => setNewAdSetName(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                        placeholder="e.g. Broad Audience - MY"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">Daily Budget (RM)</label>
                                        <input 
                                            type="number" 
                                            value={dailyBudget}
                                            onChange={(e) => setDailyBudget(parseFloat(e.target.value))}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">Optimization</label>
                                        <select 
                                            value={optimizationGoal}
                                            onChange={(e) => setOptimizationGoal(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none"
                                        >
                                            <option value="LINK_CLICKS">Link Clicks</option>
                                            <option value="OFFSITE_CONVERSIONS">Conversions (Sales)</option>
                                            <option value="IMPRESSIONS">Impressions</option>
                                            <option value="REACH">Reach</option>
                                        </select>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 italic">Targeting set to: Malaysia, Age 18-65+</p>
                            </>
                        ) : (
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Select Ad Set</label>
                                <select 
                                    value={selectedAdSetId}
                                    onChange={(e) => setSelectedAdSetId(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none"
                                >
                                    <option value="">-- Select Ad Set --</option>
                                    {existingAdSets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 3: CREATIVE */}
                {step === 3 && (
                    <div className="space-y-6 animate-fadeIn">
                        <h2 className="text-xl font-semibold text-white">Step 3: Ad Creative</h2>
                        
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Facebook Page</label>
                            {userPages.length > 0 ? (
                                <select 
                                    value={selectedPageId}
                                    onChange={(e) => setSelectedPageId(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none"
                                >
                                    <option value="">-- Select Page --</option>
                                    {userPages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            ) : (
                                <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg text-yellow-500 text-sm">
                                    <div className="flex items-center gap-2 mb-1">
                                        <AlertTriangle size={14} /> No Pages Found
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        We couldn't find any Facebook Pages you manage. 
                                        You may need to <strong className="text-white">Disconnect</strong> and Reconnect to grant "Page" permissions.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Ad Name</label>
                            <input 
                                type="text" 
                                value={adName}
                                onChange={(e) => setAdName(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                placeholder="e.g. Image Ad V1"
                            />
                        </div>

                        <div className="border border-dashed border-slate-600 rounded-xl p-6 text-center hover:bg-slate-800 transition-colors cursor-pointer relative">
                             <input 
                                type="file" 
                                accept="image/*"
                                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                             />
                             <Upload className="mx-auto text-slate-400 mb-2" />
                             <p className="text-slate-300 text-sm font-medium">{imageFile ? imageFile.name : "Click to upload Image"}</p>
                             <p className="text-slate-500 text-xs">JPG, PNG (Max 5MB)</p>
                        </div>

                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Primary Text</label>
                            <textarea 
                                value={primaryText}
                                onChange={(e) => setPrimaryText(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none h-24"
                                placeholder="Main ad copy..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Headline</label>
                            <input 
                                type="text" 
                                value={headline}
                                onChange={(e) => setHeadline(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                placeholder="Bold Headline"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Website URL</label>
                            <input 
                                type="text" 
                                value={destinationUrl}
                                onChange={(e) => setDestinationUrl(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                placeholder="https://..."
                            />
                        </div>
                    </div>
                )}

                {/* STEP 4: REVIEW */}
                {step === 4 && (
                    <div className="space-y-6 animate-fadeIn text-center">
                         <h2 className="text-xl font-semibold text-white">Review & Publish</h2>
                         <div className="bg-slate-800 p-4 rounded-lg text-left text-sm space-y-2 border border-slate-700">
                             <p><span className="text-slate-400">Campaign:</span> {campaignMode === 'new' ? newCampaignName : 'Existing'}</p>
                             <p><span className="text-slate-400">Ad Set:</span> {adSetMode === 'new' ? `${newAdSetName} (RM${dailyBudget})` : 'Existing'}</p>
                             <p><span className="text-slate-400">Ad:</span> {adName}</p>
                             <p><span className="text-slate-400">Headline:</span> {headline}</p>
                         </div>
                         <p className="text-slate-400 text-xs">By clicking Publish, this ad will be created in your account as PAUSED.</p>
                    </div>
                )}

                <div className="flex justify-between mt-8 pt-6 border-t border-slate-700">
                    <button 
                        disabled={step === 1 || loading}
                        onClick={() => setStep(s => s - 1)}
                        className="px-6 py-2 text-slate-400 hover:text-white disabled:opacity-50"
                    >
                        Back
                    </button>
                    
                    {step < 4 ? (
                        <button 
                            onClick={handleNext}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2 rounded-lg font-medium flex items-center gap-2"
                        >
                            Next <ChevronRight size={16}/>
                        </button>
                    ) : (
                        <button 
                            onClick={handleSubmit}
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-500 text-white px-8 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                        >
                            {loading && <Loader2 className="animate-spin" size={16}/>}
                            {loading ? 'Publishing...' : 'Publish Campaign'}
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
};

export default CreateCampaign;
