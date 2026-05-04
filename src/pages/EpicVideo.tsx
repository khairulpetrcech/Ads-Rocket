import React, { useState, useRef, useEffect } from 'react';
import { useSettings } from '../App';
import { useToast } from '../contexts/ToastContext';
import { Video, Download, Loader2, AlertTriangle, Sparkles, Upload, Play, X, ChevronLeft, ChevronRight, Clock, Rocket } from 'lucide-react';

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

interface VideoAnalysisResult {
    url: string;
    videoUrl?: string;
    downloadUrl?: string;
    analysis?: string;
    error?: string;
    success: boolean;
    fileName?: string;
    apifyRunId?: string;
    costUsd?: number;
}

// No localStorage needed — history is server-side via Supabase

const EpicVideo: React.FC = () => {
    const { settings, globalProcess, setGlobalProcess } = useSettings();
    const { showToast } = useToast();
    const [prompt, setPrompt] = useState('');
    const [seconds, setSeconds] = useState<4 | 8 | 12 | 16 | 20>(8);
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
    const [playingVideo, setPlayingVideo] = useState<VideoHistoryItem | null>(null);
    const [addingToRapid, setAddingToRapid] = useState<Set<number>>(new Set());

    // --- VIDEO ANALYSIS TAB STATE ---
    const [activeTab, setActiveTab] = useState<'generate' | 'analyze'>('generate');
    const [analysisUrl, setAnalysisUrl] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResults, setAnalysisResults] = useState<VideoAnalysisResult[]>([]);
    const [analysisError, setAnalysisError] = useState('');
    const [analysisRemaining, setAnalysisRemaining] = useState<number | null>(null);

    // Handler to add media to Rapid Campaign
    const handleAddToRapid = async (video: VideoHistoryItem) => {
        if (!video.videoUrl && !video.thumbnailUrl) {
            showToast('No video URL available', 'error');
            return;
        }

        const mediaUrl = video.videoUrl || video.thumbnailUrl || '';

        setAddingToRapid(prev => new Set([...prev, video.id]));

        try {
            const response = await fetch('/api/media-api?action=import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl,
                    mediaType: 'video',
                    name: `Epic Video - ${video.prompt?.slice(0, 30) || video.uuid}`,
                    sourceUuid: video.uuid,
                    source: 'epic_video'
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
                next.delete(video.id);
                return next;
            });
        }
    };

    useEffect(() => {
        fetchVideoHistory(1);
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    const fetchVideoHistory = async (page: number) => {
        setHistoryLoading(true);
        try {
            const response = await fetch(`/api/media-api?action=video-history&page=${page}`);
            const data = await response.json();
            if (data.success) {
                setHistory(data.videos || []);
                setHistoryPage(data.page);
                setHistoryTotalPages(data.totalPages || 1);
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
            const response = await fetch(`/api/media-api?action=video-status&uuid=${uuid}`);
            const data = await response.json();

            if (data.done && data.status === 'completed' && data.url) {
                setGeneratedVideoUrl(data.url);
                setLoading(false);
                setStatusMessage('Video ready!');
                setProgress(100);
                // Update global progress
                setGlobalProcess({
                    active: true,
                    name: 'Video Ready!',
                    message: 'Your video has been generated successfully.',
                    type: 'VIDEO_GENERATION',
                    progress: 100,
                    uuid
                });
                // Show toast notification
                showToast('Video generated successfully! 🎬', 'success');
                if (pollingRef.current) clearInterval(pollingRef.current);
                fetchVideoHistory(1);
            } else if (data.done && data.status === 'failed') {
                setError(data.error || 'Video generation failed. Please try again.');
                setLoading(false);
                setGlobalProcess({
                    active: true,
                    name: 'Generation Failed',
                    message: data.error || 'Video generation failed.',
                    type: 'VIDEO_GENERATION',
                    progress: 0,
                    uuid
                });
                showToast('Video generation failed. Please try again.', 'error');
                if (pollingRef.current) clearInterval(pollingRef.current);
            } else {
                const newProgress = data.progress || Math.min(progress + 10, 90);
                setProgress(newProgress);
                setStatusMessage(`Processing video... ${newProgress}%`);
                // Update global progress
                setGlobalProcess({
                    active: true,
                    name: 'Generating Video...',
                    message: `Processing... ${newProgress}%`,
                    type: 'VIDEO_GENERATION',
                    progress: newProgress,
                    uuid
                });
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
                model: 'sora-2-official',
                duration: seconds,
                aspectRatio
            };

            if (referenceImage) {
                requestBody.imageBase64 = referenceImage;
            }

            const response = await fetch('/api/generate-api?action=video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to start video generation');
            }

            // Task tracked in Supabase via generate-api.ts

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

    const parseBulkUrls = (value: string) => {
        const matches = value.match(/https?:\/\/[^\s,]+/g) || [];
        return Array.from(new Set(matches.map((item) => item.trim().replace(/[)\].,]+$/, ''))));
    };

    // Returns true if the URL looks like a plain post (not a video/reel/watch link)
    const isPlainPostUrl = (url: string): boolean => {
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.includes('facebook.com') && !parsed.hostname.includes('fb.watch')) return false;
            const hasVideoPath = /\/(reel|videos|video\.php|watch)/.test(parsed.pathname);
            const hasVideoParam = parsed.searchParams.has('v');
            const isPostUrl = /\/posts\//.test(parsed.pathname);
            return isPostUrl && !hasVideoPath && !hasVideoParam;
        } catch {
            return false;
        }
    };

    const handleAnalyzeVideo = async () => {
        const urls = parseBulkUrls(analysisUrl);
        if (!urls.length) return setAnalysisError('Sila masukkan link video Facebook.');
        if (urls.length > 1) return setAnalysisError('Download Facebook video buat masa ini satu link sekali.');

        // Early client-side check: warn if it's a plain /posts/ URL with no video indicators
        if (isPlainPostUrl(urls[0])) {
            setAnalysisError(
                'Link "/posts/" mungkin tidak disokong. Sila guna URL video terus:\n' +
                '\u2022 Reel: facebook.com/reel/{id}\n' +
                '\u2022 Watch: facebook.com/watch/?v={id}\n' +
                '\u2022 Video: facebook.com/{page}/videos/{id}'
            );
            // Allow the request to proceed anyway — the post might embed a video
        }

        setIsAnalyzing(true);
        setAnalysisError('');
        setAnalysisResults([]);
        setAnalysisRemaining(null);

        try {
            const response = await fetch('/api/facebook-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: urls[0],
                    userId: settings.userId,
                    adAccountId: settings.adAccountId
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.results?.length) {
                    setAnalysisResults(data.results);
                    setAnalysisRemaining(typeof data.remaining === 'number' ? data.remaining : null);
                }
                throw new Error(data.error || 'Gagal menganalisis video');
            }

            const results: VideoAnalysisResult[] = [{
                url: urls[0],
                videoUrl: data.videoUrl,
                downloadUrl: data.videoUrl,
                fileName: data.fileName,
                apifyRunId: data.apifyRunId,
                costUsd: data.costUsd,
                success: true
            }];
            setAnalysisResults(results);
            setAnalysisRemaining(typeof data.remaining === 'number' ? data.remaining : null);

            await triggerVideoDownload(data.videoUrl, data.fileName || 'facebook-video.mp4');
            showToast('Video siap. Download dibuka automatik.', 'success');
        } catch (e: any) {
            console.error("Analysis Error", e);
            setAnalysisError(e.message || "Ralat tidak dijangka berlaku semasa download video.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const triggerVideoDownload = async (url: string, fileName: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
        } catch {
            window.open(url, '_blank');
        }
    };

    const handleDownload = async (url?: string) => {
        const videoUrl = url || generatedVideoUrl;
        if (!videoUrl) return;

        // Use window.open for external URLs to avoid CORS issues
        // The browser will handle the download
        window.open(videoUrl, '_blank');
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
                    <p className="text-xs text-purple-600 font-bold uppercase tracking-wide">Powered by Sora 2 Official via Poyo AI</p>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-4 mb-8 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('generate')}
                    className={`pb-3 px-1 text-sm font-bold transition-all relative ${activeTab === 'generate' ? 'text-purple-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Generate Video
                    {activeTab === 'generate' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-600 rounded-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('analyze')}
                    className={`pb-3 px-1 text-sm font-bold transition-all relative ${activeTab === 'analyze' ? 'text-purple-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Download Facebook
                    {activeTab === 'analyze' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-600 rounded-full" />}
                </button>
            </div>

            {activeTab === 'generate' ? (
                <div className="grid md:grid-cols-12 gap-8 animate-fadeIn">
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
                                        Sora 2 Official
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
                                    <div className="grid grid-cols-5 gap-1">
                                        {([4, 8, 12, 16, 20] as const).map((dur) => (
                                            <button
                                                key={dur}
                                                onClick={() => setSeconds(dur)}
                                                className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-0.5 ${seconds === dur ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                            >
                                                <Clock size={10} /> {dur}s
                                            </button>
                                        ))}
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
                                            <div key={video.id} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                                                {/* Thumbnail */}
                                                <div className="aspect-video bg-slate-200 relative">
                                                    {video.thumbnailUrl ? (
                                                        <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                                                            <Video size={24} className="text-slate-400" />
                                                        </div>
                                                    )}

                                                    {/* Status Badge */}
                                                    {video.status === 1 && (
                                                        <div className="absolute top-1 left-1 bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                                            Processing...
                                                        </div>
                                                    )}
                                                    {video.status === 3 && (
                                                        <div className="absolute top-1 left-1 bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                                                            Failed
                                                        </div>
                                                    )}
                                                    {video.status === 2 && (
                                                        <div className="absolute top-1 left-1 bg-green-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                                                            Ready
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Action Buttons - Always visible */}
                                                <div className="p-2 flex items-center justify-between bg-white">
                                                    <p className="text-[10px] text-slate-500 truncate flex-1 mr-2">{video.prompt}</p>
                                                    <div className="flex gap-1">
                                                        {video.status === 2 && (
                                                            <>
                                                                <button
                                                                    onClick={() => setPlayingVideo(video)}
                                                                    className="p-1.5 bg-purple-100 rounded-md hover:bg-purple-200 transition-colors"
                                                                    title="Play"
                                                                >
                                                                    <Play size={12} className="text-purple-600 fill-purple-600" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDownload(video.videoUrl || video.thumbnailUrl || '')}
                                                                    className="p-1.5 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
                                                                    title="Download"
                                                                >
                                                                    <Download size={12} className="text-slate-600" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleAddToRapid(video)}
                                                                    disabled={addingToRapid.has(video.id)}
                                                                    className="p-1.5 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors disabled:opacity-50"
                                                                    title="Add to Rapid Campaign"
                                                                >
                                                                    {addingToRapid.has(video.id) ? (
                                                                        <Loader2 size={12} className="text-blue-600 animate-spin" />
                                                                    ) : (
                                                                        <Rocket size={12} className="text-blue-600" />
                                                                    )}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
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
            ) : (
                /* ANALISA VIDEO TAB */
                <div className="animate-fadeIn max-w-4xl mx-auto">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-slate-800 mb-2">Download Video Facebook</h2>
                            <p className="text-sm text-slate-500">Paste link Reel, Watch, atau video Facebook. Sistem akan download MP4 guna Apify.</p>
                        </div>

                        {analysisError && (
                            <div className="bg-red-50 border border-red-200 p-4 rounded-xl mb-6 flex items-start gap-3">
                                <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} />
                                <p className="text-sm text-red-600 font-medium whitespace-pre-line">{analysisError}</p>
                            </div>
                        )}

                        <div className="flex flex-col md:flex-row gap-3 mb-8">
                            <textarea
                                value={analysisUrl}
                                onChange={(e) => setAnalysisUrl(e.target.value)}
                                placeholder={'https://www.facebook.com/reel/966753982370315\nhttps://www.facebook.com/watch/?v=966753982370315'}
                                className="flex-1 min-h-[120px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-y"
                                disabled={isAnalyzing}
                            />
                            <button
                                onClick={handleAnalyzeVideo}
                                disabled={isAnalyzing || !analysisUrl}
                                className="md:self-start bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-purple-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                            >
                                {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                                <span>{isAnalyzing ? 'Downloading...' : 'Download'}</span>
                            </button>
                        </div>

                        {isAnalyzing && (
                            <div className="py-12 flex flex-col items-center justify-center text-center">
                                <div className="relative w-20 h-20 mb-6">
                                    <div className="absolute inset-0 border-4 border-purple-100 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-purple-600 rounded-full border-t-transparent animate-spin"></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Video className="text-purple-600" size={32} />
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Download Sedang Berjalan</h3>
                                <p className="text-slate-500 max-w-sm">Sistem sedang menjalankan Apify, simpan MP4, dan sediakan fail download. Sila tunggu sebentar...</p>
                            </div>
                        )}

                        {analysisResults.length > 0 && !isAnalyzing && (
                            <div className="animate-slideUp space-y-6">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="p-2 bg-green-100 rounded-lg">
                                        <Rocket className="text-green-600" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">Video Siap Download</h3>
                                        {analysisRemaining !== null && (
                                            <p className="text-xs text-slate-500">Baki limit hari ini: {analysisRemaining}/20</p>
                                        )}
                                    </div>
                                </div>

                                {analysisResults.map((item, index) => (
                                    <div key={`${item.url}-${index}`} className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                                        <div className="flex items-start justify-between gap-4 mb-4">
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-400 uppercase">Video {index + 1}</p>
                                                <p className="text-xs text-slate-500 truncate">{item.url}</p>
                                            </div>
                                            {(item.downloadUrl || item.videoUrl) && (
                                                <button
                                                    onClick={() => triggerVideoDownload(item.downloadUrl || item.videoUrl || '', item.fileName || 'facebook-video.mp4')}
                                                    className="shrink-0 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
                                                >
                                                    <Download size={14} />
                                                    Download
                                                </button>
                                            )}
                                        </div>

                                        {item.success && item.videoUrl ? (
                                            <div className="space-y-4">
                                                <video
                                                    src={item.videoUrl}
                                                    controls
                                                    className="w-full max-h-[520px] rounded-xl bg-black"
                                                />
                                                <div className="text-xs text-slate-500 space-y-1">
                                                    {item.apifyRunId && <p>Apify Run: {item.apifyRunId}</p>}
                                                    {typeof item.costUsd === 'number' && <p>Cost: ${item.costUsd.toFixed(4)}</p>}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-xl p-4">
                                                {item.error || 'Video gagal didownload.'}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                <div className="mt-8 p-4 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Sparkles className="text-purple-600" size={20} />
                                        <p className="text-xs text-purple-800 font-medium">Video disimpan dalam storage app dan download akan dibuka automatik.</p>
                                    </div>
                                    <button
                                        onClick={() => setAnalysisResults([])}
                                        className="text-xs text-purple-600 hover:underline font-bold"
                                    >
                                        Padam Skrin
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Video Playback Modal */}
            {playingVideo && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPlayingVideo(null)}>
                    <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
                        <video
                            src={playingVideo.videoUrl || ''}
                            controls
                            autoPlay
                            className="w-full rounded-lg shadow-2xl"
                        />
                        <button
                            onClick={() => setPlayingVideo(null)}
                            className="absolute -top-12 right-0 text-white hover:text-purple-400 transition-colors"
                        >
                            <X size={32} />
                        </button>
                        <div className="mt-3 text-center">
                            <button
                                onClick={() => handleDownload(playingVideo.videoUrl || '')}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 mx-auto"
                            >
                                <Download size={16} /> Download Video
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EpicVideo;
