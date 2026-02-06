/**
 * API endpoint to store/retrieve comment templates in Supabase.
 * GET: Load templates for a user
 * POST: Save/Create template for a user
 * DELETE: Remove a template
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFcvUHAg6IVFjQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ========== GET: Load Comment Templates ==========
    if (req.method === 'GET') {
        const { fbId } = req.query;

        if (!fbId) {
            return res.status(400).json({ error: 'Missing fbId parameter' });
        }

        try {
            const { data, error } = await supabase
                .from('comment_templates')
                .select('*')
                .eq('fb_id', fbId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase GET error:', error);
                return res.status(500).json({ error: error.message });
            }

            // Transform to frontend format
            const templates = (data || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                items: row.items || [],
                created_at: row.created_at
            }));

            return res.status(200).json({ templates });

        } catch (error: any) {
            console.error('Get Comment Templates Error:', error);
            return res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }

    // ========== POST: Save Comment Template ==========
    if (req.method === 'POST') {
        const { fbId, template } = req.body;

        if (!fbId) {
            return res.status(400).json({ error: 'Missing fbId in request body' });
        }

        if (!template || !template.name || !template.items) {
            return res.status(400).json({ error: 'Invalid template data' });
        }

        try {
            const now = new Date().toISOString();

            // Log incoming request for debugging
            console.log(`[CommentTemplates API] POST request - fbId: ${fbId}, template name: ${template.name}, items count: ${template.items?.length || 0}`);

            // Check if template with same name already exists for this user
            const { data: existing } = await supabase
                .from('comment_templates')
                .select('id')
                .eq('fb_id', fbId)
                .eq('name', template.name)
                .single();

            let data, error;

            if (existing) {
                // Update existing template
                const result = await supabase
                    .from('comment_templates')
                    .update({
                        items: template.items,
                        created_at: now
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                data = result.data;
                error = result.error;
                console.log(`[CommentTemplates API] Updated existing template: ${existing.id}`);
            } else {
                // Insert new template
                const result = await supabase
                    .from('comment_templates')
                    .insert({
                        fb_id: fbId,
                        name: template.name,
                        items: template.items,
                        created_at: now
                    })
                    .select()
                    .single();
                data = result.data;
                error = result.error;
                console.log(`[CommentTemplates API] Created new template`);
            }

            if (error) {
                console.error('Supabase POST error:', error);
                return res.status(500).json({ error: error.message });
            }

            return res.status(200).json({
                success: true,
                template: {
                    id: data.id,
                    name: data.name,
                    items: data.items,
                    created_at: data.created_at
                }
            });

        } catch (error: any) {
            console.error('Save Comment Template Error:', error);
            return res.status(500).json({ error: error.message || 'Unknown error' });
        }
    }

    // ========== DELETE: Remove Comment Template ==========
    if (req.method === 'DELETE') {
        const { fbId, templateId } = req.query;

        if (!fbId || !templateId) {
            return res.status(400).json({ error: 'Missing fbId or templateId parameter' });
        }

        try {
            const { error } = await supabase
                .from('comment_templates')
                .delete()
                .eq('id', templateId)
                .eq('fb_id', fbId);

            if (error) {
                console.error('Supabase DELETE error:', error);
                return res.status(500).json({ error: error.message });
            }

            return res.status(200).json({ success: true });

        } catch (error: any) {
            console.error('Delete Comment Template Error:', error);
            return res.status(500).json({ error: error.message || 'Unknown error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
