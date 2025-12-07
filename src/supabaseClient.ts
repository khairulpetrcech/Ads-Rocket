import { createClient } from '@supabase/supabase-js';

// Helper to safely access Environment Variables
// Handles cases where import.meta.env might be undefined during certain build steps or runtime
const getEnv = (key: string) => {
    let value = '';
    try {
        // Check if import.meta exists and has env property
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            // @ts-ignore
            value = import.meta.env[key] || '';
        }
    } catch (e) {
        // Ignore errors during access
    }

    // Fallback to process.env (Node/Vercel Serverless) if import.meta failed
    if (!value) {
        try {
            if (typeof process !== 'undefined' && process.env) {
                value = process.env[key] || '';
            }
        } catch (e) {
            // Ignore
        }
    }
    return value;
};

// --- PLACEHOLDER FOR HARDCODED KEYS (Optional) ---
// If you provide keys, I will put them here.
// const HARDCODED_URL = "https://your-project.supabase.co";
// const HARDCODED_KEY = "eyJh...";

const supabaseUrl = getEnv('VITE_SUPABASE_URL'); // || HARDCODED_URL
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY'); // || HARDCODED_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase Credentials! App will not function correctly.");
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');

// Simple Client-Side Encryption Helper
export const encryptKey = (text: string): string => {
    if (!text) return '';
    try {
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
    return cipher; 
};