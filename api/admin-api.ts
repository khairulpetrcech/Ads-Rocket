/**
 * Consolidated Admin API
 * Handles: users, campaigns, schedules, comment-history
 * 
 * Usage:
 * GET /api/admin-api?action=users
 * GET /api/admin-api?action=campaigns&userId=xxx&limit=50&offset=0
 * GET /api/admin-api?action=schedules
 * GET /api/admin-api?action=comment-history&fbId=xxx
 * GET /api/admin-api?action=telegram-jobs&fbId=xxx
 * POST /api/admin-api?action=comment-history-save (body: {fbId, adId?, history?})
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFczvHAg6IVFjQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rocket@admin2024';

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action } = req.query;

    // Comment history & Telegram Jobs actions don't require admin auth
    if (action === 'comment-history' || action === 'comment-history-save' || action === 'telegram-jobs') {
        try {
            if (action === 'comment-history') {
                return handleGetCommentHistory(req, res);
            }
            if (action === 'comment-history-save') {
                return handleSaveCommentHistory(req, res);
            }
            if (action === 'telegram-jobs') {
                return handleGetTelegramJobs(req, res);
            }
            return res.status(405).json({ error: 'Method not allowed for this action' });
        } catch (error: any) {
            console.error('[Admin API] Comment History Error:', error);
            return res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }

    // Admin-only actions below
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check admin authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        switch (action) {
            case 'users':
                return handleGetUsers(req, res);
            case 'campaigns':
                return handleGetCampaigns(req, res);
            case 'schedules':
                return handleGetSchedules(req, res);
            default:
                return res.status(400).json({ error: 'Invalid action. Use: users, campaigns, schedules, comment-history, or comment-history-save' });
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

// Get all analysis schedules (for debugging 8AM cron)
async function handleGetSchedules(req: any, res: any) {
    console.log('Admin API: Fetching analysis_schedules...');

    const { data: schedules, error } = await supabase
        .from('analysis_schedules')
        .select('*')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Supabase error fetching schedules:', error);
        return res.status(200).json({
            schedules: [],
            total: 0,
            debug: { error: error.message, code: error.code }
        });
    }

    const formattedSchedules = (schedules || []).map((s: any) => ({
        fbId: s.fb_id,
        adAccountId: s.ad_account_id,
        scheduleTime: s.schedule_time,
        isEnabled: s.is_enabled,
        telegramChatId: s.telegram_chat_id,
        hasBotToken: !!s.telegram_bot_token,
        hasFbToken: !!s.fb_access_token,
        updatedAt: s.updated_at
    }));

    return res.status(200).json({
        schedules: formattedSchedules,
        total: formattedSchedules.length
    });
}

// Get comment history for a user
async function handleGetCommentHistory(req: any, res: any) {
    const { fbId } = req.query;

    if (!fbId) {
        return res.status(400).json({ error: 'Missing fbId parameter' });
    }

    try {
        const { data, error } = await supabase
            .from('comment_history')
            .select('*')
            .eq('fb_id', fbId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Supabase GET comment_history error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Return empty map if no data
        if (!data) {
            return res.status(200).json({ history: {} });
        }

        return res.status(200).json({ history: data.history || {} });

    } catch (error: any) {
        console.error('Get Comment History Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Save/update comment history
async function handleSaveCommentHistory(req: any, res: any) {
    const { fbId, adId, history } = req.body;

    if (!fbId) {
        return res.status(400).json({ error: 'Missing fbId in request body' });
    }

    try {
        const now = new Date().toISOString();

        // If full history map is provided, upsert it directly
        if (history) {
            console.log(`[CommentHistory API] Saving full history for ${fbId}. Keys: ${Object.keys(history).length}`);

            const { error } = await supabase
                .from('comment_history')
                .upsert({
                    fb_id: fbId,
                    history: history,
                    updated_at: now
                }, {
                    onConflict: 'fb_id',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error('Supabase POST comment_history error:', error);
                return res.status(500).json({ error: error.message });
            }

            return res.status(200).json({ success: true });
        }

        // If adId is provided, increment that specific ad's count
        if (adId) {
            console.log(`[CommentHistory API] Incrementing count for ad ${adId} (user: ${fbId})`);

            // Get existing history
            const { data: existing } = await supabase
                .from('comment_history')
                .select('history')
                .eq('fb_id', fbId)
                .single();

            const currentHistory: Record<string, number> = existing?.history || {};
            currentHistory[adId] = (currentHistory[adId] || 0) + 1;

            const { error } = await supabase
                .from('comment_history')
                .upsert({
                    fb_id: fbId,
                    history: currentHistory,
                    updated_at: now
                }, {
                    onConflict: 'fb_id',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error('Supabase POST comment_history error:', error);
                return res.status(500).json({ error: error.message });
            }

            return res.status(200).json({
                success: true,
                count: currentHistory[adId]
            });
        }

        return res.status(400).json({ error: 'Missing adId or history in request body' });

    } catch (error: any) {
        console.error('Save Comment History Error:', error);
        return res.status(500).json({ error: error.message || 'Unknown error' });
    }
}

// Get telegram campaign jobs for a user
async function handleGetTelegramJobs(req: any, res: any) {
    const { fbId } = req.query;

    if (!fbId) {
        return res.status(400).json({ error: 'Missing fbId parameter' });
    }

    try {
        const { data: jobs, error } = await supabase
            .from('telegram_campaign_jobs')
            .select('*')
            .eq('fb_id', fbId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Supabase GET telegram_campaign_jobs error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ jobs: jobs || [] });

    } catch (error: any) {
        console.error('Get Telegram Jobs Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
