import React from 'react';
import { Edit2, X, Play, FileVideo, FileImage } from 'lucide-react';

export interface CreativeData {
    id: string;
    preview: string;
    type: 'image' | 'video';
    name: string;
    fileSize?: string;
    primaryText?: string;
    headline?: string;
    description?: string;
    adsetId: string | null;
    adName: string;
    callToAction: string;
    file?: File;
    isPlaceholder?: boolean;
}

interface CreativeCardProps {
    creative: CreativeData;
    onEdit: (e: React.MouseEvent) => void;
    onRemove: (e: React.MouseEvent) => void;
}

export const CreativeCard: React.FC<CreativeCardProps> = ({ creative, onEdit, onRemove }) => {
    return (
        <div className="group w-full flex flex-col items-center gap-2">
            {/* Visual "Card" Area - Fully filled with thumbnail */}
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-100 shadow-sm border border-slate-200 group-hover:shadow-xl group-hover:border-blue-300 transition-all duration-300">
                {creative.isPlaceholder ? (
                    <div className="w-full h-full bg-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                        {creative.type === 'video' ? <FileVideo size={32} /> : <FileImage size={32} />}
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Empty {creative.type}</span>
                    </div>
                ) : creative.type === 'image' ? (
                    <img src={creative.preview} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                    <video src={creative.preview} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" muted />
                )}

                {/* Floating Buttons - Appear on Hover with Float animation */}
                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-10px] group-hover:translate-y-0 z-20">
                    <button
                        onClick={onEdit}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded-full bg-white/90 backdrop-blur text-blue-600 shadow-lg flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all transform hover:scale-110"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        onClick={onRemove}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded-full bg-white/90 backdrop-blur text-red-500 shadow-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all transform hover:scale-110"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Subtle Video Badge if Video */}
                {creative.type === 'video' && (
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-[9px] font-bold text-white uppercase tracking-wider">
                        MP4
                    </div>
                )}
            </div>

            {/* Text Info - Mac Finder Style (Below Card) */}
            <div className="text-center w-full px-1">
                <p className="text-xs font-semibold text-slate-700 truncate leading-tight group-hover:text-blue-600 transition-colors">{creative.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">
                    {creative.type.toUpperCase()} {creative.file ? `${(creative.file.size / (1024 * 1024)).toFixed(1)}MB` : '0.0MB'}
                </p>
            </div>
        </div>
    );
};

export const CardMacFinder: React.FC<CreativeCardProps> = ({ creative, onEdit, onRemove }) => {
    return (
        <div className="w-full flex flex-col items-center group p-2 rounded-xl hover:bg-blue-50/50 transition-colors">
            {/* Icon/Thumbnail Area */}
            <div className="relative w-full aspect-[4/3] mb-2">
                <div className="w-full h-full bg-white rounded-lg shadow-sm border border-slate-200 p-1 flex items-center justify-center overflow-hidden relative">
                    {creative.isPlaceholder ? (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                            {creative.type === 'video' ? <FileVideo size={24} /> : <FileImage size={24} />}
                        </div>
                    ) : creative.type === 'image' ? (
                        <img src={creative.preview} alt="" className="w-full h-full object-contain rounded" />
                    ) : (
                        <div className="relative w-full h-full bg-black rounded overflow-hidden">
                            <video src={creative.preview} className="w-full h-full object-cover opacity-80" muted />
                            <div className="absolute inset-0 flex items-center justify-center text-white/50">
                                <Play size={20} fill="currentColor" />
                            </div>
                        </div>
                    )}

                    {/* Hover Actions Overlay */}
                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity rounded z-20">
                        <button
                            onClick={onEdit}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="p-1.5 bg-white rounded-md shadow-sm hover:text-blue-600 transform scale-90 hover:scale-100 transition-all"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button
                            onClick={onRemove}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="p-1.5 bg-white rounded-md shadow-sm hover:text-red-500 transform scale-90 hover:scale-100 transition-all"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
                {/* Tiny Badge */}
                <div className="absolute -bottom-1 -right-1 bg-white border border-slate-200 rounded-md p-0.5 shadow-sm z-10">
                    {creative.type === 'video' ? <FileVideo size={10} className="text-purple-500" /> : <FileImage size={10} className="text-blue-500" />}
                </div>
            </div>

            {/* Label */}
            <p className="text-[11px] font-medium text-slate-700 text-center leading-tight line-clamp-2 px-1 w-full break-words group-hover:text-blue-600 transition-colors">
                {creative.name}
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5">{creative.type === 'video' ? 'MP4' : 'JPG'}</p>
        </div>
    );
};
