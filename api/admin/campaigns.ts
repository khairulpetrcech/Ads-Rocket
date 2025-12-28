/**
 * Admin API to get all campaigns.
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
        // Get query params for filtering
        const { userId, limit = '50', offset = '0' } = req.query;

        console.log('Admin API: Fetching campaigns from tracked_campaigns table...');

        let query = supabase
            .from('tracked_campaigns')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        // Filter by userId if provided
        if (userId) {
            query = query.eq('fb_user_id', userId);
        }

        // Apply pagination
        const start = parseInt(offset as string);
        const end = start + parseInt(limit as string) - 1;
        query = query.range(start, end);

        const { data: campaigns, error, count } = await query;

        if (error) {
            console.error('Supabase error fetching campaigns:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });

            // Always return 200 with empty campaigns and debug info
            return res.status(200).json({
                campaigns: [],
                total: 0,
                hasMore: false,
                debug: {
                    error: error.message,
                    code: error.code,
                    hint: error.hint,
                    details: error.details
                }
            });
        }

        console.log(`Admin API: Found ${campaigns?.length || 0} campaigns`);

        // Map to expected format
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

    } catch (error: any) {
        console.error('Get Campaigns Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
