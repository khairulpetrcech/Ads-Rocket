
import React, { useState, useEffect } from 'react';
import { useSettings } from '../App';
import { CommentTemplate, CommentItem } from '../types';
import { PlusCircle, Trash2, Image as ImageIcon, Save, AlertTriangle, Layers, X } from 'lucide-react';

const CommentTemplates: React.FC = () => {
    const { settings } = useSettings();
    const [templates, setTemplates] = useState<CommentTemplate[]>([]);
    
    // Template Builder State
    const [templateName, setTemplateName] = useState('');
    const [draftItems, setDraftItems] = useState<CommentItem[]>([]);
    
    // Current Comment Input State
    const [currentMessage, setCurrentMessage] = useState('');
    const [currentImage, setCurrentImage] = useState<string>('');
    
    const [error, setError] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('ar_comment_templates');
        if (saved) setTemplates(JSON.parse(saved));
    }, []);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                // Safety check for size (LocalStorage limit is ~5MB total, careful)
                if (base64.length > 1500000) { // Approx 1MB limit per image
                    setError("Image is too large. Please use a smaller image (< 1MB).");
                    return;
                }
                setCurrentImage(base64);
                setError('');
            };
            reader.readAsDataURL(file);
        }
    };

    const addToDraft = () => {
        if (draftItems.length >= 10) return setError("Max 10 comments per template.");
        if (!currentMessage.trim()) return setError("Comment message cannot be empty.");

        const newItem: CommentItem = {
            id: Date.now().toString(),
            message: currentMessage,
            imageBase64: currentImage || undefined
        };

        setDraftItems([...draftItems, newItem]);
        setCurrentMessage('');
        setCurrentImage('');
        setError('');
    };

    const removeFromDraft = (idx: number) => {
        const newDraft = [...draftItems];
        newDraft.splice(idx, 1);
        setDraftItems(newDraft);
    };

    const handleSaveTemplate = () => {
        if (!templateName.trim()) return setError("Template Name is required.");
        if (draftItems.length === 0) return setError("Add at least one comment to the template.");

        const newTemplate: CommentTemplate = {
            id: Date.now().toString(),
            name: templateName,
            items: draftItems
        };

        const updated = [...templates, newTemplate];
        setTemplates(updated);
        localStorage.setItem('ar_comment_templates', JSON.stringify(updated));
        
        // Reset Logic
        setTemplateName('');
        setDraftItems([]);
        setCurrentMessage('');
        setCurrentImage('');
        setError('');
    };

    const handleDeleteTemplate = (id: string) => {
        const updated = templates.filter(t => t.id !== id);
        setTemplates(updated);
        localStorage.setItem('ar_comment_templates', JSON.stringify(updated));
    };

    return (
        <div className="max-w-5xl mx-auto pb-20">
            <h1 className="text-2xl font-bold text-white mb-6">Comment Templates</h1>
            <p className="text-slate-400 mb-8">
                Create templates that contain <strong>up to 10 comments</strong>. When launched, all comments in the template will be posted to your ad.
            </p>

            <div className="grid md:grid-cols-12 gap-8">
                {/* LEFT: BUILDER */}
                <div className="md:col-span-7 bg-[#1e293b] p-6 rounded-xl border border-slate-700 h-fit">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <PlusCircle className="text-indigo-400" size={20}/> Template Builder
                    </h2>
                    
                    {error && (
                        <div className="bg-red-900/20 border border-red-800 text-red-400 p-3 rounded-lg text-sm mb-4 flex items-center gap-2">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    {/* Template Name Input */}
                    <div className="mb-6">
                        <label className="block text-sm text-slate-400 mb-1">Template Name</label>
                        <input 
                            type="text" 
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-indigo-500" 
                            placeholder="e.g. Sales Funnel Reply (3 Comments)"
                        />
                    </div>

                    {/* Add Comment Section */}
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Add Comment to Sequence ({draftItems.length}/10)</h3>
                        
                        <textarea 
                            value={currentMessage}
                            onChange={(e) => setCurrentMessage(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white h-20 outline-none mb-3 text-sm" 
                            placeholder="Write a comment..."
                        />
                        
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <label className="cursor-pointer text-slate-400 hover:text-white flex items-center gap-2 text-xs bg-slate-800 px-3 py-1.5 rounded border border-slate-600">
                                    <ImageIcon size={14} /> {currentImage ? 'Change Image' : 'Attach Image'}
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </label>
                                {currentImage && (
                                    <div className="relative w-8 h-8 rounded overflow-hidden border border-slate-500">
                                        <img src={currentImage} className="w-full h-full object-cover" alt="Preview" />
                                        <button onClick={() => setCurrentImage('')} className="absolute inset-0 bg-black/60 flex items-center justify-center text-white"><X size={12}/></button>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={addToDraft}
                                disabled={draftItems.length >= 10}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                            >
                                Add to List
                            </button>
                        </div>
                    </div>

                    {/* Draft List */}
                    <div className="space-y-2 mb-6">
                        {draftItems.map((item, idx) => (
                            <div key={idx} className="flex items-start gap-3 bg-slate-900 p-3 rounded border border-slate-800">
                                <span className="bg-slate-700 text-slate-400 text-[10px] w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-slate-300 text-sm truncate">{item.message}</p>
                                </div>
                                {item.imageBase64 && <ImageIcon size={14} className="text-green-500 flex-shrink-0"/>}
                                <button onClick={() => removeFromDraft(idx)} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button>
                            </div>
                        ))}
                        {draftItems.length === 0 && (
                            <div className="text-center text-xs text-slate-500 italic py-2">No comments added to this template yet.</div>
                        )}
                    </div>

                    <button 
                        onClick={handleSaveTemplate}
                        className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-900/20"
                    >
                        <Save size={18} /> Save Template
                    </button>
                </div>

                {/* RIGHT: SAVED LIST */}
                <div className="md:col-span-5 space-y-4">
                    <h2 className="text-lg font-bold text-white mb-2">Saved Templates</h2>
                    
                    {templates.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                            No templates created yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {templates.map(t => (
                                <div key={t.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 hover:border-indigo-500/50 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-white font-bold truncate pr-4">{t.name}</h3>
                                        <button 
                                            onClick={() => handleDeleteTemplate(t.id)}
                                            className="text-slate-500 hover:text-red-400"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <div className="bg-slate-900/50 rounded p-2 text-xs text-slate-400 mb-2 flex items-center gap-2">
                                        <Layers size={12} /> {t.items.length} Comments in sequence
                                    </div>
                                    <div className="space-y-1">
                                        {t.items.slice(0, 2).map((item, i) => (
                                            <p key={i} className="text-xs text-slate-500 truncate border-l-2 border-slate-700 pl-2">
                                                {item.message}
                                            </p>
                                        ))}
                                        {t.items.length > 2 && <p className="text-[10px] text-slate-600 pl-2">+{t.items.length - 2} more...</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CommentTemplates;
