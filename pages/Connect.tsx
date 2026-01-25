import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
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
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 stars-bg relative">
      <div className="stars"></div>
      
      <div className="max-w-md w-full bg-[#1e293b]/90 backdrop-blur-xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden z-10 animate-fade-in-up">
        <div className="p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-xl font-bold text-white">Connect Meta Ads</h1>
                <button onClick={handleLogoutLocal} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                    <LogOut size={12}/> Sign Out
                </button>
            </div>
            
          <p className="text-indigo-200 mb-8 text-center text-sm">
            Sambungkan akaun Facebook Ads anda untuk mula menggunakan Ads Rocket.
          </p>

          {error && (
            <div className="bg-red-900/20 border border-red-800 p-3 rounded-lg mb-4 text-red-400 text-sm">
              <AlertTriangle size={16} className="inline mr-2" />
              {error}
            </div>
          )}

          {step === 1 && (
            <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-4 px-6 rounded-xl font-bold tracking-wide bg-[#1877F2] hover:bg-[#166fe5] text-white flex items-center justify-center gap-3 transition-all"
            >
                {loading ? <RefreshCw className="animate-spin" /> : "Link Facebook Ads Account"}
            </button>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <h3 className="text-white font-medium">Pilih Ad Account</h3>
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
                    <div className="opacity-0 group-hover:opacity-100 text-indigo-400">Pilih</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectPage;