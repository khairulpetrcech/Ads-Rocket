import { createClient } from '@supabase/supabase-js';

// Access Environment Variables (Vite uses import.meta.env)
// For Vercel, ensure these are set in Project Settings > Environment Variables
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase Credentials! App will not function correctly.");
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