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
    setTimeout(() => {
        login();
        navigate('/connect'); 
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 z-10 text-center">
            <div className="w-20 h-20 rounded-2xl bg-indigo-600 mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-200">
                <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Ads Rocket" className="w-full h-full object-cover rounded-2xl opacity-90" />
            </div>

            <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Ads Rocket</h1>
            <p className="text-slate-500 mb-8 font-medium">
                Scaling Ads Jadi Lebih Cepat.
            </p>

            <button
                onClick={handleStart}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center gap-3 shadow-lg shadow-indigo-200"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
                <span>Mula Sekarang</span>
            </button>

            <p className="mt-8 text-xs text-slate-400 font-medium">
                AI-Powered Meta Ads Manager
            </p>
        </div>
    </div>
  );
};

export default LoginPage;