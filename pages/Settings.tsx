import React, { useState } from 'react';
import { useSettings } from '../App';
import { AiProvider } from '../types';
import { Save, Key, Shield } from 'lucide-react';

const Settings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const [saved, setSaved] = useState(false);

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
        <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield size={20} className="text-indigo-400"/> Account
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
              <label className="block text-sm font-medium text-slate-400 mb-1">Status</label>
              <div className="w-full bg-green-900/20 border border-green-800 rounded-lg px-4 py-2 text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Connected to Meta Ads
              </div>
            </div>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="bg-[#1e293b] p-6 rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Key size={20} className="text-indigo-400"/> AI Provider
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Choose your preferred AI brain. The application is pre-configured with secure API access.
          </p>

          <div className="space-y-6">
            
            {/* Provider Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Active Provider</label>
              <select 
                value={localSettings.selectedAiProvider}
                onChange={(e) => setLocalSettings({...localSettings, selectedAiProvider: e.target.value as AiProvider})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value={AiProvider.FREE}>System Default (Free / Simulated)</option>
                <option value={AiProvider.GEMINI}>Google Gemini (Recommended)</option>
                <option value={AiProvider.OPENAI}>OpenAI (GPT-4)</option>
                <option value={AiProvider.CLAUDE}>Anthropic Claude</option>
              </select>
            </div>

          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-indigo-900/40"
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