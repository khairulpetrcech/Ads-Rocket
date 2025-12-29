
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
    Zap, Settings, Loader2, Edit2, Rocket, FileVideo, FileImage,
    ChevronDown, Globe, FolderOpen, Copy
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
    adName: string; // Custom ad name (defaults to creative name)
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
// DRAGGABLE CREATIVE CARD - BEAUTIFIED
// ============================================================

const DraggableCreativeCard: React.FC<{
    creative: Creative;
    onEdit: () => void;
    onRemove: () => void;
    isCompact?: boolean;
}> = ({ creative, onEdit, onRemove, isCompact = false }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: creative.id,
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${isDragging ? 1.05 : 1})`,
        zIndex: isDragging ? 999 : undefined,
        opacity: isDragging ? 0.8 : 1,
        transition: isDragging ? 'none' : 'transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease',
    } : {
        transition: 'transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease',
    };

    // File size in MB
    const fileSize = (creative.file.size / (1024 * 1024)).toFixed(2);

    if (isCompact) {
        // List view style for 3-section layout
        return (
            <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                <div className={`flex items-center gap-3 p-3 bg-white rounded-xl border-2 transition-all cursor-grab active:cursor-grabbing group
                    ${isDragging ? 'border-blue-500 shadow-xl shadow-blue-500/20 scale-[1.02]' : 'border-slate-100 hover:border-blue-300 hover:shadow-lg shadow-sm'}`}>

                    {/* Thumbnail */}
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0">
                        {creative.type === 'image' ? (
                            <img src={creative.preview} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <video src={creative.preview} className="w-full h-full object-cover" muted />
                        )}
                        <div className={`absolute top-1 left-1 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5
                            ${creative.type === 'video' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                            {creative.type === 'video' ? <FileVideo size={8} /> : <FileImage size={8} />}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{creative.name}</p>
                        <p className="text-xs text-slate-500">{fileSize} MB • {creative.type.toUpperCase()}</p>
                        {creative.adsetId && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-green-600 mt-1">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                In Ad Set
                            </span>
                        )}
                    </div>

                    {/* Status Pills */}
                    <div className="flex items-center gap-1">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                            ${creative.primaryText ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>P</span>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                            ${creative.headline ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>H</span>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                            ${creative.description ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>D</span>
                    </div>

                    {/* Action Buttons - Larger touch targets */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all hover:scale-110"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-all hover:scale-110"
                        >
                            <X size={14} />
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 transition-all hover:scale-110">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Grid card view (original but beautified)
    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            <div className={`relative bg-white rounded-xl border-2 overflow-hidden group transition-all duration-200 cursor-grab active:cursor-grabbing
                ${isDragging ? 'border-blue-500 shadow-xl shadow-blue-500/20' : 'border-slate-100 hover:border-blue-300 shadow-sm hover:shadow-lg'}`}>

                {/* Image/Video Container */}
                <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                    {creative.type === 'image' ? (
                        <img src={creative.preview} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                        <video src={creative.preview} className="w-full h-full object-cover" muted />
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Type Badge */}
                    <div className={`absolute top-2 left-2 text-white text-[9px] font-bold px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm
                        ${creative.type === 'video' ? 'bg-purple-500/90' : 'bg-blue-500/90'}`}>
                        {creative.type === 'video' ? <FileVideo size={10} /> : <FileImage size={10} />}
                        {creative.type.toUpperCase()}
                    </div>

                    {/* Delete Button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
                        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg"
                    >
                        <X size={12} />
                    </button>
                </div>

                {/* Card Footer */}
                <div className="p-2.5 border-t border-slate-100 bg-white">
                    <p className="text-xs font-semibold text-slate-800 truncate mb-2">{creative.name}</p>

                    <div className="flex items-center justify-between">
                        {/* Status Pills */}
                        <div className="flex items-center gap-1">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all
                                ${creative.primaryText ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>P</span>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all
                                ${creative.headline ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>H</span>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all
                                ${creative.description ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>D</span>
                        </div>

                        {/* Edit Button - LARGER for easy clicking */}
                        <button
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all hover:scale-110"
                        >
                            <Edit2 size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// DROPPABLE ADSET ZONE - ENHANCED
// ============================================================

const DroppableAdSetZone: React.FC<{
    adset: RapidAdSet;
    creatives: Creative[];
    onCopyAdSet: () => void;
    onDeleteAdSet: () => void;
    onEditCreative: (id: string) => void;
    onRemoveCreative: (id: string) => void;
    onUpdateAdName: (creativeId: string, adName: string) => void;
    isExpanded?: boolean;
    onToggle?: () => void;
}> = ({ adset, creatives, onCopyAdSet, onDeleteAdSet, onEditCreative, onRemoveCreative, onUpdateAdName, isExpanded = true, onToggle }) => {
    const { isOver, setNodeRef } = useDroppable({ id: adset.id });

    return (
        <div
            ref={setNodeRef}
            className={`bg-white rounded-xl border-2 transition-all duration-300 overflow-hidden
                ${isOver ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-500/10 scale-[1.01]' : 'border-slate-100 hover:border-slate-200'}`}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <button onClick={onToggle} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <ChevronDown size={16} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                    </button>
                    <FolderOpen size={16} className="text-blue-500" />
                    <span className="text-sm font-bold text-slate-800">{adset.name}</span>
                    <span className="text-[10px] bg-gradient-to-r from-green-400 to-green-500 text-white px-2 py-0.5 rounded-full font-semibold shadow-sm">
                        {adset.targeting}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Globe size={8} /> {adset.country}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{creatives.length} creatives</span>
                    <button onClick={onCopyAdSet} title="Copy Ad Set" className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <Copy size={14} />
                    </button>
                    {!adset.isExisting && (
                        <button onClick={onDeleteAdSet} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="p-3">
                    {creatives.length === 0 ? (
                        <div className={`flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-xl transition-all duration-300
                            ${isOver ? 'border-blue-400 bg-blue-100/50 scale-[1.02]' : 'border-slate-200 bg-slate-50/50'}`}>
                            <Upload size={24} className={`mb-2 transition-colors ${isOver ? 'text-blue-500' : 'text-slate-300'}`} />
                            <p className={`text-sm font-medium transition-colors ${isOver ? 'text-blue-600' : 'text-slate-400'}`}>
                                Drop creatives here
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {creatives.map(c => (
                                <div key={c.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    {/* Thumbnail */}
                                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0">
                                        {c.type === 'image' ? (
                                            <img src={c.preview} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <video src={c.preview} className="w-full h-full object-cover" muted />
                                        )}
                                        <div className={`absolute top-1 left-1 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md
                                            ${c.type === 'video' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                                            {c.type === 'video' ? 'VIDEO' : 'IMG'}
                                        </div>
                                    </div>
                                    {/* Info + Ad Name Input */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-500 mb-1">{c.name}</p>
                                        <input
                                            type="text"
                                            value={c.adName}
                                            onChange={(e) => onUpdateAdName(c.id, e.target.value)}
                                            placeholder="Enter ad name..."
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    {/* Status Pills */}
                                    <div className="flex items-center gap-1">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${c.primaryText ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'}`}>P</span>
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${c.headline ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'}`}>H</span>
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${c.description ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'}`}>D</span>
                                    </div>
                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => onEditCreative(c.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all">
                                            <Edit2 size={14} />
                                        </button>
                                        <button onClick={() => onRemoveCreative(c.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all">
                                            <X size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================
// EDIT DRAWER - SMOOTH SLIDE ANIMATION
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
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (creative) {
            setPrimaryText(creative.primaryText);
            setHeadline(creative.headline);
            setDescription(creative.description);
            setCallToAction(creative.callToAction);
        }
    }, [creative]);

    // Animation handling
    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsAnimating(true);
                });
            });
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible || !creative) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop with fade animation */}
            <div
                className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            {/* Drawer with slide animation */}
            <div className={`relative w-[400px] bg-white h-full shadow-2xl overflow-y-auto transition-transform duration-300 ease-out
                ${isAnimating ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Edit Creative</h3>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Preview */}
                    <div className="mb-6 rounded-xl overflow-hidden border-2 border-slate-100 shadow-sm">
                        {creative.type === 'image' ? (
                            <img src={creative.preview} alt="" className="w-full aspect-video object-cover" />
                        ) : (
                            <video src={creative.preview} className="w-full aspect-video object-cover" controls />
                        )}
                    </div>

                    {/* Form */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-700 mb-2 block uppercase tracking-wide">Primary Text</label>
                            <textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} placeholder="Write your primary text..."
                                rows={3}
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-700 mb-2 block uppercase tracking-wide">Headline</label>
                            <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Enter headline..."
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-700 mb-2 block uppercase tracking-wide">Description</label>
                            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enter description..."
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-700 mb-2 block uppercase tracking-wide">Call to Action</label>
                            <select value={callToAction} onChange={(e) => setCallToAction(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors appearance-none cursor-pointer">
                                <option value="LEARN_MORE">Learn More</option>
                                <option value="SHOP_NOW">Shop Now</option>
                                <option value="SIGN_UP">Sign Up</option>
                                <option value="ORDER_NOW">Order Now</option>
                                <option value="WHATSAPP_MESSAGE">WhatsApp</option>
                            </select>
                        </div>
                        <button onClick={() => { onSave({ primaryText, headline, description, callToAction }); onClose(); }}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// MAIN COMPONENT - 3 SECTION LAYOUT
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
    const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());

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

    // Add existing adset to the list when selected - FIXED GLITCH
    const handleExistingAdSetSelect = (adsetId: string) => {
        setSelectedExistingAdSetId(adsetId);

        if (adsetId !== 'new') {
            const existingAdSet = existingAdSets.find(a => a.id === adsetId);
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
                // Expand newly added adset
                setExpandedAdSets(prev => new Set([...prev, existingAdSet.id]));
            }
        }
    };

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
        const newCreatives: Creative[] = files.map(file => {
            const name = file.name.replace(/\.[^.]+$/, '');
            return {
                id: `creative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                file,
                preview: URL.createObjectURL(file),
                type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
                name,
                adName: name, // Default ad name to creative name
                primaryText: '',
                headline: '',
                description: '',
                callToAction: 'LEARN_MORE',
                adsetId: null
            };
        });
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
        setExpandedAdSets(prev => new Set([...prev, newAdSet.id]));
    };

    const removeAdSet = (id: string) => {
        setCreatives(prev => prev.map(c => c.adsetId === id ? { ...c, adsetId: null } : c));
        setAdSets(prev => prev.filter(a => a.id !== id));
        setExpandedAdSets(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    // Copy/duplicate an adset
    const copyAdSet = (id: string) => {
        const sourceAdSet = adSets.find(a => a.id === id);
        if (!sourceAdSet) return;
        const newId = `adset-${Date.now()}`;
        const newAdSet: RapidAdSet = {
            ...sourceAdSet,
            id: newId,
            name: `${sourceAdSet.name} (Copy)`,
            isExisting: false
        };
        setAdSets(prev => [...prev, newAdSet]);
        setExpandedAdSets(prev => new Set([...prev, newId]));
    };

    // Update ad name for a creative
    const updateAdName = (creativeId: string, adName: string) => {
        setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, adName } : c));
    };

    const toggleAdSetExpanded = (id: string) => {
        setExpandedAdSets(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // ============================================================
    // DRAG & DROP WITH SMOOTH ANIMATION
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

                    const creativeIdResult = await createMetaCreative(
                        settings.adAccountId, creative.name, selectedPageId,
                        creative.type === 'image' ? mediaHash : videoId,
                        creative.primaryText, creative.headline, destinationUrl, settings.fbAccessToken,
                        creative.type, creative.callToAction, creative.description, advPlusConfig,
                        creative.type === 'video' ? mediaHash : undefined
                    );

                    await createMetaAd(settings.adAccountId, settings.fbAccessToken, adsetId, creative.name, creativeIdResult);
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

    // Get selected campaign name for header
    const selectedCampaignName = selectedCampaignId === 'new'
        ? (newCampaignName || 'New Campaign')
        : campaigns.find(c => c.id === selectedCampaignId)?.name || 'Select Campaign';

    if (loadingData) return (
        <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
                <Loader2 className="animate-spin text-blue-600 mx-auto mb-3" size={40} />
                <p className="text-slate-500 text-sm">Loading data...</p>
            </div>
        </div>
    );

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* 3-SECTION LAYOUT */}
            <div className="flex gap-6 h-[calc(100vh-120px)]">

                {/* LEFT PANEL - Upload & Settings */}
                <div className="w-80 flex-shrink-0 space-y-4 overflow-y-auto pr-2">
                    {/* Upload Section Header */}
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 mb-1">Upload Creatives</h2>
                        <p className="text-xs text-slate-500">Configure where you want to upload your ad creatives</p>
                    </div>

                    {/* Campaign Selection */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-2 block uppercase tracking-wide">Campaign</label>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            <span className="text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">ABO</span>
                        </div>
                        <select value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors appearance-none cursor-pointer">
                            <option value="new">+ New Campaign</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {selectedCampaignId === 'new' && (
                            <input type="text" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="Enter campaign name..."
                                className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors" />
                        )}
                    </div>

                    {/* Ad Set Selection */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-2 block uppercase tracking-wide">Ad Set</label>
                        <select value={selectedExistingAdSetId} onChange={(e) => handleExistingAdSetSelect(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors appearance-none cursor-pointer">
                            <option value="new">• Create new ad sets</option>
                            {existingAdSets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>

                    {/* Website URL */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-2 block uppercase tracking-wide flex items-center gap-2">
                            Website URL <Globe size={12} className="text-slate-400" />
                            <span className="text-slate-400 font-normal normal-case">Or enter website URL manually</span>
                        </label>
                        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <Globe size={16} className="text-slate-400" />
                            <span className="text-sm text-slate-600">Use default website URL</span>
                        </div>
                        <input type="url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://..."
                            className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors" />
                    </div>

                    {/* Page Selection */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-2 block uppercase tracking-wide">Facebook Page</label>
                        <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors appearance-none cursor-pointer">
                            {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* Upload Zone */}
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-3 block uppercase tracking-wide">Upload Creatives</label>
                        <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}
                            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group">
                            <input type="file" multiple accept="image/*,video/*" onChange={handleFileSelect} className="hidden" id="file-upload" />
                            <label htmlFor="file-upload" className="cursor-pointer">
                                <div className="w-12 h-12 mx-auto mb-3 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                    <Upload className="text-blue-500" size={24} />
                                </div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">Click to upload ad creatives</p>
                                <p className="text-xs text-slate-400">or drag & drop your selected ad creatives here</p>
                                <p className="text-[10px] text-slate-400 mt-2">Accepts images (JPG & PNG) and videos (MP4 & MOV) up to 4GB</p>
                            </label>
                        </div>
                    </div>
                </div>

                {/* CENTER/RIGHT PANEL - Campaign & Creatives */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-lg font-bold text-slate-800">Uploading to</h2>
                                <span className="text-lg font-bold text-blue-600">{selectedCampaignName}</span>
                                <Edit2 size={14} className="text-slate-400" />
                            </div>
                            <p className="text-xs text-slate-500">Preview {creatives.length} creatives. Drag to group into ad sets.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all">
                                <Settings size={18} />
                            </button>
                            <button onClick={addAdSet}
                                className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg font-semibold text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2">
                                <Plus size={16} /> Create Ad Set
                            </button>
                            {/* ROCKET ICON for Launch */}
                            <button onClick={handleLaunchAds} disabled={!canLaunch || isLaunching}
                                className={`px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm transition-all shadow-lg
                                    ${canLaunch && !isLaunching
                                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}>
                                {isLaunching ? (
                                    <><Loader2 className="animate-spin" size={16} /> {launchProgress || 'Launching...'}</>
                                ) : (
                                    <><Rocket size={16} /> Launch Ads</>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Ad Sets Area */}
                    <div className="flex-1 overflow-y-auto space-y-3">
                        {/* Ad Set Tabs */}
                        {adSets.length > 0 && (
                            <div className="flex items-center gap-2 mb-2">
                                {adSets.map((adset, idx) => (
                                    <button key={adset.id}
                                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2">
                                        <FolderOpen size={14} className="text-slate-400" />
                                        Ad Set {idx + 1}
                                        <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                            {creatives.filter(c => c.adsetId === adset.id).length} creatives
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Targeting Badges */}
                        {adSets.length > 0 && (
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                    Broad
                                </span>
                                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                                    <Globe size={10} /> US
                                </span>
                            </div>
                        )}

                        {/* Creatives List - Compact View */}
                        <div ref={setUngroupedRef} className={`space-y-2 transition-all ${isOverUngrouped ? 'ring-2 ring-blue-400 ring-offset-2 rounded-xl' : ''}`}>
                            {creatives.map(creative => (
                                <DraggableCreativeCard
                                    key={creative.id}
                                    creative={creative}
                                    onEdit={() => setEditingCreativeId(creative.id)}
                                    onRemove={() => removeCreative(creative.id)}
                                    isCompact={true}
                                />
                            ))}
                        </div>

                        {/* Empty State */}
                        {creatives.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                <Upload size={40} className="text-slate-300 mb-3" />
                                <p className="text-slate-500 font-medium">No creatives uploaded yet</p>
                                <p className="text-slate-400 text-sm">Upload creatives from the left panel</p>
                            </div>
                        )}

                        {/* Ad Sets */}
                        {adSets.length > 0 && (
                            <div className="space-y-3 mt-4">
                                <h3 className="text-sm font-bold text-slate-700">Ad Sets</h3>
                                {adSets.map(adset => (
                                    <DroppableAdSetZone
                                        key={adset.id}
                                        adset={adset}
                                        creatives={creatives.filter(c => c.adsetId === adset.id)}
                                        onCopyAdSet={() => copyAdSet(adset.id)}
                                        onDeleteAdSet={() => removeAdSet(adset.id)}
                                        onEditCreative={setEditingCreativeId}
                                        onRemoveCreative={removeCreative}
                                        onUpdateAdName={updateAdName}
                                        isExpanded={expandedAdSets.has(adset.id)}
                                        onToggle={() => toggleAdSetExpanded(adset.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <EditDrawer creative={editingCreative} isOpen={!!editingCreativeId} onClose={() => setEditingCreativeId(null)}
                onSave={(updates) => { if (editingCreativeId) updateCreative(editingCreativeId, updates); }} />

            {/* Drag Overlay with smooth animation */}
            <DragOverlay dropAnimation={{
                duration: 250,
                easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
                {activeId && creatives.find(c => c.id === activeId) ? (
                    <div className="w-24 opacity-95 rotate-3 scale-105">
                        <div className="bg-white rounded-xl border-2 border-blue-500 shadow-2xl shadow-blue-500/30 overflow-hidden">
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
