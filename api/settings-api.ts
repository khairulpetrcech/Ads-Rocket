import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFczvHAg6IVFjQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action } = req.query;

    // ========== COMMENT TEMPLATES ==========
    if (action === 'comment-templates') {
        if (req.method === 'GET') {
            const { fbId } = req.query;
            if (!fbId) return res.status(400).json({ error: 'Missing fbId parameter' });
            try {
                const { data, error } = await supabase.from('comment_templates').select('*').eq('fb_id', fbId).order('created_at', { ascending: false });
                if (error) return res.status(500).json({ error: error.message });
                const templates = (data || []).map((row: any) => ({ id: row.id, name: row.name, items: row.items || [], created_at: row.created_at }));
                return res.status(200).json({ templates });
            } catch (error: any) { return res.status(500).json({ error: error.message || 'Internal server error' }); }
        }

        if (req.method === 'POST') {
            const { fbId, template } = req.body;
            if (!fbId) return res.status(400).json({ error: 'Missing fbId in request body' });
            if (!template || !template.name || !template.items) return res.status(400).json({ error: 'Invalid template data' });
            try {
                const now = new Date().toISOString();
                const { data: existing } = await supabase.from('comment_templates').select('id').eq('fb_id', fbId).eq('name', template.name).single();
                let data, error;
                if (existing) {
                    const result = await supabase.from('comment_templates').update({ items: template.items, created_at: now }).eq('id', existing.id).select().single();
                    data = result.data; error = result.error;
                } else {
                    const result = await supabase.from('comment_templates').insert({ fb_id: fbId, name: template.name, items: template.items, created_at: now }).select().single();
                    data = result.data; error = result.error;
                }
                if (error) return res.status(500).json({ error: error.message });
                return res.status(200).json({ success: true, template: { id: data.id, name: data.name, items: data.items, created_at: data.created_at } });
            } catch (error: any) { return res.status(500).json({ error: error.message || 'Unknown error' }); }
        }

        if (req.method === 'DELETE') {
            const { fbId, templateId } = req.query;
            if (!fbId || !templateId) return res.status(400).json({ error: 'Missing fbId or templateId parameter' });
            try {
                const { error } = await supabase.from('comment_templates').delete().eq('id', templateId).eq('fb_id', fbId);
                if (error) return res.status(500).json({ error: error.message });
                return res.status(200).json({ success: true });
            } catch (error: any) { return res.status(500).json({ error: error.message || 'Unknown error' }); }
        }
    }

    // ========== PRESETS ==========
    if (action === 'presets') {
        if (req.method === 'GET') {
            const { fbId } = req.query;
            if (!fbId) return res.status(400).json({ error: 'Missing fbId parameter' });
            try {
                const { data, error } = await supabase.from('text_presets').select('*').eq('fb_id', fbId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
                if (error) return res.status(500).json({ error: error.message });
                if (!data) return res.status(200).json({ primaryTexts: [], primaryTextNames: [], headlines: [], headlineNames: [], adTemplates: [] });
                return res.status(200).json({ primaryTexts: data.primary_texts || [], primaryTextNames: data.primary_text_names || [], headlines: data.headlines || [], headlineNames: data.headline_names || [], adTemplates: data.ad_templates || [] });
            } catch (error: any) { return res.status(500).json({ error: error.message || 'Internal server error' }); }
        }

        if (req.method === 'POST') {
            const { fbId, primaryTexts, primaryTextNames, headlines, headlineNames, adTemplates } = req.body;
            if (!fbId) return res.status(400).json({ error: 'Missing fbId in request body' });
            try {
                const now = new Date().toISOString();
                const rowData = { fb_id: fbId, primary_texts: primaryTexts || [], primary_text_names: primaryTextNames || [], headlines: headlines || [], headline_names: headlineNames || [], ad_templates: adTemplates || [], updated_at: now };
                const { data: existing, error: selectError } = await supabase.from('text_presets').select('fb_id').eq('fb_id', fbId).maybeSingle();
                if (selectError) return res.status(500).json({ error: 'Database read error', details: selectError.message });
                let saveError: any = null;
                if (existing) {
                    const { error: updateError } = await supabase.from('text_presets').update(rowData).eq('fb_id', fbId);
                    saveError = updateError;
                } else {
                    const { error: insertError } = await supabase.from('text_presets').insert(rowData);
                    saveError = insertError;
                }
                if (saveError) {
                    const isMissingColumn = saveError.code === '42703' || saveError.code === 'PGRST204' || saveError.message?.includes('column "ad_templates" does not exist');
                    if (isMissingColumn) return res.status(500).json({ error: 'Database schema outdated', details: 'Run ALTER TABLE text_presets ADD COLUMN IF NOT EXISTS ad_templates JSONB DEFAULT \'[]\'::jsonb;' });
                    return res.status(500).json({ error: 'Supabase Save Error', details: saveError.message, code: saveError.code });
                }
                return res.status(200).json({ success: true, message: 'Presets saved successfully' });
            } catch (error: any) { return res.status(500).json({ error: 'Internal Handler Error', details: error.message || 'Unknown error' }); }
        }
    }

    return res.status(404).json({ error: 'Not found or invalid action' });
}
