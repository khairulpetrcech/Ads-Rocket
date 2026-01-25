/**
 * API endpoint to store/retrieve text presets in Supabase.
 * GET: Load presets for a user
 * POST: Save presets for a user
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
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
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

            // Check if adTemplates exists in schema or just try-catch it
            // For now, we'll try the full upsert.
            const { data, error } = await supabase
                .from('text_presets')
                .upsert({
                    fb_id: fbId,
                    primary_texts: primaryTexts || [],
                    primary_text_names: primaryTextNames || [],
                    headlines: headlines || [],
                    headline_names: headlineNames || [],
                    ad_templates: adTemplates || [],
                    updated_at: now
                }, {
                    onConflict: 'fb_id',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error('Supabase POST error:', error);

                // Special handling for missing column error (PGRST204 or explicit message)
                const isMissingColumn =
                    error.code === 'PGRST204' ||
                    error.message.includes('column "ad_templates" does not exist') ||
                    (error.message.includes('ad_templates') && error.message.includes('schema cache'));

                if (isMissingColumn) {
                    console.log('[PresetsAPI] ad_templates column missing. Falling back to basic save.');
                    const { error: fallbackError } = await supabase
                        .from('text_presets')
                        .upsert({
                            fb_id: fbId,
                            primary_texts: primaryTexts || [],
                            primary_text_names: primaryTextNames || [],
                            headlines: headlines || [],
                            headline_names: headlineNames || [],
                            updated_at: now
                        }, {
                            onConflict: 'fb_id',
                            ignoreDuplicates: false
                        });

                    if (fallbackError) {
                        return res.status(500).json({
                            error: 'Database constraint error',
                            details: fallbackError.message
                        });
                    }

                    return res.status(200).json({
                        success: true,
                        warning: 'Ad Templates saved locally only (DB column missing)',
                        message: 'Basic presets saved'
                    });
                }

                return res.status(500).json({
                    error: 'Supabase Error',
                    details: error.message,
                    code: error.code
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
