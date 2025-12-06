
import React, { createContext, useContext, useState, useEffect, PropsWithChildren } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ConnectPage from './pages/Connect';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import CreateCampaign from './pages/CreateCampaign';
import CommentTemplates from './pages/CommentTemplates'; // Import
import { UserSettings, AiProvider } from './types';
import { initFacebookSdk, isSecureContext } from './services/metaService';

// Context Definition
interface AppContextType {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useSettings must be used within AppProvider');
  return context;
};

// Security Helpers
const encode = (str: string) => {
    if(!str) return '';
    try { return 'ENC_' + btoa(str); } catch(e) { return str; }
};
const decode = (str: string) => {
    if(!str) return '';
    if(str.startsWith('ENC_')) {
        try { return atob(str.substring(4)); } catch(e) { return str; }
    }
    return str; // Fallback for existing plaintext
};

// Main App Component
const App: React.FC = () => {
  // Initial State - Try to load from localStorage
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('adsRoketSettings');
    const initial = saved ? JSON.parse(saved) : {
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

    // Decode Sensitive Fields
    if(initial.fbAccessToken) initial.fbAccessToken = decode(initial.fbAccessToken);
    if(initial.apiKey) initial.apiKey = decode(initial.apiKey);

    return initial;
  });

  // Persist settings (Obfuscated)
  useEffect(() => {
    const toSave = { ...settings };
    if(toSave.fbAccessToken) toSave.fbAccessToken = encode(toSave.fbAccessToken);
    if(toSave.apiKey) toSave.apiKey = encode(toSave.apiKey);
    localStorage.setItem('adsRoketSettings', JSON.stringify(toSave));
  }, [settings]);

  // IDLE TIMEOUT (Auto Logout after 30 mins of inactivity)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if(settings.isConnected) {
                // Keep App ID but clear connection
                setSettings(prev => ({ 
                    ...prev, 
                    isConnected: false, 
                    fbAccessToken: '', 
                    adAccountId: '',
                    apiKey: '' // Clear AI Key too for security
                }));
                // Note: We don't use alert() as it blocks UI, just redirect
                window.location.hash = '#/connect';
            }
        }, 30 * 60 * 1000); // 30 minutes
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    resetTimer();

    return () => {
        clearTimeout(timer);
        window.removeEventListener('mousemove', resetTimer);
        window.removeEventListener('keydown', resetTimer);
        window.removeEventListener('click', resetTimer);
    };
  }, [settings.isConnected]);

  // Auto-init Facebook SDK if App ID is present AND we are in a secure context
  useEffect(() => {
    if (settings.fbAppId && settings.fbAppId !== '123456789' && isSecureContext()) {
      initFacebookSdk(settings.fbAppId).catch(err => 
        console.warn("Auto-init FB SDK failed:", err)
      );
    }
  }, [settings.fbAppId]);

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  // Protected Route Wrapper
  const ProtectedRoute = ({ children }: PropsWithChildren) => {
    if (!settings.isConnected) {
      return <Navigate to="/connect" replace />;
    }
    return <>{children}</>;
  };

  return (
    <AppContext.Provider value={{ settings, updateSettings }}>
      <HashRouter>
        <Routes>
          <Route path="/connect" element={<ConnectPage />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
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