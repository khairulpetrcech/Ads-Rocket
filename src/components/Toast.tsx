import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

export interface ToastProps {
    id: string;
    message: string;
    type: 'success' | 'error';
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
            <div className="bg-white border border-slate-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] rounded-xl px-5 py-4 min-w-[320px] max-w-[400px] flex items-start gap-4 hover:shadow-2xl transition-shadow cursor-pointer" onClick={() => { setIsExiting(true); setTimeout(() => onClose(id), 700); }}>
                <div className={`mt-0.5 ${type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {type === 'success' ? <Check size={18} strokeWidth={2.5} /> : <X size={18} strokeWidth={2.5} />}
                </div>
                <div>
                    <h4 className="text-base font-bold text-slate-800 tracking-tight leading-none mb-1">{type === 'success' ? 'Success' : 'Attention'}</h4>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">{message}</p>
                </div>
            </div>
        </div>
    );
};
