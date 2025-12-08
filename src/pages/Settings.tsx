
import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../App';
import { AiProvider } from '../types';
import { Save, Key, Shield, Info, RefreshCw, Server, Eye, EyeOff, Download, Upload, FileJson, CheckCircle, AlertTriangle } from 'lucide-react';
import { getAvailableModels } from '../services/aiService';

const Settings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [importStatus, setImportStatus] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effect to load available models when Provider or API Key changes
  useEffect(() => {
    const fetchModels = async () => {
      if (localSettings.selectedAiProvider === AiProvider.FREE) {
        setAvailableModels([]);
        return;
      }
      
      setLoadingModels(true);
      // Fetch models using the local key if present
      const models = await getAvailableModels(
        localSettings.selectedAiProvider, 
        localSettings.apiKey
      );
      setAvailableModels(models);
      
      // If current selected model isn't in the new list, default to first available
      if (models.length > 0 && !models.includes(localSettings.selectedModel)) {
        setLocalSettings(prev => ({ ...prev, selectedModel: models[0] }));
      }
      
      setLoadingModels(false);
    };

    // Debounce model fetching when typing API key
    const timeoutId = setTimeout(() => {
        fetchModels();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [localSettings.selectedAiProvider, localSettings.apiKey]);

  const handleSave = () => {
    updateSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // --- BACKUP & RESTORE LOGIC ---

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

              // Restore Data
              if (json.settings) localStorage.setItem('ar_settings', json.settings);
              if (json.auth) localStorage.setItem('ar_auth', json.auth);
              if (json.templates) localStorage.setItem('ar_templates', json.templates);
              if (json.comment_templates) localStorage.setItem('ar_comment_templates', json.comment_templates);
              if (json.published_comments) localStorage.setItem('ar_published_comments', json.published_comments);

              setImportStatus({ msg: 'Data restored successfully! Reloading...', type: 'success' });
              
              // Reload to apply changes
              setTimeout(() => {
                  window.location.reload();
              }, 1500);

          } catch (err) {
              setImportStatus({ msg: 'Failed to restore data. Invalid file.', type: 'error' });
          }
      };
      reader.readAsText(file);
      // Reset input
      e.target.value = '';
  };

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <h1 className="text-2xl font-bold text-white mb-8">Settings & Configuration</h1>

      <div className="space-y-6">
        
        {/* Account Section */}
        <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700 shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield size={20} className="text-indigo-400"/> Account Status
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Business Name</label>
              <input 
                type="text" 
                value={localSettings.businessName}
                readOnly
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-300 focus:outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Connection</label>
              <div className="w-full bg-green-900/20 border border-green-800 rounded-lg px-4 py-2 text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Meta Ads API Connected
              </div>
            </div>
          </div>
        </div>

        {/* Data Management (Backup/Restore) */}
        <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700 shadow-sm">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FileJson size={20} className="text-indigo-400"/> Data Management (Local PC)
            </h2>
            <div className="bg-slate-800/50 p-4 rounded-lg mb-4 text-sm text-slate-400">
                <p>Save all your settings, API keys, and templates to a file on your computer. You can use this file to restore your data later.</p>
            </div>
            
            <div className="flex gap-4">
                <button 
                    onClick={handleExportData}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
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
                        className="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <Upload size={18} /> Restore Data (Import)
                    </button>
                </div>
            </div>
            
            {importStatus && (
                <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${importStatus.type === 'success' ? 'bg-green-900/20 text-green-400 border border-green-800' : 'bg-red-900/20 text-red-400 border border-red-800'}`}>
                    {importStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                    {importStatus.msg}
                </div>
            )}
        </div>

        {/* AI Configuration */}
        <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700 shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Key size={20} className="text-indigo-400"/> AI Intelligence
          </h2>
          
          <div className="bg-indigo-900/20 border border-indigo-900/50 p-4 rounded-lg mb-6 flex items-start gap-3">
            <Info className="text-indigo-400 flex-shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-indigo-200">
                Configure your AI Provider. You can enter your own API Key to use your personal quota. If left blank, the system will attempt to use the default environment configuration (if available).
            </p>
          </div>

          <div className="space-y-6">
            
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Analysis Provider</label>
              <select 
                value={localSettings.selectedAiProvider}
                onChange={(e) => setLocalSettings({...localSettings, selectedAiProvider: e.target.value as AiProvider})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              >
                <option value={AiProvider.CLAUDE}>Anthropic Claude</option>
                <option value={AiProvider.OPENAI}>OpenAI (GPT-4)</option>
                <option value={AiProvider.OPENROUTER}>OpenRouter</option>
                <option value={AiProvider.GEMINI}>Google Gemini</option>
                <option value={AiProvider.FREE}>System Default (Simulation)</option>
              </select>
            </div>

            {/* API Key Input */}
            {localSettings.selectedAiProvider !== AiProvider.FREE && (
                <div className="animate-fadeIn">
                    <label className="block text-sm font-medium text-slate-400 mb-2">API Key</label>
                    <div className="relative">
                        <Key className="absolute left-3 top-3.5 text-slate-500" size={18} />
                        <input 
                            type={showKey ? "text" : "password"}
                            value={localSettings.apiKey || ''}
                            onChange={(e) => setLocalSettings({...localSettings, apiKey: e.target.value})}
                            placeholder={`Enter your ${localSettings.selectedAiProvider} API Key`}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-12 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder-slate-600"
                        />
                        <button 
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-3 text-slate-500 hover:text-white"
                        >
                            {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                        Your key is stored locally in your browser and used only for requests to the provider.
                    </p>
                </div>
            )}

            {/* Model Version Selector */}
            {localSettings.selectedAiProvider !== AiProvider.FREE && (
                <div className="space-y-6 animate-fadeIn">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2 flex justify-between items-center">
                            <span>Model Version</span>
                            {loadingModels && <span className="text-xs text-indigo-400 flex items-center gap-1"><RefreshCw size={12} className="animate-spin"/> Fetching...</span>}
                        </label>
                        <div className="relative">
                            <Server className="absolute left-3 top-3.5 text-slate-500" size={18} />
                            <select 
                                value={localSettings.selectedModel}
                                onChange={(e) => setLocalSettings({...localSettings, selectedModel: e.target.value})}
                                disabled={loadingModels || availableModels.length === 0}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                            >
                                {availableModels.length > 0 ? (
                                    availableModels.map(model => (
                                        <option key={model} value={model}>{model}</option>
                                    ))
                                ) : (
                                    <option value="">{loadingModels ? 'Loading available models...' : 'Enter API Key to load models'}</option>
                                )}
                            </select>
                            <div className="absolute right-4 top-4 pointer-events-none">
                                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                </div>
            )}

          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-indigo-900/40 hover:scale-[1.02]"
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
