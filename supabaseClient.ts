import { createClient } from '@supabase/supabase-js';

// Safe environment access helper
const getEnv = (key: string) => {
  try {
    // Check for Vite's import.meta.env
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[key];
    }
  } catch (e) {
    // Ignore error
  }

  try {
    // Check for Node's process.env
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
  } catch (e) {
    // Ignore error
  }

  return undefined;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

// Mock client to prevent crashes if credentials are missing
const createMockClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: async () => ({ error: { message: "Supabase credentials not configured." } }),
    signOut: async () => ({ error: null }),
  },
  from: () => ({
    select: () => ({ single: async () => ({ data: null, error: null }) }),
    insert: () => ({ select: async () => ({ data: null, error: null }) }),
    upsert: async () => ({ error: null }),
    delete: () => ({ eq: async () => ({ error: null }) })
  })
} as any);

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : createMockClient();

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