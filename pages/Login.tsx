import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../App';
import { Zap, Loader2 } from 'lucide-react';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useSettings();
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

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Animation */}
        <div className="absolute inset-0 z-0">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#0f172a] to-[#0f172a]"></div>
            <div className="stars opacity-50"></div>
        </div>

        <div className="max-w-md w-full bg-[#1e293b]/80 backdrop-blur-xl rounded-2xl border border-slate-700 shadow-2xl p-8 z-10 text-center">
            <div className="w-20 h-20 rounded-xl bg-white mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <img src="https://i.postimg.cc/pLyD6HKz/adsrocket.jpg" alt="Ads Rocket" className="w-full h-full object-cover rounded-xl" />
            </div>

            <h1 className="text-3xl font-black text-white mb-2">Ads Rocket</h1>
            <p className="text-indigo-200 mb-8 text-gold-glossy font-medium">
                Scaling Ads Jadi Lebih Cepat.
            </p>

            <button
                onClick={handleStart}
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center gap-3 shadow-lg"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
                <span>Mula Sekarang</span>
            </button>

            <p className="mt-6 text-xs text-slate-500">
                AI-Powered Meta Ads Manager
            </p>
        </div>
    </div>
  );
};

export default LoginPage;