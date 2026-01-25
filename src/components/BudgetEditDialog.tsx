import React, { useState, useEffect, useRef } from 'react';
import { X, DollarSign, Check } from 'lucide-react';

const formatMYR = (amount: number) => {
    return new Intl.NumberFormat('en-MY', {
        style: 'currency',
        currency: 'MYR',
    }).format(amount);
};

interface BudgetEditDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newBudget: number) => void;
    currentBudget: number;
    entityName?: string;
}

const BudgetEditDialog: React.FC<BudgetEditDialogProps> = ({
    isOpen,
    onClose,
    onSave,
    currentBudget,
    entityName = "Campaign/AdSet"
}) => {
    const [value, setValue] = useState(currentBudget.toString());
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(currentBudget.toString());
            // Focus input after a small delay to allow animation
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 100);
        }
    }, [isOpen, currentBudget]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0) {
            onSave(num);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-2xl p-6 relative scale-100 animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-lg font-bold text-slate-800 mb-1">Update Daily Budget</h2>
                <p className="text-xs text-slate-500 mb-6 truncate">For: <span className="font-medium text-slate-700">{entityName}</span></p>

                <form onSubmit={handleSubmit}>
                    <div className="relative mb-6">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span className="text-slate-500 font-bold">RM</span>
                        </div>
                        <input
                            ref={inputRef}
                            type="number"
                            step="0.01"
                            min="1"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="block w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                            placeholder="0.00"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 px-4 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!value || parseFloat(value) <= 0}
                            className="flex-1 py-2.5 px-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                        >
                            <Check size={16} /> Update Budget
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BudgetEditDialog;
