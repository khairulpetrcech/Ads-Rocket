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

/**
 * Analyze ad creative (video or image) using Gemini 3 Pro multimodal
 */
async function analyzeAdCreative(ad: any, geminiApiKey: string, fbAccessToken: string): Promise<string | null> {
    try {
        const creative = ad.creative;
        if (!creative) {
            console.log(`[Creative Analysis] No creative data for ad: ${ad.name}`);
            return null;
        }

        console.log(`[Creative Analysis] Starting analysis for ad: ${ad.name}`);
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

        // Check if video or image
        if (creative.video_id) {
            console.log(`[Creative Analysis] Video detected for ${ad.name}, video_id: ${creative.video_id}`);
            // Fetch video URL from Meta - try multiple fields
            const videoUrl = `https://graph.facebook.com/v19.0/${creative.video_id}?fields=source,permalink_url,embed_html,picture&access_token=${fbAccessToken}`;
            const videoResponse = await fetch(videoUrl);
            const videoData = await videoResponse.json();

            console.log(`[Creative Analysis] Video API response for ${ad.name}:`, JSON.stringify(videoData));

            if (!videoData.source) {
                console.log(`[Creative Analysis] No video source URL for ${ad.name}. Trying image_url fallback...`);

                // Fallback to image if video source unavailable
                if (creative.image_url) {
                    console.log(`[Creative Analysis] Using image fallback for ${ad.name}`);
                    const imageResponse = await fetch(creative.image_url);
                    const imageBuffer = await imageResponse.arrayBuffer();
                    const base64Image = Buffer.from(imageBuffer).toString('base64');

                    const prompt = `Kau seorang pakar Meta Ads Malaysia. Analisa poster iklan ini yang mencapai ROAS ${ad.roas.toFixed(2)}x.

Iklan: "${ad.name}"
Performance: RM${ad.spend.toFixed(2)} spend, ${ad.purchases} purchases

Analisa elemen visual yang buatkan iklan ni WIN:
1. Warna & Design
2. Text & Messaging
3. Call-to-Action
4. Target Audience Appeal

Jawab dalam 3-4 ayat pendek, Bahasa Malaysia.`;

                    const result = await genAI.models.generateContent({
                        model: 'gemini-2.0-flash-exp',
                        contents: [
                            { text: prompt },
                            { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                        ]
                    });

                    console.log(`[Creative Analysis] ✅ Image fallback analysis complete for ${ad.name}`);
                    return result.text || null;
                }

                return null;
            }

            console.log(`[Creative Analysis] Downloading video for ${ad.name}...`);
            // Download video
            const videoFileResponse = await fetch(videoData.source);
            const videoArrayBuffer = await videoFileResponse.arrayBuffer();

            // Create Blob for upload
            const videoBlob = new Blob([videoArrayBuffer], { type: 'video/mp4' });

            console.log(`[Creative Analysis] Uploading video to Gemini for ${ad.name}...`);
            // Upload to Gemini Files API
            const uploadResult = await genAI.files.upload({
                file: videoBlob
            });

            console.log(`[Creative Analysis] Analyzing video with Gemini 2.0 Flash for ${ad.name}...`);
            // Analyze video
            const prompt = `Kau seorang pakar Meta Ads Malaysia. Tonton video iklan ini yang mencapai ROAS ${ad.roas.toFixed(2)}x.

Iklan: "${ad.name}"
Performance: RM${ad.spend.toFixed(2)} spend, ${ad.purchases} purchases

Analisa kenapa video ni WIN:
1. Hook (3 saat pertama)
2. Storyline & Pacing
3. Audio & Music
4. Visual Elements
5. Call-to-Action

Jawab dalam 4-5 ayat pendek, Bahasa Malaysia.`;

            const result = await genAI.models.generateContent({
                model: 'gemini-2.0-flash-exp',  // Latest multimodal model (Jan 2026)
                contents: [
                    { text: prompt },
                    { fileData: { fileUri: uploadResult.uri, mimeType: 'video/mp4' } }
                ]
            });

            // Delete uploaded file
            await genAI.files.delete({ name: uploadResult.name });

            console.log(`[Creative Analysis] ✅ Video analysis complete for ${ad.name}`);
            return result.text || null;

        } else if (creative.image_url) {
            console.log(`[Creative Analysis] Image detected for ${ad.name}`);
            // Download image
            const imageResponse = await fetch(creative.image_url);
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString('base64');

            console.log(`[Creative Analysis] Analyzing image with Gemini 2.0 Flash for ${ad.name}...`);
            // Analyze image
            const prompt = `Kau seorang pakar Meta Ads Malaysia. Analisa poster iklan ini yang mencapai ROAS ${ad.roas.toFixed(2)}x.

Iklan: "${ad.name}"
Performance: RM${ad.spend.toFixed(2)} spend, ${ad.purchases} purchases

Analisa elemen visual yang buatkan iklan ni WIN:
1. Warna & Design
2. Text & Messaging
3. Call-to-Action
4. Target Audience Appeal

Jawab dalam 3-4 ayat pendek, Bahasa Malaysia.`;

            const result = await genAI.models.generateContent({
                model: 'gemini-2.0-flash-exp',  // Latest multimodal model (Jan 2026)
                contents: [
                    { text: prompt },
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                ]
            });

            console.log(`[Creative Analysis] ✅ Image analysis complete for ${ad.name}`);
            return result.text || null;
        }

        console.log(`[Creative Analysis] No video or image found for ${ad.name}`);
        return null;
    } catch (error) {
        console.error(`[Creative Analysis] ❌ Failed to analyze creative for ad "${ad.name}":`, error);
        return null; // Graceful fallback
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
    const creativeFields = 'creative{video_id,image_url,thumbnail_url,object_story_spec}';
    const fields = ['id', 'name', 'status', 'effective_status', insightsQuery, creativeFields].join(',');
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
            id: ad.id,
            name: ad.name,
            spend,
            roas: spend > 0 ? (revenue / spend) : 0,
            ctr: parseFloat(insights.ctr || '0'),
            purchases: parseInt(insights.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0),
            creative: ad.creative || null
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

    // Multimodal Creative Analysis for each winning ad
    const creativeAnalyses: string[] = [];
    for (const ad of topAds) {
        const creativeInsight = await analyzeAdCreative(ad, geminiApiKey, fb_access_token);
        if (creativeInsight) {
            creativeAnalyses.push(`*${ad.name}*\n${creativeInsight}`);
        }
    }

    // Build final message
    let finalMessage = analysisText;

    if (creativeAnalyses.length > 0) {
        finalMessage += `\n\n🎯 *Kenapa Iklan Win?*\n\n${creativeAnalyses.join('\n\n')}`;
    }

    await sendTelegram(telegram_bot_token, telegram_chat_id, finalMessage);
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
