import React, { createContext, useContext, useState, useCallback } from 'react';
import { ToastItem } from '../components/Toast';

interface ToastData {
    id: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container - Stacking Effect */}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none p-4">
                {toasts.map((toast, index) => {
                    // Stacking Logic: Make older toasts move up and scale down slightly? 
                    // Or just simple overlap. User wants "berlapik" (layered).
                    // We'll use a negative margin on subsequent items to pull them up.
                    const isLast = index === toasts.length - 1;
                    return (
                        <div
                            key={toast.id}
                            className="pointer-events-auto transition-all duration-700 ease-out"
                            style={{
                                marginTop: index === 0 ? 0 : '-48px', // Tighter overlap (was -16px)
                                zIndex: index,
                                // Stack visually: each card moves down slightly to show the top edge of the one behind? 
                                // No, usually stack means new one on top/bottom. 
                                // Let's make the previous ones scale down and just peek out.
                                transform: `scale(${1 - (toasts.length - 1 - index) * 0.05}) translateY(-${(toasts.length - 1 - index) * 12}px)`,
                                opacity: 1 - (toasts.length - 1 - index) * 0.2
                            }}
                        >
                            <ToastItem
                                id={toast.id}
                                message={toast.message}
                                type={toast.type}
                                onClose={removeToast}
                            />
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
