import React, { createContext, useContext, useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ConnectPage from './pages/Connect';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import CreateCampaign from './pages/CreateCampaign';
import CommentTemplates from './pages/CommentTemplates';
import { UserSettings, AiProvider } from './types';
import { initFacebookSdk, isSecureContext } from './services/metaService';
import { Loader2 } from 'lucide-react';
import LoginPage from './pages/Login';

// Context Definition
interface AppContextType {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
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
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load Settings from LocalStorage on mount
  useEffect(() => {
    const loadSettings = () => {
        try {
            const saved = localStorage.getItem('ar_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings(prev => ({ ...prev, ...parsed }));
            }
        } catch (e) {
            console.error("Failed to load settings from LocalStorage", e);
        } finally {
            setLoading(false);
        }
    };
    loadSettings();
  }, []);

  // Save Settings to LocalStorage whenever updated
  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings(prev => {
        const next = { ...prev, ...newSettings };
        localStorage.setItem('ar_settings', JSON.stringify(next));
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

  return (
    <AppContext.Provider value={{ settings, updateSettings, loading }}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route path="/connect" element={<ConnectPage />} />
          
          <Route path="/" element={
            settings.isConnected ? <Layout /> : <Navigate to="/connect" replace />
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