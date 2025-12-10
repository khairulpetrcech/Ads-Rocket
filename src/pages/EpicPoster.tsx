import React, { useState } from 'react';
import { useSettings } from '../App';
import { generateImage } from '../services/aiService';
import { Wand2, Download, Image as ImageIcon, Loader2, AlertTriangle, Sparkles, Terminal } from 'lucide-react';

const EpicPoster: React.FC = () => {
    const { settings, reselectApiKey } = useSettings();
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16">("1:1");
    const [loading, setLoading] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        if (!prompt.trim()) return setError("Please enter a prompt description.");
        // We rely on system key for image generation now
        
        setLoading(true);
        setError('');
        setGeneratedImage(null);

        try {
            // "Nano Banana Pro" logic via aiService
            // Pass undefined for userApiKey to force system key usage
            const imageUrl = await generateImage(prompt, undefined, aspectRatio);
            setGeneratedImage(imageUrl);
        } catch (e: any) {
            console.error("Gen Error", e);
            let msg = e.message || "An unknown error occurred.";
            const msgLower = msg.toLowerCase();
            
            // Check for API Key validity issues and trigger reselection
            if (msgLower.includes("api key not valid") || msgLower.includes("api_key_invalid") || msgLower.includes("requested entity was not found")) {
                await reselectApiKey();
                setError("API Key issue detected. Please re-select your key and try again.");
                setLoading(false);
                return;
            }

            // Friendly error mapping
            if (msg.includes("Receiving end does not exist") || msg.includes("Could not establish connection")) {
                msg = "Connection Error: The browser could not communicate with the AI service. Please check your internet connection or disable any interfering extensions/VPNs.";
            } else if (msg.includes("400")) {
                msg = "Invalid Request: Check your Prompt or ensure the API Key is valid. (Error 400)";
            }

            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!generatedImage) return;
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `EpicPoster_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="max-w-5xl mx-auto pb-20">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-600 rounded-lg">
                    <Sparkles className="text-white" size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">Epic Poster</h1>
                    <p className="text-xs text-indigo-400 font-medium">Powered by Nano Banana Pro</p>
                </div>
            </div>

            <div className="grid md:grid-cols-12 gap-8">
                {/* CONTROL PANEL */}
                <div className="md:col-span-5 space-y-6">
                    <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700 shadow-sm">
                        
                        {error && (
                            <div className="bg-red-900/20 border border-red-800 p-4 rounded-xl mb-6 shadow-inner animate-fadeIn">
                                <div className="flex items-center gap-2 text-red-400 font-bold mb-2 text-sm uppercase tracking-wide">
                                    <AlertTriangle size={18} />
                                    <span>Error</span>
                                </div>
                                <div className="bg-black/30 rounded-lg p-3 overflow-x-auto border border-red-900/30">
                                    <code className="text-xs text-red-200 font-mono whitespace-pre-wrap break-all leading-relaxed">
                                        {error}
                                    </code>
                                </div>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Prompt Description</label>
                            <textarea 
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g. A futuristic glossy running shoe floating in neon space with gold sparkles..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white h-32 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Aspect Ratio</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button 
                                    onClick={() => setAspectRatio("1:1")}
                                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${aspectRatio === "1:1" ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                                >
                                    Square (1:1)
                                </button>
                                <button 
                                    onClick={() => setAspectRatio("9:16")}
                                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${aspectRatio === "9:16" ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                                >
                                    Story (9:16)
                                </button>
                                <button 
                                    onClick={() => setAspectRatio("16:9")}
                                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${aspectRatio === "16:9" ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                                >
                                    Landscape (16:9)
                                </button>
                            </div>
                        </div>

                        <button 
                            onClick={handleGenerate}
                            disabled={loading || !prompt}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-lg font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <Wand2 className="w-5 h-5" />}
                            <span>Generate Poster</span>
                        </button>
                    </div>

                    <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-lg text-xs text-indigo-300">
                        <strong>Tip:</strong> Be descriptive about lighting, style (e.g., "cinematic lighting", "vector art"), and colors for best results.
                    </div>
                </div>

                {/* PREVIEW AREA */}
                <div className="md:col-span-7">
                    <div className={`w-full h-full min-h-[400px] bg-[#1e293b] rounded-xl border border-slate-700 flex flex-col items-center justify-center p-4 relative overflow-hidden ${loading ? 'animate-pulse' : ''}`}>
                        
                        {generatedImage ? (
                            <>
                                <img src={generatedImage} alt="Generated Poster" className="w-full h-full object-contain rounded-lg shadow-2xl" />
                                <div className="absolute top-4 right-4">
                                    <button 
                                        onClick={handleDownload}
                                        className="bg-black/50 hover:bg-black/70 backdrop-blur-md text-white p-3 rounded-lg transition-all border border-white/10"
                                        title="Download Image"
                                    >
                                        <Download size={20} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-slate-500">
                                {loading ? (
                                    <div className="flex flex-col items-center">
                                        <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
                                        <p className="text-slate-300 font-medium">Creating Masterpiece...</p>
                                        <p className="text-xs mt-2">Connecting to Nano Banana Pro...</p>
                                    </div>
                                ) : (
                                    <>
                                        <ImageIcon size={64} className="mx-auto mb-4 opacity-50" />
                                        <p>Your generated poster will appear here.</p>
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

export default EpicPoster;