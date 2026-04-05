/**
 * API endpoint to store/retrieve text presets in Supabase.
 * GET: Load presets for a user
 * POST: Save presets for a user
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFczvHAg6IVFjQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ========== GET: Load Presets ==========
    if (req.method === 'GET') {
        const { fbId } = req.query;

        if (!fbId) {
            return res.status(400).json({ error: 'Missing fbId parameter' });
        }

        try {
            const { data, error } = await supabase
                .from('text_presets')
                .select('*')
                .eq('fb_id', fbId)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error('Supabase GET error:', error);
                return res.status(500).json({ error: error.message });
            }

            // Return empty defaults if no data
            if (!data) {
                return res.status(200).json({
                    primaryTexts: [],
                    primaryTextNames: [],
                    headlines: [],
                    headlineNames: [],
                    adTemplates: []
                });
            }

            return res.status(200).json({
                primaryTexts: data.primary_texts || [],
                primaryTextNames: data.primary_text_names || [],
                headlines: data.headlines || [],
                headlineNames: data.headline_names || [],
                adTemplates: data.ad_templates || []
            });

        } catch (error: any) {
            console.error('Get Presets Error:', error);
            return res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }

    // ========== POST: Save Presets ==========
    if (req.method === 'POST') {
        const { fbId, primaryTexts, primaryTextNames, headlines, headlineNames, adTemplates } = req.body;

        if (!fbId) {
            return res.status(400).json({ error: 'Missing fbId in request body' });
        }

        try {
            const now = new Date().toISOString();

            // Log payload size for debugging
            const payloadSize = JSON.stringify(req.body).length;
            console.log(`[PresetsAPI] Saving settings for ${fbId}. Size: ${payloadSize} bytes`);

            const rowData = {
                fb_id: fbId,
                primary_texts: primaryTexts || [],
                primary_text_names: primaryTextNames || [],
                headlines: headlines || [],
                headline_names: headlineNames || [],
                ad_templates: adTemplates || [],
                updated_at: now
            };

            // Use select-then-update/insert to avoid dependency on unique constraint
            const { data: existing, error: selectError } = await supabase
                .from('text_presets')
                .select('fb_id')
                .eq('fb_id', fbId)
                .maybeSingle();

            if (selectError) {
                console.error('[PresetsAPI] Select error:', selectError);
                return res.status(500).json({ error: 'Database read error', details: selectError.message });
            }

            let saveError: any = null;

            if (existing) {
                // Row exists → UPDATE
                const { error: updateError } = await supabase
                    .from('text_presets')
                    .update(rowData)
                    .eq('fb_id', fbId);
                saveError = updateError;
            } else {
                // Row doesn't exist → INSERT
                const { error: insertError } = await supabase
                    .from('text_presets')
                    .insert(rowData);
                saveError = insertError;
            }

            if (saveError) {
                console.error('[PresetsAPI] Save error:', saveError);

                // Detect missing column errors: PostgreSQL error code 42703, or PGRST schema cache error
                const isMissingColumn =
                    saveError.code === '42703' ||
                    saveError.code === 'PGRST204' ||
                    saveError.message?.includes('column "ad_templates" does not exist') ||
                    (saveError.message?.includes('ad_templates') && saveError.message?.includes('schema cache'));

                if (isMissingColumn) {
                    console.error('[PresetsAPI] ad_templates column missing. Run this in Supabase SQL Editor:\nALTER TABLE text_presets ADD COLUMN IF NOT EXISTS ad_templates JSONB DEFAULT \'[]\'::jsonb;');
                    return res.status(500).json({
                        error: 'Database schema outdated — column ad_templates missing',
                        details: 'Run in Supabase SQL Editor: ALTER TABLE text_presets ADD COLUMN IF NOT EXISTS ad_templates JSONB DEFAULT \'[]\'::jsonb;'
                    });
                }

                return res.status(500).json({
                    error: 'Supabase Save Error',
                    details: saveError.message,
                    code: saveError.code
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Presets saved successfully'
            });

        } catch (error: any) {
            console.error('Save Presets Error:', error);
            return res.status(500).json({
                error: 'Internal Handler Error',
                details: error.message || 'Unknown error'
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
