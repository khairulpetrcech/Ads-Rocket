
// This file is kept to export utility functions used in App.tsx
// Supabase dependencies have been removed.

export const supabase = null; // Export null to prevent breaking imports temporarily, though it should not be used.

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
