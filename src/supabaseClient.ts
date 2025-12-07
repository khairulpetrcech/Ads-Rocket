import { createClient } from '@supabase/supabase-js';

// Helper to safely access Environment Variables
// Handles cases where import.meta.env might be undefined during certain build steps
const getEnv = (key: string) => {
    try {
        // Check if import.meta exists and has .env property
        if (import.meta && (import.meta as any).env) {
            return (import.meta as any).env[key];
        }
    } catch (e) {
        // Ignore errors
    }
    return undefined;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase Credentials! App will not function correctly. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Simple Client-Side Encryption Helper
// In a real high-security app, keys should be managed via Vault or Backend Proxy.
// This prevents casual database readers from seeing keys in plain text.
export const encryptKey = (text: string): string => {
    if (!text) return '';
    try {
        // Simple Base64 obfuscation with a salt prefix
        // Enough to hide from casual DB view, but allow client to decrypt for API calls
        return 'ENCv1_' + btoa(text).split('').reverse().join(''); 
    } catch (e) { return text; }
};

export const decryptKey = (cipher: string): string => {
    if (!cipher) return '';
    if (cipher.startsWith('ENCv1_')) {
        try {
            return atob(cipher.substring(6).split('').reverse().join(''));
        } catch (e) { return cipher; }
    }
    return cipher; // Return as is if not encrypted
};