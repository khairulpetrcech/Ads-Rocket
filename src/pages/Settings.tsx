import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../App';
import { AiProvider } from '../types';
import { Save, Key, Shield, Info, RefreshCw, Server, Eye, EyeOff, Download, Upload, FileJson, CheckCircle, AlertTriangle, Send } from 'lucide-react';
import { getAvailableModels } from '../services/aiService';
import { getPages, getPixels } from '../services/metaService';

const Settings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [importStatus, setImportStatus] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
  const [telegramTestStatus, setTelegramTestStatus] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fbPages, setFbPages] = useState<{ id: string; name: string }[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [fbPixels, setFbPixels] = useState<{ id: string; name: string }[]>([]);
  const [loadingPixels, setLoadingPixels] = useState(false);

  useEffect(() => {
    const fetchModels = async () => {
      if (localSettings.selectedAiProvider === AiProvider.FREE) {
        setAvailableModels([]);
        return;
      }
      setLoadingModels(true);
      const models = await getAvailableModels(
        localSettings.selectedAiProvider,
        localSettings.apiKey
      );
      setAvailableModels(models);
      if (models.length > 0 && !models.includes(localSettings.selectedModel)) {
        setLocalSettings(prev => ({ ...prev, selectedModel: models[0] }));
      }
      setLoadingModels(false);
    };

    const timeoutId = setTimeout(() => {
      fetchModels();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [localSettings.selectedAiProvider, localSettings.apiKey]);

  // Fetch Facebook Pages for dropdown
  useEffect(() => {
    const fetchPages = async () => {
      if (!settings.fbAccessToken || settings.fbAccessToken === 'dummy_token') return;
      setLoadingPages(true);
      try {
        const pagesData = await getPages(settings.fbAccessToken);
        setFbPages(pagesData.map((p: any) => ({ id: p.id, name: p.name })));
      } catch (err) {
        console.error('Failed to fetch pages:', err);
      }
      setLoadingPages(false);
    };
    fetchPages();
  }, [settings.fbAccessToken]);

  // Fetch Facebook Pixels for dropdown
  useEffect(() => {
    const fetchPixels = async () => {
      if (!settings.fbAccessToken || settings.fbAccessToken === 'dummy_token' || !settings.adAccountId) return;
      setLoadingPixels(true);
      try {
        const pixelsData = await getPixels(settings.adAccountId, settings.fbAccessToken);
        setFbPixels(pixelsData.map((p: any) => ({ id: p.id, name: p.name })));
      } catch (err) {
        console.error('Failed to fetch pixels:', err);
      }
      setLoadingPixels(false);
    };
    fetchPixels();
  }, [settings.fbAccessToken, settings.adAccountId]);

  const handleSave = async () => {
    const cleanSettings = { ...localSettings };
    if (cleanSettings.apiKey) {
      cleanSettings.apiKey = cleanSettings.apiKey.trim();
    }
    setLocalSettings(cleanSettings);
    updateSettings(cleanSettings);

    // Also save Telegram settings to Supabase for daily cron
    if (cleanSettings.telegramBotToken && cleanSettings.telegramChatId) {
      try {
        await fetch('/api/save-telegram-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fbId: settings.fbAppId || 'default',
            fbAccessToken: settings.fbAccessToken,
            adAccountId: settings.adAccountId,
            telegramBotToken: cleanSettings.telegramBotToken,
            telegramChatId: cleanSettings.telegramChatId,
            enabled: true
          })
        });
        console.log('Telegram settings saved to Supabase for daily reports');
      } catch (err) {
        console.warn('Failed to save Telegram settings for daily reports:', err);
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTestTelegram = async () => {
    if (!localSettings.telegramBotToken || !localSettings.telegramChatId) {
      setTelegramTestStatus({ msg: 'Please enter Bot Token and Chat ID', type: 'error' });
      return;
    }

    setTestingTelegram(true);
    setTelegramTestStatus(null);

    try {
      const response = await fetch('/api/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: localSettings.telegramChatId,
          botToken: localSettings.telegramBotToken,
          message: '✅ *Ads Rocket Connected!*\n\nYour Telegram integration is working correctly.'
        })
      });

      const data = await response.json();

      if (data.success) {
        setTelegramTestStatus({ msg: 'Test message sent! Check your Telegram.', type: 'success' });
      } else {
        setTelegramTestStatus({ msg: data.error || 'Failed to send message', type: 'error' });
      }
    } catch (err: any) {
      setTelegramTestStatus({ msg: err.message || 'Connection failed', type: 'error' });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleExportData = () => {
    const dataToExport = {
      settings: localStorage.getItem('ar_settings'),
      auth: localStorage.getItem('ar_auth'),
      templates: localStorage.getItem('ar_templates'),
      comment_templates: localStorage.getItem('ar_comment_templates'),
      published_comments: localStorage.getItem('ar_published_comments'),
      exportDate: new Date().toISOString(),
      version: '2.0'
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AdsRocket_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.version) throw new Error("Invalid backup file format.");
        if (json.settings) localStorage.setItem('ar_settings', json.settings);
        if (json.auth) localStorage.setItem('ar_auth', json.auth);
        if (json.templates) localStorage.setItem('ar_templates', json.templates);
        if (json.comment_templates) localStorage.setItem('ar_comment_templates', json.comment_templates);
        if (json.published_comments) localStorage.setItem('ar_published_comments', json.published_comments);
        setImportStatus({ msg: 'Data restored successfully! Reloading...', type: 'success' });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        setImportStatus({ msg: 'Failed to restore data. Invalid file.', type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-3xl mx-auto pb-20 relative">
      {/* Toast Notification */}
      {saved && (
        <div className="fixed top-6 right-6 z-50 animate-slideIn">
          <div className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 transform transition-all duration-300">
            <CheckCircle size={20} />
            <span className="font-semibold">Settings Saved!</span>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800 mb-8">Settings & Configuration</h1>

      <div className="space-y-6">

        {/* Account Status - Hidden for now
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Shield size={20} className="text-indigo-600" /> Account Status
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Business Name</label>
              <input
                type="text"
                value={localSettings.businessName}
                readOnly
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:outline-none cursor-not-allowed font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Connection</label>
              <div className="w-full bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-green-700 flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Meta Ads API Connected
              </div>
            </div>
          </div>
        </div>
        */}

        {/* Rapid Creator Configuration */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Server size={20} className="text-indigo-600" /> Rapid Creator Defaults
          </h2>
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-6 flex items-start gap-3">
            <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-blue-900">
              Set default website URL, Facebook Page, and Pixel for Rapid Campaign. These will be pre-filled when you create new ads.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Default Website URL</label>
              <input
                type="url"
                value={localSettings.defaultWebsiteUrl || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, defaultWebsiteUrl: e.target.value })}
                placeholder="https://example.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1 flex items-center gap-2">
                Default Facebook Page
                {loadingPages && <RefreshCw size={12} className="animate-spin text-blue-500" />}
              </label>
              <select
                value={localSettings.defaultPageId || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, defaultPageId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="">Select a page...</option>
                {fbPages.map(page => (
                  <option key={page.id} value={page.id}>{page.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1 flex items-center gap-2">
                Default Pixel
                {loadingPixels && <RefreshCw size={12} className="animate-spin text-blue-500" />}
              </label>
              <select
                value={localSettings.defaultPixelId || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, defaultPixelId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="">Select a pixel...</option>
                {fbPixels.map(pixel => (
                  <option key={pixel.id} value={pixel.id}>{pixel.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Data Management (Backup/Restore) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <FileJson size={20} className="text-indigo-600" /> Data Management
          </h2>
          <div className="bg-slate-50 p-4 rounded-lg mb-4 text-sm text-slate-600 border border-slate-100">
            <p>Save all your settings, API keys, and templates to a file on your computer. You can use this file to restore your data later.</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleExportData}
              className="flex-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium shadow-sm"
            >
              <Download size={18} /> Backup Data (Download)
            </button>

            <div className="flex-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
              <button
                onClick={handleImportClick}
                className="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium shadow-sm"
              >
                <Upload size={18} /> Restore Data (Import)
              </button>
            </div>
          </div>

          {importStatus && (
            <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 font-medium ${importStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {importStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
              {importStatus.msg}
            </div>
          )}
        </div>

        {/* Telegram Integration */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Send size={20} className="text-blue-500" /> Telegram Integration
          </h2>
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-6 flex items-start gap-3">
            <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-blue-900">
              <p className="mb-2">Connect Telegram to receive AI analysis alerts for your winning ads.</p>
              <p className="text-blue-700">1. Chat <strong>@BotFather</strong> → /newbot → Get <strong>Bot Token</strong></p>
              <p className="text-blue-700">2. Chat <strong>@userinfobot</strong> → Get your <strong>Chat ID</strong></p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Bot Token</label>
              <div className="relative">
                <input
                  type={showTelegramToken ? "text" : "password"}
                  value={localSettings.telegramBotToken || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, telegramBotToken: e.target.value })}
                  placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pr-12 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowTelegramToken(!showTelegramToken)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showTelegramToken ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Chat ID</label>
              <input
                type="text"
                value={localSettings.telegramChatId || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, telegramChatId: e.target.value })}
                placeholder="123456789"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
              />
            </div>

            <button
              onClick={handleTestTelegram}
              disabled={testingTelegram}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
            >
              {testingTelegram ? (
                <><RefreshCw size={18} className="animate-spin" /> Testing...</>
              ) : (
                <><Send size={18} /> Test Connection</>
              )}
            </button>

            {telegramTestStatus && (
              <div className={`p-3 rounded-lg text-sm flex items-center gap-2 font-medium ${telegramTestStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {telegramTestStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                {telegramTestStatus.msg}
              </div>
            )}
          </div>
        </div>

        {/* AI Configuration - Hidden for now
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Key size={20} className="text-indigo-600" /> AI Intelligence
          </h2>
          ... AI section content hidden ...
        </div>
        */}

        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold transition-all shadow-md shadow-indigo-200 hover:shadow-lg transform hover:scale-[1.01]"
          >
            <Save size={18} />
            {saved ? 'Changes Saved!' : 'Save Configuration'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default Settings;