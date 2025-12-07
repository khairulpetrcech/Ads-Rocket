import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFacebookLogin = async () => {
    setLoading(true);
    setError('');
    try {
      // Login with Supabase Auth (FB Provider)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
            redirectTo: window.location.origin, // Redirect back to here
        }
      });
      if (error) throw error;
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
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

            {error && (
                <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-lg mb-4 text-sm">
                    {error}
                </div>
            )}

            <button
                onClick={handleFacebookLogin}
                disabled={loading}
                className="w-full bg-[#1877F2] hover:bg-[#1559b3] text-white font-bold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.02] flex items-center justify-center gap-3 shadow-lg"
            >
                {loading ? <Loader2 className="animate-spin" /> : (
                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                )}
                <span>Log Masuk dengan Facebook</span>
            </button>
            
            <p className="mt-6 text-xs text-slate-500">
                By logging in, you agree to our Terms of Service and Privacy Policy.
            </p>
        </div>
    </div>
  );
};

export default LoginPage;