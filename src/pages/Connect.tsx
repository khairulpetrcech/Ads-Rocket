
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, LogOut, CheckCircle, ArrowRight } from 'lucide-react';
import { useSettings } from '../App';
import { useToast } from '../contexts/ToastContext';
import { initFacebookSdk, loginWithFacebook, getAdAccounts } from '../services/metaService';
import { MetaAdAccount } from '../types';

const SYSTEM_APP_ID: string = '861724536220118';

const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings, logout } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

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

    try {
      await initFacebookSdk(appIdToUse);
      const shortLivedToken = await loginWithFacebook();

      // Attempt to exchange for long-lived token (60 days)
      let accessToken = shortLivedToken;
      let tokenExpiresAt: string | undefined;

      try {
        console.log("Exchanging for long-lived token...");
        console.log("Short-lived token length:", shortLivedToken?.length);

        const exchangeResponse = await fetch('/api/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shortLivedToken })
        });

        const responseText = await exchangeResponse.text();
        console.log("Exchange response status:", exchangeResponse.status);
        console.log("Exchange response:", responseText);

        if (exchangeResponse.ok) {
          const data = JSON.parse(responseText);
          accessToken = data.access_token;
          tokenExpiresAt = data.expires_at;
          console.log(`✅ Long-lived token obtained. Length: ${accessToken?.length}. Expires: ${tokenExpiresAt}`);
        } else {
          console.warn("⚠️ Token exchange failed, using short-lived token:", responseText);
          // Show warning to user but continue
          showToast("Note: Using short-lived token (expires in ~1 hour). Long-lived exchange failed.", 'error');
        }
      } catch (exchangeErr) {
        console.warn("⚠️ Token exchange request failed, using short-lived token:", exchangeErr);
      }

      console.log("Final token length being saved:", accessToken?.length);

      // SAVE TO CONTEXT (with token expiry if available)
      updateSettings({
        fbAppId: appIdToUse,
        fbAccessToken: accessToken,
        ...(tokenExpiresAt && { fbTokenExpiresAt: tokenExpiresAt })
      });

      const adAccounts = await getAdAccounts(accessToken);

      if (adAccounts.length === 0) {
        showToast("No Ad Accounts found. Ensure you have admin access.", 'error');
        return;
      }

      setAccounts(adAccounts);
      updateSettings({ availableAccounts: adAccounts });
      setStep(2);

    } catch (err: any) {
      showToast(typeof err === 'string' ? err : err.message || "Failed to connect.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectAccount = async (account: MetaAdAccount) => {
    // Get FB user info for logging
    try {
      const fbUser = await new Promise<{ id: string; name: string; picture?: { data?: { url: string } } }>((resolve, reject) => {
        if (window.FB && window.FB.api) {
          window.FB.api('/me', { fields: 'id,name,picture.type(large)' }, (response: any) => {
            if (response && !response.error) {
              resolve(response);
            } else {
              reject(response?.error || 'Failed to get user info');
            }
          });
        } else {
          reject('FB SDK not available');
        }
      });

      // Log user to Vercel KV
      await fetch('/api/log-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fbId: fbUser.id,
          fbName: fbUser.name,
          profilePicture: fbUser.picture?.data?.url || '',
          tokenExpiresAt: settings.fbTokenExpiresAt,
          adAccountId: account.id,
          adAccountName: account.name
        })
      });
      console.log('User logged to admin tracking');

      // Save userId for cloud sync (Text Presets, etc.)
      updateSettings({
        isConnected: true,
        businessName: account.name,
        adAccountId: account.id,
        userId: fbUser.id
      });

      // AUTO-SAVE to database for cron job (preserve existing Telegram settings from DATABASE, not just localStorage)
      // Fetch existing schedule from database first, then update with new FB token
      try {
        // First, try to get existing Telegram settings from database
        const existingScheduleRes = await fetch(`/api/analyze-telegram?action=get-schedule&fbId=${fbUser.id}`);
        let existingTelegramToken = settings.telegramBotToken || '';
        let existingTelegramChatId = settings.telegramChatId || '';

        if (existingScheduleRes.ok) {
          const responseData = await existingScheduleRes.json();
          const existingSchedule = responseData.schedule || responseData; // Handle both formats
          if (existingSchedule && existingSchedule.telegram_bot_token) {
            existingTelegramToken = existingSchedule.telegram_bot_token;
          }
          if (existingSchedule && existingSchedule.telegram_chat_id) {
            existingTelegramChatId = existingSchedule.telegram_chat_id;
          }
          console.log('📦 Found existing schedule in database, telegram token:', existingTelegramToken ? 'exists' : 'none');
        }

        // Always save/update the schedule with new FB token
        // Use existing Telegram settings from DB or localStorage
        await fetch('/api/analyze-telegram?action=save-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fbId: fbUser.id,
            fbAccessToken: settings.fbAccessToken,
            adAccountId: account.id,
            telegramBotToken: existingTelegramToken,
            telegramChatId: existingTelegramChatId,
            scheduleTime: '08:00',
            isEnabled: existingTelegramToken && existingTelegramChatId ? true : false
          })
        });
        console.log('✅ Auto-saved schedule with new FB token and preserved Telegram settings');

        // Also update localStorage with the existing Telegram settings from DB
        if (existingTelegramToken && existingTelegramChatId) {
          updateSettings({
            telegramBotToken: existingTelegramToken,
            telegramChatId: existingTelegramChatId
          });
        }
      } catch (scheduleErr) {
        console.warn('Failed to auto-save schedule:', scheduleErr);
      }

      navigate('/');

    } catch (logErr) {
      console.warn('Failed to log user (non-critical):', logErr);
      // Fallback: still connect but without userId (local storage only)
      updateSettings({
        isConnected: true,
        businessName: account.name,
        adAccountId: account.id
      });
      navigate('/');
    }
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
              <LogOut size={12} /> Sign Out
            </button>
          </div>

          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Connect your Facebook Ads account to sync campaigns, analyze data, and manage creatives.
          </p>



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
