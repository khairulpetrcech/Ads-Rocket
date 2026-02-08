import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFczvHAg6IVFjQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Consolidated Telegram API
 * Usage:
 * POST /api/analyze-telegram (default: AI analysis)
 * POST /api/analyze-telegram?action=save-settings (save Telegram settings)
 * POST /api/analyze-telegram?action=send-message (send generic message)
 */
export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action } = req.query;

    // Allow GET for get-schedule action
    if (req.method === 'GET' && action === 'get-schedule') {
        return handleGetSchedule(req, res);
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Route based on action (action already extracted above for GET)
    if (action === 'save-settings') {
        return handleSaveSettings(req, res);
    }
    if (action === 'send-message') {
        return handleSendMessage(req, res);
    }
    if (action === 'save-schedule') {
        return handleSaveSchedule(req, res);
    }
    if (action === 'get-schedule') {
        return handleGetSchedule(req, res);
    }

    // Default: AI Analysis
    return handleAnalysis(req, res);
}

// Main AI Analysis Handler
async function handleAnalysis(req: any, res: any) {
    try {
        const { adAccountId, fbAccessToken, telegramChatId, telegramBotToken, dailyUsageCount } = req.body;

        if (!adAccountId || !fbAccessToken) {
            return res.status(400).json({ error: 'Missing Meta Ads credentials' });
        }

        if (!telegramChatId || !telegramBotToken) {
            return res.status(400).json({ error: 'Telegram credentials not configured' });
        }

        // --- RATE LIMITING: 3 analyses per day (exempt for admin users) ---
        const EXEMPT_USERS = ['khai'];
        const fbName = req.body.fbName || '';
        const isExempt = EXEMPT_USERS.some(name => fbName.toLowerCase().includes(name.toLowerCase()));

        const MAX_DAILY_ANALYSES = 3;
        if (!isExempt && dailyUsageCount !== undefined && dailyUsageCount >= MAX_DAILY_ANALYSES) {
            return res.status(429).json({
                error: 'Daily limit reached',
                message: `Anda telah mencapai had ${MAX_DAILY_ANALYSES} analisa sehari. Cuba lagi esok!`,
                limitReached: true
            });
        }

        const geminiApiKey = process.env.VITE_GEMINI_3_API;
        if (!geminiApiKey) {
            return res.status(500).json({ error: 'VITE_GEMINI_3_API not configured' });
        }

        // --- STEP 1: Fetch Account Name and Top Ads with Creatives from Meta API (last 4 days) ---
        const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

        // Calculate date range: last 4 days
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

        const startDateStr = formatDate(fourDaysAgo);
        const endDateStr = formatDate(today);
        const startDateMY = formatDateMY(fourDaysAgo);
        const endDateMY = formatDateMY(today);

        const timeRange = JSON.stringify({
            since: startDateStr,
            until: endDateStr
        });

        // 1a. Fetch Account Name
        const accountInfoUrl = `https://graph.facebook.com/v19.0/${actId}?fields=name&access_token=${fbAccessToken}`;
        const accountInfoResponse = await fetch(accountInfoUrl);
        const accountInfo = await accountInfoResponse.json();
        const accountName = accountInfo.name || adAccountId;

        // 1b. Fetch Ads Insights WITH Creative Data (video_id, effective_instagram_media_id, image_url)
        const insightsQuery = `insights.time_range(${timeRange}){spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type}`;
        const creativeFields = 'creative{video_id,image_url,thumbnail_url,effective_instagram_media_id,object_story_spec}';
        const fields = ['id', 'name', 'status', 'effective_status', creativeFields, insightsQuery].join(',');
        // Include CAMPAIGN_PAUSED and ADSET_PAUSED to get ads from paused parent campaigns/adsets
        const filtering = encodeURIComponent(`[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]}]`);

        const metaUrl = `https://graph.facebook.com/v19.0/${actId}/ads?fields=${encodeURIComponent(fields)}&access_token=${fbAccessToken}&limit=50&filtering=${filtering}`;

        console.log(`Fetching Meta API for ${accountName}...`);
        const metaResponse = await fetch(metaUrl);
        const metaData = await metaResponse.json();

        if (metaData.error) {
            console.error('Meta API error:', metaData.error);
            return res.status(400).json({ error: metaData.error.message || 'Failed to fetch ads' });
        }

        // Parse ads and calculate metrics
        const ads = (metaData.data || []).map((ad: any) => {
            const insights = ad.insights?.data?.[0] || {};
            const spend = parseFloat(insights.spend || '0');
            const purchaseValue = insights.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0;
            const revenue = parseFloat(purchaseValue || '0');
            const leads = insights.actions?.find((a: any) => a.action_type === 'lead')?.value || 0;
            const messages = insights.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0;

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

            // Get CPA (Cost Per Purchase)
            const cpaData = insights.cost_per_action_type?.find((a: any) => a.action_type === 'purchase');
            const cpa = cpaData ? parseFloat(cpaData.value) : (purchaseCount > 0 ? spend / purchaseCount : 0);

            return {
                id: ad.id,
                name: ad.name,
                status: ad.effective_status || ad.status,
                spend,
                roas: spend > 0 ? (revenue / spend) : 0,
                ctr: parseFloat(insights.ctr || '0'),
                purchases: purchaseCount,
                leads: parseInt(leads) + parseInt(messages),
                revenue,
                cpa,
                creative: ad.creative || {}
            };
        });

        // Filter only ads with spend and sort by PURCHASES first, then ROAS
        const topAds = ads
            .filter((a: any) => a.spend > 0)
            .sort((a: any, b: any) => b.purchases - a.purchases || b.roas - a.roas)
            .slice(0, 3);

        if (topAds.length === 0) {
            const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
            await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegramChatId,
                    text: `📊 *Report : ${accountName}*\n\npast 4 Days\n(${startDateMY} - ${endDateMY})\n\nTiada iklan aktif dengan spend dalam 4 hari lepas.`,
                    parse_mode: 'Markdown'
                })
            });
            return res.status(200).json({ success: true, message: 'No ads with spend found' });
        }

        // --- STEP 2: Analyze Each Ad Creative (Video/Image) with Gemini Multimodal ---
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
        const creativeAnalyses: { name: string; analysis: string }[] = [];

        for (const ad of topAds) {
            try {
                const analysis = await analyzeAdCreative(ad, genAI, fbAccessToken);
                if (analysis) {
                    creativeAnalyses.push({ name: ad.name, analysis });
                }
            } catch (err: any) {
                console.error(`Failed to analyze creative for ${ad.name}:`, err);
                // Push error to report so user sees it
                creativeAnalyses.push({
                    name: ad.name,
                    analysis: `❌ Error: ${err.message || 'Unknown error'}`
                });
            }
        }

        console.log(`Analyzed ${creativeAnalyses.length} creatives with Gemini multimodal`);

        // --- STEP 3: Build Final Report ---
        const emojis = ['🥇', '🥈', '🥉'];
        let reportText = `📊 *Report : ${accountName}*\npast 4 Days\n(${startDateMY} - ${endDateMY})\n\n`;

        reportText += `*Top 3 Win Ads*\n`;
        topAds.forEach((ad: any, i: number) => {
            reportText += `${emojis[i]} ${ad.name}\n   ${ad.purchases} purch | ${ad.roas.toFixed(2)}x ROAS | RM${ad.cpa.toFixed(2)} CPA\n`;
        });

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

        // --- STEP 4: Send to Telegram with Prompt Buttons ---
        const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;

        // Store top ads data for later prompt generation - USE SUPABASE for persistence
        const cacheData = {
            chat_id: String(telegramChatId), // Ensure string type for consistency
            fb_access_token: fbAccessToken,
            telegram_bot_token: telegramBotToken,
            ads_data: JSON.stringify(topAds.slice(0, 3).map((ad: any) => ({
                id: ad.id,
                name: ad.name,
                videoId: ad.video_id || null,
                imageUrl: ad.image_url || null,
                thumbnailUrl: ad.thumbnail_url || null
            }))),
            updated_at: new Date().toISOString()
        };

        console.log(`[Cache] Saving to Supabase: chat_id=${telegramChatId}, ads_count=${topAds.slice(0, 3).length}`);

        // Save to Supabase for persistence across serverless instances
        try {
            const { error } = await supabase.from('ads_cache').upsert(cacheData, { onConflict: 'chat_id' });
            if (error) {
                console.error('[Cache] Supabase upsert error:', error);
            } else {
                console.log(`[Cache] ✅ Successfully stored ${topAds.length} ads in Supabase for chat ${telegramChatId}`);
            }
        } catch (cacheErr) {
            console.error('[Cache] Failed to save to Supabase:', cacheErr);
        }

        // Build inline keyboard buttons for prompt generation
        // Format: p_{index}_{videoId}_{adName} - include video_id directly to avoid cache lookup
        // Extract video_id from ad.creative.video_id
        const promptButtons = topAds.slice(0, 3).map((ad: any, i: number) => {
            const videoId = ad.creative?.video_id || null;
            const igMediaId = ad.creative?.effective_instagram_media_id || null;
            const imageUrl = ad.creative?.image_url || ad.creative?.thumbnail_url || null;

            // Determine media type and ID for callback
            // i{igMediaId} = video via Instagram, v{videoId} = video via FB, x{adId} = image ad
            let mediaId: string;
            if (videoId && igMediaId) {
                // Video ad with Instagram media - prioritize IG
                mediaId = `i${igMediaId}`;
            } else if (videoId) {
                // Video ad with FB video only
                mediaId = `v${videoId}`;
            } else if (ad.id) {
                // Image ad - include ad_id so we can fetch image URL
                mediaId = `x${ad.id}`;
            } else {
                mediaId = 'none';
            }

            return {
                text: `📝 Prompt Ads ${i + 1}`,
                callback_data: `p_${i}_${mediaId}_${(ad.name || '').substring(0, 8)}`
            };
        });

        const telegramResponse = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegramChatId,
                text: reportText,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [promptButtons]
                }
            })
        });

        const telegramData = await telegramResponse.json();

        if (!telegramData.ok) {
            console.error('Telegram error:', telegramData);
            return res.status(400).json({
                error: 'Failed to send Telegram',
                telegramError: telegramData.description
            });
        }

        // --- STEP 5: Save Top Ads History for Upscale Tracking ---
        try {
            const historyPayload = {
                businessName: accountName,
                adAccountId: actId,
                topAds: topAds.map((ad: any) => ({
                    id: ad.id,
                    name: ad.name
                }))
            };

            // Save to global history (in-memory for now)
            const history = (globalThis as any).__analysisHistory || [];
            const today = new Date().toISOString().split('T')[0];

            // Remove existing today's record for this account
            const filteredHistory = history.filter(
                (r: any) => !(r.date === today && r.adAccountId === actId)
            );

            // Add new record
            filteredHistory.push({
                date: today,
                businessName: accountName,
                adAccountId: actId,
                topAds: topAds.map((ad: any, i: number) => ({
                    id: ad.id,
                    name: ad.name,
                    rank: i + 1
                }))
            });

            // Keep only last 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const cutoff = sevenDaysAgo.toISOString().split('T')[0];
            (globalThis as any).__analysisHistory = filteredHistory.filter((r: any) => r.date >= cutoff);

            // Check for upscale candidates (top 3 for 3 consecutive days)
            const last3Days = [];
            for (let i = 0; i < 3; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                last3Days.push(d.toISOString().split('T')[0]);
            }

            const relevantRecords = ((globalThis as any).__analysisHistory || []).filter(
                (r: any) => r.adAccountId === actId && last3Days.includes(r.date)
            );

            if (relevantRecords.length >= 3) {
                const adCounts: Record<string, { name: string; days: string[] }> = {};

                for (const record of relevantRecords) {
                    for (const ad of record.topAds) {
                        if (!adCounts[ad.id]) {
                            adCounts[ad.id] = { name: ad.name, days: [] };
                        }
                        if (!adCounts[ad.id].days.includes(record.date)) {
                            adCounts[ad.id].days.push(record.date);
                        }
                    }
                }

                // Find ads present in all 3 days
                const candidates = Object.entries(adCounts)
                    .filter(([_, data]) => data.days.length >= 3)
                    .map(([id, data]) => ({ id, name: data.name }));

                // Send upscale recommendation for each candidate
                for (const candidate of candidates) {
                    const upscaleMessage = `🚀 *Upscale Recommendation*\n\nAds *"${candidate.name}"* berada dalam Top 3 selama 3 hari berturut-turut!\n\nNak upscale adset/campaign sebanyak 20%?`;

                    await fetch(telegramUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: telegramChatId,
                            text: upscaleMessage,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '✅ Ya, Upscale 20%', callback_data: `upscale_yes_${candidate.id}` },
                                        { text: '❌ Tidak', callback_data: `upscale_no_${candidate.id}` }
                                    ]
                                ]
                            }
                        })
                    });
                }
            }

        } catch (historyErr) {
            console.error('Failed to save history:', historyErr);
            // Non-critical, continue
        }

        return res.status(200).json({
            success: true,
            message: 'Analisis multimodal dihantar ke Telegram!',
            adsAnalyzed: topAds.length,
            creativesAnalyzed: creativeAnalyses.length
        });

    } catch (error: any) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message || 'Internal error' });
    }
}

