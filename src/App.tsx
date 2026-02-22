
import React, { createContext, useContext, useState, useEffect, PropsWithChildren, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import ConnectPage from './pages/Connect';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import CreateCampaign from './pages/CreateCampaign';
import RapidCreator from './pages/RapidCreator';
import CommentTemplates from './pages/CommentTemplates';
import EpicPoster from './pages/EpicPoster';
import EpicVideo from './pages/EpicVideo';
import AiAssistant from './pages/AiAssistant';
import LogPage from './pages/Log';
import AdminPage from './pages/Admin';
import { UserSettings, AiProvider, GlobalProcess } from './types';
import { initFacebookSdk, isSecureContext } from './services/metaService';
import { Loader2, Key } from 'lucide-react';
import { encryptKey, decryptKey } from './utils';
import { ToastProvider } from './contexts/ToastContext';
import GenerationProgress from './components/GenerationProgress';

// Declare global augmentation for Window to include aistudio
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}

// Context Definition
interface AppContextType {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  loading: boolean;
  reselectApiKey: () => Promise<void>;
  // Global Process State
  globalProcess: GlobalProcess;
  setGlobalProcess: (process: GlobalProcess) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useSettings must be used within AppProvider');
  return context;
};

// Default Empty Settings
const DEFAULT_SETTINGS: UserSettings = {
  isConnected: false,
  businessName: '',
  selectedAiProvider: AiProvider.CLAUDE,
  selectedModel: 'claude-3-5-sonnet-20241022',
  apiKey: '',
  fbAppId: '',
  fbAccessToken: '',
  adAccountId: '',
  availableAccounts: [],
  telegramBotToken: '',
  telegramChatId: '',
  defaultWebsiteUrl: '',
  defaultPageId: '',
  presetPrimaryTexts: [],
  presetHeadlines: [],
  presetPrimaryTextNames: [],
  presetHeadlineNames: [],
  adTemplates: []
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Global Process State (e.g. Campaign Creation)
  const [globalProcess, setGlobalProcess] = useState<GlobalProcess>({
    active: false,
    name: '',
    message: '',
    type: 'NONE'
  });

  // API Key Selection State
  const [hasApiKey, setHasApiKey] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);

  // Check for Google GenAI API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        try {
          const has = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(has);
        } catch (e) {
          console.warn("Error checking API key status:", e);
          setHasApiKey(false);
        }
      } else {
        // Not in IDX/SFDX environment, assume valid or handle gracefully
        setHasApiKey(true);
      }
      setCheckingKey(false);
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      } catch (e: any) {
        console.error("Failed to select API key:", e);
        // Reset state if entity not found or other error to allow retry
        setHasApiKey(false);
      }
    }
  };

  const reselectApiKey = async () => {
    await handleSelectKey();
  };

  // Load State from LocalStorage on Mount
  useEffect(() => {
    const initApp = () => {
      try {
        // 1. Check Auth
        const auth = localStorage.getItem('ar_auth');
        if (auth === 'true') {
          setIsAuthenticated(true);
        }

        // 2. Check Settings
        const savedSettings = localStorage.getItem('ar_settings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          // Decrypt API key if present so the app can use it
          if (parsed.apiKey) {
            parsed.apiKey = decryptKey(parsed.apiKey);
          }
          setSettings(prev => ({ ...prev, ...parsed }));

          // 3. Sync with Cloud if possible
          const fbId = parsed.userId || parsed.adAccountId;
          if (fbId) {
            fetch(`/api/presets-api?fbId=${fbId}`)
              .then(res => res.json())
              .then(data => {
                if (!data.error) {
                  setSettings(prev => {
                    const next = {
                      ...prev,
                      presetPrimaryTexts: (data.primaryTexts && data.primaryTexts.length > 0) ? data.primaryTexts : prev.presetPrimaryTexts,
                      presetPrimaryTextNames: (data.primaryTextNames && data.primaryTextNames.length > 0) ? data.primaryTextNames : prev.presetPrimaryTextNames,
                      presetHeadlines: (data.headlines && data.headlines.length > 0) ? data.headlines : prev.presetHeadlines,
                      presetHeadlineNames: (data.headlineNames && data.headlineNames.length > 0) ? data.headlineNames : prev.presetHeadlineNames,
                      adTemplates: (data.adTemplates && data.adTemplates.length > 0) ? data.adTemplates : prev.adTemplates
                    };
                    // Also update localStorage with synced data
                    localStorage.setItem('ar_settings', JSON.stringify(next));
                    return next;
                  });
                  console.log('[App] Cloud sync successful');
                }
              })
              .catch(err => console.error('[App] Failed to sync presets:', err));
          }
        }
      } catch (e) {
        console.error("Failed to load local state", e);
      } finally {
        setLoading(false);
      }
    };
    initApp();
  }, []);

  const login = () => {
    localStorage.setItem('ar_auth', 'true');
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('ar_auth');
    setIsAuthenticated(false);
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem('ar_settings');
  };

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...newSettings };

      // Trim API Key if it exists in the update
      if (next.apiKey) {
        next.apiKey = next.apiKey.trim();
      }

      // Encrypt API Key before saving to LocalStorage
      const toSave = { ...next };
      if (toSave.apiKey) {
        toSave.apiKey = encryptKey(toSave.apiKey);
      }

      localStorage.setItem('ar_settings', JSON.stringify(toSave));
      return next;
    });
  };

  // FB SDK Auto-Init
  useEffect(() => {
    if (settings.fbAppId && settings.fbAppId !== '123456789' && isSecureContext()) {
      initFacebookSdk(settings.fbAppId).catch(console.warn);
    }
  }, [settings.fbAppId]);

  // Background Token Validity Check (Robust Desktop Handling)
  useEffect(() => {
    if (!isAuthenticated || !settings.isConnected || !settings.fbAppId) return;

    const checkToken = () => {
      // Safety check to ensure window.FB is available and not in a disconnected state
      if (typeof window.FB !== 'undefined' && window.FB.getLoginStatus && settings.fbAccessToken !== 'dummy_token') {

        // IMPORTANT: Don't overwrite if we have a valid long-lived token (check expiry)
        // The FB SDK's getLoginStatus returns a SHORT-LIVED token, which would replace our 60-day token!
        if (settings.fbTokenExpiresAt) {
          const expiryDate = new Date(settings.fbTokenExpiresAt);
          const now = new Date();
          const daysUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

          if (daysUntilExpiry > 7) {
            // Token is still valid for more than 7 days, don't refresh with short-lived token
            console.log(`Token still valid for ${Math.round(daysUntilExpiry)} days. Skipping background refresh.`);
            return;
          }
        }

        try {
          // The 'true' flag forces a roundtrip to FB servers.
          // We wrap this in a try-catch because if the extension context is invalidated (common in 'sleeping' tabs),
          // accessing window.FB might throw a "Receiving end does not exist" error.
          window.FB.getLoginStatus((response: any) => {
            if (response.status === 'connected' && response.authResponse) {
              const newToken = response.authResponse.accessToken;
              // Only update if different AND if we don't have a long-lived token
              // FB SDK returns short-lived tokens which SHOULD NOT replace long-lived tokens!
              if (newToken && newToken !== settings.fbAccessToken && !settings.fbTokenExpiresAt) {
                console.log("Refreshing token in background (no long-lived token set)...");
                updateSettings({ fbAccessToken: newToken });
              }
            } else if (response.status === 'unknown' || response.status === 'not_authorized') {
              // Don't clear token here - user might still have valid long-lived token
              console.warn("Session lost during background check. Long-lived token may still be valid.");
            }
          }, true);
        } catch (e) {
          // Silently ignore connection errors during background checks to prevent console noise
          // This usually happens when the browser cleans up the extension context.
          console.debug("Background token check skipped due to browser state.");
        }
      }
    };

    // 1. Regular Interval (Stops when tab sleeps)
    const interval = setInterval(checkToken, 5 * 60 * 1000); // Check every 5 mins

    // 2. Visibility Change Listener (Triggers when tab wakes up)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log("Tab woke up: Re-initializing FB SDK and checking token...");
        // Longer delay for desktop browsers to fully restore connections after sleep
        await new Promise(r => setTimeout(r, 2000));

        // Try to re-init FB SDK first (important for long idle periods on desktop)
        try {
          await initFacebookSdk(settings.fbAppId);
        } catch (e) {
          console.debug("FB SDK re-init skipped:", e);
        }

        // Then check token
        setTimeout(checkToken, 500);
      }
    };

    // 3. User Interaction Listener (Extra safety for desktop idle)
    // We debounce this so it doesn't fire constantly
    let lastInteractionCheck = Date.now();
    const handleInteraction = () => {
      const now = Date.now();
      // Only check if it's been more than 10 minutes since last check AND user is active
      if (now - lastInteractionCheck > 10 * 60 * 1000) {
        lastInteractionCheck = now;
        console.log("User active after idle: Checking token...");
        checkToken();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [isAuthenticated, settings.isConnected, settings.fbAppId, settings.fbAccessToken]);

  if (loading || checkingKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600 w-12 h-12" />
      </div>
    );
  }

  // Block access if no API Key is selected (in supported environments)
  if (!hasApiKey && window.aistudio) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-md border border-slate-200">
          <Key className="text-indigo-600 w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-3">API Key Required</h1>
        <p className="text-slate-500 mb-8 max-w-md leading-relaxed">
          To use the powerful AI features powered by Gemini, you must select a paid API key from your Google Cloud Project.
        </p>
        <button
          onClick={handleSelectKey}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-indigo-200"
        >
          Select API Key
        </button>
        <p className="mt-8 text-xs text-slate-400">
          Read the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-500 underline transition-colors">Billing Documentation</a> for more details.
        </p>
      </div>
    );
  }

  // Protected Routes Wrapper
  const ProtectedRoute = ({ children }: PropsWithChildren) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
  };

  return (
    <AppContext.Provider value={{ settings, updateSettings, isAuthenticated, login, logout, loading, reselectApiKey, globalProcess, setGlobalProcess }}>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/connect" replace /> : <LoginPage />
            } />

            <Route path="/admin" element={<AdminPage />} />

            <Route path="/connect" element={
              isAuthenticated ? <ConnectPage /> : <Navigate to="/login" replace />
            } />

            <Route path="/" element={
              isAuthenticated ? (
                settings.isConnected ? <Layout /> : <Navigate to="/connect" replace />
              ) : <Navigate to="/login" replace />
            }>
              <Route index element={<Dashboard />} />
              <Route path="create-campaign" element={<CreateCampaign />} />
              <Route path="rapid" element={<RapidCreator />} />
              <Route path="epic-poster" element={<EpicPoster />} />
              <Route path="epic-video" element={<EpicVideo />} />
              <Route path="assistant" element={<AiAssistant />} />
              <Route path="comment-templates" element={<CommentTemplates />} />
              <Route path="log" element={<LogPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <GenerationProgress />
        </HashRouter>
      </ToastProvider>
    </AppContext.Provider>
  );
};

export default App;
