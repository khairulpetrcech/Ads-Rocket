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

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onClose(id), 300); // Wait for exit animation
        }, 3000);

        return () => clearTimeout(timer);
    }, [id, onClose]);

    return (
        <div
            className={`
                transition-all duration-300 ease-in-out transform
                ${isExiting ? 'opacity-0 translate-x-10 scale-95' : 'opacity-100 translate-x-0 scale-100'}
                animate-in slide-in-from-right-8 fade-in duration-300
            `}
        >
            <div className="bg-white border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-xl px-5 py-4 min-w-[320px] max-w-[400px] flex items-start gap-4 hover:shadow-xl transition-shadow cursor-pointer" onClick={() => { setIsExiting(true); setTimeout(() => onClose(id), 300); }}>
                <div className={`mt-0.5 ${type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {type === 'success' ? <Check size={18} strokeWidth={2.5} /> : <X size={18} strokeWidth={2.5} />}
                </div>
                <div>
                    <h4 className="text-sm font-bold text-slate-800 tracking-tight leading-none mb-1">{type === 'success' ? 'Success' : 'Attention'}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{message}</p>
                </div>
            </div>
        </div>
    );
};
