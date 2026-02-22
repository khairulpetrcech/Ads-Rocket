
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { useToast } from '../contexts/ToastContext';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    closestCenter,
    pointerWithin,
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
    getWhatsAppPhoneNumbersForPage,
    extractVideoThumbnail,
    uploadAdImageBlob
} from '../services/metaService';
import { WhatsAppPhoneNumber } from '../services/metaService';
import { AdCampaign, AdSet, AdvantagePlusConfig, AdTemplate } from '../types';
import {
    Upload, Image as ImageIcon, Video, Trash2, X, Plus,
    Zap, Settings, Loader2, Edit2, Rocket, FileVideo, FileImage,
    ChevronDown, Globe, FolderOpen, Copy, CheckCircle, ShoppingBag, MessageSquare, Palette, Book, Settings as SettingsIcon, Send
} from 'lucide-react';
import { assistantChatWithContext, rapidCreatorAssistantWithActions, RapidCreatorAction, parseAdTemplatePrompt, ParsedAdTemplate } from '../services/aiService';
import { ChatMessage, AssistantContext } from '../types';
import { CreativeCard, CardMacFinder } from '../components/CreativeCardVariants';
import TextPresetsDialog from '../components/TextPresetsDialog';
import { useSettings } from '../App';

// ============================================================
// TYPES
// ============================================================

interface Creative {
    id: string;
    file?: File;
    preview: string;
    type: 'image' | 'video';
    name: string;
    adName: string; // Custom ad name (defaults to creative name)
    primaryText: string;
    headline: string;
    description: string;
    callToAction: string;
    adsetId: string | null;
    isPlaceholder?: boolean;
    isImported?: boolean;
    supabaseId?: string;
    expiresAt?: string;
    source?: 'epic_poster' | 'epic_video' | null;
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
    interests: string[]; // Selected interest categories
    enhancementPlus: boolean; // Creative Enhancement+
    isExisting?: boolean;
    // Schedule settings
    scheduleEnabled?: boolean;
    scheduleStartDate?: string; // YYYY-MM-DD format
    scheduleStartTime?: string; // HH:mm format (Malaysia time GMT+8)
}

// ============================================================



// ============================================================
// DRAGGABLE CREATIVE CARD WRAPPER
// ============================================================

const DraggableCreativeCard: React.FC<{
    creative: Creative;
    onEdit: () => void;
    onRemove: () => void;
    variant?: 'default' | 'mac-finder';
}> = ({ creative, onEdit, onRemove, variant = 'default' }) => {
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

    const CardComponent = variant === 'mac-finder' ? CardMacFinder : CreativeCard;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            {/* Wrapper to handle selection/dragging states */}
            <div className={`relative transition-all duration-200 cursor-grab active:cursor-grabbing
                ${isDragging ? 'scale-105 z-50' : 'hover:scale-[1.02]'}`}>
                <CardComponent
                    creative={creative}
                    onEdit={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(); }}
                    onRemove={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
                />
            </div>
        </div>
    );
};

