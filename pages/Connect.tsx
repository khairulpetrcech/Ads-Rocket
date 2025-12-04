import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, CheckCircle } from 'lucide-react';
import { useSettings } from '../App'; // We will define context later in App

const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const { updateSettings } = useSettings();
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    setLoading(true);
    // Simulate API delay
    setTimeout(() => {
      updateSettings({ isConnected: true, businessName: "Roket Growth Agency" });
      setLoading(false);
      navigate('/');
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#1e293b] rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30">
            <Rocket className="text-white w-8 h-8" />
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-2">Ads Roket</h1>
          <p className="text-slate-400 mb-8">
            Connect your Meta Ads Manager to unlock AI-powered insights and ROAS optimization.
          </p>

          <div className="space-y-4">
            <button
              onClick={handleConnect}
              disabled={loading}
              className={`w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-3 transition-all duration-300 ${
                loading
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-[#1877F2] hover:bg-[#166fe5] text-white shadow-lg shadow-blue-900/50 hover:scale-[1.02]'
              }`}
            >
              {loading ? (
                <span>Connecting...</span>
              ) : (
                <>
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Connect with Facebook
                </>
              )}
            </button>
            
            <div className="text-xs text-slate-500 mt-6 flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2">
                 <CheckCircle size={14} className="text-green-500"/> Secure Token Exchange
              </div>
              <div className="flex items-center justify-center gap-2">
                 <CheckCircle size={14} className="text-green-500"/> Read-Only Analytics Access
              </div>
            </div>
          </div>
        </div>
        <div className="bg-slate-800/50 p-4 border-t border-slate-700 text-center">
            <p className="text-xs text-slate-400">By connecting, you agree to our Terms of Service.</p>
        </div>
      </div>
    </div>
  );
};

export default ConnectPage;