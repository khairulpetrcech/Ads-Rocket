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
            let contextAds: any[] = [];
            if (settings.isConnected && settings.adAccountId && settings.fbAccessToken) {
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
                className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-200 flex items-center justify-center transition-transform hover:scale-105 z-50"
            >
                <MessageSquare size={24} />
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 flex flex-col transition-all duration-300 ${isMinimized ? 'w-72 h-14' : 'w-80 h-96'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50/50 rounded-t-xl cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <Bot size={18} className="text-indigo-600" />
                    <span>Ads Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className="text-slate-400 hover:text-slate-600">
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} className="text-slate-400 hover:text-red-500">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Body */}
            {!isMinimized && (
                <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-white">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-700 rounded-bl-none'}`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-100 rounded-2xl rounded-bl-none p-2 px-3">
                                    <Loader2 size={16} className="animate-spin text-slate-400" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-slate-100 bg-white rounded-b-xl">
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Ask about ads..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
                            />
                            <button 
                                onClick={handleSend}
                                disabled={loading}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg disabled:opacity-50 transition-colors"
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