const DroppableCreativeRow: React.FC<{
    creative: Creative;
    onUpdateAdName: (name: string) => void;
    onDuplicate: () => void;
    onEdit: () => void;
    onRemove: () => void;
    onRemoveMedia: () => void;
}> = ({ creative, onUpdateAdName, onDuplicate, onEdit, onRemove, onRemoveMedia }) => {
    const { setNodeRef, isOver } = useDroppable({ id: creative.id });

    return (
        <div
            ref={setNodeRef}
            className={`group flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-300 relative
                ${isOver ? 'border-blue-500 bg-blue-50 shadow-[0_0_20px_rgba(59,130,246,0.3)] ring-2 ring-blue-500/10 scale-[1.01] z-10' : 'bg-slate-50 border-slate-100 z-0'}`}
        >
            {/* Thumbnail */}
            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0">
                {creative.isPlaceholder ? (
                    <div className="w-full h-full bg-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                        {creative.type === 'video' ? <FileVideo size={20} /> : <FileImage size={20} />}
                        <span className="text-[7px] font-bold uppercase opacity-50">Empty</span>
                    </div>
                ) : creative.type === 'image' ? (
                    <img src={creative.preview} alt="" className="w-full h-full object-cover" />
                ) : (
                    <video src={creative.preview} className="w-full h-full object-cover" muted />
                )}

                {/* REMOVE MEDIA ONLY BUTTON */}
                {!creative.isPlaceholder && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemoveMedia(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute bottom-1 right-1 w-5 h-5 bg-white/90 backdrop-blur rounded flex items-center justify-center text-red-500 shadow-sm hover:bg-red-500 hover:text-white transition-all scale-0 group-hover:scale-100 opacity-0 group-hover:opacity-100"
                        title="Remove media only"
                    >
                        <X size={10} strokeWidth={3} />
                    </button>
                )}

                <div className={`absolute top-1 left-1 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md
                    ${creative.isPlaceholder ? 'bg-slate-400' : creative.type === 'video' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                    {creative.type === 'video' ? 'VIDEO' : 'IMG'}
                </div>
            </div>
            {/* Info + Ad Name Input */}
            <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 mb-1">{creative.name}</p>
                <input
                    type="text"
                    value={creative.adName}
                    onChange={(e) => onUpdateAdName(e.target.value)}
                    placeholder="Enter ad name..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
            {/* Status Pills */}
            <div className="flex items-center gap-1">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${creative.primaryText ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'}`}>P</span>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${creative.headline ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'}`}>H</span>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${creative.description ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'}`}>D</span>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1">
                <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Duplicate"
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-slate-400 hover:text-purple-600 transition-all"
                >
                    <Copy size={14} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all"
                >
                    <Edit2 size={14} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};


const DroppableAdSetZone: React.FC<{
    adset: RapidAdSet;
    creatives: Creative[];
    onCopyAdSet: () => void;
    onDeleteAdSet: () => void;
    onEditCreative: (id: string) => void;
    onRemoveCreative: (id: string) => void;
    onUpdateAdName: (creativeId: string, adName: string) => void;
    onRenameAdSet: (newName: string) => void;
    onOpenSettings: () => void;
    onDuplicateCreative: (id: string) => void;
    onRemoveMedia: (id: string) => void;
    isExpanded?: boolean;
    onToggle?: () => void;
}> = ({ adset, creatives, onCopyAdSet, onDeleteAdSet, onEditCreative, onRemoveCreative, onUpdateAdName, onRenameAdSet, onOpenSettings, onDuplicateCreative, onRemoveMedia, isExpanded = true, onToggle }) => {
    const { isOver, setNodeRef } = useDroppable({ id: adset.id });
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(adset.name);

    return (
        <div
            ref={setNodeRef}
            className={`bg-white rounded-xl border-2 transition-all duration-300 relative
                ${isOver ? 'border-blue-500 bg-blue-50/50 shadow-[0_0_40px_rgba(59,130,246,0.5)] ring-4 ring-blue-600/20 scale-[1.01] z-20' : 'border-slate-100 hover:border-slate-200 z-0'}`}
        >
            {/* Header */}
            <div className={`flex items-center justify-between p-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 rounded-t-xl`}>
                <div className="flex items-center gap-3">
                    <button onClick={onToggle} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <ChevronDown size={16} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                    </button>
                    <FolderOpen size={16} className="text-blue-500" />
                    {isEditing ? (
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => { onRenameAdSet(editName); setIsEditing(false); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { onRenameAdSet(editName); setIsEditing(false); } }}
                            className="text-sm font-bold text-slate-800 bg-white border border-blue-400 rounded px-2 py-0.5 outline-none w-32"
                            autoFocus
                        />
                    ) : (
                        <span
                            className="text-sm font-bold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => setIsEditing(true)}
                            title="Click to rename"
                        >{adset.name}</span>
                    )}
                    <span
                        onClick={onOpenSettings}
                        className="text-[10px] bg-gradient-to-r from-green-400 to-green-500 text-white px-2 py-0.5 rounded-full font-semibold shadow-sm cursor-pointer hover:from-green-500 hover:to-green-600 transition-all"
                    >
                        {adset.targeting}
                    </span>
                    <span
                        onClick={onOpenSettings}
                        className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 cursor-pointer hover:bg-slate-200 transition-all"
                    >
                        <Globe size={8} /> {adset.country}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{creatives.length} creatives</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onCopyAdSet(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="Copy Ad Set"
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    >
                        <Copy size={14} />
                    </button>
                    {!adset.isExisting && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDeleteAdSet(); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
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
                                <DroppableCreativeRow
                                    key={c.id}
                                    creative={c}
                                    onUpdateAdName={(name) => onUpdateAdName(c.id, name)}
                                    onDuplicate={() => onDuplicateCreative(c.id)}
                                    onEdit={() => onEditCreative(c.id)}
                                    onRemove={() => onRemoveCreative(c.id)}
                                    onRemoveMedia={() => onRemoveMedia(c.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================
// EDIT DRAWER - SMOOTH SLIDE ANIMATION + COPY FROM DROPDOWN + AUTO-SAVE
// ============================================================

const EditDrawer: React.FC<{
    creative: Creative | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: Partial<Creative>) => void;
    allCreatives: Creative[];
    onShowToast: (msg: string) => void;
}> = ({ creative, isOpen, onClose, onSave, allCreatives, onShowToast }) => {
    const [primaryText, setPrimaryText] = useState('');
    const [headline, setHeadline] = useState('');
    const [description, setDescription] = useState('');
    const [callToAction, setCallToAction] = useState('LEARN_MORE');
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [showCopyDropdown, setShowCopyDropdown] = useState(false);
    const [showPrimaryPresets, setShowPrimaryPresets] = useState(false);
    const [showHeadlinePresets, setShowHeadlinePresets] = useState(false);
    const [activePrimaryName, setActivePrimaryName] = useState('');
    const [activeHeadlineName, setActiveHeadlineName] = useState('');

    // Access Global Settings for Presets
    const { settings } = useSettings();
    // Filter presets that have text content
    const availablePrimaryPresets = useMemo(() => (settings.presetPrimaryTexts || []).map((text, idx) => ({
        name: settings.presetPrimaryTextNames?.[idx] || '',
        text: text
    })).filter(p => p.text.trim().length > 0), [settings.presetPrimaryTexts, settings.presetPrimaryTextNames]);

    const availableHeadlinePresets = useMemo(() => (settings.presetHeadlines || []).map((text, idx) => ({
        name: settings.presetHeadlineNames?.[idx] || '',
        text: text
    })).filter(p => p.text.trim().length > 0), [settings.presetHeadlines, settings.presetHeadlineNames]);


    // Get creatives that have PHD content (excluding current one)
    const creativesWithPHD = useMemo(() =>
        allCreatives.filter(c => c.id !== creative?.id && (c.primaryText || c.headline || c.description))
        , [allCreatives, creative?.id]);

    useEffect(() => {
        if (creative) {
            setPrimaryText(creative.primaryText);
            setHeadline(creative.headline);
            setDescription(creative.description);
            setCallToAction(creative.callToAction);

            // Match names from presets
            const pMatch = availablePrimaryPresets.find(p => p.text === creative.primaryText);
            setActivePrimaryName(pMatch?.name || '');
            const hMatch = availableHeadlinePresets.find(p => p.text === creative.headline);
            setActiveHeadlineName(hMatch?.name || '');
        }
    }, [creative?.id]); // Only reset when the specific creative changes

    // Animation handling
    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            setShowCopyDropdown(false);
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

    const handleCopyFrom = (sourceCreative: Creative) => {
        setPrimaryText(sourceCreative.primaryText);
        setHeadline(sourceCreative.headline);
        setDescription(sourceCreative.description);
        setShowCopyDropdown(false);
    };

    // Auto-save when closing (backdrop click or X button)
    const handleAutoSaveClose = () => {
        // Check if any field has changed
        const hasChanges = creative && (
            primaryText !== creative.primaryText ||
            headline !== creative.headline ||
            description !== creative.description ||
            callToAction !== creative.callToAction
        );

        if (hasChanges) {
            onSave({ primaryText, headline, description, callToAction });
            onShowToast?.('Saved');
        }
        onClose();
    };

    if (!isVisible || !creative) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop with fade animation - AUTO-SAVE on click */}
            <div
                className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
                onClick={handleAutoSaveClose}
            />

            {/* Drawer with slide animation */}
            <div className={`relative w-[400px] bg-white h-full shadow-2xl overflow-y-auto transition-transform duration-300 ease-out
                ${isAnimating ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Edit Creative</h3>
                        <button onClick={handleAutoSaveClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Preview - Natural aspect ratio */}
                    <div className="mb-6 rounded-xl overflow-hidden border-2 border-slate-100 shadow-sm bg-slate-50">
                        {creative.type === 'image' ? (
                            <img src={creative.preview} alt="" className="w-full h-auto object-contain max-h-64" />
                        ) : (
                            <video src={creative.preview} className="w-full h-auto object-contain max-h-64" controls />
                        )}
                    </div>

                    {/* Copy From Dropdown */}
                    {creativesWithPHD.length > 0 && (
                        <div className="relative mb-4">
                            <button
                                onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                                className="w-full px-4 py-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 hover:border-purple-300 rounded-xl text-sm font-medium text-purple-700 hover:text-purple-800 transition-all flex items-center justify-center gap-2"
                            >
                                <Copy size={14} />
                                Copy from...
                                <ChevronDown size={14} className={`transition-transform ${showCopyDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showCopyDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                                    {creativesWithPHD.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => handleCopyFrom(c)}
                                            className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 last:border-b-0 transition-colors"
                                        >
                                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                                                {c.type === 'image' ? (
                                                    <img src={c.preview} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <video src={c.preview} className="w-full h-full object-cover" muted />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                                                <p className="text-xs text-slate-400 truncate">{c.primaryText || c.headline || c.description}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Form */}
                    <div className="space-y-4">
                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2 flex-nowrap">
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex-shrink-0">Primary Text</label>
                                {activePrimaryName && (
                                    <span className="text-[9px] font-bold text-blue-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded truncate" style={{ maxWidth: '80px' }} title={activePrimaryName}>
                                        {activePrimaryName.length > 10 ? activePrimaryName.substring(0, 10) + '...' : activePrimaryName}
                                    </span>
                                )}
                                <div className="flex-1" />
                                {availablePrimaryPresets.length > 0 && (
                                    <div className="relative flex-shrink-0">
                                        <button
                                            onClick={() => setShowPrimaryPresets(!showPrimaryPresets)}
                                            className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md hover:bg-blue-100 flex items-center gap-1 active:bg-blue-200 transition-colors"
                                        >
                                            <Book size={10} /> PRESETS
                                        </button>

                                        {showPrimaryPresets && (
                                            <>
                                                <div className="fixed inset-0 z-10 cursor-default" onClick={() => setShowPrimaryPresets(false)} />
                                                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                                                    {availablePrimaryPresets.map((preset, idx) => (
                                                        <button key={idx} onClick={() => {
                                                            setPrimaryText(preset.text);
                                                            setActivePrimaryName(preset.name);
                                                            setShowPrimaryPresets(false);
                                                        }}
                                                            className="w-full text-left p-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                                            {preset.name ? (
                                                                <span className="font-semibold text-slate-700">{preset.name}</span>
                                                            ) : (
                                                                <span className="text-slate-500">{preset.text.substring(0, 40)}...</span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            <textarea
                                value={primaryText}
                                onChange={(e) => {
                                    setPrimaryText(e.target.value);
                                    setActivePrimaryName('');
                                }}
                                placeholder="Write your primary text..."
                                rows={3}
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-400 rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors" />
                        </div>
                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2 flex-nowrap">
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex-shrink-0">Headline</label>
                                {activeHeadlineName && (
                                    <span className="text-[9px] font-bold text-purple-500 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded truncate" style={{ maxWidth: '80px' }} title={activeHeadlineName}>
                                        {activeHeadlineName.length > 10 ? activeHeadlineName.substring(0, 10) + '...' : activeHeadlineName}
                                    </span>
                                )}
                                <div className="flex-1" />
                                {availableHeadlinePresets.length > 0 && (
                                    <div className="relative flex-shrink-0">
                                        <button
                                            onClick={() => setShowHeadlinePresets(!showHeadlinePresets)}
                                            className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md hover:bg-purple-100 flex items-center gap-1 active:bg-purple-200 transition-colors"
                                        >
                                            <Book size={10} /> PRESETS
                                        </button>

                                        {showHeadlinePresets && (
                                            <>
                                                <div className="fixed inset-0 z-10 cursor-default" onClick={() => setShowHeadlinePresets(false)} />
                                                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                                                    {availableHeadlinePresets.map((preset, idx) => (
                                                        <button key={idx} onClick={() => {
                                                            setHeadline(preset.text);
                                                            setActiveHeadlineName(preset.name);
                                                            setShowHeadlinePresets(false);
                                                        }}
                                                            className="w-full text-left p-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                                            {preset.name ? (
                                                                <span className="font-semibold text-slate-700">{preset.name}</span>
                                                            ) : (
                                                                <span className="text-slate-500">{preset.text.substring(0, 40)}...</span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            <input
                                type="text"
                                value={headline}
                                onChange={(e) => {
                                    setHeadline(e.target.value);
                                    setActiveHeadlineName('');
                                }}
                                placeholder="Enter headline..."
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
                            className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-lg transition-all shadow-sm hover:shadow-md">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// ADSET SETTINGS DRAWER - Targeting, Country, Age, Enhancement+
// ============================================================

// Popular Facebook interest categories
const INTEREST_CATEGORIES = [
    { id: 'fitness', name: '🏋️ Fitness & Health', category: 'Lifestyle' },
    { id: 'beauty', name: '💄 Beauty & Fashion', category: 'Lifestyle' },
    { id: 'food', name: '🍔 Food & Dining', category: 'Lifestyle' },
    { id: 'travel', name: '✈️ Travel', category: 'Lifestyle' },
    { id: 'tech', name: '📱 Technology', category: 'Interest' },
    { id: 'gaming', name: '🎮 Gaming', category: 'Interest' },
    { id: 'parenting', name: '👶 Parenting', category: 'Demographics' },
    { id: 'business', name: '💼 Business & Entrepreneur', category: 'Interest' },
    { id: 'education', name: '📚 Education', category: 'Interest' },
    { id: 'sports', name: '⚽ Sports', category: 'Interest' },
    { id: 'shopping', name: '🛒 Online Shopping', category: 'Behavior' },
    { id: 'ecommerce', name: '📦 E-commerce', category: 'Behavior' },
    { id: 'automotive', name: '🚗 Automotive', category: 'Interest' },
    { id: 'home', name: '🏠 Home & Garden', category: 'Interest' },
    { id: 'pets', name: '🐾 Pets', category: 'Interest' },
    { id: 'finance', name: '💰 Finance & Investment', category: 'Interest' },
];

const AdSetSettingsDrawer: React.FC<{
    adset: RapidAdSet | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: Partial<RapidAdSet>) => void;
}> = ({ adset, isOpen, onClose, onSave }) => {
    const [dailyBudget, setDailyBudget] = useState(10);
    const [targeting, setTargeting] = useState<'BROAD' | 'CUSTOM'>('BROAD');
    const [country, setCountry] = useState('MY');
    const [ageMin, setAgeMin] = useState(18);
    const [ageMax, setAgeMax] = useState(65);
    const [gender, setGender] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
    const [interests, setInterests] = useState<string[]>([]);
    const [enhancementPlus, setEnhancementPlus] = useState(false);
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    // Default to today's date in YYYY-MM-DD format
    const [scheduleStartDate, setScheduleStartDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [scheduleStartTime, setScheduleStartTime] = useState('06:00'); // Default 6:00 AM
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (adset) {
            setDailyBudget(adset.dailyBudget);
            setTargeting(adset.targeting);
            setCountry(adset.country);
            setAgeMin(adset.ageMin);
            setAgeMax(adset.ageMax);
            setGender(adset.gender);
            setInterests(adset.interests || []);
            setEnhancementPlus(adset.enhancementPlus);
            setScheduleEnabled(adset.scheduleEnabled || false);
            setScheduleStartDate(adset.scheduleStartDate || new Date().toISOString().split('T')[0]);
            setScheduleStartTime(adset.scheduleStartTime || '06:00');
        }
    }, [adset]);

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

    const toggleInterest = (id: string) => {
        setInterests(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    if (!isVisible || !adset) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div
                className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />
            <div className={`relative w-[420px] bg-white h-full shadow-2xl overflow-y-auto transition-transform duration-300 ease-out
                ${isAnimating ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Ad Set Settings</h3>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-5">
                        {/* Budget */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-1.5 block uppercase tracking-wide">Daily Budget (MYR)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">RM</span>
                                <input
                                    type="number"
                                    value={dailyBudget}
                                    onChange={(e) => setDailyBudget(Number(e.target.value))}
                                    min={5}
                                    className="w-full bg-white border border-slate-200 focus:border-slate-800 rounded-lg pl-10 pr-3 py-2.5 text-base font-bold outline-none transition-colors shadow-sm"
                                />
                            </div>
                        </div>

                        {/* Targeting */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-1.5 block uppercase tracking-wide">Targeting</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setTargeting('BROAD'); setInterests([]); }}
                                    className={`flex-1 py-2 rounded-lg font-semibold text-xs transition-all ${targeting === 'BROAD' ? 'bg-slate-900 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    Broad
                                </button>
                                <button
                                    onClick={() => setTargeting('CUSTOM')}
                                    className={`flex-1 py-2 rounded-lg font-semibold text-xs transition-all ${targeting === 'CUSTOM' ? 'bg-slate-900 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    Detail Targeting
                                </button>
                            </div>

                            {/* Advantage+ Audience Note */}
                            {targeting === 'BROAD' && (
                                <div className="mt-2 flex items-start gap-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg">
                                    <Zap size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-[10px] font-bold text-blue-700">Advantage+ Audience Active</p>
                                        <p className="text-[10px] text-blue-600 leading-relaxed">Meta's AI will automatically find your ideal customers. Recommended.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Detail Targeting Interests - Only show when CUSTOM */}
                        {targeting === 'CUSTOM' && (
                            <div className="animate-fadeIn">
                                <label className="text-xs font-semibold text-slate-700 mb-2 block uppercase tracking-wide">
                                    Interests <span className="text-slate-400">({interests.length} selected)</span>
                                </label>
                                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-100">
                                    {INTEREST_CATEGORIES.map(interest => (
                                        <button
                                            key={interest.id}
                                            onClick={() => toggleInterest(interest.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${interests.includes(interest.id)
                                                ? 'bg-blue-500 text-white shadow-md'
                                                : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'
                                                }`}
                                        >
                                            {interest.name}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-400 mt-2">Click to toggle interests for your ad targeting</p>
                            </div>
                        )}

                        {/* Country */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-1.5 block uppercase tracking-wide">Country</label>
                            <select value={country} onChange={(e) => setCountry(e.target.value)}
                                className="w-full bg-white border border-slate-200 focus:border-slate-800 rounded-lg px-4 py-2.5 text-sm outline-none transition-colors appearance-none cursor-pointer shadow-sm">
                                <option value="MY">🇲🇾 Malaysia</option>
                                <option value="US">🇺🇸 United States</option>
                                <option value="SG">🇸🇬 Singapore</option>
                                <option value="ID">🇮🇩 Indonesia</option>
                                <option value="PH">🇵🇭 Philippines</option>
                                <option value="TH">🇹🇭 Thailand</option>
                                <option value="VN">🇻🇳 Vietnam</option>
                                <option value="GB">🇬🇧 United Kingdom</option>
                                <option value="AU">🇦🇺 Australia</option>
                            </select>
                        </div>

                        {/* Age */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-1.5 block uppercase tracking-wide">Age Range</label>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-[10px] text-slate-400 mb-1 block">Min</label>
                                    <input type="number" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))}
                                        min={13} max={65}
                                        className="w-full bg-white border border-slate-200 focus:border-slate-800 rounded-lg px-4 py-2.5 text-sm outline-none transition-colors shadow-sm" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-slate-400 mb-1 block">Max</label>
                                    <input type="number" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))}
                                        min={13} max={65}
                                        className="w-full bg-white border border-slate-200 focus:border-slate-800 rounded-lg px-4 py-2.5 text-sm outline-none transition-colors shadow-sm" />
                                </div>
                            </div>
                        </div>

                        {/* Gender */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-1.5 block uppercase tracking-wide">Gender</label>
                            <div className="flex gap-2">
                                {(['ALL', 'MALE', 'FEMALE'] as const).map(g => (
                                    <button key={g} onClick={() => setGender(g)}
                                        className={`flex-1 py-2 rounded-lg font-medium text-xs transition-all ${gender === g ? 'bg-slate-900 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                        {g === 'ALL' ? 'All' : g === 'MALE' ? 'Male' : 'Female'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Enhancement+ Toggle */}
                        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800">Creative Enhancement+</h4>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Meta will automatically optimize your ad creative.</p>
                                </div>
                                <button
                                    onClick={() => setEnhancementPlus(!enhancementPlus)}
                                    className={`w-14 h-8 rounded-full transition-all relative ${enhancementPlus ? 'bg-slate-900' : 'bg-slate-200'}`}
                                >
                                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-all ${enhancementPlus ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>
                        </div>

                        {/* Schedule Ad Set Toggle */}
                        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800">Ad Schedule</h4>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Only run ads during specific hours.</p>
                                </div>
                                <button
                                    onClick={() => setScheduleEnabled(!scheduleEnabled)}
                                    className={`w-14 h-8 rounded-full transition-all relative ${scheduleEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                                >
                                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-all ${scheduleEnabled ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>

                            {/* Time/Date Range (Only show when schedule enabled) */}
                            {scheduleEnabled && (
                                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                                    {/* Timezone Label */}
                                    <div className="flex items-center gap-2 text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded-md w-fit">
                                        <span>🇲🇾</span>
                                        <span className="font-medium">Malaysia Time (GMT+8)</span>
                                    </div>

                                    {/* Start Date */}
                                    <div>
                                        <label className="text-[10px] text-slate-400 mb-1 block">Start Date</label>
                                        <input
                                            type="date"
                                            value={scheduleStartDate}
                                            onChange={(e) => setScheduleStartDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                                        />
                                    </div>

                                    {/* Start Time */}
                                    <div>
                                        <label className="text-[10px] text-slate-400 mb-1 block">Start Time</label>
                                        <input
                                            type="time"
                                            value={scheduleStartTime}
                                            onChange={(e) => setScheduleStartTime(e.target.value)}
                                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <button onClick={() => { onSave({ dailyBudget, targeting, country, ageMin, ageMax, gender, interests, enhancementPlus, scheduleEnabled, scheduleStartDate, scheduleStartTime }); onClose(); }}
                            className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-lg transition-all shadow-sm hover:shadow-md">
                            Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
};

// ============================================================
// GEMINI ICON COMPONENT
// ============================================================

const GeminiIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <defs>
            <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4285F4" />
                <stop offset="50%" stopColor="#9B72CB" />
                <stop offset="100%" stopColor="#D96570" />
            </linearGradient>
        </defs>
        <path
            d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"
            fill="url(#gemini-gradient)"
        />
    </svg>
);

// ============================================================
// AI CHAT DRAWER FOR RAPID CREATOR
// ============================================================

const AiChatDrawer: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    creativesCount: number;
    creativesTypes: { images: number; videos: number };
    campaignObjective: 'SALES' | 'LEAD';
    adSetsCount: number;
    currentBudget: number;
    currentTargeting: 'BROAD' | 'CUSTOM';
    // Action handlers
    onSetBudget: (budget: number) => void;
    onCreateAdSets: (count: number) => void;
    onSetTargeting: (targeting: 'BROAD' | 'CUSTOM') => void;
    onSetCountry: (country: string) => void;
    onSetAgeRange: (min: number, max: number) => void;
    onSetEnhancementPlus: (enabled: boolean) => void;
    onSetGender: (gender: 'ALL' | 'MALE' | 'FEMALE') => void;
    onDistributeCreatives: () => void;
}> = ({ isOpen, onClose, creativesCount, creativesTypes, campaignObjective, adSetsCount, currentBudget, currentTargeting, onSetBudget, onCreateAdSets, onSetTargeting, onSetCountry, onSetAgeRange, onSetEnhancementPlus, onSetGender, onDistributeCreatives }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: `Saya boleh bantu anda setup ads! 🤖✨\n\nAnda ada ${creativesCount} creatives.\n\n**Quick Commands:**\n• "Buat 3 adset dengan budget RM20"\n• "Guna broad targeting"\n\n**Atau paste TEMPLATE PROMPT** dengan:\n• goal, setting adset, primary texts\n• Saya akan parse dan setup untuk anda!`,
            timestamp: new Date()
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Animation handling
    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsAnimating(true);
                });
            });
            // Update welcome message with current state
            setMessages([{
                id: 'welcome',
                role: 'assistant',
                content: `Saya boleh bantu anda setup ads! 🤖✨\n\nAnda ada ${creativesCount} creatives.\n\n**Quick Commands:**\n• "Buat 3 adset dengan budget RM20"\n• "Guna broad targeting"\n\n**Atau paste TEMPLATE PROMPT** dengan:\n• goal, setting adset, primary texts\n• Saya akan parse dan setup untuk anda!`,
                timestamp: new Date()
            }]);
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, creativesCount, creativesTypes]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus input
    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    // Execute AI actions
    const executeActions = (actions: RapidCreatorAction[]) => {
        actions.forEach(action => {
            switch (action.type) {
                case 'SET_BUDGET':
                    if (typeof action.value === 'number' || typeof action.value === 'string') {
                        onSetBudget(Number(action.value));
                    }
                    break;
                case 'CREATE_ADSETS':
                    if (action.count) {
                        onCreateAdSets(action.count);
                    }
                    break;
                case 'SET_TARGETING':
                    if (action.value === 'BROAD' || action.value === 'CUSTOM') {
                        onSetTargeting(action.value);
                    }
                    break;
                case 'SET_COUNTRY':
                    if (typeof action.value === 'string') {
                        onSetCountry(action.value);
                    }
                    break;
                case 'SET_AGE_RANGE':
                    if (action.min && action.max) {
                        onSetAgeRange(action.min, action.max);
                    }
                    break;
                case 'SET_ENHANCEMENT_PLUS':
                    onSetEnhancementPlus(action.value === true || action.value === 'true');
                    break;
                case 'SET_GENDER':
                    if (action.value === 'ALL' || action.value === 'MALE' || action.value === 'FEMALE') {
                        onSetGender(action.value);
                    }
                    break;
                case 'DISTRIBUTE_CREATIVES':
                    onDistributeCreatives();
                    break;
            }
        });
    };

    const handleSend = async () => {
        if (!inputText.trim() || loading) return;

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: inputText.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setLoading(true);

        try {
            // Check if this looks like a template prompt
            const templateIndicators = ['goal:', 'primary text', 'setting adset', 'naming convention', 'existing campaign'];
            const lowerMessage = userMessage.content.toLowerCase();
            const matchedIndicators = templateIndicators.filter(ind => lowerMessage.includes(ind));
            const isLikelyTemplate = matchedIndicators.length >= 2;

            if (isLikelyTemplate) {
                // Parse as template
                const parsed = await parseAdTemplatePrompt(userMessage.content);

                if (parsed.isTemplate && parsed.primaryTexts && parsed.primaryTexts.length > 0) {
                    // Show confirmation with parsed data
                    const confirmMessage = `📋 **Template Detected!**\n\n` +
                        `**Campaign:** ${parsed.campaign?.name || 'New'} (${parsed.campaign?.objective})\n` +
                        `**AdSets:** ${parsed.adset?.count || 1} adsets × RM${parsed.adset?.budget || 10}/day\n` +
                        `**Primary Texts:** ${parsed.primaryTexts.length} variations (${parsed.primaryTexts.map(pt => pt.name).join(', ')})\n` +
                        `**Headline:** ${parsed.ad?.headline || 'Not set'}\n` +
                        `**CTA:** ${parsed.ad?.cta || 'LEARN_MORE'}\n\n` +
                        `⚠️ **Note:** Untuk create ads dengan template ni, sila:\n` +
                        `1. Upload creative dulu\n` +
                        `2. Create ${parsed.adset?.count || 1} adsets (budget RM${parsed.adset?.budget || 10})\n` +
                        `3. Drag creative ke semua adsets\n` +
                        `4. Click "Launch Ads"\n\n` +
                        `_Primary texts dah di-parse tapi perlu manual setup buat masa ni._`;

                    setMessages(prev => [...prev, {
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        content: confirmMessage,
                        timestamp: new Date()
                    }]);

                    // Execute actions based on parsed template
                    if (parsed.adset?.count) {
                        onCreateAdSets(parsed.adset.count);
                    }
                    if (parsed.adset?.budget) {
                        onSetBudget(parsed.adset.budget);
                    }
                    if (parsed.adset?.targeting === 'BROAD') {
                        onSetTargeting('BROAD');
                    }
                } else {
                    setMessages(prev => [...prev, {
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        content: parsed.message || 'Maaf, tidak dapat parse template. Pastikan ada goal, setting adset, dan primary texts.',
                        timestamp: new Date()
                    }]);
                }
            } else {
                // Regular action-based AI
                const history = messages
                    .filter(m => m.id !== 'welcome')
                    .map(m => ({
                        role: m.role === 'user' ? 'user' as const : 'model' as const,
                        text: m.content
                    }));

                const response = await rapidCreatorAssistantWithActions(
                    userMessage.content,
                    history,
                    {
                        creativesCount,
                        creativesTypes,
                        adSetsCount,
                        campaignObjective,
                        currentBudget,
                        currentTargeting
                    }
                );

                // Execute any actions from AI
                if (response.actions && response.actions.length > 0) {
                    executeActions(response.actions);
                }

                setMessages(prev => [...prev, {
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content: response.message,
                    timestamp: new Date()
                }]);
            }
        } catch (error) {
            console.error('AI Chat error:', error);
            setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: 'Maaf, berlaku ralat. Sila cuba lagi. 🙏',
                timestamp: new Date()
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const quickPrompts = [
        { text: "Buat 3 adset dengan budget RM20", emoji: "📦" },
        { text: "Guna broad targeting untuk semua", emoji: "🎯" },
        { text: "Target umur 25-45 tahun", emoji: "👥" },
        { text: "Distribute creatives ke semua adset", emoji: "🎨" },
    ];

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            {/* Drawer */}
            <div className={`relative w-[400px] bg-white h-full shadow-2xl flex flex-col transition-transform duration-300 ease-out
                ${isAnimating ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header */}
                <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-purple-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md">
                                <GeminiIcon size={22} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">AI Assistant</h3>
                                <p className="text-xs text-slate-500">Powered by Gemini</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/80 hover:bg-white text-slate-500 hover:text-slate-700 transition-all shadow-sm">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-sm'
                                : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                                }`}>
                                {msg.role === 'assistant' && (
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
                                        <GeminiIcon size={12} />
                                        <span className="text-[10px] font-semibold text-blue-600">AI Assistant</span>
                                    </div>
                                )}
                                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                    {msg.content}
                                </div>
                                <div className={`text-[10px] mt-2 ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                                    {msg.timestamp.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-slate-100 rounded-2xl rounded-bl-sm p-3">
                                <div className="flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-blue-600" />
                                    <span className="text-xs text-slate-500">Sedang berfikir...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Quick Prompts */}
                {messages.length <= 1 && (
                    <div className="px-4 pb-3">
                        <p className="text-[10px] text-slate-400 mb-2 font-medium">Quick Questions:</p>
                        <div className="flex flex-wrap gap-2">
                            {quickPrompts.map((prompt, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setInputText(prompt.text)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
                                >
                                    <span>{prompt.emoji}</span>
                                    <span>{prompt.text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input Area */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Tanya apa sahaja..."
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !inputText.trim()}
                            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
                        >
                            <Send size={16} />
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
    const { showToast } = useToast();

    // Campaign & AdSet Selection
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [existingAdSets, setExistingAdSets] = useState<AdSet[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('new');
    const [selectedExistingAdSetId, setSelectedExistingAdSetId] = useState<string>('new');
    const [newCampaignName, setNewCampaignName] = useState('');

    // Objective & Configuration
    const [campaignObjective, setCampaignObjective] = useState<'SALES' | 'LEAD'>('SALES');
    const [whatsappNumber, setWhatsappNumber] = useState('');

    // Pages & Pixels & WhatsApp
    const [pages, setPages] = useState<any[]>([]);
    const [pixels, setPixels] = useState<any[]>([]);
    const [whatsappPhones, setWhatsappPhones] = useState<WhatsAppPhoneNumber[]>([]);
    const [loadingWhatsappPhones, setLoadingWhatsappPhones] = useState(false);
    const [selectedPageId, setSelectedPageId] = useState(settings.defaultPageId || '');
    const [selectedPixelId, setSelectedPixelId] = useState(settings.defaultPixelId || '');
    const [destinationUrl, setDestinationUrl] = useState(settings.defaultWebsiteUrl || '');

    // Creatives & AdSets
    const [creatives, setCreatives] = useState<Creative[]>([]);
    const [importedCreatives, setImportedCreatives] = useState<Creative[]>([]);
    const [loadingImported, setLoadingImported] = useState(false);
    const [adSets, setAdSets] = useState<RapidAdSet[]>([]);

    // UI
    const [editingCreativeId, setEditingCreativeId] = useState<string | null>(null);
    const [editingAdSetId, setEditingAdSetId] = useState<string | null>(null);
    const [isLaunching, setIsLaunching] = useState(false);
    const [launchProgress, setLaunchProgress] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
    const [showTextPresets, setShowTextPresets] = useState(false); // Global Text Presets Dialog
    const [showAiChat, setShowAiChat] = useState(false); // AI Assistant Chat Drawer

    const selectedPageName = useMemo(() => {
        return pages.find((p: any) => p.id === selectedPageId)?.name || 'selected page';
    }, [pages, selectedPageId]);



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
                // Use default page if available, otherwise first page
                if (settings.defaultPageId && pagesData.some((p: any) => p.id === settings.defaultPageId)) {
                    setSelectedPageId(settings.defaultPageId);
                } else if (pagesData.length > 0) {
                    setSelectedPageId(pagesData[0].id);
                }
                if (pixelsData.length > 0) setSelectedPixelId(pixelsData[0].id);
            } catch (err) {
                console.error('Failed to load data:', err);
            }
            setLoadingData(false);
        };
        loadData();
    }, [settings.fbAccessToken, settings.adAccountId]);

    // Load WhatsApp numbers connected to selected Facebook Page
    useEffect(() => {
        const loadWhatsAppPhonesForPage = async () => {
            if (!settings.fbAccessToken || settings.fbAccessToken === 'dummy_token' || !selectedPageId) {
                setWhatsappPhones([]);
                setWhatsappNumber('');
                return;
            }

            setLoadingWhatsappPhones(true);
            try {
                const selectedPage = pages.find((p: any) => p.id === selectedPageId);
                const pageAccessToken = selectedPage?.access_token;
                const phones = await getWhatsAppPhoneNumbersForPage(selectedPageId, settings.fbAccessToken, pageAccessToken);
                setWhatsappPhones(phones);

                // Clear stale selection if current number is not connected to the selected page
                setWhatsappNumber((prev) => {
                    if (!prev) return '';
                    return phones.some((phone) => phone.display_phone_number === prev) ? prev : '';
                });
            } catch (err) {
                console.error('Failed to load WhatsApp numbers for selected page:', err);
                setWhatsappPhones([]);
                setWhatsappNumber('');
            } finally {
                setLoadingWhatsappPhones(false);
            }
        };

        loadWhatsAppPhonesForPage();
    }, [selectedPageId, settings.fbAccessToken, pages]);

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

    // Fetch imported creatives from Supabase
    const fetchImportedCreatives = async () => {
        setLoadingImported(true);
        try {
            const response = await fetch('/api/media-api?action=import-list');
            const data = await response.json();

            if (data.success && data.creatives) {
                // Convert Supabase records to Creative format
                const imported: Creative[] = data.creatives.map((c: any) => ({
                    id: `imported-${c.id}`,
                    supabaseId: c.id,
                    preview: c.file_url,
                    type: c.media_type === 'video' ? 'video' : 'image',
                    name: c.name || 'Imported Creative',
                    adName: c.name || 'Imported Creative',
                    primaryText: '',
                    headline: '',
                    description: '',
                    callToAction: 'SHOP_NOW',
                    adsetId: null,
                    isImported: true,
                    expiresAt: c.expires_at,
                    source: c.source || null
                }));
                setImportedCreatives(imported);
            }
        } catch (err) {
            console.error('Failed to fetch imported creatives:', err);
        } finally {
            setLoadingImported(false);
        }
    };

    // Load imported creatives on mount
    useEffect(() => {
        fetchImportedCreatives();
    }, []);

    // Delete imported creative from Supabase
    const deleteImportedCreative = async (creativeId: string) => {
        const supabaseId = creativeId.replace('imported-', '');
        try {
            const response = await fetch(`/api/media-api?action=import-delete&id=${supabaseId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                setImportedCreatives(prev => prev.filter(c => c.id !== creativeId));
                showToast('Creative removed', 'success');
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            console.error('Failed to delete imported creative:', err);
            showToast('Failed to remove creative', 'error');
        }
    };

    // Add existing adset to the list when selected - FIXED GLITCH
    const handleExistingAdSetSelect = (adsetId: string) => {
        setSelectedExistingAdSetId(adsetId);

        if (adsetId !== 'new') {
            const existingAdSet = existingAdSets.find(a => a.id === adsetId);
            if (existingAdSet && !adSets.find(a => a.id === existingAdSet.id)) {
                setAdSets(prev => [...prev, {
                    id: existingAdSet.id,
                    name: existingAdSet.name,
                    dailyBudget: existingAdSet.dailyBudget || 10,
                    targeting: 'BROAD',
                    country: 'MY',
                    ageMin: 18,
                    ageMax: 65,
                    gender: 'ALL',
                    interests: [],
                    enhancementPlus: false,
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

            // Apply ad naming template if configured
            const adName = settings.namingAd
                ? applyNamingTemplate(settings.namingAd, { nama_file: name })
                : name;

            return {
                id: `creative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                file,
                preview: URL.createObjectURL(file),
                type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
                name,
                adName, // Apply template or default to creative name
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
    // NAMING CONVENTION HELPER
    // ============================================================

    const applyNamingTemplate = (template: string | undefined, params: {
        date?: string;
        nama_file?: string;
        campaign?: string;
        adset?: string;
        objective?: string;
    }): string => {
        if (!template) return '';

        const today = new Date().toLocaleDateString('en-MY', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        let result = template;
        result = result.replace(/<date>/gi, params.date || today);
        result = result.replace(/<nama_file>/gi, params.nama_file || '');
        result = result.replace(/<campaign>/gi, params.campaign || '');
        result = result.replace(/<adset>/gi, params.adset || '');
        result = result.replace(/<objective>/gi, params.objective || campaignObjective);

        return result;
    };

    // ============================================================
    // ADSET MANAGEMENT
    // ============================================================

    const addAdSet = () => {
        const today = new Date().toISOString().split('T')[0];

        // Apply naming template if configured
        const defaultName = `Ad Set ${adSets.length + 1}`;
        const templateName = settings.namingAdSet
            ? applyNamingTemplate(settings.namingAdSet, { adset: defaultName })
            : defaultName;

        const newAdSet: RapidAdSet = {
            id: `adset-${Date.now()}`,
            name: templateName,
            dailyBudget: 10,
            targeting: 'BROAD',
            country: 'MY',
            ageMin: 18,
            ageMax: 65,
            gender: 'ALL',
            interests: [],
            enhancementPlus: false,
            scheduleEnabled: false,
            scheduleStartDate: today,
            scheduleStartTime: '06:00'
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

    // ============================================================
    // TEMPLATE MANAGEMENT
    // ============================================================

    const getCurrentSettingsAsTemplate = (): Partial<AdTemplate> => {
        // Find if we have an existing campaign selected
        const campaignId = selectedCampaignId !== 'new' ? selectedCampaignId : undefined;

        const campaign = {
            name: newCampaignName,
            objective: campaignObjective === 'SALES' ? 'OUTCOME_SALES' : 'OUTCOME_ENGAGEMENT',
            dailyBudget: 20,
            selectionType: selectedCampaignId === 'new' ? 'NEW' as const : 'EXISTING' as const,
            campaignId: campaignId
        };

        const firstAdSet = adSets[0] || {
            name: 'Ad Set 1',
            dailyBudget: 20,
            targeting: 'BROAD',
            country: 'MY',
            ageMin: 18,
            ageMax: 65,
            gender: 'ALL',
            interests: [],
            enhancementPlus: false,
            scheduleEnabled: false,
            scheduleStartDate: undefined,
            scheduleStartTime: undefined
        };

        // Capture all grouped ads (assigned to an ad set)
        const groupedAds = creatives.filter(c => c.adsetId !== null);

        const templateAds = groupedAds.map(c => ({
            type: c.type,
            adName: c.adName,
            primaryText: c.primaryText || '',
            headline: c.headline || '',
            description: c.description || '',
            cta: c.callToAction || 'LEARN_MORE'
        }));

        return {
            campaign,
            adSet: {
                name: firstAdSet.name,
                dailyBudget: firstAdSet.dailyBudget,
                targeting: firstAdSet.targeting,
                country: firstAdSet.country,
                ageMin: firstAdSet.ageMin,
                ageMax: firstAdSet.ageMax,
                gender: firstAdSet.gender as any,
                interests: firstAdSet.interests || [],
                enhancementPlus: firstAdSet.enhancementPlus || false,
                scheduleEnabled: firstAdSet.scheduleEnabled || false,
                scheduleStartDate: firstAdSet.scheduleStartDate,
                scheduleStartTime: firstAdSet.scheduleStartTime
            },
            config: {
                pageId: selectedPageId,
                pixelId: selectedPixelId,
                url: destinationUrl
            },
            ads: templateAds
        };
    };

    const handleLoadTemplate = (template: AdTemplate) => {
        setNewCampaignName(template.campaign.name);
        setCampaignObjective(template.campaign.objective === 'OUTCOME_SALES' ? 'SALES' : 'LEAD');

        if (template.campaign.selectionType === 'EXISTING' && template.campaign.campaignId) {
            setSelectedCampaignId(template.campaign.campaignId);
        } else {
            setSelectedCampaignId('new');
        }

        if (template.config) {
            setSelectedPageId(template.config.pageId || '');
            setSelectedPixelId(template.config.pixelId || '');
            setDestinationUrl(template.config.url || '');
        }

        const newAdSetId = `adset-${Date.now()}`;
        const newAdSet: RapidAdSet = {
            id: newAdSetId,
            name: template.adSet.name,
            dailyBudget: template.adSet.dailyBudget,
            targeting: template.adSet.targeting,
            country: template.adSet.country,
            ageMin: template.adSet.ageMin,
            ageMax: template.adSet.ageMax,
            gender: template.adSet.gender as any,
            interests: template.adSet.interests,
            enhancementPlus: template.adSet.enhancementPlus || false,
            scheduleEnabled: template.adSet.scheduleEnabled || false,
            scheduleStartDate: template.adSet.scheduleStartDate,
            scheduleStartTime: template.adSet.scheduleStartTime
        };

        setAdSets([newAdSet]);
        setExpandedAdSets(new Set([newAdSetId]));

        // Create Placeholder Creatives for EVERY saved ad
        const placeholders: Creative[] = (template.ads || []).map((ad, idx) => ({
            id: `placeholder-${idx}-${Date.now()}`,
            preview: '',
            type: ad.type,
            name: `Template ${ad.type === 'video' ? 'Video' : 'Image'} Placeholder`,
            adName: ad.adName || `${ad.type === 'video' ? 'Video' : 'Image'} Ad`,
            primaryText: ad.primaryText,
            headline: ad.headline,
            description: ad.description,
            callToAction: ad.cta,
            adsetId: newAdSetId,
            isPlaceholder: true
        }));

        setCreatives(placeholders);
        showToast('Template loaded successfully! Replaced with saved ad configurations.', 'success');
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

    // Update adset settings
    const updateAdSet = (id: string, updates: Partial<RapidAdSet>) => {
        setAdSets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    };

    // Duplicate a creative (copy within same adset)
    const duplicateCreative = (creativeId: string) => {
        const source = creatives.find(c => c.id === creativeId);
        if (!source) return;
        const newCreative: Creative = {
            ...source,
            id: `creative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: `${source.name} (Copy)`,
            adName: `${source.adName} (Copy)`
        };
        setCreatives(prev => [...prev, newCreative]);
    };

    // Update ad name for a creative
    const updateAdName = (creativeId: string, adName: string) => {
        setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, adName } : c));
    };

    // Rename adset
    const renameAdSet = (id: string, newName: string) => {
        setAdSets(prev => prev.map(a => a.id === id ? { ...a, name: newName } : a));
    };

    // Remove creative from adset (move back to uncategorized)
    const removeCreativeFromAdSet = (creativeId: string) => {
        const creative = creatives.find(c => c.id === creativeId);
        if (creative?.isPlaceholder) {
            // Delete placeholder entirely
            setCreatives(prev => prev.filter(c => c.id !== creativeId));
        } else {
            // Move real creative back to uncategorized
            setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, adsetId: null } : c));
        }
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

    const handleRemoveMedia = (creativeId: string) => {
        const source = creatives.find(c => c.id === creativeId);
        if (!source || source.isPlaceholder) return;

        // Create a new creative with no adset (goes back to uncategorized)
        const realReplacement: Creative = {
            ...source,
            id: `creative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            adsetId: null,
            // Reset text settings for the one going back to inventory? 
            // User said "media tu akan dibuang dan kembali ke uncategorized creative", implying the creative file itself.
            // Usually inventory items don't have ad-specific text.
            primaryText: '',
            headline: '',
            description: '',
        };

        // Create a placeholder that stays in the adset with existing settings
        const placeholder: Creative = {
            id: `placeholder-${Date.now()}`,
            preview: '',
            type: source.type,
            name: `Placeholder for ${source.name}`,
            adName: source.adName,
            primaryText: source.primaryText,
            headline: source.headline,
            description: source.description,
            callToAction: source.callToAction,
            adsetId: source.adsetId,
            isPlaceholder: true
        };

        setCreatives(prev => [
            ...prev.filter(c => c.id !== creativeId),
            realReplacement,
            placeholder
        ]);
        showToast('Media removed. Template settings kept.', 'success');
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

        // Check if source is an imported creative
        const isImportedSource = creativeId.startsWith('imported-');
        const importedCreative = isImportedSource ? importedCreatives.find(c => c.id === creativeId) : null;

        // CASE 1: Replace logic (Dropped on another Creative row)
        const targetCreative = creatives.find(c => c.id === overId);
        if (targetCreative && targetCreative.id !== creativeId) {
            const sourceCreative = importedCreative || creatives.find(c => c.id === creativeId);
            if (sourceCreative && !sourceCreative.isPlaceholder) {
                // If source is imported, move it to creatives state
                if (isImportedSource && importedCreative) {
                    const newCreative: Creative = {
                        ...importedCreative,
                        adsetId: targetCreative.adsetId,
                        primaryText: targetCreative.primaryText || importedCreative.primaryText,
                        headline: targetCreative.headline || importedCreative.headline,
                        description: targetCreative.description || importedCreative.description,
                        callToAction: targetCreative.callToAction || importedCreative.callToAction,
                        adName: targetCreative.adName || importedCreative.adName
                    };

                    // Remove from imported and add to creatives
                    setImportedCreatives(prev => prev.filter(c => c.id !== creativeId));

                    if (targetCreative.isPlaceholder) {
                        setCreatives(prev => [...prev.filter(c => c.id !== targetCreative.id), newCreative]);
                    } else {
                        setCreatives(prev => [...prev.map(c => c.id === targetCreative.id ? { ...c, adsetId: null } : c), newCreative]);
                    }
                    return;
                }

                setCreatives(prev => {
                    const updated = prev.map(c => {
                        if (c.id === creativeId) {
                            return {
                                ...c,
                                adsetId: targetCreative.adsetId,
                                primaryText: targetCreative.primaryText || c.primaryText,
                                headline: targetCreative.headline || c.headline,
                                description: targetCreative.description || c.description,
                                callToAction: targetCreative.callToAction || c.callToAction,
                                adName: targetCreative.adName || c.adName
                            };
                        }
                        return c;
                    });

                    if (targetCreative.isPlaceholder) {
                        return updated.filter(c => c.id !== targetCreative.id);
                    } else {
                        // Move real creative back to uncategorized if it was replaced
                        return updated.map(c => c.id === targetCreative.id ? { ...c, adsetId: null } : c);
                    }
                });
                return;
            }
        }

        // CASE 2: Dropped on an AdSet (header/zone) - APPLY TO ALL LOGIC
        const targetAdSet = adSets.find(a => a.id === overId);
        if (targetAdSet) {
            const sourceCreative = importedCreative || creatives.find(c => c.id === creativeId);
            if (sourceCreative && !sourceCreative.isPlaceholder) {
                const targetAdSetPlaceholders = creatives.filter(c => c.adsetId === overId && c.isPlaceholder);

                // Handle imported creative being dropped on AdSet
                if (isImportedSource && importedCreative) {
                    setImportedCreatives(prev => prev.filter(c => c.id !== creativeId));

                    if (targetAdSetPlaceholders.length > 0) {
                        const replacements = targetAdSetPlaceholders.map((p, idx) => ({
                            ...importedCreative,
                            id: `repl-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            adsetId: overId,
                            primaryText: p.primaryText || importedCreative.primaryText,
                            headline: p.headline || importedCreative.headline,
                            description: p.description || importedCreative.description,
                            callToAction: p.callToAction || importedCreative.callToAction,
                            adName: p.adName || importedCreative.adName
                        }));

                        setCreatives(prev => [
                            ...prev.filter(c => !(c.adsetId === overId && c.isPlaceholder)),
                            ...replacements
                        ]);
                        showToast(`Media applied to all ${targetAdSetPlaceholders.length} ads! ✨`, 'success');
                    } else {
                        setCreatives(prev => [...prev, { ...importedCreative, adsetId: overId }]);
                    }
                    return;
                }

                if (targetAdSetPlaceholders.length > 0) {
                    setCreatives(prev => {
                        // 1. Remove placeholders from this adset
                        const otherCreatives = prev.filter(c => !(c.adsetId === overId && c.isPlaceholder));

                        // 2. Create replacements for each placeholder
                        const replacements = targetAdSetPlaceholders.map((p, idx) => ({
                            ...sourceCreative,
                            id: `repl-${idx}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            adsetId: overId,
                            // Preserve placeholder text/naming
                            primaryText: p.primaryText || sourceCreative.primaryText,
                            headline: p.headline || sourceCreative.headline,
                            description: p.description || sourceCreative.description,
                            callToAction: p.callToAction || sourceCreative.callToAction,
                            adName: p.adName || sourceCreative.adName
                        }));

                        // 3. Remove original source and add replacements
                        return [...otherCreatives, ...replacements].filter(c => c.id !== creativeId);
                    });
                    showToast(`Media applied to all ${targetAdSetPlaceholders.length} ads! ✨`, 'success');
                } else {
                    // Standard move if no placeholders
                    setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, adsetId: overId } : c));
                }
            } else {
                setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, adsetId: overId } : c));
            }
        } else if (overId === 'ungrouped-zone') {
            setCreatives(prev => prev.map(c => c.id === creativeId ? { ...c, adsetId: null } : c));
        }
    };

    // ============================================================
    // LAUNCH ADS
    // ============================================================

    const handleLaunchAds = async () => {
        if (selectedCampaignId === 'new' && !newCampaignName.trim()) {
            showToast('Please enter a campaign name', 'error');
            return;
        }
        if (!selectedPageId) {
            showToast('Please select a Facebook Page', 'error');
            return;
        }

        // Conditional validation based on objective
        if (campaignObjective === 'SALES') {
            if (!destinationUrl) {
                showToast('Please enter a destination URL', 'error');
                return;
            }
        } else {
            if (!whatsappNumber) {
                showToast('Please enter a WhatsApp number', 'error');
                return;
            }
        }

        const groupedCreatives = creatives.filter(c => c.adsetId !== null);
        if (groupedCreatives.length === 0) {
            showToast('Please assign at least one creative to an ad set', 'error');
            return;
        }

        setIsLaunching(true);

        // Cache uploaded assets: same file only uploaded once, reused for all duplicates
        const uploadCache = new Map<File, { mediaHash: string; videoId: string }>();

        let successCount = 0;
        let failCount = 0;
        const failedAds: string[] = [];

        try {
            let campaignId = selectedCampaignId;

            if (selectedCampaignId === 'new') {
                setLaunchProgress('Creating campaign...');
                const objective = campaignObjective === 'SALES' ? 'OUTCOME_SALES' : 'OUTCOME_ENGAGEMENT';
                campaignId = await createMetaCampaign(settings.adAccountId, newCampaignName, objective, settings.fbAccessToken);
            }

            for (const adset of adSets) {
                const adsetCreatives = groupedCreatives.filter(c => c.adsetId === adset.id);
                if (adsetCreatives.length === 0) continue;

                let adsetId = adset.id;

                // Create new adset if not existing
                if (!adset.isExisting) {
                    setLaunchProgress(`Creating ${adset.name}...`);
                    // Use CONVERSATIONS for Engagement (WhatsApp)
                    const optimizationGoal = campaignObjective === 'SALES' ? 'OFFSITE_CONVERSIONS' : 'CONVERSATIONS';
                    // Pixel is optional for Lead objective
                    const pixelToUse = campaignObjective === 'LEAD' && !selectedPixelId ? '' : selectedPixelId;
                    // Pass whatsappNumber for conditional WhatsApp CTA
                    const adsetResult = await createMetaAdSet(settings.adAccountId, campaignId, adset.name, adset.dailyBudget, optimizationGoal, pixelToUse, settings.fbAccessToken, selectedPageId, whatsappNumber || undefined);
                    adsetId = adsetResult.id;
                }

                for (const creative of adsetCreatives) {
                    try {
                        let mediaHash = '';
                        let videoId = '';

                        // Check if this file was already uploaded (same file used by multiple ads)
                        if (creative.file && uploadCache.has(creative.file)) {
                            const cached = uploadCache.get(creative.file)!;
                            mediaHash = cached.mediaHash;
                            videoId = cached.videoId;
                            setLaunchProgress(`Reusing upload for ${creative.name}...`);
                            console.debug(`[Launch] Reusing cached upload for ${creative.name}`);
                        } else if (creative.file) {
                            setLaunchProgress(`Uploading ${creative.name}...`);

                            if (creative.type === 'image') {
                                mediaHash = await uploadAdImage(settings.adAccountId, creative.file, settings.fbAccessToken);
                            } else {
                                const thumbnailBlob = await extractVideoThumbnail(creative.file);
                                const thumbnailHash = await uploadAdImageBlob(settings.adAccountId, thumbnailBlob, settings.fbAccessToken);
                                videoId = await uploadAdVideo(settings.adAccountId, creative.file, settings.fbAccessToken);
                                mediaHash = thumbnailHash;
                            }

                            // Cache the upload result for reuse by duplicate creatives
                            uploadCache.set(creative.file, { mediaHash, videoId });
                        } else {
                            throw new Error(`No file attached to creative: ${creative.name}`);
                        }

                        setLaunchProgress(`Creating ad ${successCount + failCount + 1}/${groupedCreatives.length}: ${creative.name}...`);

                        const advPlusConfig: AdvantagePlusConfig = { enabled: false, visualTouchups: false, textOptimizations: false, mediaCropping: false, music: false };

                        const creativeIdResult = await createMetaCreative(
                            settings.adAccountId, creative.name, selectedPageId,
                            creative.type === 'image' ? mediaHash : videoId,
                            creative.primaryText, creative.headline, destinationUrl, settings.fbAccessToken,
                            creative.type, creative.callToAction, creative.description, advPlusConfig,
                            creative.type === 'video' ? mediaHash : undefined
                        );

                        await createMetaAd(settings.adAccountId, adsetId, creative.adName || creative.name, creativeIdResult, settings.fbAccessToken);
                        successCount++;
                    } catch (adError: any) {
                        failCount++;
                        failedAds.push(creative.adName || creative.name);
                        console.error(`Failed to create ad "${creative.adName || creative.name}":`, adError);

                        // If session expired, stop everything
                        const msg = adError.message?.toLowerCase() || '';
                        if (msg.includes('session_expired') || msg.includes('invalid oauth') || msg.includes('access token')) {
                            throw adError; // Re-throw to outer catch
                        }
                        // Otherwise continue with next creative
                    }
                }
            }

            if (failCount === 0) {
                showToast(`🎉 All ${successCount} ads launched successfully!`, 'success');
            } else if (successCount > 0) {
                showToast(`⚠️ ${successCount} ads launched, ${failCount} failed: ${failedAds.join(', ')}`, 'error');
            } else {
                showToast(`❌ All ${failCount} ads failed: ${failedAds.join(', ')}`, 'error');
            }

            if (successCount > 0) {
                setCreatives([]);
                setAdSets([]);
                setNewCampaignName('');
            }
        } catch (error: any) {
            console.error('Launch failed:', error);
            const errorMsg = error.message?.toLowerCase() || '';
            if (errorMsg.includes('session_expired') || errorMsg.includes('invalid oauth') || errorMsg.includes('access token')) {
                showToast('❌ Session expired! Please reconnect your Meta account in Settings.', 'error');
            } else {
                showToast(`Failed: ${error.message}`, 'error');
            }
        } finally {
            setIsLaunching(false);
            setLaunchProgress('');
        }
    };

    // ============================================================
    // COMPUTED
    // ============================================================

    const ungroupedCreatives = useMemo(() => {
        const uploaded = creatives.filter(c => c.adsetId === null);
        const imported = importedCreatives.filter(c => c.adsetId === null);
        return [...uploaded, ...imported];
    }, [creatives, importedCreatives]);
    const editingCreative = useMemo(() => creatives.find(c => c.id === editingCreativeId) || null, [creatives, editingCreativeId]);

    const canLaunch = useMemo(() => {
        const hasGrouped = creatives.some(c => c.adsetId !== null);
        const hasCampaign = selectedCampaignId !== 'new' || newCampaignName.trim();
        const hasPage = !!selectedPageId;
        // URL only required for SALES, not for LEAD/WhatsApp Engagement
        const hasRequiredUrl = campaignObjective === 'LEAD' ? true : !!destinationUrl;
        return hasGrouped && hasCampaign && hasPage && hasRequiredUrl;
    }, [creatives, selectedCampaignId, newCampaignName, selectedPageId, destinationUrl, campaignObjective]);

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
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* 3-SECTION LAYOUT */}
            <div className="flex gap-6 min-h-0 overflow-hidden pb-4">

                {/* LEFT PANEL - Upload & Settings */}
                <div className="w-80 flex-shrink-0 space-y-2 overflow-y-auto overflow-x-hidden pr-2">
                    {/* Header */}
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 mb-1">Rapid Campaign</h2>
                        <p className="text-xs text-slate-500">Configure your campaign objective and settings</p>
                    </div>

                    {/* POSITION 1: Objective Selector */}
                    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Campaign Objective</label>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setCampaignObjective('SALES')}
                                className={`relative flex flex-col items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border-2 transition-all duration-200 group ${campaignObjective === 'SALES'
                                    ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20'
                                    : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                            >
                                <div className={`p-2 rounded-full transition-colors ${campaignObjective === 'SALES' ? 'bg-white/10' : 'bg-slate-100 group-hover:bg-white'}`}>
                                    <ShoppingBag size={18} strokeWidth={1.5} />
                                </div>
                                <span className="font-bold text-xs tracking-wide">Sales</span>
                            </button>

                            <div className="relative group">
                                <button
                                    onClick={() => setCampaignObjective('LEAD')}
                                    className={`relative w-full flex flex-col items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border-2 transition-all duration-200 group ${campaignObjective === 'LEAD'
                                        ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20'
                                        : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                >
                                    {/* Badge Positioned on Top Right of Button */}
                                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded-full shadow-sm border border-white/20 tracking-wider">
                                        BETA
                                    </div>

                                    <div className={`p-2 rounded-full transition-colors ${campaignObjective === 'LEAD' ? 'bg-white/10' : 'bg-slate-100 group-hover:bg-white'}`}>
                                        <MessageSquare size={18} strokeWidth={1.5} />
                                    </div>
                                    <span className="font-bold text-xs tracking-wide">Lead</span>
                                </button>

                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 shadow-xl">
                                    Function in testing. Expect Unstable
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                </div>
                            </div>
                        </div>

                        {/* Lead Objective Sub-Options */}
                        {campaignObjective === 'LEAD' && (
                            <div className="mt-3 space-y-2 animate-fadeIn">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Objective Focus</label>

                                {/* Engagement (WhatsApp) - Active */}
                                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-blue-500 bg-blue-50/50 cursor-pointer">
                                    <div className="w-4 h-4 rounded-full border-[5px] border-blue-600 bg-white"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Engagement (WhatsApp)</p>
                                    </div>
                                </div>

                                {/* Lead (WhatsApp) - Coming Soon */}
                                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed">
                                    <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-500">Lead (WhatsApp)</p>
                                        <p className="text-[10px] text-slate-400">Coming Soon</p>
                                    </div>
                                </div>

                                {/* Sales (WhatsApp) - Coming Soon */}
                                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed">
                                    <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-500">Sales (WhatsApp)</p>
                                        <p className="text-[10px] text-slate-400">Coming Soon</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* POSITION 2: Conditional Settings Based on Objective */}
                    {/* Campaign Selection */}
                    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Campaign</label>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            <span className="text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">ABO</span>
                        </div>
                        <select value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-colors appearance-none cursor-pointer">
                            <option value="new">+ New Campaign</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {selectedCampaignId === 'new' && (
                            <input type="text" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="Enter campaign name..."
                                className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-colors" />
                        )}
                    </div>

                    {/* Ad Set Selection */}
                    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Ad Set</label>
                        <select value={selectedExistingAdSetId} onChange={(e) => handleExistingAdSetSelect(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-colors appearance-none cursor-pointer">
                            <option value="new">• Create new ad sets</option>
                            {existingAdSets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>

                    {/* POSITION 3: Upload Creatives (Moved here) */}
                    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-2 block uppercase tracking-wide">Upload Creatives</label>
                        <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}
                            className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group">
                            <input type="file" multiple accept="image/*,video/*" onChange={handleFileSelect} className="hidden" id="file-upload" />
                            <label htmlFor="file-upload" className="cursor-pointer">
                                <div className="w-8 h-8 mx-auto mb-1 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                    <Upload className="text-blue-500" size={16} />
                                </div>
                                <p className="text-xs font-semibold text-slate-700 mb-0.5">Click to upload</p>
                                <p className="text-[10px] text-slate-400">or drag & drop</p>
                            </label>
                        </div>
                    </div>

                    {/* Conditional: Website URL (Sales) or WhatsApp Number (Lead) */}
                    {campaignObjective === 'SALES' ? (
                        <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Website URL</label>
                            <input type="url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-colors" />
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">
                                WhatsApp Number <span className="text-[10px] text-slate-400 normal-case">(Optional)</span>
                            </label>
                            {loadingWhatsappPhones ? (
                                <p className="text-[11px] text-slate-500">Loading WhatsApp numbers for selected page...</p>
                            ) : whatsappPhones.length > 0 ? (
                                <>
                                    <select
                                        value={whatsappNumber}
                                        onChange={(e) => setWhatsappNumber(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-colors appearance-none cursor-pointer"
                                    >
                                        <option value="">No WhatsApp CTA</option>
                                        {whatsappPhones.map(phone => (
                                            <option key={phone.id} value={phone.display_phone_number}>
                                                {phone.display_phone_number} - {phone.verified_name}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        {whatsappNumber ? '✅ Will use WhatsApp CTA button' : `Select a number linked to ${selectedPageName}`}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <input type="tel" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="60123456789"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-colors" />
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        No WhatsApp number linked to {selectedPageName}. Enter manually.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {/* Pixel Selection (Both objectives) */}
                    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">
                            Pixel {campaignObjective === 'LEAD' && <span className="text-[10px] text-slate-400 normal-case">(Optional)</span>}
                        </label>
                        <select value={selectedPixelId} onChange={(e) => setSelectedPixelId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-colors appearance-none cursor-pointer">
                            <option value="">Select pixel...</option>
                            {pixels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* POSITION 4: Page Selection */}
                    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Facebook Page</label>
                        <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400 transition-colors appearance-none cursor-pointer">
                            <option value="">Select page...</option>
                            {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
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
                            <button onClick={addAdSet}

                                className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold flex items-center gap-2 text-sm transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                            >
                                <Plus size={16} />
                                Create Ad Set
                            </button>
                            {/* Text Presets Gear Button */}
                            <button onClick={() => setShowTextPresets(true)}
                                className="p-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-800 rounded-lg transition-all shadow-sm hover:shadow-md"
                                title="Global Text Presets"
                            >
                                <SettingsIcon size={18} />
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
                            <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
                                {adSets.map((adset) => (
                                    <button key={adset.id}
                                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 whitespace-nowrap">
                                        <FolderOpen size={14} className="text-slate-400" />
                                        {adset.name}
                                        <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                            {creatives.filter(c => c.adsetId === adset.id).length} creatives
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Ungrouped Creatives - Only show creatives NOT assigned to any adset */}
                        {ungroupedCreatives.length > 0 && (
                            <div className="mb-4">
                                <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                    Uncategorized Creatives
                                    <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{ungroupedCreatives.length}</span>
                                </h3>
                                <div ref={setUngroupedRef} className={`max-h-[30rem] overflow-y-auto p-3 bg-slate-50 rounded-xl border transition-all ${isOverUngrouped ? 'ring-2 ring-blue-400 border-blue-300' : 'border-slate-200'}`}>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                                        {ungroupedCreatives.map(creative => (
                                            <DraggableCreativeCard
                                                key={creative.id}
                                                creative={creative}
                                                onEdit={() => setEditingCreativeId(creative.id)}
                                                onRemove={() => {
                                                    if (creative.isImported) {
                                                        deleteImportedCreative(creative.id);
                                                    } else {
                                                        removeCreative(creative.id);
                                                    }
                                                }}
                                                variant="mac-finder"
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Empty State - Only when NO creatives at all */}
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
                                        onRemoveCreative={removeCreativeFromAdSet}
                                        onUpdateAdName={updateAdName}
                                        onRenameAdSet={(newName) => renameAdSet(adset.id, newName)}
                                        onOpenSettings={() => setEditingAdSetId(adset.id)}
                                        onDuplicateCreative={duplicateCreative}
                                        onRemoveMedia={handleRemoveMedia}
                                        isExpanded={expandedAdSets.has(adset.id)}
                                        onToggle={() => toggleAdSetExpanded(adset.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <EditDrawer
                creative={editingCreative}
                isOpen={!!editingCreativeId}
                onClose={() => setEditingCreativeId(null)}
                onSave={(updates) => { if (editingCreativeId) updateCreative(editingCreativeId, updates); }}
                allCreatives={creatives}
                onShowToast={(msg) => showToast(msg, 'success')}
            />

            <AdSetSettingsDrawer
                adset={adSets.find(a => a.id === editingAdSetId) || null}
                isOpen={!!editingAdSetId}
                onClose={() => setEditingAdSetId(null)}
                onSave={(updates) => { if (editingAdSetId) updateAdSet(editingAdSetId, updates); }}
            />

            <TextPresetsDialog
                isOpen={showTextPresets}
                onClose={() => setShowTextPresets(false)}
                currentSettings={getCurrentSettingsAsTemplate()}
                onLoadTemplate={handleLoadTemplate}
            />

            {/* AI Assistant Chat Drawer */}
            <AiChatDrawer
                isOpen={showAiChat}
                onClose={() => setShowAiChat(false)}
                creativesCount={creatives.length}
                creativesTypes={{
                    images: creatives.filter(c => c.type === 'image').length,
                    videos: creatives.filter(c => c.type === 'video').length
                }}
                campaignObjective={campaignObjective}
                adSetsCount={adSets.length}
                currentBudget={adSets[0]?.dailyBudget || 10}
                currentTargeting={adSets[0]?.targeting || 'BROAD'}
                onSetBudget={(budget) => {
                    setAdSets(prev => prev.map(as => ({ ...as, dailyBudget: budget })));
                }}
                onCreateAdSets={(count) => {
                    const newAdSets: RapidAdSet[] = [];
                    for (let i = 0; i < count; i++) {
                        newAdSets.push({
                            id: `adset-${Date.now()}-${i}`,
                            name: `Ad Set ${adSets.length + i + 1}`,
                            dailyBudget: 10,
                            targeting: 'BROAD',
                            country: 'MY',
                            ageMin: 18,
                            ageMax: 65,
                            gender: 'ALL',
                            interests: [],
                            enhancementPlus: false
                        });
                    }
                    setAdSets(prev => [...prev, ...newAdSets]);
                }}
                onSetTargeting={(targeting) => {
                    setAdSets(prev => prev.map(as => ({ ...as, targeting })));
                }}
                onSetCountry={(country) => {
                    setAdSets(prev => prev.map(as => ({ ...as, country })));
                }}
                onSetAgeRange={(min, max) => {
                    setAdSets(prev => prev.map(as => ({ ...as, ageMin: min, ageMax: max })));
                }}
                onSetEnhancementPlus={(enabled) => {
                    setAdSets(prev => prev.map(as => ({ ...as, enhancementPlus: enabled })));
                }}
                onSetGender={(gender) => {
                    setAdSets(prev => prev.map(as => ({ ...as, gender })));
                }}
                onDistributeCreatives={() => {
                    if (adSets.length === 0) return;
                    const creativesPerAdSet = Math.ceil(creatives.filter(c => !c.adsetId).length / adSets.length);
                    let adSetIndex = 0;
                    let count = 0;
                    setCreatives(prev => prev.map(c => {
                        if (c.adsetId) return c;
                        const assignedAdSet = adSets[adSetIndex];
                        count++;
                        if (count >= creativesPerAdSet && adSetIndex < adSets.length - 1) {
                            adSetIndex++;
                            count = 0;
                        }
                        return { ...c, adsetId: assignedAdSet.id };
                    }));
                }}
            />

            {/* Floating AI Assistant Button - Only show when creatives uploaded */}
            {creatives.length > 0 && (
                <button
                    onClick={() => setShowAiChat(true)}
                    className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-white rounded-2xl shadow-xl shadow-purple-200 border border-slate-100 flex items-center justify-center hover:scale-110 hover:shadow-2xl hover:shadow-purple-300 transition-all duration-300 group"
                    title="AI Assistant"
                >
                    <GeminiIcon size={28} />
                    <span className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow-md">
                        AI
                    </span>
                </button>
            )}

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
                    // TODO: Could implement a "Draft" variant for drag overlay too, but standard looks okay for now
                ) : null}
            </DragOverlay>
        </DndContext >
    );
};

export default RapidCreator;
