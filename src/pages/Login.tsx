
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../App';
import { useToast } from '../contexts/ToastContext';
import { Zap, Loader2, LayoutTemplate, User, Lock, X } from 'lucide-react';

// Hardcoded credentials
const TESTER_USERNAME = 'admin';
const TESTER_PASSWORD = 'admin12345';

// Admin credentials (for viewing user dashboard)
const ADMIN_USERNAME = 'superadmin';
const ADMIN_PASSWORD = 'rocket@admin2024';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, updateSettings } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showAltLogin, setShowAltLogin] = useState(false);
  const [altCode, setAltCode] = useState('');
  const [altLoading, setAltLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      showToast('Please enter both username and password.', 'error');
      return;
    }

    // Check for admin login
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setLoading(true);
      localStorage.setItem('ar_admin', 'true');
      setTimeout(() => {
        navigate('/admin');
      }, 800);
      return;
    }

    // Check for tester login
    if (username !== TESTER_USERNAME || password !== TESTER_PASSWORD) {
      showToast('Invalid username or password.', 'error');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      login();
      navigate('/connect');
    }, 800);
  };

  const handleDemoMode = () => {
    setLoading(true);
    setTimeout(() => {
      updateSettings({
        isConnected: true,
        businessName: 'Rocket Demo Store',
        adAccountId: 'act_demo_123',
        fbAccessToken: 'dummy_token',
        availableAccounts: [
          { id: 'act_demo_123', name: 'Rocket Demo Store', account_id: '1234567890', currency: 'MYR' }
        ]
      });
      login();
      navigate('/');
    }, 1000);
  };

  const handleAltLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!altCode.trim() || altCode.length !== 5) {
      showToast('Sila masukkan 5 aksara terakhir token.', 'error');
      return;
    }

    setAltLoading(true);
    try {
      const response = await fetch('/api/alt-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: altCode.trim() })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Set settings
        updateSettings({
          isConnected: true,
          fbAccessToken: data.accessToken,
          fbAppId: '861724536220118', // System App ID
          availableAccounts: data.adAccounts,
          userId: data.userData.id,
          businessName: data.adAccounts[0]?.name || 'Alt Account'
        });

        // Set ad account if available
        if (data.adAccounts.length > 0) {
          updateSettings({ adAccountId: data.adAccounts[0].id });
        }

        showToast(`Selamat datang, ${data.userData.name}!`, 'success');
        login();
        navigate('/');
      } else {
        showToast(data.error || 'Gagal login. Sila cuba lagi.', 'error');
      }
    } catch (err) {
      showToast('Masalah sambungan server.', 'error');
    } finally {
      setAltLoading(false);
    }
  };

  // Terms and Conditions content (translated to formal English)
  const termsContent = [
    "By using this web system, you are classified as a Tester.",
    "As a Tester, your testing period is one (1) month (and may be extended at the discretion of the administrator).",
    "Your data and privacy are protected.",
    "Your data and privacy shall not be disclosed to the public without your consent.",
    "Your Tester status may be revoked if we suspect any misuse or conduct harmful to the system or other users.",
    "The use of third-party applications or integrations with this system is strictly prohibited.",
    "Tester usage is limited to four (4) campaigns per hour (you may create up to ninety-six (96) campaigns within a 24-hour period).",
    "Your account shall remain under Tester status until the administrator amends these terms."
  ];

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
        <p className="text-slate-500 mb-6 font-medium">
          AI-Powered Meta Ads Manager
        </p>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-left">
          {/* Username Field */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-slate-800"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-slate-800"
              />
            </div>
          </div>

          {/* Error Message */}


          {/* Terms and Conditions Link */}
          <div className="text-center pt-1">
            <span className="text-sm text-slate-500">Please Read Before You Login : </span>
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline transition-colors font-medium"
            >
              Terms and Conditions
            </button>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.01] flex items-center justify-center gap-3 shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
            <span>Login</span>
          </button>
        </form>

        <button
          onClick={handleDemoMode}
          disabled={loading || altLoading}
          className="mt-4 w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-sm"
        >
          <LayoutTemplate size={16} className="text-indigo-500" /> Preview Demo Dashboard
        </button>

        <button
          onClick={() => setShowAltLogin(true)}
          disabled={loading || altLoading}
          className="mt-3 w-full bg-slate-900 hover:bg-black text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg"
        >
          <Zap size={16} className="text-yellow-400 fill-current" /> ⚡ ALT LOGIN
        </button>

        <p className="mt-6 text-xs text-slate-400">
          Version 0.91 &bull; Powered by Gemini
        </p>
      </div>

      {/* Alt Login Modal */}
      {showAltLogin && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setShowAltLogin(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full shadow-2xl animate-scaleIn overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 mx-auto">
                <Lock className="text-indigo-600 w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 text-center mb-2">Alt Login Access</h2>
              <p className="text-slate-500 text-center text-sm mb-6">
                Masukkan 5 aksara terakhir token FB untuk akses pantas.
              </p>

              <form onSubmit={handleAltLogin} className="space-y-4">
                <input
                  type="password"
                  maxLength={5}
                  value={altCode}
                  onChange={(e) => setAltCode(e.target.value)}
                  placeholder="Contoh: xYz12"
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none transition-all uppercase"
                  autoFocus
                />

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAltLogin(false)}
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={altLoading}
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {altLoading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Akses'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
