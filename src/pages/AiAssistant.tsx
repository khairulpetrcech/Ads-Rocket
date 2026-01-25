import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Loader2, Bot, Sparkles, Trash2, TrendingUp, Image, Zap, RefreshCw } from 'lucide-react';
import { useSettings } from '../App';
import { assistantChatWithContext } from '../services/aiService';
import { getRealCampaigns, getTopAdsForAccount } from '../services/metaService';
import { ChatMessage, AdCampaign, Ad, AssistantContext } from '../types';

const AiAssistant: React.FC = () => {
    const { settings } = useSettings();
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: 'Assalamualaikum! 👋 Saya AI Assistant untuk Meta Ads anda.\n\nAnda boleh tanya saya tentang:\n• Analisis performance ads\n• Creative mana yang perform\n• Cara optimise kempen\n\nApa yang boleh saya bantu?',
            timestamp: new Date()
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [adsContext, setAdsContext] = useState<AssistantContext>({});
    const [loadingContext, setLoadingContext] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Focus input on load
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Load ads context on mount
    useEffect(() => {
        loadAdsContext();
    }, [settings.adAccountId, settings.fbAccessToken]);

    const loadAdsContext = async () => {
        if (!settings.isConnected || !settings.adAccountId || !settings.fbAccessToken || settings.fbAccessToken === 'dummy_token') {
            return;
        }

        setLoadingContext(true);
        try {
            const [campaigns, topAds] = await Promise.all([
                getRealCampaigns(settings.adAccountId, settings.fbAccessToken, 'last_7d'),
                getTopAdsForAccount(settings.adAccountId, settings.fbAccessToken)
            ]);

            setAdsContext({
                campaigns: campaigns.slice(0, 10),
                ads: topAds
            });
        } catch (error) {
            console.error('Failed to load ads context:', error);
        } finally {
            setLoadingContext(false);
        }
    };

    const handleSend = async () => {
        if (!inputText.trim() || loading) return;

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: inputText.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setLoading(true);

        try {
            // Build conversation history for context
            const history = messages
                .filter(m => m.id !== 'welcome')
                .map(m => ({
                    role: m.role === 'user' ? 'user' as const : 'model' as const,
                    text: m.content
                }));

            const reply = await assistantChatWithContext(
                userMessage.content,
                history,
                adsContext
            );

            const assistantMessage: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: reply,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: 'Maaf, berlaku ralat. Sila cuba lagi. 🙏',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const clearChat = () => {
        setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: 'Chat dibersihkan. Apa yang boleh saya bantu? 🚀',
            timestamp: new Date()
        }]);
    };

    const quickPrompts = [
        { icon: TrendingUp, text: "Analisa performance ads 7 hari lepas", color: "blue" },
        { icon: Sparkles, text: "Creative mana yang paling perform?", color: "purple" },
        { icon: Zap, text: "Cadangan untuk optimise kempen", color: "amber" },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
            <div className="max-w-4xl mx-auto p-4 md:p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                            <Bot size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">AI Assistant</h1>
                            <p className="text-sm text-slate-500">Powered by Gemini 3 Flash</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadAdsContext}
                            disabled={loadingContext}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={loadingContext ? 'animate-spin' : ''} />
                            Refresh Data
                        </button>
                        <button
                            onClick={clearChat}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                        >
                            <Trash2 size={14} />
                            Clear
                        </button>
                    </div>
                </div>

                {/* Context Status */}
                <div className="mb-4 flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${settings.isConnected
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${settings.isConnected ? 'bg-green-500' : 'bg-amber-500'}`} />
                        {settings.isConnected ? 'Meta Connected' : 'Meta Not Connected'}
                    </div>
                    {adsContext.campaigns && adsContext.campaigns.length > 0 && (
                        <span className="text-xs text-slate-500">
                            📊 {adsContext.campaigns.length} campaigns loaded
                        </span>
                    )}
                </div>

                {/* Chat Container */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
                    {/* Messages */}
                    <div className="h-[500px] overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-sm'
                                            : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                                        }`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
                                            <Bot size={14} className="text-blue-600" />
                                            <span className="text-xs font-semibold text-blue-600">AI Assistant</span>
                                        </div>
                                    )}
                                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                        {msg.content}
                                    </div>
                                    <div className={`text-[10px] mt-2 ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                                        }`}>
                                        {msg.timestamp.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-100 rounded-2xl rounded-bl-sm p-4">
                                    <div className="flex items-center gap-2">
                                        <Loader2 size={16} className="animate-spin text-blue-600" />
                                        <span className="text-sm text-slate-500">Sedang berfikir...</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Prompts */}
                    {messages.length <= 1 && (
                        <div className="px-6 pb-4">
                            <p className="text-xs text-slate-400 mb-2">Quick Actions:</p>
                            <div className="flex flex-wrap gap-2">
                                {quickPrompts.map((prompt, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setInputText(prompt.text)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-[1.02] ${prompt.color === 'blue' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' :
                                                prompt.color === 'purple' ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' :
                                                    'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                            }`}
                                    >
                                        <prompt.icon size={14} />
                                        {prompt.text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                        <div className="flex gap-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Tanya apa sahaja tentang ads anda..."
                                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                disabled={loading}
                            />
                            <button
                                onClick={handleSend}
                                disabled={loading || !inputText.trim()}
                                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-5 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 flex items-center gap-2"
                            >
                                <Send size={16} />
                                <span className="hidden sm:inline font-medium">Send</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer Note */}
                <p className="text-xs text-slate-400 text-center mt-4">
                    AI Assistant menggunakan data ads real-time untuk memberikan cadangan yang lebih tepat.
                </p>
            </div>
        </div>
    );
};

export default AiAssistant;
