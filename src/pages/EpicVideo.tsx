import React, { useState, useRef, useEffect } from 'react';
import { useSettings } from '../App';
import { Video, Download, Loader2, AlertTriangle, Sparkles, Upload, Play, X, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface VideoHistoryItem {
    id: number;
    uuid: string;
    prompt: string;
    model: string;
    status: number; // 1=processing, 2=completed, 3=failed
    thumbnailUrl: string | null;
    videoUrl: string | null;
    createdAt: string;
    expiresAt: string;
}

const EpicVideo: React.FC = () => {
    const { settings } = useSettings();
    const [prompt, setPrompt] = useState('');
    const [seconds, setSeconds] = useState<10 | 15>(10);
    const [aspectRatio, setAspectRatio] = useState<'portrait' | 'landscape'>('portrait');
    const [loading, setLoading] = useState(false);
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');

    // Image-to-video
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Polling
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Video History
    const [history, setHistory] = useState<VideoHistoryItem[]>([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);

    useEffect(() => {
        fetchVideoHistory(1);
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    const fetchVideoHistory = async (page: number) => {
        setHistoryLoading(true);
        try {
            const response = await fetch(`/api/video-history?page=${page}`);
            const data = await response.json();
            if (data.success) {
                setHistory(data.videos || []);
                setHistoryPage(data.page);
                setHistoryTotalPages(data.totalPages);
            }
        } catch (err) {
            console.error('Failed to fetch video history:', err);
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

    const pollVideoStatus = async (uuid: string) => {
        try {
            const response = await fetch(`/api/video-status?uuid=${uuid}`);
            const data = await response.json();

            if (data.done && data.status === 'completed' && data.url) {
                setGeneratedVideoUrl(data.url);
                setLoading(false);
                setStatusMessage('Video ready!');
                setProgress(100);
                if (pollingRef.current) clearInterval(pollingRef.current);
                fetchVideoHistory(1); // Refresh history
            } else if (data.done && data.status === 'failed') {
                setError(data.error || 'Video generation failed. Please try again.');
                setLoading(false);
                if (pollingRef.current) clearInterval(pollingRef.current);
            } else {
                setProgress(data.progress || Math.min(progress + 10, 90));
                setStatusMessage(`Processing video... ${data.progress || progress}%`);
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) return setError("Please enter a prompt description.");

        setLoading(true);
        setError('');
        setGeneratedVideoUrl(null);
        setProgress(0);
        setStatusMessage('Starting video generation...');

        try {
            const requestBody: any = {
                prompt,
                model: 'sora-2', // Fixed to sora-2 only
                duration: seconds,
                resolution: 'small',
                aspectRatio
            };

            if (referenceImage) {
                requestBody.imageBase64 = referenceImage;
            }

            const response = await fetch('/api/generate-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to start video generation');
            }

            setStatusMessage('Video generation started. Processing...');
            setProgress(10);

            pollingRef.current = setInterval(() => {
                pollVideoStatus(data.uuid);
            }, 5000);

        } catch (e: any) {
            console.error("Gen Error", e);
            setError(e.message || "An unknown error occurred.");
            setLoading(false);
        }
    };

    const handleDownload = async (url?: string) => {
        const videoUrl = url || generatedVideoUrl;
        if (!videoUrl) return;

        try {
            const response = await fetch(videoUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `EpicVideo_${Date.now()}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error('Download error:', err);
        }
    };

    const clearReferenceImage = () => {
        setReferenceImage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="max-w-5xl mx-auto pb-20">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg shadow-md shadow-purple-200">
                    <Video className="text-white" size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Epic Video</h1>
                    <p className="text-xs text-purple-600 font-bold uppercase tracking-wide">Powered by Sora 2 via GeminiGen.ai</p>
                </div>
            </div>

            <div className="grid md:grid-cols-12 gap-8">
                {/* CONTROL PANEL */}
                <div className="md:col-span-5 space-y-6">

                    {/* PROMPT */}
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
                            <label className="block text-sm font-bold text-slate-600 mb-2">Video Prompt</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g. A product showcase of a premium watch, slowly rotating on a marble surface with golden lighting, cinematic feel..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-800 h-32 outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
                            />
                        </div>

                        {/* Reference Image Upload */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-600 mb-2">Reference Image (Optional)</label>
                            <p className="text-xs text-slate-400 mb-2">Upload an image to use as the first frame of your video.</p>

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
                                    className="w-full py-6 border-2 border-dashed border-slate-300 rounded-lg text-slate-400 hover:border-purple-400 hover:text-purple-500 transition-all flex flex-col items-center gap-2"
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

                        {/* Model Selection - Only Sora 2 available */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-600 mb-2">Model</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button className="py-2 px-2 rounded-lg border text-xs font-bold bg-purple-600 text-white border-purple-600 shadow-md">
                                    Sora 2
                                </button>
                                <button disabled className="py-2 px-2 rounded-lg border text-xs font-bold bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60">
                                    Pro (Soon)
                                </button>
                                <button disabled className="py-2 px-2 rounded-lg border text-xs font-bold bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60">
                                    HD (Soon)
                                </button>
                            </div>
                        </div>

                        {/* Duration & Aspect Ratio */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">Duration</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setSeconds(10)}
                                        className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1 ${seconds === 10 ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <Clock size={12} /> 10s
                                    </button>
                                    <button
                                        onClick={() => setSeconds(15)}
                                        className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1 ${seconds === 15 ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <Clock size={12} /> 15s
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">Aspect Ratio</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setAspectRatio("portrait")}
                                        className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all ${aspectRatio === "portrait" ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        9:16
                                    </button>
                                    <button
                                        onClick={() => setAspectRatio("landscape")}
                                        className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all ${aspectRatio === "landscape" ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        16:9
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={loading || !prompt}
                            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-lg font-bold py-3.5 rounded-xl shadow-lg shadow-purple-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <Sparkles className="w-5 h-5" />}
                            <span>Generate Video</span>
                        </button>
                    </div>

                    {/* VIDEO HISTORY */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-600">Video History</h3>
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">⏰ Videos stored for 7 days</span>
                        </div>

                        {historyLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="animate-spin text-purple-600" size={24} />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-sm">
                                <Video size={32} className="mx-auto mb-2 opacity-30" />
                                <p>No videos generated yet.</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    {history.map((video) => (
                                        <div key={video.id} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                                            {/* Thumbnail */}
                                            <div className="aspect-video bg-slate-200 relative">
                                                {video.thumbnailUrl ? (
                                                    <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Video size={24} className="text-slate-400" />
                                                    </div>
                                                )}

                                                {/* Status Badge */}
                                                {video.status === 1 && (
                                                    <div className="absolute top-1 left-1 bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                                                        Processing
                                                    </div>
                                                )}
                                                {video.status === 3 && (
                                                    <div className="absolute top-1 left-1 bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                                                        Failed
                                                    </div>
                                                )}

                                                {/* Play/Download Overlay */}
                                                {video.status === 2 && video.videoUrl && (
                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => setPlayingVideoId(playingVideoId === video.id ? null : video.id)}
                                                            className="p-2 bg-white rounded-full shadow-lg hover:scale-110 transition-transform"
                                                            title="Play"
                                                        >
                                                            <Play size={16} className="text-purple-600 fill-purple-600" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDownload(video.videoUrl!)}
                                                            className="p-2 bg-white rounded-full shadow-lg hover:scale-110 transition-transform"
                                                            title="Download"
                                                        >
                                                            <Download size={16} className="text-slate-600" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Playing Video */}
                                            {playingVideoId === video.id && video.videoUrl && (
                                                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                                                    <div className="relative max-w-3xl w-full">
                                                        <video src={video.videoUrl} controls autoPlay className="w-full rounded-lg" />
                                                        <button
                                                            onClick={() => setPlayingVideoId(null)}
                                                            className="absolute -top-10 right-0 text-white hover:text-purple-400"
                                                        >
                                                            <X size={28} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Prompt Preview */}
                                            <div className="p-2">
                                                <p className="text-[10px] text-slate-500 truncate">{video.prompt}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Pagination */}
                                {historyTotalPages > 1 && (
                                    <div className="flex items-center justify-center gap-2 mt-4">
                                        <button
                                            onClick={() => fetchVideoHistory(historyPage - 1)}
                                            disabled={historyPage <= 1}
                                            className="p-1 rounded border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span className="text-xs text-slate-500">{historyPage} / {historyTotalPages}</span>
                                        <button
                                            onClick={() => fetchVideoHistory(historyPage + 1)}
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

                    <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg text-xs text-purple-800">
                        <strong>Tip:</strong> Describe camera movements, lighting, atmosphere, and subject actions for cinematic results.
                    </div>
                </div>

                {/* PREVIEW AREA */}
                <div className="md:col-span-7">
                    <div className={`w-full h-full min-h-[400px] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center p-4 relative overflow-hidden`}>

                        {generatedVideoUrl ? (
                            <>
                                <video
                                    src={generatedVideoUrl}
                                    controls
                                    autoPlay
                                    loop
                                    className="w-full h-full object-contain rounded-lg shadow-lg"
                                />
                                <div className="absolute top-4 right-4">
                                    <button
                                        onClick={() => handleDownload()}
                                        className="bg-white/90 backdrop-blur-md text-slate-800 p-3 rounded-lg transition-all border border-slate-200 shadow-lg hover:scale-105"
                                        title="Download Video"
                                    >
                                        <Download size={20} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-slate-400">
                                {loading ? (
                                    <div className="flex flex-col items-center">
                                        <Loader2 size={48} className="animate-spin text-purple-600 mb-4" />
                                        <p className="text-slate-600 font-bold">{statusMessage}</p>
                                        <div className="w-48 h-2 bg-slate-200 rounded-full mt-4 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-500"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <p className="text-xs mt-2 text-slate-400">This may take 1-3 minutes...</p>
                                    </div>
                                ) : (
                                    <>
                                        <Video size={64} className="mx-auto mb-4 opacity-30" />
                                        <p>Your generated video will appear here.</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EpicVideo;
