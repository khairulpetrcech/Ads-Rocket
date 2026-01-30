import React, { useState, useEffect } from 'react';
import { CommentTemplate, CommentItem } from '../types';
import { PlusCircle, Trash2, Image as ImageIcon, Save, AlertTriangle, Layers, Loader2, CheckCircle, Cloud, CloudOff } from 'lucide-react';

const API_BASE = import.meta.env.PROD ? '' : '';

const CommentTemplates: React.FC = () => {
    const [templates, setTemplates] = useState<CommentTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Builder State
    const [templateName, setTemplateName] = useState('');
    const [draftItems, setDraftItems] = useState<CommentItem[]>([]);

    // Inputs
    const [currentMessage, setCurrentMessage] = useState('');
    const [currentImage, setCurrentImage] = useState<string>('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const getFbId = () => {
        try {
            const saved = localStorage.getItem('ar_user_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                return settings.userId || settings.fbId;
            }
        } catch (e) {
            console.error('Error getting fbId:', e);
        }
        return null;
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        const fbId = getFbId();
        if (!fbId) {
            // Fallback to localStorage if not logged in
            const saved = localStorage.getItem('ar_comment_templates');
            if (saved) {
                setTemplates(JSON.parse(saved));
            }
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/comment-templates-api?fbId=${fbId}`);
            const data = await res.json();

            if (data.templates && data.templates.length > 0) {
                setTemplates(data.templates);
            } else {
                // Check if there's localStorage data to migrate
                const saved = localStorage.getItem('ar_comment_templates');
                if (saved) {
                    const localTemplates = JSON.parse(saved);
                    if (localTemplates.length > 0) {
                        setSuccessMsg('Migrating local templates to cloud...');
                        await migrateLocalToCloud(localTemplates, fbId);
                        setSuccessMsg('Migration complete!');
                        setTimeout(() => setSuccessMsg(''), 2000);
                    }
                }
            }
        } catch (e) {
            console.error('Fetch templates error:', e);
            // Fallback to localStorage
            const saved = localStorage.getItem('ar_comment_templates');
            if (saved) {
                setTemplates(JSON.parse(saved));
            }
        }
        setLoading(false);
    };

    const migrateLocalToCloud = async (localTemplates: CommentTemplate[], fbId: string) => {
        setSyncing(true);
        const migratedTemplates: CommentTemplate[] = [];

        for (const template of localTemplates) {
            try {
                const res = await fetch(`${API_BASE}/api/comment-templates-api`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fbId,
                        template: {
                            name: template.name,
                            items: template.items
                        }
                    })
                });
                const data = await res.json();
                if (data.success && data.template) {
                    migratedTemplates.push(data.template);
                }
            } catch (e) {
                console.error('Migration error for template:', template.name, e);
            }
        }

        if (migratedTemplates.length > 0) {
            setTemplates(migratedTemplates);
            // Clear localStorage after successful migration
            localStorage.removeItem('ar_comment_templates');
        }
        setSyncing(false);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                if (base64.length > 2000000) { // 2MB Check
                    setError("Image is too large. Please use a smaller image (< 2MB).");
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

    const handleSaveTemplate = async () => {
        if (!templateName.trim()) return setError("Template Name is required.");
        if (draftItems.length === 0) return setError("Add at least one comment.");

        setLoading(true);
        const fbId = getFbId();

        const newTemplate: CommentTemplate = {
            id: Date.now().toString(),
            name: templateName,
            items: draftItems,
            created_at: new Date().toISOString()
        };

        if (fbId) {
            // Save to Supabase
            try {
                const res = await fetch(`${API_BASE}/api/comment-templates-api`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fbId,
                        template: {
                            name: templateName,
                            items: draftItems
                        }
                    })
                });
                const data = await res.json();

                if (data.success && data.template) {
                    setTemplates([data.template, ...templates]);
                    setSuccessMsg("Template saved to cloud ☁️");
                } else {
                    throw new Error(data.error || 'Failed to save');
                }
            } catch (e: any) {
                console.error('Save error:', e);
                // Fallback to localStorage
                const updated = [newTemplate, ...templates];
                setTemplates(updated);
                localStorage.setItem('ar_comment_templates', JSON.stringify(updated));
                setSuccessMsg("Template saved locally (offline).");
            }
        } else {
            // Save to localStorage
            const updated = [newTemplate, ...templates];
            setTemplates(updated);
            localStorage.setItem('ar_comment_templates', JSON.stringify(updated));
            setSuccessMsg("Template saved locally.");
        }

        setTemplateName('');
        setDraftItems([]);
        setError('');
        setTimeout(() => setSuccessMsg(''), 2000);
        setLoading(false);
    };

    const handleDeleteTemplate = async (id: string) => {
        const fbId = getFbId();

        if (fbId) {
            try {
                const res = await fetch(`${API_BASE}/api/comment-templates-api?fbId=${fbId}&templateId=${id}`, {
                    method: 'DELETE'
                });
                const data = await res.json();

                if (data.success) {
                    setTemplates(templates.filter(t => t.id !== id));
                }
            } catch (e) {
                console.error('Delete error:', e);
            }
        } else {
            const updated = templates.filter(t => t.id !== id);
            setTemplates(updated);
            localStorage.setItem('ar_comment_templates', JSON.stringify(updated));
        }
    };

    const fbId = getFbId();

    return (
        <div className="max-w-5xl mx-auto pb-20">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-slate-800">Comment Templates</h1>
                <div className="flex items-center gap-2 text-xs">
                    {fbId ? (
                        <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                            <Cloud size={12} /> Cloud Sync
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                            <CloudOff size={12} /> Local Only
                        </span>
                    )}
                    {syncing && <Loader2 size={14} className="animate-spin text-indigo-600" />}
                </div>
            </div>

            <div className="grid md:grid-cols-12 gap-8">
                {/* BUILDER */}
                <div className="md:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <PlusCircle className="text-indigo-600" size={20} /> Template Builder
                    </h2>

                    {error && <div className="text-red-600 bg-red-50 p-3 rounded mb-4 text-sm flex items-center gap-2 border border-red-200"><AlertTriangle size={16} />{error}</div>}
                    {successMsg && <div className="text-green-600 bg-green-50 p-3 rounded mb-4 text-sm flex items-center gap-2 border border-green-200"><CheckCircle size={16} />{successMsg}</div>}

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-500 mb-1">Template Name</label>
                        <input
                            type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                            placeholder="e.g. Sales Funnel Reply"
                        />
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                        <textarea
                            value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-800 h-20 text-sm mb-3 focus:outline-none focus:border-indigo-500"
                            placeholder="Write a comment..."
                        />
                        <div className="flex justify-between items-center">
                            <label className="cursor-pointer text-slate-500 hover:text-indigo-600 flex items-center gap-2 text-xs bg-white px-3 py-1.5 rounded border border-slate-200 shadow-sm transition-colors font-medium">
                                <ImageIcon size={14} /> {currentImage ? 'Change Image' : 'Attach Image'}
                                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                            </label>
                            <button onClick={addToDraft} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded text-sm font-bold shadow-sm">Add to List</button>
                        </div>
                    </div>

                    <div className="space-y-2 mb-6">
                        {draftItems.map((item, idx) => (
                            <div key={idx} className="flex items-start gap-3 bg-slate-50 p-3 rounded border border-slate-200">
                                <span className="bg-slate-200 text-slate-600 text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">{idx + 1}</span>
                                <p className="text-slate-700 text-sm truncate flex-1">{item.message}</p>
                                {item.imageBase64 && <ImageIcon size={14} className="text-green-500" />}
                                <button onClick={() => removeFromDraft(idx)}><Trash2 size={14} className="text-slate-400 hover:text-red-500" /></button>
                            </div>
                        ))}
                    </div>

                    <button onClick={handleSaveTemplate} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm transition-all">
                        {loading ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Save Template</>}
                    </button>
                </div>

                {/* SAVED LIST */}
                <div className="md:col-span-5 space-y-4">
                    <h2 className="text-lg font-bold text-slate-800">Saved Templates</h2>
                    {loading && templates.length === 0 ? <Loader2 className="animate-spin text-indigo-600" /> :
                        templates.length === 0 ? <p className="text-slate-400">No templates found.</p> : (
                            <div className="space-y-3">
                                {templates.map(t => (
                                    <div key={t.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="text-slate-800 font-bold truncate pr-4">{t.name}</h3>
                                            <button onClick={() => handleDeleteTemplate(t.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                                        </div>
                                        <div className="bg-slate-50 rounded p-2 text-xs text-slate-500 mb-2 flex items-center gap-2 font-medium">
                                            <Layers size={12} /> {(t.items || []).length} Comments
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