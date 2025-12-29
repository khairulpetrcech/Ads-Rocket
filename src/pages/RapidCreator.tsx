
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
    useDraggable,
    useDroppable,
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
    Zap, Settings, Loader2, Edit2
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
    adsetId: string | null;
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
    isExisting?: boolean;
}

// ============================================================
// DRAGGABLE CREATIVE CARD
// ============================================================

const DraggableCreativeCard: React.FC<{
    creative: Creative;
    onEdit: () => void;
    onRemove: () => void;
}> = ({ creative, onEdit, onRemove }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: creative.id,
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 999 : undefined,
        opacity: isDragging ? 0.5 : 1,
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            <div className={`relative bg-white rounded-lg border-2 overflow-hidden group transition-all cursor-grab active:cursor-grabbing
                ${isDragging ? 'border-blue-500 shadow-xl' : 'border-slate-200 hover:border-blue-400'}`}>
                <div className="aspect-square bg-slate-100 relative">
                    {creative.type === 'image' ? (
                        <img src={creative.preview} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <video src={creative.preview} className="w-full h-full object-cover" muted />
                    )}
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        {creative.type === 'video' ? <Video size={8} /> : <ImageIcon size={8} />}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-0.5 rounded opacity-0 group-hover:opacity-100"
                    >
                        <X size={10} />
                    </button>
                </div>
                <div className="p-1.5 border-t border-slate-100">
                    <p className="text-[10px] font-medium text-slate-700 truncate">{creative.name}</p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                        <span className={`text-[8px] px-1 py-0.5 rounded ${creative.primaryText ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>P</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded ${creative.headline ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>H</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded ${creative.description ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>D</span>
                        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="ml-auto text-slate-400 hover:text-blue-600">
                            <Edit2 size={10} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// DROPPABLE ADSET ZONE
// ============================================================

const DroppableAdSetZone: React.FC<{
    adset: RapidAdSet;
    creatives: Creative[];
    onSettingsClick: () => void;
    onDeleteAdSet: () => void;
    onEditCreative: (id: string) => void;
    onRemoveCreative: (id: string) => void;
}> = ({ adset, creatives, onSettingsClick, onDeleteAdSet, onEditCreative, onRemoveCreative }) => {
    const { isOver, setNodeRef } = useDroppable({ id: adset.id });

    return (
        <div
            ref={setNodeRef}
            className={`bg-white rounded-lg border-2 transition-all ${isOver ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-slate-200'}`}
        >
            <div className="flex items-center justify-between p-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{adset.name}</span>
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{adset.targeting}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{adset.country}</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500">{creatives.length}</span>
                    <button onClick={onSettingsClick} className="text-slate-400 hover:text-blue-600 p-1"><Settings size={12} /></button>
                    {!adset.isExisting && <button onClick={onDeleteAdSet} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={12} /></button>}
                </div>
            </div>
            <div className="p-2 min-h-[80px]">
                {creatives.length === 0 ? (
                    <div className={`flex items-center justify-center h-[60px] border-2 border-dashed rounded text-[11px] transition-colors
                        ${isOver ? 'border-blue-400 bg-blue-100 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
                        Drop creatives here
                    </div>
                ) : (
                    <div className="grid grid-cols-5 gap-1.5">
                        {creatives.map(c => (
                            <DraggableCreativeCard key={c.id} creative={c} onEdit={() => onEditCreative(c.id)} onRemove={() => onRemoveCreative(c.id)} />
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

    if (!isOpen || !creative) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className="relative w-[360px] bg-white h-full shadow-2xl overflow-y-auto">
                <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-slate-800">Edit Creative</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    </div>
                    <div className="mb-4 rounded-lg overflow-hidden border border-slate-200">
                        {creative.type === 'image' ? (
                            <img src={creative.preview} alt="" className="w-full aspect-video object-cover" />
                        ) : (
                            <video src={creative.preview} className="w-full aspect-video object-cover" controls />
                        )}
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-slate-700 mb-1 block">Primary Text</label>
                            <textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} placeholder="Primary text..." rows={3}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm outline-none resize-none" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-700 mb-1 block">Headline</label>
                            <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline..."
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm outline-none" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-700 mb-1 block">Description</label>
                            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description..."
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm outline-none" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-700 mb-1 block">Call to Action</label>
                            <select value={callToAction} onChange={(e) => setCallToAction(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm outline-none">
                                <option value="LEARN_MORE">Learn More</option>
                                <option value="SHOP_NOW">Shop Now</option>
                                <option value="SIGN_UP">Sign Up</option>
                                <option value="ORDER_NOW">Order Now</option>
                                <option value="WHATSAPP_MESSAGE">WhatsApp</option>
                            </select>
                        </div>
                        <button onClick={() => { onSave({ primaryText, headline, description, callToAction }); onClose(); }}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg">
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

    // Campaign & AdSet Selection
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [existingAdSets, setExistingAdSets] = useState<AdSet[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('new');
    const [selectedExistingAdSetId, setSelectedExistingAdSetId] = useState<string>('new');
    const [newCampaignName, setNewCampaignName] = useState('');

    // Pages & Pixels
    const [pages, setPages] = useState<any[]>([]);
    const [pixels, setPixels] = useState<any[]>([]);
    const [selectedPageId, setSelectedPageId] = useState('');
    const [selectedPixelId, setSelectedPixelId] = useState('');
    const [destinationUrl, setDestinationUrl] = useState('');

    // Creatives & AdSets
    const [creatives, setCreatives] = useState<Creative[]>([]);
    const [adSets, setAdSets] = useState<RapidAdSet[]>([]);

    // UI
    const [editingCreativeId, setEditingCreativeId] = useState<string | null>(null);
    const [isLaunching, setIsLaunching] = useState(false);
    const [launchProgress, setLaunchProgress] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loadingData, setLoadingData] = useState(true);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

    // Add existing adset to the list when selected
    useEffect(() => {
        if (selectedExistingAdSetId !== 'new') {
            const existingAdSet = existingAdSets.find(a => a.id === selectedExistingAdSetId);
            if (existingAdSet && !adSets.find(a => a.id === existingAdSet.id)) {
                setAdSets(prev => [...prev, {
                    id: existingAdSet.id,
                    name: existingAdSet.name,
                    dailyBudget: 50,
                    targeting: 'BROAD',
                    country: 'MY',
                    ageMin: 18,
                    ageMax: 65,
                    gender: 'ALL',
                    isExisting: true
                }]);
            }
            setSelectedExistingAdSetId('new');
        }
    }, [selectedExistingAdSetId, existingAdSets, adSets]);

    // ============================================================
    // FILE HANDLING
    // ============================================================

    const handleFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
        addFiles(files);
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(Array.from(e.target.files));
    };

    const addFiles = (files: File[]) => {
        const newCreatives: Creative[] = files.map(file => ({
            id: `creative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            preview: URL.createObjectURL(file),
            type: file.type.startsWith('video/') ? 'video' : 'image',
            name: file.name.replace(/\.[^.]+$/, ''),
            primaryText: '',
            headline: '',
            description: '',
            callToAction: 'LEARN_MORE',
            adsetId: null
        }));
        setCreatives(prev => [...prev, ...newCreatives]);
    };

    const removeCreative = (id: string) => setCreatives(prev => prev.filter(c => c.id !== id));
    const updateCreative = (id: string, updates: Partial<Creative>) => setCreatives(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

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
        setCreatives(prev => prev.map(c => c.adsetId === id ? { ...c, adsetId: null } : c));
        setAdSets(prev => prev.filter(a => a.id !== id));
    };

    // ============================================================
    // DRAG & DROP
    // ============================================================

    const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over) return;

        const creativeId = active.id as string;
        const overId = over.id as string;

        // Check if dropped on an adset
        const targetAdSet = adSets.find(a => a.id === overId);
        if (targetAdSet) {
            setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, adsetId: overId } : c));
        } else if (overId === 'ungrouped-zone') {
            setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, adsetId: null } : c));
        }
    };

    // ============================================================
    // LAUNCH ADS
    // ============================================================

    const handleLaunchAds = async () => {
        if (selectedCampaignId === 'new' && !newCampaignName.trim()) return alert('Please enter a campaign name');
        if (!selectedPageId) return alert('Please select a Facebook Page');
        if (!destinationUrl) return alert('Please enter a destination URL');

        const groupedCreatives = creatives.filter(c => c.adsetId !== null);
        if (groupedCreatives.length === 0) return alert('Please assign at least one creative to an ad set');

        setIsLaunching(true);

        try {
            let campaignId = selectedCampaignId;

            if (selectedCampaignId === 'new') {
                setLaunchProgress('Creating campaign...');
                campaignId = await createMetaCampaign(settings.adAccountId, settings.fbAccessToken, newCampaignName, 'OUTCOME_SALES');
            }

            for (const adset of adSets) {
                const adsetCreatives = groupedCreatives.filter(c => c.adsetId === adset.id);
                if (adsetCreatives.length === 0) continue;

                let adsetId = adset.id;

                // Create new adset if not existing
                if (!adset.isExisting) {
                    setLaunchProgress(`Creating ${adset.name}...`);
                    const adsetResult = await createMetaAdSet(settings.adAccountId, campaignId, adset.name, adset.dailyBudget, 'OFFSITE_CONVERSIONS', selectedPixelId, settings.fbAccessToken);
                    adsetId = adsetResult.id;
                }

                for (const creative of adsetCreatives) {
                    setLaunchProgress(`Uploading ${creative.name}...`);

                    let mediaHash = '';
                    let videoId = '';

                    if (creative.type === 'image') {
                        mediaHash = await uploadAdImage(settings.adAccountId, creative.file, settings.fbAccessToken);
                    } else {
                        const thumbnailBlob = await extractVideoThumbnail(creative.file);
                        const thumbnailHash = await uploadAdImageBlob(settings.adAccountId, thumbnailBlob, settings.fbAccessToken);
                        videoId = await uploadAdVideo(settings.adAccountId, creative.file, settings.fbAccessToken);
                        mediaHash = thumbnailHash;
                    }

                    setLaunchProgress(`Creating ad: ${creative.name}...`);

                    const advPlusConfig: AdvantagePlusConfig = { enabled: false, visualTouchups: false, textOptimizations: false, mediaCropping: false, music: false };

                    const creativeId = await createMetaCreative(
                        settings.adAccountId, creative.name, selectedPageId,
                        creative.type === 'image' ? mediaHash : videoId,
                        creative.primaryText, creative.headline, destinationUrl, settings.fbAccessToken,
                        creative.type, creative.callToAction, creative.description, advPlusConfig,
                        creative.type === 'video' ? mediaHash : undefined
                    );

                    await createMetaAd(settings.adAccountId, settings.fbAccessToken, adsetId, creative.name, creativeId);
                }
            }

            alert('🎉 All ads launched successfully!');
            setCreatives([]);
            setAdSets([]);
            setNewCampaignName('');
        } catch (error: any) {
            console.error('Launch failed:', error);
            alert(`Failed: ${error.message}`);
        } finally {
            setIsLaunching(false);
            setLaunchProgress('');
        }
    };

    // ============================================================
    // COMPUTED
    // ============================================================

    const ungroupedCreatives = useMemo(() => creatives.filter(c => c.adsetId === null), [creatives]);
    const editingCreative = useMemo(() => creatives.find(c => c.id === editingCreativeId) || null, [creatives, editingCreativeId]);
    const canLaunch = useMemo(() => {
        const hasGrouped = creatives.some(c => c.adsetId !== null);
        const hasCampaign = selectedCampaignId !== 'new' || newCampaignName.trim();
        return hasGrouped && hasCampaign && selectedPageId && destinationUrl;
    }, [creatives, selectedCampaignId, newCampaignName, selectedPageId, destinationUrl]);

    // Ungrouped zone droppable
    const { setNodeRef: setUngroupedRef, isOver: isOverUngrouped } = useDroppable({ id: 'ungrouped-zone' });

    if (loadingData) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* CENTERED NARROW LAYOUT */}
            <div className="max-w-4xl mx-auto space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <Zap className="text-yellow-500" size={24} /> Rapid Creator
                        </h1>
                        <p className="text-slate-500 text-xs">Drag & drop to launch ads fast</p>
                    </div>
                    <button onClick={handleLaunchAds} disabled={!canLaunch || isLaunching}
                        className={`px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm
                            ${canLaunch && !isLaunching ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                        {isLaunching ? <><Loader2 className="animate-spin" size={16} /> {launchProgress || 'Launching...'}</> : <><Zap size={16} /> Launch Ads</>}
                    </button>
                </div>

                {/* Settings Row */}
                <div className="grid grid-cols-4 gap-3">
                    {/* Campaign */}
                    <div className="bg-white rounded-lg border border-slate-200 p-3">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Campaign</label>
                        <select value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none">
                            <option value="new">+ New Campaign</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {selectedCampaignId === 'new' && (
                            <input type="text" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="Campaign name..."
                                className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none" />
                        )}
                    </div>

                    {/* Ad Set */}
                    <div className="bg-white rounded-lg border border-slate-200 p-3">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Ad Set</label>
                        <select value={selectedExistingAdSetId} onChange={(e) => setSelectedExistingAdSetId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none">
                            <option value="new">+ New Ad Set</option>
                            {existingAdSets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <button onClick={addAdSet} className="w-full mt-1.5 text-blue-600 hover:bg-blue-50 text-xs font-medium py-1 rounded border border-blue-200">
                            <Plus size={12} className="inline mr-1" />Create New
                        </button>
                    </div>

                    {/* Page */}
                    <div className="bg-white rounded-lg border border-slate-200 p-3">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Page</label>
                        <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none">
                            {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* URL */}
                    <div className="bg-white rounded-lg border border-slate-200 p-3">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">URL</label>
                        <input type="url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://..."
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none" />
                    </div>
                </div>

                {/* Upload Zone */}
                <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}
                    className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-300 rounded-xl p-6 text-center hover:border-blue-500 transition-all cursor-pointer">
                    <input type="file" multiple accept="image/*,video/*" onChange={handleFileSelect} className="hidden" id="file-upload" />
                    <label htmlFor="file-upload" className="cursor-pointer">
                        <Upload className="mx-auto text-blue-500 mb-2" size={32} />
                        <p className="text-blue-700 font-bold text-sm">Drop creatives here</p>
                        <p className="text-blue-500 text-xs mt-0.5">or click to browse</p>
                    </label>
                </div>

                {/* Ungrouped Creatives */}
                {ungroupedCreatives.length > 0 && (
                    <div ref={setUngroupedRef} className={`bg-slate-50 rounded-lg border p-3 transition-all ${isOverUngrouped ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-slate-700 text-sm">Ungrouped Creatives</h3>
                            <span className="text-xs text-slate-500">{ungroupedCreatives.length} items • Drag to ad sets</span>
                        </div>
                        <div className="grid grid-cols-8 gap-2">
                            {ungroupedCreatives.map(c => (
                                <DraggableCreativeCard key={c.id} creative={c} onEdit={() => setEditingCreativeId(c.id)} onRemove={() => removeCreative(c.id)} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Ad Sets */}
                <div className="space-y-2">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        Ad Sets {adSets.length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{adSets.length}</span>}
                    </h3>
                    {adSets.length === 0 ? (
                        <div className="bg-white rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
                            <p className="text-slate-400 text-sm">No ad sets. Create one or select existing above.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {adSets.map(adset => (
                                <DroppableAdSetZone key={adset.id} adset={adset} creatives={creatives.filter(c => c.adsetId === adset.id)}
                                    onSettingsClick={() => { }} onDeleteAdSet={() => removeAdSet(adset.id)} onEditCreative={setEditingCreativeId} onRemoveCreative={removeCreative} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <EditDrawer creative={editingCreative} isOpen={!!editingCreativeId} onClose={() => setEditingCreativeId(null)}
                onSave={(updates) => { if (editingCreativeId) updateCreative(editingCreativeId, updates); }} />

            <DragOverlay>
                {activeId && creatives.find(c => c.id === activeId) ? (
                    <div className="w-20 opacity-90">
                        <div className="bg-white rounded-lg border-2 border-blue-500 shadow-xl overflow-hidden">
                            <div className="aspect-square bg-slate-100">
                                {creatives.find(c => c.id === activeId)!.type === 'image' ? (
                                    <img src={creatives.find(c => c.id === activeId)!.preview} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <video src={creatives.find(c => c.id === activeId)!.preview} className="w-full h-full object-cover" muted />
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default RapidCreator;
