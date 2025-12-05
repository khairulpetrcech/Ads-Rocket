
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, CheckCircle, AlertTriangle, Info, KeyRound, RefreshCw } from 'lucide-react';
import { useSettings } from '../App';
import { initFacebookSdk, loginWithFacebook, getAdAccounts, checkLoginStatus } from '../services/metaService';
import { MetaAdAccount } from '../types';

const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [appIdInput, setAppIdInput] = useState(settings.fbAppId || '');
  
  const [step, setStep] = useState<1 | 2>(1); // 1 = App ID, 2 = Account Selection
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);

  // On mount, auto-check login if App ID exists
  useEffect(() => {
    const autoConnect = async () => {
      // If we already have everything, go to dashboard
      if (settings.isConnected && settings.adAccountId) {
        navigate('/');
        return;
      }

      // If we have App ID but no connection, try to auto-reconnect
      if (settings.fbAppId && settings.fbAppId !== '123456789') {
        setLoading(true);
        try {
          await initFacebookSdk(settings.fbAppId);
          const existingToken = await checkLoginStatus();
          
          if (existingToken) {
            // Already connected to FB, fetch accounts automatically
            updateSettings({ fbAccessToken: existingToken });
            const adAccounts = await getAdAccounts(existingToken);
            
            if (adAccounts.length > 0) {
              setAccounts(adAccounts);
              // Save all accounts to global state for switcher
              updateSettings({ availableAccounts: adAccounts });
              setStep(2);
              
              // If we previously had an account ID and it's still valid, auto-redirect
              if (settings.adAccountId && adAccounts.find(a => a.id === settings.adAccountId)) {
                 updateSettings({ isConnected: true }); // Ensure connected flag is true
                 navigate('/');
              }
            } else {
               setError("Connected to Facebook, but no Ad Accounts found.");
            }
          }
        } catch (e) {
          console.warn("Auto-connect failed, falling back to manual login", e);
        } finally {
          setLoading(false);
        }
      }
    };

    autoConnect();
  }, [settings.fbAppId, settings.isConnected, settings.adAccountId, navigate, updateSettings]);


  const handleLogin = async () => {
    if (!appIdInput) {
      setError("Please enter your Facebook App ID first.");
      return;
    }
    
    setLoading(true);
    setError('');

    // --- DUMMY LOGIN BACKDOOR ---
    if (appIdInput === '123456789') {
        setTimeout(() => {
            const dummyAccounts = [
                { id: 'act_dummy_123', name: 'Demo Store (Malaysia)', account_id: '123', currency: 'MYR' },
                { id: 'act_dummy_456', name: 'Second Store', account_id: '456', currency: 'MYR' }
            ];
            updateSettings({ 
                fbAppId: '123456789', 
                fbAccessToken: 'dummy_token',
                isConnected: true,
                businessName: 'Demo Store (Malaysia)',
                adAccountId: 'act_dummy_123',
                availableAccounts: dummyAccounts
            });
            navigate('/');
        }, 800);
        return;
    }
    // ---------------------------

    try {
      await initFacebookSdk(appIdInput);
      const accessToken = await loginWithFacebook();
      
      // Save Token and App ID temporarily
      updateSettings({ fbAppId: appIdInput, fbAccessToken: accessToken });
      
      // Fetch Accounts
      const adAccounts = await getAdAccounts(accessToken);
      
      if (adAccounts.length === 0) {
        setError("No Ad Accounts found for this user. Ensure you have admin access.");
        setLoading(false);
        return;
      }

      setAccounts(adAccounts);
      updateSettings({ availableAccounts: adAccounts }); // Save list for dashboard
      setStep(2);
      setLoading(false);

    } catch (err: any) {
      console.error(err);
      setError(typeof err === 'string' ? err : "Failed to connect to Facebook. Check your App ID and ensure your domain is allowed in Meta App Settings.");
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
        <div className="p-6 md:p-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30">
            <Rocket className="text-white w-8 h-8" />
          </div>
          
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 text-center">Ads Roket</h1>
          <p className="text-slate-400 mb-8 text-center text-sm md:text-base">
            Connect your Meta Ads Manager to unlock AI-powered insights.
          </p>

          {error && (
            <div className="bg-red-900/20 border border-red-800 p-3 rounded-lg mb-4 text-red-400 text-sm">
              <div className="flex items-center gap-2 mb-1">
                 <AlertTriangle size={16} />
                 <span className="font-bold">Connection Failed</span>
              </div>
              <p>{error}</p>
              <div className="mt-2 text-xs text-red-300 opacity-80 pl-6">
                Tip: In Meta Developers App Settings Basic, ensure your Vercel URL is added to "App Domains".
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Facebook App ID</label>
                <div className="relative">
                    <KeyRound className="absolute left-3 top-3.5 text-slate-500" size={16} />
                    <input 
                      type="text" 
                      value={appIdInput}
                      onChange={(e) => setAppIdInput(e.target.value)}
                      placeholder="Enter App ID or 123456789 for demo"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder-slate-600"
                    />
                </div>
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
                  <>
                    <RefreshCw className="animate-spin" size={20} />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
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
            <div className="flex items-center justify-center gap-2">
               <Info size={14} className="text-blue-500"/> Requires "App Domains" setup in Meta
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectPage;
