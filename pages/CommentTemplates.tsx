
import React, { useState, useEffect } from 'react';
import { useSettings } from '../App';
import { CommentTemplate } from '../types';
import { PlusCircle, Trash2, Image as ImageIcon, Save, AlertTriangle } from 'lucide-react';

const CommentTemplates: React.FC = () => {
    const { settings } = useSettings();
    const [templates, setTemplates] = useState<CommentTemplate[]>([]);
    
    const [newName, setNewName] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [newImage, setNewImage] = useState<string>('');
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
                // Safety check for size (LocalStorage limit is ~5MB)
                if (base64.length > 2000000) { // Approx 1.5MB limit
                    setError("Image is too large for template storage. Please use a smaller image (< 1.5MB).");
                    return;
                }
                setNewImage(base64);
                setError('');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAddTemplate = () => {
        if (templates.length >= 10) return setError("Limit reached (Max 10 Templates).");
        if (!newName.trim() || !newMessage.trim()) return setError("Name and Message are required.");

        const newTemplate: CommentTemplate = {
            id: Date.now().toString(),
            name: newName,
            message: newMessage,
            imageBase64: newImage || undefined
        };

        const updated = [...templates, newTemplate];
        setTemplates(updated);
        localStorage.setItem('ar_comment_templates', JSON.stringify(updated));
        
        // Reset
        setNewName('');
        setNewMessage('');
        setNewImage('');
        setError('');
    };

    const handleDelete = (id: string) => {
        const updated = templates.filter(t => t.id !== id);
        setTemplates(updated);
        localStorage.setItem('ar_comment_templates', JSON.stringify(updated));
    };

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <h1 className="text-2xl font-bold text-white mb-6">Comment Templates</h1>
            <p className="text-slate-400 mb-8">Create up to 10 preset comments to quickly launch on your active ads. Supports text and optional image.</p>

            <div className="grid md:grid-cols-2 gap-8">
                {/* CREATE FORM */}
                <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700 h-fit">
                    <h2 className="text-lg font-bold text-white mb-4">New Template</h2>
                    
                    {error && (
                        <div className="bg-red-900/20 border border-red-800 text-red-400 p-3 rounded-lg text-sm mb-4 flex items-center gap-2">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Template Name</label>
                            <input 
                                type="text" 
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none" 
                                placeholder="e.g. Promo Reply"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Comment Message</label>
                            <textarea 
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white h-24 outline-none" 
                                placeholder="Write your comment here..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Attach Image (Optional)</label>
                            <div className="flex items-center gap-4">
                                <label className="cursor-pointer bg-slate-800 border border-slate-600 hover:border-indigo-500 text-slate-300 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                                    <ImageIcon size={16} /> Upload Image
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </label>
                                {newImage && (
                                    <div className="relative w-12 h-12 rounded overflow-hidden border border-slate-600">
                                        <img src={newImage} className="w-full h-full object-cover" alt="Preview" />
                                        <button 
                                            onClick={() => setNewImage('')}
                                            className="absolute inset-0 bg-black/50 flex items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Max size 1.5MB (Stored locally).</p>
                        </div>

                        <button 
                            onClick={handleAddTemplate}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 mt-2"
                        >
                            <PlusCircle size={18} /> Add Template
                        </button>
                    </div>
                </div>

                {/* TEMPLATE LIST */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-white mb-2">Saved Templates ({templates.length}/10)</h2>
                    
                    {templates.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                            No templates created yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {templates.map(t => (
                                <div key={t.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-white font-medium truncate">{t.name}</h3>
                                        <p className="text-sm text-slate-400 line-clamp-2 mt-1">{t.message}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        {t.imageBase64 && (
                                            <div className="w-10 h-10 rounded bg-slate-900 border border-slate-600 overflow-hidden">
                                                <img src={t.imageBase64} className="w-full h-full object-cover" alt="Thumb" />
                                            </div>
                                        )}
                                        <button 
                                            onClick={() => handleDelete(t.id)}
                                            className="text-slate-500 hover:text-red-400 p-1"
                                        >
                                            <Trash2 size={16} />
                                        </button>
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
