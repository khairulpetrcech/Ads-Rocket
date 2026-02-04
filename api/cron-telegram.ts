import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

// Vercel Hobby plan: max 60 seconds for cron jobs
export const config = {
    maxDuration: 60
};

const SUPABASE_URL = 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFczvHAg6IVFjQ';

if (!SUPABASE_ANON_KEY) {
    console.error('SUPABASE_ANON_KEY not configured');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Cron job endpoint - runs every hour, checks analysis_schedules for matching times
 * Only processes users who have enabled schedules matching current hour
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
        console.log(`[Cron] Daily scheduled run at ${new Date().toISOString()}`);

        // Fetch ONLY enabled schedules from analysis_schedules
        const { data: schedules, error } = await supabase
            .from('analysis_schedules')
            .select('*')
            .eq('is_enabled', true);

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({
                error: 'Failed to fetch schedules',
                details: error.message
            });
        }

        if (!schedules || schedules.length === 0) {
            return res.status(200).json({ message: 'No enabled schedules found' });
        }

        // Vercel Hobby plan = 1 cron/day, so process ALL enabled schedules
        // (time matching removed since we can only run once daily at 8AM)
        console.log(`[Cron] Processing ${schedules.length} enabled schedules`);

        const geminiApiKey = process.env.VITE_GEMINI_3_API;
        if (!geminiApiKey) {
            return res.status(500).json({ error: 'VITE_GEMINI_3_API not configured' });
        }

        let successCount = 0;
        let failCount = 0;

        for (const schedule of schedules) {
            try {
                // Pass schedule data instead of telegram_users data
                await processScheduledAnalysis(schedule, geminiApiKey);
                successCount++;
            } catch (err: any) {
                console.error(`Failed for schedule ${schedule.fb_id}:`, err);
                failCount++;
            }
        }

        return res.status(200).json({
            success: true,
            totalSchedules: schedules.length,
            processed: schedules.length,
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

            // Try to get video source URL through multiple methods
            let videoSourceUrl = videoData.source;

            // Method 1: Check if source is directly available
            if (!videoSourceUrl && creative.effective_instagram_media_id) {
                console.log(`[Creative Analysis] Trying Instagram media ID for ${ad.name}...`);
                try {
                    const igMediaUrl = `https://graph.facebook.com/v19.0/${creative.effective_instagram_media_id}?fields=media_url&access_token=${fbAccessToken}`;
                    const igResponse = await fetch(igMediaUrl);
                    const igData = await igResponse.json();
                    if (igData.media_url) {
                        videoSourceUrl = igData.media_url;
                        console.log(`[Creative Analysis] Got video from Instagram media ID for ${ad.name}`);
                    }
                } catch (err) {
                    console.log(`[Creative Analysis] Instagram media ID failed for ${ad.name}`);
                }
            }

            // If we have video source URL, download and analyze it
            if (videoSourceUrl) {
                console.log(`[Creative Analysis] Downloading video for ${ad.name}...`);
                const videoFileResponse = await fetch(videoSourceUrl);
                const videoArrayBuffer = await videoFileResponse.arrayBuffer();

                // Create Blob for upload
                const videoBlob = new Blob([videoArrayBuffer], { type: 'video/mp4' });

                console.log(`[Creative Analysis] Uploading video to Gemini for ${ad.name}...`);
                // Upload to Gemini Files API
                const uploadResult = await genAI.files.upload({
                    file: videoBlob
                });

                console.log(`[Creative Analysis] Waiting for file to be processed for ${ad.name}...`);
                // Wait for file to be ACTIVE (poll status)
                let fileReady = false;
                let attempts = 0;
                const maxAttempts = 10; // Max 10 seconds

                while (!fileReady && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

                    try {
                        const fileStatus = await genAI.files.get({ name: uploadResult.name });
                        if (fileStatus.state === 'ACTIVE') {
                            fileReady = true;
                            console.log(`[Creative Analysis] File ready for ${ad.name} after ${attempts + 1}s`);
                        }
                    } catch (err) {
                        console.log(`[Creative Analysis] File status check failed, attempt ${attempts + 1}`);
                    }

                    attempts++;
                }

                if (!fileReady) {
                    console.log(`[Creative Analysis] File not ready after ${maxAttempts}s for ${ad.name}, skipping...`);
                    await genAI.files.delete({ name: uploadResult.name });
                    return null;
                }

                console.log(`[Creative Analysis] Analyzing video with Gemini 3 Pro for ${ad.name}...`);
                // Initial analysis - ULTRA SHORT (target: 70 words per ad, 210 total for 3 ads)
                const prompt = `Analisa video iklan ini (${ad.purchases} purchases, ROAS ${ad.roas.toFixed(2)}x).

MESTI 70 patah perkataan SAHAJA. Format:

*Hook:* (30 words - apa yang stop scroll)
*Emosi:* (30 words - emosi yang drive action)

PERATURAN: Terus jawab, JANGAN intro. BM ringkas.`;

                const result = await genAI.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: [
                        { text: prompt },
                        { fileData: { fileUri: uploadResult.uri, mimeType: 'video/mp4' } }
                    ]
                });

                // Delete uploaded file
                await genAI.files.delete({ name: uploadResult.name });

                console.log(`[Creative Analysis] ✅ Video analysis complete for ${ad.name}`);
                return result.text || null;
            }

            // Fallback to thumbnail if no video source available
            if (!videoSourceUrl) {
                console.log(`[Creative Analysis] No video source URL for ${ad.name}. Using thumbnail image instead...`);

                // Use video thumbnail from Meta API response
                const thumbnailUrl = videoData.picture || creative.image_url;

                if (thumbnailUrl) {
                    console.log(`[Creative Analysis] Analyzing thumbnail image for ${ad.name}`);
                    const imageResponse = await fetch(thumbnailUrl);
                    const imageBuffer = await imageResponse.arrayBuffer();
                    const base64Image = Buffer.from(imageBuffer).toString('base64');

                    const prompt = `Analisa image iklan ini (${ad.purchases} purchases, ROAS ${ad.roas.toFixed(2)}x).

MESTI 70 patah perkataan SAHAJA. Format:

*Hook:* (30 words - visual yang grab attention)
*Emosi:* (30 words - emosi yang drive action)

PERATURAN: Terus jawab, JANGAN intro. BM ringkas.`;

                    const result = await genAI.models.generateContent({
                        model: 'gemini-3-flash-preview',
                        contents: [
                            { text: prompt },
                            { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                        ]
                    });

                    console.log(`[Creative Analysis] ✅ Thumbnail analysis complete for ${ad.name}`);
                    return result.text || null;
                }

                return null;
            }

        } else if (creative.image_url) {
            console.log(`[Creative Analysis] Image detected for ${ad.name}`);
            // Download image
            const imageResponse = await fetch(creative.image_url);
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString('base64');

            console.log(`[Creative Analysis] Analyzing image with Gemini 3 Flash for ${ad.name}...`);
            // Analyze image - ULTRA SHORT (70 words)
            const prompt = `Analisa poster iklan ini (${ad.purchases} purchases, ROAS ${ad.roas.toFixed(2)}x).

MESTI 70 patah perkataan SAHAJA. Format:

*Hook:* (30 words - visual yang grab attention)
*Emosi:* (30 words - emosi yang drive action)

PERATURAN: Terus jawab, JANGAN intro. BM ringkas.`;

            const result = await genAI.models.generateContent({
                model: 'gemini-3-flash-preview',  // Gemini 3 Pro - Latest Pro model (Jan 2026)
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
        console.error(`[Creative Analysis] ❌ Failed to analyze creative for ad "${ad.name}": `, error);
        return null; // Graceful fallback
    }
}

async function processScheduledAnalysis(schedule: any, geminiApiKey: string) {
    // Schedule data from analysis_schedules table
    const {
        fb_id,
        ad_account_id,
        telegram_bot_token,
        telegram_chat_id,
        fb_access_token
    } = schedule;

    if (!fb_access_token || !ad_account_id) {
        throw new Error(`Missing credentials for schedule ${fb_id}`);
    }

    // Fetch account name and ads from Meta API
    const actId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id} `;

    const today = new Date();
    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(today.getDate() - 3);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const formatDateMY = (d: Date) => {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day} /${month}/${year} `;
    };

    const startDateMY = formatDateMY(fourDaysAgo);
    const endDateMY = formatDateMY(today);

    const timeRange = `{ "since": "${formatDate(fourDaysAgo)}", "until": "${formatDate(today)}" } `;

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
    const creativeFields = 'creative{video_id,image_url,thumbnail_url,effective_instagram_media_id,object_story_spec}';
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

        // Check multiple purchase action types (Meta API can return different types)
        const purchaseActionTypes = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
        let purchaseCount = 0;
        if (insights.actions && Array.isArray(insights.actions)) {
            for (const actionType of purchaseActionTypes) {
                const found = insights.actions.find((a: any) => a.action_type === actionType);
                if (found && found.value) {
                    purchaseCount = parseInt(found.value);
                    break;
                }
            }
        }

        return {
            id: ad.id,
            name: ad.name,
            spend,
            roas: spend > 0 ? (revenue / spend) : 0,
            ctr: parseFloat(insights.ctr || '0'),
            purchases: purchaseCount,
            creative: ad.creative || null
        };
    });

    // Sort by purchases first, then ROAS (matching analyze-telegram.ts)
    const topAds = ads.filter((a: any) => a.spend > 0).sort((a: any, b: any) => b.purchases - a.purchases || b.roas - a.roas).slice(0, 3);

    if (topAds.length === 0) {
        // Send no ads message
        await sendTelegram(telegram_bot_token, telegram_chat_id,
            `📊 *Report : ${accountName}*\n\npast 4 Days\n(${startDateMY} - ${endDateMY})\n\nTiada iklan dengan spend dalam 4 hari lepas.`);
        return;
    }

    // --- Build Report (matching analyze-telegram.ts template) ---
    const emojis = ['🥇', '🥈', '🥉'];
    let reportText = `📊 *Report : ${accountName}*\npast 4 Days\n(${startDateMY} - ${endDateMY})\n\n`;

    // Calculate CPA for each ad
    topAds.forEach((ad: any) => {
        ad.cpa = ad.purchases > 0 ? ad.spend / ad.purchases : 0;
    });

    reportText += `*Top 3 Win Ads*\n`;
    topAds.forEach((ad: any, i: number) => {
        reportText += `${emojis[i]} ${ad.name}\n   ${ad.purchases} purch | ${ad.roas.toFixed(2)}x ROAS | RM${ad.cpa.toFixed(2)} CPA\n`;
    });

    // Multimodal Creative Analysis for each winning ad
    const creativeAnalyses: { name: string; analysis: string }[] = [];
    for (const ad of topAds) {
        try {
            const creativeInsight = await analyzeAdCreative(ad, geminiApiKey, fb_access_token);
            if (creativeInsight) {
                creativeAnalyses.push({ name: ad.name, analysis: creativeInsight });
            }
        } catch (err: any) {
            console.error(`Failed to analyze creative for ${ad.name}:`, err);
            creativeAnalyses.push({
                name: ad.name,
                analysis: `❌ Error: ${err.message || 'Unknown error'}`
            });
        }
    }

    reportText += `\n*🎯 Kenapa Iklan Win?*\n\n`;
    creativeAnalyses.forEach((item) => {
        reportText += `*${item.name}*\n${item.analysis}\n\n`;
    });

    // If no creative analyses, add placeholder
    if (creativeAnalyses.length === 0) {
        reportText += `(Creative analysis tidak tersedia)\n\n`;
    }

    // Footer with cost estimate and AI model
    const validAnalyses = creativeAnalyses.filter(a => !a.analysis.includes('❌ Error'));
    const estimatedCost = (validAnalyses.length * 0.025).toFixed(2); // Flash = Pro/4 (~RM0.025 per video)
    reportText += `---\n_AI: Gemini 3 Flash | Est. Cost: ~RM${estimatedCost}_`;

    // Build inline keyboard buttons for prompt generation - same as analyze-telegram.ts
    const promptButtons = topAds.map((ad: any, i: number) => {
        const videoId = ad.creative?.video_id || null;
        const igMediaId = ad.creative?.effective_instagram_media_id || null;

        // Determine media type: i{igMediaId} = IG video, v{videoId} = FB video, x{adId} = image
        let mediaId: string;
        if (videoId && igMediaId) {
            mediaId = `i${igMediaId}`;
        } else if (videoId) {
            mediaId = `v${videoId}`;
        } else if (ad.id) {
            mediaId = `x${ad.id}`;
        } else {
            mediaId = 'none';
        }

        return {
            text: `📝 Prompt Ads ${i + 1}`,
            callback_data: `p_${i}_${mediaId}_${(ad.name || '').substring(0, 8)}`
        };
    });

    // Send with inline keyboard
    await sendTelegramWithButtons(telegram_bot_token, telegram_chat_id, reportText, promptButtons);
}

async function sendTelegram(botToken: string, chatId: string, text: string) {
    console.log(`[Telegram Debug] Bot token prefix: ${botToken?.substring(0, 10)}..., Chat ID: ${chatId}`);
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
        console.error(`[Telegram Debug] Error response:`, JSON.stringify(data));
        throw new Error(data.description || 'Telegram send failed');
    }
}

async function sendTelegramWithButtons(botToken: string, chatId: string, text: string, buttons: any[]) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [buttons]
            }
        })
    });
    const data = await response.json();
    if (!data.ok) {
        console.error('[Cron Telegram] Telegram send error:', data);
        throw new Error(data.description || 'Telegram send failed');
    }
}
