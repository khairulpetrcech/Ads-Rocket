/**
 * API endpoint to store/retrieve comment history (per-ad comment counts) in Supabase.
 * GET: Load comment history for a user
 * POST: Increment comment count for a specific ad
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFcvUHAg6IVFjQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ========== GET: Load Comment History ==========
    if (req.method === 'GET') {
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

    // ========== POST: Save/Update Comment History ==========
    if (req.method === 'POST') {
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

    return res.status(405).json({ error: 'Method not allowed' });
}
