
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, LogOut, CheckCircle, ArrowRight } from 'lucide-react';
import { useSettings } from '../App';
import { initFacebookSdk, loginWithFacebook, getAdAccounts } from '../services/metaService';
import { MetaAdAccount } from '../types';

const SYSTEM_APP_ID: string = '861724536220118'; 

const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings, logout } = useSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [step, setStep] = useState<1 | 2>(1); 
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const appIdToUse = SYSTEM_APP_ID;

  // Auto-connect check
  useEffect(() => {
    const autoCheck = async () => {
      if (settings.isConnected && settings.adAccountId) {
        navigate('/');
        return;
      }
      // If we have token from DB, verify it works
      if (settings.fbAccessToken) {
          try {
              const adAccounts = await getAdAccounts(settings.fbAccessToken);
              if (adAccounts.length > 0) {
                setAccounts(adAccounts);
                updateSettings({ availableAccounts: adAccounts });
                setStep(2);
              }
          } catch (e) {
              console.warn("Saved token expired or invalid");
          }
      }
    };
    autoCheck();
  }, [settings.isConnected, settings.fbAccessToken]);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      await initFacebookSdk(appIdToUse);
      const accessToken = await loginWithFacebook();
      
      // SAVE TO CONTEXT
      updateSettings({ fbAppId: appIdToUse, fbAccessToken: accessToken });
      
      const adAccounts = await getAdAccounts(accessToken);
      
      if (adAccounts.length === 0) {
        setError("No Ad Accounts found. Ensure you have admin access.");
        return;
      }

      setAccounts(adAccounts);
      updateSettings({ availableAccounts: adAccounts });
      setStep(2);

    } catch (err: any) {
      setError(typeof err === 'string' ? err : err.message || "Failed to connect.");
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

  const handleLogoutLocal = () => {
      logout();
      navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px] opacity-60"></div>
      
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-10 animate-fade-in-up">
        <div className="p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <img src="https://i.postimg.cc/5tpzdqNN/rocket.png" alt="Logo" className="w-5 h-5 object-cover opacity-90" />
                    </div>
                    <h1 className="text-lg font-bold text-slate-800">Connect Meta Ads</h1>
                </div>
                <button onClick={handleLogoutLocal} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                    <LogOut size={12}/> Sign Out
                </button>
            </div>
            
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Connect your Facebook Ads account to sync campaigns, analyze data, and manage creatives.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 p-3 rounded-lg mb-6 text-red-600 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-xl font-bold tracking-wide bg-[#1877F2] hover:bg-[#166fe5] text-white flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg disabled:opacity-70"
            >
                {loading ? <RefreshCw className="animate-spin" /> : "Link Facebook Account"}
            </button>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                  <h3 className="text-slate-800 font-bold">Select Ad Account</h3>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{accounts.length} found</span>
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => selectAccount(acc)}
                    className="w-full text-left p-4 rounded-xl bg-white border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all flex justify-between items-center group relative overflow-hidden"
                  >
                    <div className="relative z-10">
                      <p className="text-slate-800 font-bold text-sm">{acc.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">ID: {acc.account_id}</p>
                    </div>
                    <div className="text-indigo-600 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                        <ArrowRight size={18} />
                    </div>
                    <div className="absolute inset-0 bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {step === 1 && (
            <div className="bg-slate-50 p-4 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400">Secure connection via Meta Graph API v19.0</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default ConnectPage;
