import React, { useEffect, useState } from 'react';
import { Check, X, AlertTriangle, Info, AlertCircle } from 'lucide-react';

export interface ToastProps {
    id: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onClose: (id: string) => void;
}

export const ToastItem: React.FC<ToastProps> = ({ id, message, type, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);
    const [isVisible, setIsVisible] = useState(false); // For Enter Animation

    useEffect(() => {
        // Trigger Enter Animation (Left to Right)
        const enterTimer = setTimeout(() => {
            setIsVisible(true);
        }, 50);

        // Auto Close Timer
        const closeTimer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onClose(id), 1000); // Exit duration
        }, 5000); // Stay for 5s

        return () => {
            clearTimeout(enterTimer);
            clearTimeout(closeTimer);
        };
    }, [id, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success': return <Check size={18} strokeWidth={2.5} />;
            case 'error': return <AlertCircle size={18} strokeWidth={2.5} />;
            case 'warning': return <AlertTriangle size={18} strokeWidth={2.5} />;
            case 'info': return <Info size={18} strokeWidth={2.5} />;
        }
    };

    const getColorClass = () => {
        switch (type) {
            case 'success': return 'text-emerald-500';
            case 'error': return 'text-red-500';
            case 'warning': return 'text-amber-500';
            case 'info': return 'text-indigo-500';
        }
    };

    const getTitle = () => {
        switch (type) {
            case 'success': return 'Success';
            case 'error': return 'Error';
            case 'warning': return 'Attention';
            case 'info': return 'Info';
        }
    };

    return (
        <div
            className={`
                transition-all duration-[2000ms] ease-out transform
                ${isExiting
                    ? 'opacity-0 translate-y-4 scale-95' // Exit State
                    : isVisible
                        ? 'opacity-100 translate-x-0 scale-100' // Active State
                        : 'opacity-0 -translate-x-24 scale-95' // Enter Start State (From Left)
                }
            `}
        >
            <div className="font-helvetica bg-white border border-slate-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] rounded-xl px-5 py-4 min-w-[320px] max-w-[400px] flex items-start gap-4 hover:shadow-2xl transition-shadow cursor-pointer" onClick={() => { setIsExiting(true); setTimeout(() => onClose(id), 700); }}>
                <div className={`mt-0.5 ${getColorClass()}`}>
                    {getIcon()}
                </div>
                <div className="flex-1">
                    <h4 className="text-base font-bold text-slate-800 tracking-tight leading-none mb-1">{getTitle()}</h4>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed whitespace-pre-wrap">{message}</p>
                </div>
                <button className="text-slate-300 hover:text-slate-500 transition-colors">
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
