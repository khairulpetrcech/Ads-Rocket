
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSettings } from '../App';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    closestCenter,
    useSensor,
    useSensors,
    PointerSensor,
} from '@dnd-kit/core';
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
import { AdCampaign, AdSet, AdvantagePlusConfig } from '../types';
import {
    Upload, Image as ImageIcon, Video, Trash2, X, Plus,
    Zap, ChevronDown, Settings, Loader2, CheckCircle,
    AlertTriangle, Edit2, GripVertical
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface Creative {
    id: string;
    file: File;
    preview: string;
    type: 'image' | 'video';
    name: string;
    primaryText: string;
    headline: string;
    description: string;
    callToAction: string;
    adsetId: string | null; // null = ungrouped
}

interface RapidAdSet {
    id: string;
    name: string;
    dailyBudget: number;
    targeting: 'BROAD' | 'CUSTOM';
    country: string;
    ageMin: number;
    ageMax: number;
    gender: 'ALL' | 'MALE' | 'FEMALE';
}

// ============================================================
// HELPER COMPONENTS
// ============================================================

const CreativeCard: React.FC<{
    creative: Creative;
    onEdit: () => void;
    onRemove: () => void;
    isDragging?: boolean;
}> = ({ creative, onEdit, onRemove, isDragging }) => {
    const hasText = creative.primaryText || creative.headline;

    return (
        <div
            className={`relative bg-white rounded-xl border-2 overflow-hidden group transition-all cursor-grab active:cursor-grabbing
                ${isDragging ? 'border-blue-500 shadow-xl scale-105 opacity-80' : 'border-slate-200 hover:border-blue-400 hover:shadow-md'}`}
        >
            {/* Thumbnail */}
            <div className="aspect-square bg-slate-100 relative">
                {creative.type === 'image' ? (
                    <img src={creative.preview} alt={creative.name} className="w-full h-full object-cover" />
                ) : (
                    <video src={creative.preview} className="w-full h-full object-cover" muted />
                )}

                {/* Type Badge */}
                <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    {creative.type === 'video' ? <Video size={10} /> : <ImageIcon size={10} />}
                    {creative.type.toUpperCase()}
                </div>

                {/* Delete Button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <X size={12} />
                </button>
            </div>

            {/* Info Bar */}
            <div className="p-2 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-700 truncate" title={creative.name}>
                    {creative.name}
                </p>
                <div className="flex items-center gap-1 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${creative.primaryText ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>P</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${creative.headline ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>H</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${creative.description ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>D</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        className="ml-auto text-slate-400 hover:text-blue-600"
                    >
                        <Edit2 size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const DroppableAdSetCard: React.FC<{
    adset: RapidAdSet;
    creatives: Creative[];
    onSettingsClick: () => void;
    onDeleteAdSet: () => void;
    onEditCreative: (id: string) => void;
    onRemoveCreative: (id: string) => void;
    isOver?: boolean;
}> = ({ adset, creatives, onSettingsClick, onDeleteAdSet, onEditCreative, onRemoveCreative, isOver }) => {
    return (
        <div className={`bg-white rounded-xl border-2 transition-all ${isOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{adset.name}</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{adset.targeting}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{adset.country}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{creatives.length} creatives</span>
                    <button onClick={onSettingsClick} className="text-slate-400 hover:text-blue-600">
                        <Settings size={16} />
                    </button>
                    <button onClick={onDeleteAdSet} className="text-slate-400 hover:text-red-500">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Creatives Grid */}
            <div className="p-3 min-h-[120px]">
                {creatives.length === 0 ? (
                    <div className="flex items-center justify-center h-[100px] border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
                        Drag creatives here
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-2">
                        {creatives.map(creative => (
                            <CreativeCard
                                key={creative.id}
                                creative={creative}
                                onEdit={() => onEditCreative(creative.id)}
                                onRemove={() => onRemoveCreative(creative.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================
// EDIT DRAWER
// ============================================================

const EditDrawer: React.FC<{
    creative: Creative | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: Partial<Creative>) => void;
}> = ({ creative, isOpen, onClose, onSave }) => {
    const [primaryText, setPrimaryText] = useState('');
    const [headline, setHeadline] = useState('');
    const [description, setDescription] = useState('');
    const [callToAction, setCallToAction] = useState('LEARN_MORE');

    useEffect(() => {
        if (creative) {
            setPrimaryText(creative.primaryText);
            setHeadline(creative.headline);
            setDescription(creative.description);
            setCallToAction(creative.callToAction);
        }
    }, [creative]);

    const handleSave = () => {
        onSave({ primaryText, headline, description, callToAction });
        onClose();
    };

    if (!isOpen || !creative) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />

            {/* Drawer */}
            <div className="relative w-[400px] bg-white h-full shadow-2xl animate-slideIn overflow-y-auto">
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Edit Creative</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Preview */}
                    <div className="mb-6 rounded-xl overflow-hidden border border-slate-200">
                        {creative.type === 'image' ? (
                            <img src={creative.preview} alt="" className="w-full aspect-video object-cover" />
                        ) : (
                            <video src={creative.preview} className="w-full aspect-video object-cover" controls />
                        )}
                    </div>

                    {/* Form */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1 block">Primary Text</label>
                            <textarea
                                value={primaryText}
                                onChange={(e) => setPrimaryText(e.target.value)}
                                placeholder="Enter primary text..."
                                rows={4}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1 block">Headline</label>
                            <input
                                type="text"
                                value={headline}
                                onChange={(e) => setHeadline(e.target.value)}
                                placeholder="Enter headline..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1 block">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Enter description..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1 block">Call to Action</label>
                            <select
                                value={callToAction}
                                onChange={(e) => setCallToAction(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="LEARN_MORE">Learn More</option>
                                <option value="SHOP_NOW">Shop Now</option>
                                <option value="SIGN_UP">Sign Up</option>
                                <option value="CONTACT_US">Contact Us</option>
                                <option value="ORDER_NOW">Order Now</option>
                                <option value="BUY_NOW">Buy Now</option>
                                <option value="WHATSAPP_MESSAGE">WhatsApp</option>
                            </select>
                        </div>

                        <button
                            onClick={handleSave}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

const RapidCreator: React.FC = () => {
    const { settings } = useSettings();

    // Campaign Selection
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [existingAdSets, setExistingAdSets] = useState<AdSet[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('new');
    const [selectedAdSetId, setSelectedAdSetId] = useState<string>('new');
    const [newCampaignName, setNewCampaignName] = useState('');
    const [campaignObjective, setCampaignObjective] = useState('OUTCOME_SALES');

    // Pages & Pixels
    const [pages, setPages] = useState<any[]>([]);
    const [pixels, setPixels] = useState<any[]>([]);
    const [selectedPageId, setSelectedPageId] = useState('');
    const [selectedPixelId, setSelectedPixelId] = useState('');
    const [destinationUrl, setDestinationUrl] = useState('');

    // Creatives & AdSets
    const [creatives, setCreatives] = useState<Creative[]>([]);
    const [adSets, setAdSets] = useState<RapidAdSet[]>([]);

    // UI State
    const [editingCreativeId, setEditingCreativeId] = useState<string | null>(null);
    const [isLaunching, setIsLaunching] = useState(false);
    const [launchProgress, setLaunchProgress] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loadingData, setLoadingData] = useState(true);

    // Drag sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // ============================================================
    // DATA LOADING
    // ============================================================

    useEffect(() => {
        const loadData = async () => {
            if (!settings.fbAccessToken || settings.fbAccessToken === 'dummy_token') {
                setLoadingData(false);
                return;
            }
            try {
                const [campaignsData, pagesData, pixelsData] = await Promise.all([
                    getRealCampaigns(settings.adAccountId, settings.fbAccessToken, 'last_7d'),
                    getPages(settings.fbAccessToken),
                    getPixels(settings.adAccountId, settings.fbAccessToken)
                ]);
                setCampaigns(campaignsData);
                setPages(pagesData);
                setPixels(pixelsData);
                if (pagesData.length > 0) setSelectedPageId(pagesData[0].id);
                if (pixelsData.length > 0) setSelectedPixelId(pixelsData[0].id);
            } catch (err) {
                console.error('Failed to load data:', err);
            }
            setLoadingData(false);
        };
        loadData();
    }, [settings.fbAccessToken, settings.adAccountId]);

    // Load adsets when campaign changes
    useEffect(() => {
        const loadAdSets = async () => {
            if (selectedCampaignId !== 'new' && settings.fbAccessToken) {
                try {
                    const data = await getAdSets(selectedCampaignId, settings.fbAccessToken, 'last_7d');
                    setExistingAdSets(data);
                } catch (err) {
                    console.error('Failed to load adsets:', err);
                }
            } else {
                setExistingAdSets([]);
            }
        };
        loadAdSets();
    }, [selectedCampaignId, settings.fbAccessToken]);

    // ============================================================
    // FILE HANDLING
    // ============================================================

    const handleFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(
            f => f.type.startsWith('image/') || f.type.startsWith('video/')
        );
        addFiles(files);
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            addFiles(files);
        }
    };

    const addFiles = (files: File[]) => {
        const newCreatives: Creative[] = files.map(file => ({
            id: `creative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            preview: URL.createObjectURL(file),
            type: file.type.startsWith('video/') ? 'video' : 'image',
            name: file.name.replace(/\.[^.]+$/, ''), // Remove extension
            primaryText: '',
            headline: '',
            description: '',
            callToAction: 'LEARN_MORE',
            adsetId: null
        }));
        setCreatives(prev => [...prev, ...newCreatives]);
    };

    const removeCreative = (id: string) => {
        setCreatives(prev => prev.filter(c => c.id !== id));
    };

    const updateCreative = (id: string, updates: Partial<Creative>) => {
        setCreatives(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    // ============================================================
    // ADSET MANAGEMENT
    // ============================================================

    const addAdSet = () => {
        const newAdSet: RapidAdSet = {
            id: `adset-${Date.now()}`,
            name: `Ad Set ${adSets.length + 1}`,
            dailyBudget: 50,
            targeting: 'BROAD',
            country: 'MY',
            ageMin: 18,
            ageMax: 65,
            gender: 'ALL'
        };
        setAdSets(prev => [...prev, newAdSet]);
    };

    const removeAdSet = (id: string) => {
        // Move creatives back to ungrouped
        setCreatives(prev => prev.map(c => c.adsetId === id ? { ...c, adsetId: null } : c));
        setAdSets(prev => prev.filter(a => a.id !== id));
    };

    // ============================================================
    // DRAG & DROP
    // ============================================================

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;

        if (!over) return;

        const creativeId = active.id as string;
        const overId = over.id as string;

        // If dropped on an adset zone
        if (overId.startsWith('adset-') || overId === 'ungrouped') {
            const newAdsetId = overId === 'ungrouped' ? null : overId;
            setCreatives(prev => prev.map(c =>
                c.id === creativeId ? { ...c, adsetId: newAdsetId } : c
            ));
        }
    };

    // ============================================================
    // LAUNCH ADS
    // ============================================================

    const handleLaunchAds = async () => {
        // Validation
        if (selectedCampaignId === 'new' && !newCampaignName.trim()) {
            alert('Please enter a campaign name');
            return;
        }
        if (!selectedPageId) {
            alert('Please select a Facebook Page');
            return;
        }
        if (!destinationUrl) {
            alert('Please enter a destination URL');
            return;
        }

        const groupedCreatives = creatives.filter(c => c.adsetId !== null);
        if (groupedCreatives.length === 0) {
            alert('Please assign at least one creative to an ad set');
            return;
        }

        setIsLaunching(true);

        try {
            let campaignId = selectedCampaignId;

            // Create campaign if new
            if (selectedCampaignId === 'new') {
                setLaunchProgress('Creating campaign...');
                campaignId = await createMetaCampaign(
                    settings.adAccountId,
                    settings.fbAccessToken,
                    newCampaignName,
                    campaignObjective
                );
            }

            // Process each adset
            for (const adset of adSets) {
                const adsetCreatives = groupedCreatives.filter(c => c.adsetId === adset.id);
                if (adsetCreatives.length === 0) continue;

                setLaunchProgress(`Creating ad set: ${adset.name}...`);

                // Create adset with correct signature: (accountId, campaignId, name, dailyBudget, optimizationGoal, pixelId, accessToken)
                const adsetResult = await createMetaAdSet(
                    settings.adAccountId,
                    campaignId,
                    adset.name,
                    adset.dailyBudget,
                    'OFFSITE_CONVERSIONS',
                    selectedPixelId,
                    settings.fbAccessToken
                );
                const adsetId = adsetResult.id;

                // Upload and create ads for each creative
                for (const creative of adsetCreatives) {
                    setLaunchProgress(`Uploading: ${creative.name}...`);

                    let mediaHash = '';
                    let videoId = '';

                    if (creative.type === 'image') {
                        // uploadAdImage signature: (accountId, file, accessToken)
                        mediaHash = await uploadAdImage(settings.adAccountId, creative.file, settings.fbAccessToken);
                    } else {
                        // For video, extract thumbnail first
                        const thumbnailBlob = await extractVideoThumbnail(creative.file);
                        // uploadAdImageBlob signature: (accountId, blob, accessToken)
                        const thumbnailHash = await uploadAdImageBlob(settings.adAccountId, thumbnailBlob, settings.fbAccessToken);
                        // uploadAdVideo signature: (accountId, file, accessToken)
                        videoId = await uploadAdVideo(settings.adAccountId, creative.file, settings.fbAccessToken);
                        mediaHash = thumbnailHash;
                    }

                    setLaunchProgress(`Creating ad: ${creative.name}...`);

                    // Advantage+ config (OFF by default)
                    const advPlusConfig: AdvantagePlusConfig = {
                        enabled: false,
                        visualTouchups: false,
                        textOptimizations: false,
                        mediaCropping: false,
                        music: false
                    };

                    // createMetaCreative signature: (accountId, name, pageId, assetId, message, headline, link, accessToken, mediaType, callToAction, description, advPlusConfig, thumbnailHash)
                    const creativeId = await createMetaCreative(
                        settings.adAccountId,
                        creative.name,
                        selectedPageId,
                        creative.type === 'image' ? mediaHash : videoId, // assetId (hash for image, id for video)
                        creative.primaryText, // message
                        creative.headline,
                        destinationUrl, // link
                        settings.fbAccessToken,
                        creative.type, // mediaType: 'image' | 'video'
                        creative.callToAction,
                        creative.description,
                        advPlusConfig,
                        creative.type === 'video' ? mediaHash : undefined // thumbnailHash for video
                    );

                    await createMetaAd(
                        settings.adAccountId,
                        settings.fbAccessToken,
                        adsetId,
                        creative.name,
                        creativeId
                    );
                }
            }

            setLaunchProgress('');
            alert('🎉 All ads launched successfully!');

            // Clear state
            setCreatives([]);
            setAdSets([]);
            setNewCampaignName('');

        } catch (error: any) {
            console.error('Launch failed:', error);
            alert(`Failed to launch: ${error.message}`);
        } finally {
            setIsLaunching(false);
            setLaunchProgress('');
        }
    };

    // ============================================================
    // COMPUTED VALUES
    // ============================================================

    const ungroupedCreatives = useMemo(() => creatives.filter(c => c.adsetId === null), [creatives]);
    const editingCreative = useMemo(() => creatives.find(c => c.id === editingCreativeId) || null, [creatives, editingCreativeId]);
    const canLaunch = useMemo(() => {
        const hasGroupedCreatives = creatives.some(c => c.adsetId !== null);
        const hasCampaign = selectedCampaignId !== 'new' || newCampaignName.trim();
        return hasGroupedCreatives && hasCampaign && selectedPageId && destinationUrl;
    }, [creatives, selectedCampaignId, newCampaignName, selectedPageId, destinationUrl]);

    // ============================================================
    // RENDER
    // ============================================================

    if (loadingData) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Zap className="text-yellow-500" size={28} />
                            Rapid Creator
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">
                            Drag & drop to launch ads in seconds
                        </p>
                    </div>
                    <button
                        onClick={handleLaunchAds}
                        disabled={!canLaunch || isLaunching}
                        className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all
                            ${canLaunch && !isLaunching
                                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/30'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    >
                        {isLaunching ? (
                            <><Loader2 className="animate-spin" size={18} /> {launchProgress || 'Launching...'}</>
                        ) : (
                            <><Zap size={18} /> Launch Ads</>
                        )}
                    </button>
                </div>

                {/* Campaign & Settings */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <label className="text-sm font-medium text-slate-700 mb-2 block">Campaign</label>
                        <select
                            value={selectedCampaignId}
                            onChange={(e) => setSelectedCampaignId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                        >
                            <option value="new">+ New Campaign</option>
                            {campaigns.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        {selectedCampaignId === 'new' && (
                            <input
                                type="text"
                                value={newCampaignName}
                                onChange={(e) => setNewCampaignName(e.target.value)}
                                placeholder="Campaign name..."
                                className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <label className="text-sm font-medium text-slate-700 mb-2 block">Facebook Page</label>
                        <select
                            value={selectedPageId}
                            onChange={(e) => setSelectedPageId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                        >
                            {pages.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <label className="text-sm font-medium text-slate-700 mb-2 block">Destination URL</label>
                        <input
                            type="url"
                            value={destinationUrl}
                            onChange={(e) => setDestinationUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* Upload Zone */}
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-300 rounded-2xl p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                >
                    <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                        <Upload className="mx-auto text-blue-500 mb-3" size={40} />
                        <p className="text-blue-700 font-bold text-lg">Drop creatives here</p>
                        <p className="text-blue-500 text-sm mt-1">or click to browse • Images & Videos</p>
                    </label>
                </div>

                {/* Ungrouped Creatives */}
                {ungroupedCreatives.length > 0 && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-slate-700">Ungrouped Creatives</h3>
                            <span className="text-xs text-slate-500">{ungroupedCreatives.length} items • Drag to ad sets below</span>
                        </div>
                        <div className="grid grid-cols-6 gap-3">
                            {ungroupedCreatives.map(creative => (
                                <div key={creative.id} data-id={creative.id}>
                                    <CreativeCard
                                        creative={creative}
                                        onEdit={() => setEditingCreativeId(creative.id)}
                                        onRemove={() => removeCreative(creative.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Ad Sets */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            Ad Sets
                            {adSets.length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{adSets.length}</span>}
                        </h3>
                        <button
                            onClick={addAdSet}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-sm"
                        >
                            <Plus size={16} /> Create Ad Set
                        </button>
                    </div>

                    {adSets.length === 0 ? (
                        <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
                            <p className="text-slate-400">No ad sets yet. Click "Create Ad Set" to start.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {adSets.map(adset => (
                                <DroppableAdSetCard
                                    key={adset.id}
                                    adset={adset}
                                    creatives={creatives.filter(c => c.adsetId === adset.id)}
                                    onSettingsClick={() => { }}
                                    onDeleteAdSet={() => removeAdSet(adset.id)}
                                    onEditCreative={(id) => setEditingCreativeId(id)}
                                    onRemoveCreative={removeCreative}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Drawer */}
            <EditDrawer
                creative={editingCreative}
                isOpen={!!editingCreativeId}
                onClose={() => setEditingCreativeId(null)}
                onSave={(updates) => {
                    if (editingCreativeId) {
                        updateCreative(editingCreativeId, updates);
                    }
                }}
            />

            {/* Drag Overlay */}
            <DragOverlay>
                {activeId ? (
                    <div className="w-32">
                        <CreativeCard
                            creative={creatives.find(c => c.id === activeId)!}
                            onEdit={() => { }}
                            onRemove={() => { }}
                            isDragging
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default RapidCreator;
