
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useSettings } from '../App';
import { initFacebookSdk, loginWithFacebook, getAdAccounts, checkLoginStatus, isSecureContext } from '../services/metaService';
import { MetaAdAccount } from '../types';

// Production App ID
const SYSTEM_APP_ID: string = '861724536220118'; 

const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [step, setStep] = useState<1 | 2>(1); // 1 = Login, 2 = Account Selection
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  // We strictly use SYSTEM_APP_ID now
  const appIdToUse = SYSTEM_APP_ID;

  const isSecure = isSecureContext();

  // On mount, auto-check login
  useEffect(() => {
    const autoConnect = async () => {
      // If we already have everything, go to dashboard
      if (settings.isConnected && settings.adAccountId) {
        navigate('/');
        return;
      }

      // Skip auto-connect on insecure protocols to avoid console errors
      if (!isSecureContext()) return;
      
      const currentAppId = settings.fbAppId || appIdToUse;
      
      setLoading(true);
      try {
        await initFacebookSdk(currentAppId);
        const existingToken = await checkLoginStatus();
        
        if (existingToken) {
          updateSettings({ fbAccessToken: existingToken, fbAppId: currentAppId });
          const adAccounts = await getAdAccounts(existingToken);
          
          if (adAccounts.length > 0) {
            setAccounts(adAccounts);
            updateSettings({ availableAccounts: adAccounts });
            setStep(2);
            
            if (settings.adAccountId && adAccounts.find(a => a.id === settings.adAccountId)) {
               updateSettings({ isConnected: true }); 
               navigate('/');
            }
          }
        }
      } catch (e) {
        console.warn("Auto-connect failed or blocked", e);
      } finally {
        setLoading(false);
      }
    };

    autoConnect();
  }, [settings.isConnected, settings.adAccountId, navigate, updateSettings, settings.fbAppId, settings.fbAccessToken]);


  const handleLogin = async () => {
    setLoading(true);
    setError('');
    
    // --- DUMMY LOGIN BACKDOOR (For Demo/Dev if needed) ---
    if (appIdToUse === '123456789') {
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
      await initFacebookSdk(appIdToUse);
      const accessToken = await loginWithFacebook();
      
      // Save Token and App ID
      updateSettings({ fbAppId: appIdToUse, fbAccessToken: accessToken });
      
      const adAccounts = await getAdAccounts(accessToken);
      
      if (adAccounts.length === 0) {
        setError("No Ad Accounts found for this user. Ensure you have admin access.");
        return;
      }

      setAccounts(adAccounts);
      updateSettings({ availableAccounts: adAccounts });
      setStep(2);

    } catch (err: any) {
      console.error(err);
      // Extract meaningful error message
      let msg = "Failed to connect to Facebook.";
      if (typeof err === 'string') {
        msg = err;
      } else if (err?.message) {
        msg = err.message;
      } else if (err?.error_user_msg) {
        msg = err.error_user_msg;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectAccount = (account: MetaAdAccount) => {
    updateSettings({
      isConnected: true,
      businessName: account.name,
      adAccountId: account.id
    });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#1e293b] rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30 overflow-hidden bg-white">
             <img src="https://i.postimg.cc/pLyD6HKz/adsrocket.jpg" alt="Ads Rocket" className="w-full h-full object-cover" />
          </div>
          
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 text-center">Ads Rocket</h1>
          <p className="text-slate-400 mb-8 text-center text-sm md:text-base">
            Ambil Advantage Dengan Update Andromeda. Buat Ads Lelaju dan Meroket 10x Lebih Pantas
          </p>

          {!isSecure && (
             <div className="bg-yellow-900/20 border border-yellow-800 p-3 rounded-lg mb-4 text-yellow-400 text-sm animate-fadeIn">
               <div className="flex items-center gap-2 mb-1">
                 <AlertTriangle size={16} />
                 <span className="font-bold">HTTPS Required</span>
               </div>
               <p>Facebook Login does not work on HTTP. Please access this site via <b>HTTPS</b>.</p>
             </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-800 p-3 rounded-lg mb-4 text-red-400 text-sm animate-fadeIn">
              <div className="flex items-center gap-2 mb-1">
                 <AlertTriangle size={16} />
                 <span className="font-bold">Connection Failed</span>
              </div>
              <p className="break-words">{error}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              
              <button
                onClick={handleLogin}
                disabled={loading || !isSecure}
                className={`w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-3 transition-all duration-300 ${
                  loading || !isSecure
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
               <CheckCircle size={14} className="text-green-500"/> Secure Official Meta API
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectPage;
