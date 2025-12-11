
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../App';
import { Zap, Loader2, LayoutTemplate } from 'lucide-react';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, updateSettings } = useSettings();
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    // Simulate a brief loading for UX
    setTimeout(() => {
        login();
        // The App component will handle redirection based on auth state
        navigate('/connect'); 
    }, 800);
  };

  const handleDemoMode = () => {
    setLoading(true);
    setTimeout(() => {
        // Set up Mock Environment
        updateSettings({
            isConnected: true,
            businessName: 'Rocket Demo Store',
            adAccountId: 'act_demo_123',
            fbAccessToken: 'dummy_token', // Signals app to use Mock Data
            availableAccounts: [
                { id: 'act_demo_123', name: 'Rocket Demo Store', account_id: '1234567890', currency: 'MYR' }
            ]
        });
        login(); // Set authenticated state
        navigate('/'); // Redirect straight to Dashboard
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-50"></div>

        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 z-10 text-center relative">
            
            {/* Clickable Logo for Demo Mode */}
            <div 
                onClick={handleDemoMode}
                className="w-20 h-20 rounded-xl bg-indigo-600 mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-200 cursor-pointer hover:scale-105 transition-transform group relative"
                title="Click to enter Demo Mode"
            >
                <img src="https://i.postimg.cc/pLyD6HKz/adsrocket.jpg" alt="Ads Rocket" className="w-full h-full object-cover rounded-xl opacity-90" />
                <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg z-20 pointer-events-none">
                    Launch Demo
                </div>
            </div>

            <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Ads Rocket</h1>
            <p className="text-slate-500 mb-8 font-medium">
                AI-Powered Meta Ads Manager
            </p>

            <button
                onClick={handleStart}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.01] flex items-center justify-center gap-3 shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
                <span>Mula Sekarang</span>
            </button>
            
            <button 
                onClick={handleDemoMode}
                disabled={loading}
                className="mt-4 w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-sm"
            >
                <LayoutTemplate size={16} className="text-indigo-500" /> Preview Demo Dashboard
            </button>

            <p className="mt-6 text-xs text-slate-400">
                Version 0.91 &bull; Powered by Gemini
            </p>
        </div>
    </div>
  );
};

export default LoginPage;