/**
 * Analyze ad creative (video or image) using Gemini 3 Pro multimodal
 * Supports: Video via video_id, Instagram media fallback, Image fallback
 */
async function analyzeAdCreative(ad: any, genAI: any, fbAccessToken: string): Promise<string | null> {
    try {
        const creative = ad.creative;
        if (!creative) {
            console.log(`[Creative Analysis] No creative data for ad: ${ad.name}`);
            return null;
        }

        console.log(`[Creative Analysis] Starting analysis for ad: ${ad.name}`);

        // Check if video or image
        if (creative.video_id) {
            console.log(`[Creative Analysis] Video detected for ${ad.name}, video_id: ${creative.video_id}`);

            // Fetch video URL from Meta
            const videoUrl = `https://graph.facebook.com/v19.0/${creative.video_id}?fields=source,permalink_url,picture&access_token=${fbAccessToken}`;
            const videoResponse = await fetch(videoUrl);
            const videoData = await videoResponse.json();

            console.log(`[Creative Analysis] Video API response for ${ad.name}:`, JSON.stringify(videoData));

            let videoSourceUrl = videoData.source;

            // Fallback: Try Instagram media ID
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
                const maxAttempts = 15; // Max 15 seconds

                while (!fileReady && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
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
                }).catch((err: any) => {
                    console.error('Gemini 3.0 Analysis Error:', err);
                    throw new Error(`Gemini Error: ${err.message}`);
                });

                // Delete uploaded file
                await genAI.files.delete({ name: uploadResult.name });

                console.log(`[Creative Analysis] ✅ Video analysis complete for ${ad.name}`);
                return result.text || null;
            }

            // Fallback to thumbnail if no video source available
            if (!videoSourceUrl) {
                console.log(`[Creative Analysis] No video source URL for ${ad.name}. Using thumbnail...`);
                const thumbnailUrl = videoData.picture || creative.thumbnail_url || creative.image_url;

                if (thumbnailUrl) {
                    return await analyzeImage(ad, thumbnailUrl, genAI);
                }
            }

            return null;

        } else if (creative.image_url || creative.thumbnail_url) {
            console.log(`[Creative Analysis] Image detected for ${ad.name}`);
            const imageUrl = creative.image_url || creative.thumbnail_url;
            return await analyzeImage(ad, imageUrl, genAI);
        }

        console.log(`[Creative Analysis] No video or image found for ${ad.name}`);
        return null;
    } catch (error) {
        console.error(`[Creative Analysis] ❌ Failed to analyze creative for ad "${ad.name}":`, error);
        return null;
    }
}

