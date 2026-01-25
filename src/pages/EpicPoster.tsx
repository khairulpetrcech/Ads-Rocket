import React, { useState, useRef, useEffect } from 'react';
import { useSettings } from '../App';
import { useToast } from '../contexts/ToastContext';
import { Sparkles, Download, Loader2, AlertTriangle, Upload, X, ChevronLeft, ChevronRight, Image as ImageIcon, Maximize2, Rocket } from 'lucide-react';

interface ImageHistoryItem {
    id: number;
    uuid: string;
    prompt: string;
    model: string;
    status: number;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    createdAt: string;
    expiresAt: string;
}

const STORAGE_KEY = 'epicposter_created_uuids';

// Helper to get created UUIDs from localStorage
const getCreatedUUIDs = (): string[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

// Helper to add UUID to localStorage
const addCreatedUUID = (uuid: string) => {
    try {
        const uuids = getCreatedUUIDs();
        if (!uuids.includes(uuid)) {
            uuids.push(uuid);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(uuids));
        }
    } catch (e) {
        console.error('Failed to save UUID:', e);
    }
};

const EpicPoster: React.FC = () => {
    const { settings, globalProcess, setGlobalProcess } = useSettings();
    const { showToast } = useToast();
    const [prompt, setPrompt] = useState('');
    // Fixed to imagen-pro (Nano Banana Pro)
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16'>('1:1');
    const [style, setStyle] = useState<string>('Photorealistic');
    const [loading, setLoading] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [error, setError] = useState('');

    // Reference image
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Image History
    const [history, setHistory] = useState<ImageHistoryItem[]>([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [viewingImage, setViewingImage] = useState<ImageHistoryItem | null>(null);
    const [addingToRapid, setAddingToRapid] = useState<Set<number>>(new Set());

    // Polling for status
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Handler to add media to Rapid Campaign
    const handleAddToRapid = async (img: ImageHistoryItem) => {
        if (!img.imageUrl && !img.thumbnailUrl) {
            showToast('No image URL available', 'error');
            return;
        }

        const mediaUrl = img.imageUrl || img.thumbnailUrl || '';

        setAddingToRapid(prev => new Set([...prev, img.id]));

        try {
            const response = await fetch('/api/import-to-rapid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl,
                    mediaType: 'image',
                    name: `Epic Poster - ${img.prompt?.slice(0, 30) || img.uuid}`,
                    sourceUuid: img.uuid
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to import to Rapid Campaign');
            }

            showToast('✅ Added to Rapid Campaign!', 'success');
        } catch (e: any) {
            console.error('Import to Rapid failed:', e);
            showToast(e.message || 'Failed to add to Rapid Campaign', 'error');
        } finally {
            setAddingToRapid(prev => {
                const next = new Set(prev);
                next.delete(img.id);
                return next;
            });
        }
    };

    const styles = [
        'Photorealistic', '3D Render', 'Anime General', 'Illustration',
        'Watercolor', 'Portrait Cinematic', 'Fashion', 'Creative'
    ];

    useEffect(() => {
        fetchImageHistory(1);
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    const fetchImageHistory = async (page: number) => {
        setHistoryLoading(true);
        try {
            const response = await fetch(`/api/media-api?action=image-history&page=${page}`);
            const data = await response.json();
            if (data.success) {
                // Filter to only show images created by this app
                const createdUUIDs = getCreatedUUIDs();
                const filteredImages = (data.images || []).filter((img: ImageHistoryItem) =>
                    createdUUIDs.includes(img.uuid)
                );
                setHistory(filteredImages);
                setHistoryPage(data.page);
                setHistoryTotalPages(Math.max(1, Math.ceil(filteredImages.length / 6)));
            }
        } catch (err) {
            console.error('Failed to fetch image history:', err);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            setReferenceImage(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) return setError("Please enter a prompt description.");

        setLoading(true);
        setError('');
        setGeneratedImage(null);

        try {
            const requestBody: any = {
                prompt,
                model: 'nano-banana-pro', // Fixed to Nano Banana Pro
                aspectRatio,
                style
            };

            if (referenceImage) {
                requestBody.imageBase64 = referenceImage;
            }

            const response = await fetch('/api/generate-poster', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate image');
            }

            // Store UUID in localStorage to track images created by this app
            if (data.uuid) {
                addCreatedUUID(data.uuid);
            }

            // If image is ready immediately
            if (data.imageUrl && data.status === 2) {
                setGeneratedImage(data.imageUrl);
                setLoading(false);
                setGlobalProcess({
                    active: true,
                    name: 'Image Ready!',
                    message: 'Your poster has been generated successfully.',
                    type: 'IMAGE_GENERATION',
                    progress: 100,
                    uuid: data.uuid
                });
                showToast('Poster generated successfully! 🎨', 'success');
                fetchImageHistory(1);
            } else {
                // Set initial progress
                setGlobalProcess({
                    active: true,
                    name: 'Generating Poster...',
                    message: 'Processing...',
                    type: 'IMAGE_GENERATION',
                    progress: 10,
                    uuid: data.uuid
                });

                // Start polling
                pollingRef.current = setInterval(async () => {
                    const statusRes = await fetch(`/api/media-api?action=video-status&uuid=${data.uuid}`);
                    const statusData = await statusRes.json();

                    if (statusData.done && statusData.status === 'completed' && statusData.url) {
                        setGeneratedImage(statusData.url);
                        setLoading(false);
                        setGlobalProcess({
                            active: true,
                            name: 'Image Ready!',
                            message: 'Your poster has been generated successfully.',
                            type: 'IMAGE_GENERATION',
                            progress: 100,
                            uuid: data.uuid
                        });
                        showToast('Poster generated successfully! 🎨', 'success');
                        if (pollingRef.current) clearInterval(pollingRef.current);
                        fetchImageHistory(1);
                    } else if (statusData.done && statusData.status === 'failed') {
                        setError('Image generation failed. Please try again.');
                        setLoading(false);
                        setGlobalProcess({
                            active: true,
                            name: 'Generation Failed',
                            message: 'Image generation failed.',
                            type: 'IMAGE_GENERATION',
                            progress: 0,
                            uuid: data.uuid
                        });
                        showToast('Image generation failed.', 'error');
                        if (pollingRef.current) clearInterval(pollingRef.current);
                    } else {
                        const newProgress = statusData.progress || 50;
                        setGlobalProcess({
                            active: true,
                            name: 'Generating Poster...',
                            message: `Processing... ${newProgress}%`,
                            type: 'IMAGE_GENERATION',
                            progress: newProgress,
                            uuid: data.uuid
                        });
                    }
                }, 3000);

                // Timeout after 60 seconds
                setTimeout(() => {
                    if (loading && pollingRef.current) {
                        clearInterval(pollingRef.current);
                        setLoading(false);
                        setError('Generation timed out. Check history for results.');
                    }
                }, 60000);
            }

        } catch (e: any) {
            console.error("Gen Error", e);
            setError(e.message || "An unknown error occurred.");
            setLoading(false);
        }
    };

    const handleDownload = (url?: string) => {
        const imageUrl = url || generatedImage;
        if (!imageUrl) return;

        // Use window.open for external URLs to avoid CORS issues
        window.open(imageUrl, '_blank');
    };

    const clearReferenceImage = () => {
        setReferenceImage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="max-w-5xl mx-auto pb-20">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg shadow-md shadow-indigo-200">
                    <Sparkles className="text-white" size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Epic Poster</h1>
                    <p className="text-xs text-indigo-600 font-bold uppercase tracking-wide">Powered by Imagen via GeminiGen.ai</p>
                </div>
            </div>

            <div className="grid md:grid-cols-12 gap-8">
                {/* CONTROL PANEL */}
                <div className="md:col-span-5 space-y-6">

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">

                        {error && (
                            <div className="bg-red-50 border border-red-200 p-4 rounded-xl mb-6 shadow-sm animate-fadeIn">
                                <div className="flex items-center gap-2 text-red-600 font-bold mb-2 text-sm uppercase tracking-wide">
                                    <AlertTriangle size={18} />
                                    <span>Error</span>
                                </div>
                                <div className="bg-white rounded-lg p-3 overflow-x-auto border border-red-100">
                                    <code className="text-xs text-red-600 font-mono whitespace-pre-wrap break-all leading-relaxed">
                                        {error}
                                    </code>
                                </div>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-600 mb-2">Prompt Description</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g. A futuristic glossy running shoe floating in neon space with gold sparkles..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-800 h-32 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                            />
                        </div>

                        {/* Reference Image Upload */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-600 mb-2">Reference Image (Optional)</label>
                            <p className="text-xs text-slate-400 mb-2">Upload an image for style or content reference.</p>

                            {referenceImage ? (
                                <div className="relative">
                                    <img src={referenceImage} alt="Reference" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                                    <button
                                        onClick={clearReferenceImage}
                                        className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full py-6 border-2 border-dashed border-slate-300 rounded-lg text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-all flex flex-col items-center gap-2"
                                >
                                    <Upload size={24} />
                                    <span className="text-sm">Click to upload image</span>
                                </button>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                        </div>

                        {/* Model - Fixed to Nano Banana Pro */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-600 mb-2">Model</label>
                            <div className="py-2 px-3 rounded-lg border text-sm font-bold bg-indigo-600 text-white border-indigo-600 shadow-md text-center">
                                Nano Banana Pro
                            </div>
                        </div>

                        {/* Aspect Ratio & Style */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">Aspect Ratio</label>
                                <div className="grid grid-cols-3 gap-1">
                                    {['1:1', '16:9', '9:16'].map((ar) => (
                                        <button
                                            key={ar}
                                            onClick={() => setAspectRatio(ar as any)}
                                            className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all ${aspectRatio === ar ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            {ar}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">Style</label>
                                <select
                                    value={style}
                                    onChange={(e) => setStyle(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                >
                                    {styles.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={loading || !prompt}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-lg font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <Sparkles className="w-5 h-5" />}
                            <span>Generate Poster</span>
                        </button>
                    </div>

                    {/* IMAGE HISTORY */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-600">Image History</h3>
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">⏰ Images stored for 7 days</span>
                        </div>

                        {historyLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="animate-spin text-indigo-600" size={24} />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-sm">
                                <ImageIcon size={32} className="mx-auto mb-2 opacity-30" />
                                <p>No images generated yet.</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-3 gap-2">
                                    {history.map((img) => (
                                        <div key={img.id} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                                            {/* Thumbnail */}
                                            <div className="aspect-square bg-slate-200 relative">
                                                {img.thumbnailUrl ? (
                                                    <img src={img.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                                                        <ImageIcon size={20} className="text-slate-400" />
                                                    </div>
                                                )}

                                                {/* Status Badge */}
                                                {img.status === 1 && (
                                                    <div className="absolute top-1 left-1 bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                                        Processing
                                                    </div>
                                                )}
                                                {img.status === 2 && (
                                                    <div className="absolute top-1 left-1 bg-green-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                                                        Ready
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons - Always visible */}
                                            {img.status === 2 && (
                                                <div className="absolute bottom-0 left-0 right-0 p-1 bg-white/90 backdrop-blur-sm flex justify-center gap-1">
                                                    <button
                                                        onClick={() => setViewingImage(img)}
                                                        className="p-1 bg-indigo-100 rounded hover:bg-indigo-200 transition-colors"
                                                        title="View"
                                                    >
                                                        <Maximize2 size={10} className="text-indigo-600" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownload(img.imageUrl || img.thumbnailUrl || '')}
                                                        className="p-1 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                                                        title="Download"
                                                    >
                                                        <Download size={10} className="text-slate-600" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleAddToRapid(img)}
                                                        disabled={addingToRapid.has(img.id)}
                                                        className="p-1 bg-blue-100 rounded hover:bg-blue-200 transition-colors disabled:opacity-50"
                                                        title="Add to Rapid Campaign"
                                                    >
                                                        {addingToRapid.has(img.id) ? (
                                                            <Loader2 size={10} className="text-blue-600 animate-spin" />
                                                        ) : (
                                                            <Rocket size={10} className="text-blue-600" />
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Pagination */}
                                {historyTotalPages > 1 && (
                                    <div className="flex items-center justify-center gap-2 mt-4">
                                        <button
                                            onClick={() => fetchImageHistory(historyPage - 1)}
                                            disabled={historyPage <= 1}
                                            className="p-1 rounded border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span className="text-xs text-slate-500">{historyPage} / {historyTotalPages}</span>
                                        <button
                                            onClick={() => fetchImageHistory(historyPage + 1)}
                                            disabled={historyPage >= historyTotalPages}
                                            className="p-1 rounded border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg text-xs text-indigo-800">
                        <strong>Tip:</strong> Be descriptive about lighting, style (e.g., "cinematic lighting", "vector art"), and colors for best results.
                    </div>
                </div>

                {/* PREVIEW AREA */}
                <div className="md:col-span-7">
                    <div className={`w-full h-full min-h-[400px] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center p-4 relative overflow-hidden ${loading ? 'animate-pulse' : ''}`}>

                        {generatedImage ? (
                            <>
                                <img src={generatedImage} alt="Generated Poster" className="w-full h-full object-contain rounded-lg shadow-lg" />
                                <div className="absolute top-4 right-4">
                                    <button
                                        onClick={() => handleDownload()}
                                        className="bg-white/90 backdrop-blur-md text-slate-800 p-3 rounded-lg transition-all border border-slate-200 shadow-lg hover:scale-105"
                                        title="Download Image"
                                    >
                                        <Download size={20} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-slate-400">
                                {loading ? (
                                    <div className="flex flex-col items-center">
                                        <Loader2 size={48} className="animate-spin text-indigo-600 mb-4" />
                                        <p className="text-slate-600 font-bold">Creating Masterpiece...</p>
                                        <p className="text-xs mt-2 text-slate-400">This may take a few seconds...</p>
                                    </div>
                                ) : (
                                    <>
                                        <ImageIcon size={64} className="mx-auto mb-4 opacity-30" />
                                        <p>Your generated poster will appear here.</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Image Lightbox Modal */}
            {viewingImage && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
                    <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={viewingImage.imageUrl || viewingImage.thumbnailUrl || ''}
                            alt=""
                            className="w-full rounded-lg shadow-2xl"
                        />
                        <button
                            onClick={() => setViewingImage(null)}
                            className="absolute -top-12 right-0 text-white hover:text-indigo-400 transition-colors"
                        >
                            <X size={32} />
                        </button>
                        <div className="mt-3 text-center">
                            <button
                                onClick={() => handleDownload(viewingImage.imageUrl || viewingImage.thumbnailUrl || '')}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 mx-auto"
                            >
                                <Download size={16} /> Download Image
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EpicPoster;
