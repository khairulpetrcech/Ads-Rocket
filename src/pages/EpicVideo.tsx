import React, { useState, useRef, useEffect } from 'react';
import { useSettings } from '../App';
import { Video, Download, Image as ImageIcon, Loader2, AlertTriangle, Sparkles, Upload, Play, X, Clock } from 'lucide-react';

const EpicVideo: React.FC = () => {
    const { settings } = useSettings();
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState<'sora-2' | 'sora-2-pro' | 'sora-2-pro-hd'>('sora-2');
    const [seconds, setSeconds] = useState<10 | 15 | 25>(10);
    const [aspectRatio, setAspectRatio] = useState<'portrait' | 'landscape'>('portrait');
    const [resolution, setResolution] = useState<'small' | 'large'>('small');
    const [loading, setLoading] = useState(false);
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [uuid, setUuid] = useState<string | null>(null);

    // Image-to-video
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Polling
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

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
                model,
                duration: seconds,
                resolution,
                aspectRatio
            };

            // If reference image, add base64
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

            // Start polling for status
            setUuid(data.uuid);
            pollingRef.current = setInterval(() => {
                pollVideoStatus(data.uuid);
            }, 5000);

        } catch (e: any) {
            console.error("Gen Error", e);
            setError(e.message || "An unknown error occurred.");
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!generatedVideoUrl) return;

        try {
            const response = await fetch(generatedVideoUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `EpicVideo_${Date.now()}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
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

                        {/* Model Selection */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-600 mb-2">Model</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setModel('sora-2')}
                                    className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all ${model === 'sora-2' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    Sora 2
                                </button>
                                <button
                                    onClick={() => setModel('sora-2-pro')}
                                    className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all ${model === 'sora-2-pro' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    Sora 2 Pro
                                </button>
                                <button
                                    onClick={() => setModel('sora-2-pro-hd')}
                                    className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all ${model === 'sora-2-pro-hd' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    Sora 2 HD
                                </button>
                            </div>
                        </div>

                        {/* Duration & Resolution */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">Duration</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[10, 15, 25].map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setSeconds(s as 10 | 15 | 25)}
                                            disabled={(model === 'sora-2' && s === 25) || (model.includes('pro') && s === 10)}
                                            className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1 ${seconds === s ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                                        >
                                            {s}s
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">Resolution</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setResolution('small')}
                                        disabled={model === 'sora-2-pro-hd'}
                                        className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all ${resolution === 'small' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 disabled:opacity-50'}`}
                                    >
                                        720p
                                    </button>
                                    <button
                                        onClick={() => setResolution('large')}
                                        disabled={model !== 'sora-2-pro-hd'}
                                        className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all ${resolution === 'large' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 disabled:opacity-50'}`}
                                    >
                                        1080p
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Aspect Ratio */}
                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-600 mb-2">Aspect Ratio</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setAspectRatio("portrait")}
                                    className={`py-2 px-3 rounded-lg border text-sm font-bold transition-all ${aspectRatio === "portrait" ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    9:16 (Portrait)
                                </button>
                                <button
                                    onClick={() => setAspectRatio("landscape")}
                                    className={`py-2 px-3 rounded-lg border text-sm font-bold transition-all ${aspectRatio === "landscape" ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    16:9 (Landscape)
                                </button>
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

                    <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg text-xs text-purple-800">
                        <strong>Tip:</strong> Describe camera movements, lighting, atmosphere, and subject actions for cinematic results.
                    </div>
                </div>

                {/* PREVIEW AREA */}
                <div className="md:col-span-7">
                    <div className={`w-full h-full min-h-[400px] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center p-4 relative overflow-hidden ${loading ? '' : ''}`}>

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
                                        onClick={handleDownload}
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
