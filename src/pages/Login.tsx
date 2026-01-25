
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
          disabled={loading}
          className="mt-4 w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-sm"
        >
          <LayoutTemplate size={16} className="text-indigo-500" /> Preview Demo Dashboard
        </button>

        <p className="mt-6 text-xs text-slate-400">
          Version 0.91 &bull; Powered by Gemini
        </p>
      </div>

      {/* Terms and Conditions Modal */}
      {showTermsModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setShowTermsModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Terms and Conditions</h2>
              <button
                onClick={() => setShowTermsModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <p className="text-sm text-slate-600 mb-4">
                Please read and acknowledge the following terms before proceeding:
              </p>
              <ol className="space-y-3">
                {termsContent.map((term, index) => (
                  <li key={index} className="flex gap-3 text-sm text-slate-700">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <span className="leading-relaxed">{term}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowTermsModal(false)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-all"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
