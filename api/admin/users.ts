/**
 * Admin API to get all connected users.
 * Uses Supabase for storage.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFcvUHAg6IVFjQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rocket@admin2024';

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check admin authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get all users with campaign counts
        const { data: users, error } = await supabase
            .from('tracked_users')
            .select('*')
            .order('last_active', { ascending: false });

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Get campaign counts per user
        const { data: counts, error: countError } = await supabase
            .from('tracked_campaigns')
            .select('fb_user_id');

        const campaignCounts: Record<string, number> = {};
        if (counts) {
            counts.forEach((c: any) => {
                campaignCounts[c.fb_user_id] = (campaignCounts[c.fb_user_id] || 0) + 1;
            });
        }

        // Map to expected format
        const formattedUsers = (users || []).map((u: any) => ({
            fbId: u.fb_id,
            fbName: u.fb_name,
            profilePicture: u.profile_picture,
            connectedAt: u.created_at,
            tokenExpiresAt: u.token_expires_at,
            adAccountId: u.ad_account_id,
            adAccountName: u.ad_account_name,
            lastActive: u.last_active,
            campaignCount: campaignCounts[u.fb_id] || 0
        }));

        return res.status(200).json({
            users: formattedUsers,
            total: formattedUsers.length
        });

    } catch (error: any) {
        console.error('Get Users Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
