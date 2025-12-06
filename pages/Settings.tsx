
import React, { useState, useEffect } from 'react';
import { useSettings } from '../App';
import { AiProvider } from '../types';
import { Save, Key, Shield, Info, RefreshCw, Server, Eye, EyeOff } from 'lucide-react';
import { getAvailableModels } from '../services/aiService';

const Settings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);

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

  return (
    <div className="max-w-3xl mx-auto">
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