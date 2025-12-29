import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFcvUHAg6IVFjQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Save or update user's Telegram settings and Meta credentials for daily cron
 */
export default async function handler(req: any, res: any) {
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
            fbId,
            fbAccessToken,
            adAccountId,
            telegramBotToken,
            telegramChatId,
            enabled
        } = req.body;

        if (!fbId) {
            return res.status(400).json({ error: 'Missing fbId' });
        }

        // Upsert to telegram_users table
        const { error } = await supabase
            .from('telegram_users')
            .upsert({
                fb_id: fbId,
                fb_access_token: fbAccessToken,
                ad_account_id: adAccountId,
                telegram_bot_token: telegramBotToken,
                telegram_chat_id: telegramChatId,
                enabled: enabled !== false,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'fb_id'
            });

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to save settings', details: error.message });
        }

        return res.status(200).json({
            success: true,
            message: 'Telegram settings saved for daily reports'
        });

    } catch (error: any) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
