
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Minimize2, Maximize2, Loader2, Bot } from 'lucide-react';
import { useSettings } from '../App';
import { chatWithAi } from '../services/aiService';
import { getTopAdsForAccount } from '../services/metaService';

const Chatbot: React.FC = () => {
    const { settings } = useSettings();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<{role: 'user' | 'bot', text: string}[]>([
        { role: 'bot', text: 'Hi! Ask me about your ads performance.' }
    ]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!inputText.trim() || loading) return;
        
        const userMsg = inputText;
        setInputText('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            // Fetch fresh context
            let contextAds: any[] = [];
            if (settings.isConnected && settings.adAccountId && settings.fbAccessToken) {
                // If dummy token, empty context is fine, service handles simulation
                if (settings.fbAccessToken !== 'dummy_token') {
                    contextAds = await getTopAdsForAccount(settings.adAccountId, settings.fbAccessToken);
                }
            }

            const reply = await chatWithAi(
                userMsg, 
                contextAds, 
                settings.selectedAiProvider, 
                settings.apiKey, 
                settings.selectedModel
            );

            setMessages(prev => [...prev, { role: 'bot', text: reply }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'bot', text: "Sorry, I couldn't process that." }]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-900/40 flex items-center justify-center transition-transform hover:scale-105 z-50"
            >
                <MessageSquare size={24} />
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col transition-all duration-300 ${isMinimized ? 'w-72 h-14' : 'w-80 h-96'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800/50 rounded-t-xl cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="flex items-center gap-2 text-white font-medium">
                    <Bot size={18} className="text-indigo-400" />
                    <span>Ads Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className="text-slate-400 hover:text-white">
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} className="text-slate-400 hover:text-red-400">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Body */}
            {!isMinimized && (
                <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-[#0f172a]/50">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg p-2 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-700 rounded-lg p-2">
                                    <Loader2 size={16} className="animate-spin text-slate-400" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-slate-700 bg-slate-800/30 rounded-b-xl">
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Ask about ads..."
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                            />
                            <button 
                                onClick={handleSend}
                                disabled={loading}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg disabled:opacity-50"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Chatbot;