/**
 * Analyze image using Gemini multimodal
 */
async function analyzeImage(ad: any, imageUrl: string, genAI: any): Promise<string | null> {
    try {
        console.log(`[Creative Analysis] Analyzing image for ${ad.name}...`);

        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

        const prompt = `Analisa image iklan ini (${ad.purchases} purchases, ROAS ${ad.roas.toFixed(2)}x).

MESTI 70 patah perkataan SAHAJA. Format:

*Hook:* (30 words - visual yang grab attention)
*Emosi:* (30 words - emosi yang drive action)

PERATURAN: Terus jawab, JANGAN intro. BM ringkas.`;

        const result = await genAI.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                { text: prompt },
                { inlineData: { mimeType: mimeType, data: base64Image } }
            ]
        }).catch((err: any) => {
            console.error('Gemini 3.0 Image Error:', err);
            throw new Error(`Gemini Error: ${err.message}`);
        });

        console.log(`[Creative Analysis] ✅ Image analysis complete for ${ad.name}`);
        return result.text || null;
    } catch (error) {
        console.error(`[Creative Analysis] ❌ Image analysis failed for ${ad.name}:`, error);
        return null;
    }
}

// Save Telegram Settings Handler
async function handleSaveSettings(req: any, res: any) {
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
        console.error('Save Settings Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Send Telegram Message Handler
async function handleSendMessage(req: any, res: any) {
    try {
        const { chatId, message, botToken } = req.body;

        if (!chatId || !message || !botToken) {
            return res.status(400).json({ error: 'Missing required fields: chatId, message, botToken' });
        }

        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram API error:', data);
            return res.status(400).json({
                error: data.description || 'Failed to send Telegram message',
                details: data
            });
        }

        return res.status(200).json({
            success: true,
            message_id: data.result?.message_id
        });

    } catch (error: any) {
        console.error('Send Message Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Save Schedule Handler - Store analysis schedule in Supabase
async function handleSaveSchedule(req: any, res: any) {
    try {
        const {
            fbId,
            adAccountId,
            scheduleTime,
            isEnabled,
            telegramBotToken,
            telegramChatId,
            fbAccessToken  // Include FB token for cron job
        } = req.body;

        if (!fbId) {
            return res.status(400).json({ error: 'Missing fbId' });
        }

        // Preserve existing values when partial payload arrives (e.g., reconnect flow without Telegram fields)
        const { data: existingSchedule, error: existingError } = await supabase
            .from('analysis_schedules')
            .select('schedule_time, is_enabled, telegram_bot_token, telegram_chat_id, fb_access_token')
            .eq('fb_id', fbId)
            .maybeSingle();

        if (existingError && existingError.code !== 'PGRST116') {
            console.error('Save Schedule Read Existing Error:', existingError);
            return res.status(500).json({ error: 'Failed to read existing schedule', details: existingError.message });
        }

        const finalTelegramBotToken = telegramBotToken || existingSchedule?.telegram_bot_token || null;
        const finalTelegramChatId = telegramChatId || existingSchedule?.telegram_chat_id || null;
        const finalFbAccessToken = fbAccessToken || existingSchedule?.fb_access_token || null;
        const finalScheduleTime = scheduleTime || existingSchedule?.schedule_time || '08:00';

        let finalIsEnabled: boolean;
        if (typeof isEnabled === 'boolean') {
            finalIsEnabled = isEnabled;
        } else if (typeof existingSchedule?.is_enabled === 'boolean') {
            finalIsEnabled = existingSchedule.is_enabled;
        } else {
            finalIsEnabled = false;
        }

        // Safety: do not keep schedule enabled if Telegram credentials are incomplete
        if (!finalTelegramBotToken || !finalTelegramChatId) {
            finalIsEnabled = false;
        }

        const { error } = await supabase
            .from('analysis_schedules')
            .upsert({
                fb_id: fbId,
                ad_account_id: adAccountId,
                schedule_time: finalScheduleTime,
                is_enabled: finalIsEnabled,
                telegram_bot_token: finalTelegramBotToken,
                telegram_chat_id: finalTelegramChatId,
                fb_access_token: finalFbAccessToken,  // Save FB token
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'fb_id'
            });

        if (error) {
            console.error('Save Schedule Error:', error);
            return res.status(500).json({ error: 'Failed to save schedule', details: error.message });
        }

        return res.status(200).json({
            success: true,
            message: 'Schedule saved successfully'
        });

    } catch (error: any) {
        console.error('Save Schedule Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Get Schedule Handler - Retrieve analysis schedule from Supabase
async function handleGetSchedule(req: any, res: any) {
    try {
        const { fbId } = req.query;

        if (!fbId) {
            return res.status(400).json({ error: 'Missing fbId' });
        }

        const { data, error } = await supabase
            .from('analysis_schedules')
            .select('*')
            .eq('fb_id', fbId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            console.error('Get Schedule Error:', error);
            return res.status(500).json({ error: 'Failed to get schedule' });
        }

        return res.status(200).json({
            success: true,
            schedule: data || null
        });

    } catch (error: any) {
        console.error('Get Schedule Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
