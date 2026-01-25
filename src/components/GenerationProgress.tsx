import React, { useEffect } from 'react';
import { useSettings } from '../App';
import { Video, Image, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

// Toast-style generation progress component
// Appears at bottom-right, persists across all tabs

const GenerationProgress: React.FC = () => {
    const { globalProcess, setGlobalProcess } = useSettings();

    // Don't render if no active generation process
    if (!globalProcess.active || (globalProcess.type !== 'VIDEO_GENERATION' && globalProcess.type !== 'IMAGE_GENERATION')) {
        return null;
    }

    const isVideo = globalProcess.type === 'VIDEO_GENERATION';
    const Icon = isVideo ? Video : Image;
    const progress = globalProcess.progress || 0;
    const isComplete = progress >= 100;
    const isFailed = globalProcess.message?.toLowerCase().includes('failed');

    const handleClose = () => {
        setGlobalProcess({ active: false, name: '', message: '', type: 'NONE' });
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 animate-slideUp">
            <div className={`bg-white rounded-xl shadow-2xl border ${isFailed ? 'border-red-200' : isComplete ? 'border-green-200' : 'border-purple-200'} p-4 min-w-[320px] max-w-[400px]`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${isFailed ? 'bg-red-100' : isComplete ? 'bg-green-100' : 'bg-purple-100'}`}>
                            {isFailed ? (
                                <AlertCircle size={18} className="text-red-600" />
                            ) : isComplete ? (
                                <CheckCircle size={18} className="text-green-600" />
                            ) : (
                                <Icon size={18} className="text-purple-600" />
                            )}
                        </div>
                        <div>
                            <p className="font-bold text-slate-800 text-sm">{globalProcess.name}</p>
                            <p className="text-xs text-slate-500">{isVideo ? 'Epic Video' : 'Epic Poster'}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Progress Bar */}
                {!isComplete && !isFailed && (
                    <div className="mb-2">
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-500 ease-out"
                                style={{ width: `${Math.max(progress, 5)}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Status Message */}
                <div className="flex items-center justify-between">
                    <p className={`text-xs ${isFailed ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-slate-500'}`}>
                        {globalProcess.message}
                    </p>
                    {!isComplete && !isFailed && (
                        <div className="flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin text-purple-600" />
                            <span className="text-xs font-bold text-purple-600">{progress}%</span>
                        </div>
                    )}
                </div>

                {/* Action Button for Complete */}
                {isComplete && (
                    <button
                        onClick={handleClose}
                        className="mt-3 w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-bold py-2 rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all"
                    >
                        View Result
                    </button>
                )}
            </div>
        </div>
    );
};

export default GenerationProgress;

// Add CSS animation in index.css or inline style
// @keyframes slideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
// .animate-slideUp { animation: slideUp 0.3s ease-out; }
