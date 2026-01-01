import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
    console.error('SUPABASE_ANON_KEY not configured');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Cron job endpoint - runs daily at 8am Malaysia time (00:00 UTC)
 * Fetches all users with Telegram configured and sends daily analysis
 */
export default async function handler(req: any, res: any) {
    // Cron jobs send GET request
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify cron secret (optional security)
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Fetch all users with Telegram enabled
        const { data: users, error } = await supabase
            .from('telegram_users')
            .select('*')
            .not('telegram_bot_token', 'is', null)
            .not('telegram_chat_id', 'is', null);

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({
                error: 'Failed to fetch users',
                details: error.message,
                hint: error.hint,
                code: error.code
            });
        }

        if (!users || users.length === 0) {
            return res.status(200).json({ message: 'No users with Telegram configured' });
        }

        const geminiApiKey = process.env.GEMINI_3_API;
        if (!geminiApiKey) {
            return res.status(500).json({ error: 'GEMINI_3_API not configured' });
        }

        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            try {
                await processUserAnalysis(user, geminiApiKey);
                successCount++;
            } catch (err) {
                console.error(`Failed for user ${user.fb_id}:`, err);
                failCount++;
            }
        }

        return res.status(200).json({
            success: true,
            processed: users.length,
            successful: successCount,
            failed: failCount
        });

    } catch (error: any) {
        console.error('Cron error:', error);
        return res.status(500).json({ error: error.message });
    }
}

async function processUserAnalysis(user: any, geminiApiKey: string) {
    const { fb_access_token, ad_account_id, telegram_bot_token, telegram_chat_id } = user;

    if (!fb_access_token || !ad_account_id) {
        throw new Error('Missing Meta credentials');
    }

    // Fetch account name and ads from Meta API
    const actId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`;

    const today = new Date();
    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(today.getDate() - 3);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const formatDateMY = (d: Date) => {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const startDateMY = formatDateMY(fourDaysAgo);
    const endDateMY = formatDateMY(today);

    const timeRange = `{"since":"${formatDate(fourDaysAgo)}","until":"${formatDate(today)}"}`;

    // Fetch Account Name
    let accountName = ad_account_id;
    try {
        const accountInfoUrl = `https://graph.facebook.com/v19.0/${actId}?fields=name&access_token=${fb_access_token}`;
        const accountInfoResponse = await fetch(accountInfoUrl);
        const accountInfo = await accountInfoResponse.json();
        if (accountInfo.name) accountName = accountInfo.name;
    } catch (e) {
        console.warn(`Failed to fetch account name for ${actId}`);
    }

    const insightsQuery = `insights.time_range(${timeRange}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;
    const fields = ['id', 'name', 'status', 'effective_status', insightsQuery].join(',');
    const filtering = encodeURIComponent(`[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]`);

    const metaUrl = `https://graph.facebook.com/v19.0/${actId}/ads?fields=${encodeURIComponent(fields)}&access_token=${fb_access_token}&limit=50&filtering=${filtering}`;

    const metaResponse = await fetch(metaUrl);
    const metaData = await metaResponse.json();

    if (metaData.error) {
        throw new Error(metaData.error.message);
    }

    // Parse ads
    const ads = (metaData.data || []).map((ad: any) => {
        const insights = ad.insights?.data?.[0] || {};
        const spend = parseFloat(insights.spend || '0');
        const purchaseValue = insights.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0;
        const revenue = parseFloat(purchaseValue || '0');

        return {
            name: ad.name,
            spend,
            roas: spend > 0 ? (revenue / spend) : 0,
            ctr: parseFloat(insights.ctr || '0'),
            purchases: parseInt(insights.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0)
        };
    });

    const topAds = ads.filter((a: any) => a.spend > 0).sort((a: any, b: any) => b.roas - a.roas).slice(0, 3);

    if (topAds.length === 0) {
        // Send no ads message
        await sendTelegram(telegram_bot_token, telegram_chat_id,
            `📊 *Report : ${accountName}*\n\npast 4 Days\n(${startDateMY} - ${endDateMY})\n\nTiada iklan dengan spend dalam 4 hari lepas.`);
        return;
    }

    // AI Analysis
    const adDetails = topAds.map((ad: any, i: number) =>
        `${i + 1}. "${ad.name}" - RM${ad.spend.toFixed(2)}, ROAS: ${ad.roas.toFixed(2)}x, Purchase: ${ad.purchases}`
    ).join('\n');

    const prompt = `Kau seorang pakar Meta Ads Malaysia. Analisa data iklan untuk Ads Manager "${accountName}" bagi tempoh 4 hari lepas (${startDateMY} - ${endDateMY}).

Data Iklan:
${adDetails}

Sila hasilkan laporan mengikut format TEPAT di bawah (Bahasa Malaysia):

Report : ${accountName}
past 4 Days
(${startDateMY} - ${endDateMY})

3 Win Ad :
1) [Nama Ad 1] | ROAS : [Nilai] | Total Purchase : [Nilai]
2) [Nama Ad 2] | ROAS : [Nilai] | Total Purchase : [Nilai]
3) [Nama Ad 3] | ROAS : [Nilai] | Total Purchase : [Nilai]

Why Wins?
1) [Nama Ad 1] - [Satu ayat pendek kenapa menang]
2) [Nama Ad 2] - [Satu ayat pendek kenapa menang]
3) [Nama Ad 3] - [Satu ayat pendek kenapa menang]

Overall Campaign Analysis : [Analisis keseluruhan akaun dalam 20 patah perkataan sahaja.]

PENTING: Guna format Markdown Telegram (*bold* untuk tajuk). Jangan tambah intro atau outro.`;

    const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt
    });

    const analysisText = response.text || 'Tidak dapat generate analisis.';

    await sendTelegram(telegram_bot_token, telegram_chat_id, analysisText);
}

async function sendTelegram(botToken: string, chatId: string, text: string) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        })
    });
    const data = await response.json();
    if (!data.ok) {
        throw new Error(data.description || 'Telegram send failed');
    }
}
