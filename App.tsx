import React, { createContext, useContext, useState, useEffect, PropsWithChildren } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import ConnectPage from './pages/Connect';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import CreateCampaign from './pages/CreateCampaign';
import CommentTemplates from './pages/CommentTemplates';
import { UserSettings, AiProvider } from './types';
import { initFacebookSdk, isSecureContext } from './services/metaService';
import { Loader2 } from 'lucide-react';
import { encryptKey, decryptKey } from './src/utils';

// Context Definition
interface AppContextType {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  loading: boolean;
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
  availableAccounts: []
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

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
          // Decrypt API key if present
          if (parsed.apiKey) {
              parsed.apiKey = decryptKey(parsed.apiKey);
          }
          setSettings(prev => ({ ...prev, ...parsed }));
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white">
        <Loader2 className="animate-spin text-indigo-500 w-12 h-12" />
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
    <AppContext.Provider value={{ settings, updateSettings, isAuthenticated, login, logout, loading }}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={
             isAuthenticated ? <Navigate to="/connect" replace /> : <LoginPage />
          } />
          
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
            <Route path="comment-templates" element={<CommentTemplates />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppContext.Provider>
  );
};

export default App;