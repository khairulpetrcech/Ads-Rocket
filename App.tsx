import React, { createContext, useContext, useState, useEffect, PropsWithChildren } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/Login'; // New Login Page
import ConnectPage from './pages/Connect';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import CreateCampaign from './pages/CreateCampaign';
import CommentTemplates from './pages/CommentTemplates';
import { UserSettings, AiProvider } from './types';
import { initFacebookSdk, isSecureContext } from './services/metaService';
import { supabase, decryptKey, encryptKey } from './supabaseClient';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';

// Context Definition
interface AppContextType {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  session: Session | null;
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
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // 1. Listen for Auth Changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadUserProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadUserProfile(session.user.id);
      else {
        setSettings(DEFAULT_SETTINGS);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Load User Profile from Supabase
  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found", might be new user
        console.error('Error fetching profile:', error);
      }

      if (data) {
        setSettings(prev => ({
          ...prev,
          userId: userId,
          email: session?.user.email,
          businessName: data.business_name || '',
          fbAccessToken: data.fb_access_token || '',
          adAccountId: data.ad_account_id || '',
          fbAppId: data.fb_app_id || '',
          apiKey: decryptKey(data.api_key_encrypted), // Decrypt on load
          selectedAiProvider: (data.selected_ai_provider as AiProvider) || AiProvider.CLAUDE,
          selectedModel: data.selected_model || 'claude-3-5-sonnet-20241022',
          dashboardViewMode: data.dashboard_view_mode || undefined,
          isConnected: !!(data.fb_access_token && data.ad_account_id)
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 3. Update Settings (Save to Supabase)
  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    // Update Local State first for UI responsiveness
    setSettings(prev => ({ ...prev, ...newSettings }));

    if (!session?.user) return;

    // Prepare payload for DB
    const updates: any = {
      updated_at: new Date(),
    };

    if (newSettings.businessName !== undefined) updates.business_name = newSettings.businessName;
    if (newSettings.fbAccessToken !== undefined) updates.fb_access_token = newSettings.fbAccessToken;
    if (newSettings.adAccountId !== undefined) updates.ad_account_id = newSettings.adAccountId;
    if (newSettings.fbAppId !== undefined) updates.fb_app_id = newSettings.fbAppId;
    if (newSettings.selectedAiProvider !== undefined) updates.selected_ai_provider = newSettings.selectedAiProvider;
    if (newSettings.selectedModel !== undefined) updates.selected_model = newSettings.selectedModel;
    if (newSettings.dashboardViewMode !== undefined) updates.dashboard_view_mode = newSettings.dashboardViewMode;
    
    // Encrypt Key before saving if changed
    if (newSettings.apiKey !== undefined) {
        updates.api_key_encrypted = encryptKey(newSettings.apiKey);
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: session.user.id, ...updates });

      if (error) throw error;
    } catch (e) {
      console.error("Failed to save settings to DB:", e);
    }
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
    if (!session) {
      return <Navigate to="/login" replace />;
    }
    // If logged in to SaaS but not connected to Meta, go to Connect
    if (!settings.isConnected) {
       // Allow access to Connect page
       return <Navigate to="/connect" replace />; 
    }
    return <>{children}</>;
  };

  return (
    <AppContext.Provider value={{ settings, updateSettings, session, loading }}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route path="/connect" element={
            session ? <ConnectPage /> : <Navigate to="/login" replace />
          } />
          
          <Route path="/" element={
            session ? (
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