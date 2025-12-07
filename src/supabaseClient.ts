import { createClient } from '@supabase/supabase-js';

// Hardcoded Credentials to ensure immediate connection and avoid runtime errors
const supabaseUrl = "https://ztpedgagubjoiluagqzd.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFczvHAg6IVFjQ";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase Credentials! App will not function correctly.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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