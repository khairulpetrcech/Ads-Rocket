import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, CheckCircle, AlertTriangle } from 'lucide-react';
import { useSettings } from '../App';
import { initFacebookSdk, loginWithFacebook, getAdAccounts } from '../services/metaService';
import { MetaAdAccount } from '../types';

const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [appIdInput, setAppIdInput] = useState(settings.fbAppId || '');
  
  const [step, setStep] = useState<1 | 2>(1); // 1 = App ID, 2 = Account Selection
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);

  useEffect(() => {
    if (settings.isConnected && settings.adAccountId) {
      navigate('/');
    }
  }, [settings, navigate]);

  const handleLogin = async () => {
    if (!appIdInput) {
      setError("Please enter your Facebook App ID first.");
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      await initFacebookSdk(appIdInput);
      const accessToken = await loginWithFacebook();
      
      // Save Token and App ID temporarily
      updateSettings({ fbAppId: appIdInput, fbAccessToken: accessToken });
      
      // Fetch Accounts
      const adAccounts = await getAdAccounts(accessToken);
      
      if (adAccounts.length === 0) {
        setError("No Ad Accounts found for this user.");
        setLoading(false);
        return;
      }

      setAccounts(adAccounts);
      setStep(2);
      setLoading(false);

    } catch (err: any) {
      console.error(err);
      setError(typeof err === 'string' ? err : "Failed to connect to Facebook. Check your App ID and Pop-up blocker.");
      setLoading(false);
    }
  };

  const selectAccount = (account: MetaAdAccount) => {
    updateSettings({
      isConnected: true,
      businessName: account.name,
      adAccountId: account.id // usually act_123123
    });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#1e293b] rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="p-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30">
            <Rocket className="text-white w-8 h-8" />
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-2 text-center">Ads Roket</h1>
          <p className="text-slate-400 mb-8 text-center">
            Connect your Meta Ads Manager to unlock AI-powered insights.
          </p>

          {error && (
            <div className="bg-red-900/20 border border-red-800 p-3 rounded-lg mb-4 flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Facebook App ID</label>
                <input 
                  type="text" 
                  value={appIdInput}
                  onChange={(e) => setAppIdInput(e.target.value)}
                  placeholder="1234567890..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">Found in Meta Developers Portal</p>
              </div>

              <button
                onClick={handleLogin}
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
                    Continue with Facebook
                  </>
                )}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <h3 className="text-white font-medium">Select Ad Account</h3>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => selectAccount(acc)}
                    className="w-full text-left p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 transition-all flex justify-between items-center group"
                  >
                    <div>
                      <p className="text-slate-200 font-medium">{acc.name}</p>
                      <p className="text-xs text-slate-500">ID: {acc.account_id}</p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 text-indigo-400">
                      Select
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="text-xs text-slate-500 mt-6 flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2">
               <CheckCircle size={14} className="text-green-500"/> Read-Only Analytics Access
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectPage;