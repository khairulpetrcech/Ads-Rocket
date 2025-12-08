// This file is deprecated as Supabase dependencies are removed.
// Utility functions for local encryption are moved to src/utils.ts or kept here as helpers.

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
