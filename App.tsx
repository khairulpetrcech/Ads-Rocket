
import React, { createContext, useContext, useState, useEffect, PropsWithChildren } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ConnectPage from './pages/Connect';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import { UserSettings, AiProvider } from './types';
import { initFacebookSdk } from './services/metaService';

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

// Main App Component
const App: React.FC = () => {
  // Initial State - Try to load from localStorage
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('adsRoketSettings');
    return saved ? JSON.parse(saved) : {
      isConnected: false,
      businessName: '',
      selectedAiProvider: AiProvider.CLAUDE, 
      selectedModel: 'claude-3-5-sonnet-20241022', 
      apiKey: '',
      fbAppId: '', // Will be preserved if previously set
      fbAccessToken: '',
      adAccountId: '',
      availableAccounts: []
    };
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem('adsRoketSettings', JSON.stringify(settings));
  }, [settings]);

  // Auto-init Facebook SDK if App ID is present
  useEffect(() => {
    if (settings.fbAppId && settings.fbAppId !== '123456789') {
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
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppContext.Provider>
  );
};

export default App;
