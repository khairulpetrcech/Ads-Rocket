/**
 * Consolidated Admin API
 * Handles: users, campaigns
 * 
 * Usage:
 * GET /api/admin-api?action=users
 * GET /api/admin-api?action=campaigns&userId=xxx&limit=50&offset=0
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

    const { action } = req.query;

    try {
        switch (action) {
            case 'users':
                return handleGetUsers(req, res);
            case 'campaigns':
                return handleGetCampaigns(req, res);
            default:
                return res.status(400).json({ error: 'Invalid action. Use: users or campaigns' });
        }
    } catch (error: any) {
        console.error('[Admin API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Get all users
async function handleGetUsers(req: any, res: any) {
    console.log('Admin API: Fetching users from tracked_users table...');

    const result = await supabase
        .from('tracked_users')
        .select('*')
        .order('id', { ascending: false });

    if (result.error) {
        console.error('Supabase error fetching users:', result.error);
        return res.status(200).json({
            users: [],
            total: 0,
            debug: { error: result.error.message, code: result.error.code }
        });
    }

    // Get campaign counts per user
    const { data: counts } = await supabase.from('tracked_campaigns').select('fb_user_id');

    const campaignCounts: Record<string, number> = {};
    if (counts) {
        counts.forEach((c: any) => {
            campaignCounts[c.fb_user_id] = (campaignCounts[c.fb_user_id] || 0) + 1;
        });
    }

    const formattedUsers = (result.data || []).map((u: any) => ({
        fbId: u.fb_id || '',
        fbName: u.fb_name || 'Unknown User',
        profilePicture: u.profile_picture || '',
        connectedAt: u.created_at || new Date().toISOString(),
        tokenExpiresAt: u.token_expires_at || null,
        adAccountId: u.ad_account_id || '',
        adAccountName: u.ad_account_name || '',
        lastActive: u.last_active || u.created_at || new Date().toISOString(),
        campaignCount: campaignCounts[u.fb_id] || 0
    }));

    return res.status(200).json({ users: formattedUsers, total: formattedUsers.length });
}

// Get all campaigns
async function handleGetCampaigns(req: any, res: any) {
    const { userId, limit = '50', offset = '0' } = req.query;

    console.log('Admin API: Fetching campaigns from tracked_campaigns table...');

    let query = supabase
        .from('tracked_campaigns')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

    if (userId) {
        query = query.eq('fb_user_id', userId);
    }

    const start = parseInt(offset as string);
    const end = start + parseInt(limit as string) - 1;
    query = query.range(start, end);

    const { data: campaigns, error, count } = await query;

    if (error) {
        console.error('Supabase error fetching campaigns:', error);
        return res.status(200).json({
            campaigns: [],
            total: 0,
            hasMore: false,
            debug: { error: error.message, code: error.code }
        });
    }

    const formattedCampaigns = (campaigns || []).map((c: any) => ({
        id: c.id,
        fbUserId: c.fb_user_id,
        fbUserName: c.fb_user_name,
        campaignName: c.campaign_name,
        objective: c.objective,
        mediaType: c.media_type,
        adAccountId: c.ad_account_id,
        createdAt: c.created_at
    }));

    return res.status(200).json({
        campaigns: formattedCampaigns,
        total: count || 0,
        hasMore: (start + formattedCampaigns.length) < (count || 0)
    });
}
