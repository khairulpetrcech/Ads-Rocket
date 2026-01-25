import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface CustomToastProps {
    message: string;
    description?: string;
    type?: ToastType;
    duration?: number;
    onClose: () => void;
    isVisible: boolean;
}

const CustomToast: React.FC<CustomToastProps> = ({
    message,
    description,
    type = 'info',
    duration = 5000,
    onClose,
    isVisible
}) => {
    const [show, setShow] = useState(isVisible);

    useEffect(() => {
        setShow(isVisible);
        if (isVisible && duration > 0) {
            const timer = setTimeout(() => {
                setShow(false);
                setTimeout(onClose, 300); // Wait for exit animation
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [isVisible, duration, onClose]);

    if (!isVisible && !show) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle className="text-green-500" size={20} />;
            case 'error': return <AlertCircle className="text-red-500" size={20} />;
            case 'warning': return <AlertTriangle className="text-amber-500" size={20} />;
            case 'info': return <Info className="text-indigo-500" size={20} />;
        }
    };

    const getBgColor = () => {
        switch (type) {
            case 'success': return 'bg-green-50 border-green-100';
            case 'error': return 'bg-red-50 border-red-100';
            case 'warning': return 'bg-amber-50 border-amber-100';
            case 'info': return 'bg-indigo-50 border-indigo-100';
        }
    };

    return (
        <div className={`fixed top-6 right-6 z-[60] max-w-sm w-full transition-all duration-300 transform ${show ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'}`}>
            <div className={`backdrop-blur-xl bg-white/95 border shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl p-4 flex gap-3 ${getBgColor()}`}>
                <div className="flex-shrink-0 mt-0.5">
                    {getIcon()}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-slate-800 font-bold text-sm leading-tight mb-1">{message}</h4>
                    {description && <p className="text-slate-500 text-xs leading-relaxed whitespace-pre-wrap">{description}</p>}
                </div>
                <button
                    onClick={() => { setShow(false); setTimeout(onClose, 300); }}
                    className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors -mt-1 -mr-1 p-1"
                >
                    <X size={16} />
                </button>
            </div>
            {/* Progress bar for time remaining could be added here */}
        </div>
    );
};

export default CustomToast;
