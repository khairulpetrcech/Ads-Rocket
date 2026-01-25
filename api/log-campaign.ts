/**
 * API endpoint to log campaign creation.
 * Uses Supabase for storage.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFcvUHAg6IVFjQ';

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
            fbUserId,
            fbUserName,
            campaignName,
            objective,
            mediaType,
            adAccountId
        } = req.body;

        if (!fbUserId || !campaignName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const now = new Date().toISOString();

        // Insert campaign
        const { data, error } = await supabase
            .from('tracked_campaigns')
            .insert({
                fb_user_id: fbUserId,
                fb_user_name: fbUserName || 'Unknown',
                campaign_name: campaignName,
                objective: objective || 'OUTCOME_SALES',
                media_type: mediaType || 'IMAGE',
                ad_account_id: adAccountId || '',
                created_at: now
            })
            .select();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Update user's last_active
        await supabase
            .from('tracked_users')
            .update({ last_active: now })
            .eq('fb_id', fbUserId);

        console.log(`Campaign logged: ${campaignName} by ${fbUserName}`);

        return res.status(200).json({
            success: true,
            message: 'Campaign logged successfully',
            campaignId: data?.[0]?.id
        });

    } catch (error: any) {
        console.error('Log Campaign Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
