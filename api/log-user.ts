/**
 * API endpoint to log user when they connect their FB account.
 * Uses Supabase for storage.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFczvHAg6IVFjQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            fbId,
            fbName,
            profilePicture,
            tokenExpiresAt,
            adAccountId,
            adAccountName
        } = req.body;

        if (!fbId || !fbName) {
            return res.status(400).json({ error: 'Missing required fields: fbId, fbName' });
        }

        const now = new Date().toISOString();

        // Upsert user (insert or update if exists)
        const { data, error } = await supabase
            .from('tracked_users')
            .upsert({
                fb_id: fbId,
                fb_name: fbName,
                profile_picture: profilePicture || '',
                token_expires_at: tokenExpiresAt || null,
                ad_account_id: adAccountId || '',
                ad_account_name: adAccountName || '',
                last_active: now,
                updated_at: now
            }, {
                onConflict: 'fb_id',
                ignoreDuplicates: false
            })
            .select();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log(`User logged: ${fbName} (${fbId})`);

        return res.status(200).json({
            success: true,
            message: 'User logged successfully'
        });

    } catch (error: any) {
        console.error('Log User Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
