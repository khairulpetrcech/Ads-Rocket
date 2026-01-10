/**
 * Consolidated Media API for GeminiGen.ai
 * Handles: video-status, video-history, image-history, telegram-webhook
 * 
 * Usage:
 * GET /api/media-api?action=video-status&uuid=xxx
 * GET /api/media-api?action=video-history&page=1
 * GET /api/media-api?action=image-history&page=1
 * POST /api/media-api?action=telegram-webhook (Telegram callback)
 */
import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action, uuid, page = '1' } = req.query;

    // Handle POST requests
    if (req.method === 'POST') {
        // Auto-detect Telegram webhook from body structure (callback_query or message)
        if (req.body && (req.body.callback_query || req.body.message || req.body.update_id)) {
            console.log('[Media API] Auto-detected Telegram webhook from body');
            return handleTelegramWebhook(req, res);
        }
        // Fallback to action query param
        if (action === 'telegram-webhook') {
            return handleTelegramWebhook(req, res);
        }
        return res.status(400).json({ error: 'Invalid POST request' });
    }

    // Handle GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINIGEN_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINIGEN_API_KEY not configured' });
    }

    try {
        switch (action) {
            case 'video-status':
                return handleVideoStatus(req, res, apiKey, uuid);
            case 'video-history':
                return handleVideoHistory(req, res, apiKey, parseInt(page as string, 10) || 1);
            case 'image-history':
                return handleImageHistory(req, res, apiKey, parseInt(page as string, 10) || 1);
            default:
                return res.status(400).json({ error: 'Invalid action. Use: video-status, video-history, image-history, or telegram-webhook' });
        }
    } catch (error: any) {
        console.error('[Media API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Video Status Handler
async function handleVideoStatus(req: any, res: any, apiKey: string, uuid: string) {
    if (!uuid) {
        return res.status(400).json({ error: 'UUID is required' });
    }

    const url = `https://api.geminigen.ai/uapi/v1/history/${uuid}`;
    const response = await fetch(url, {
        headers: { "x-api-key": apiKey }
    });

    const data = await response.json();

    if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch status' });
    }

    const status = data.status;
    const progress = data.status_percentage || 0;

    if (status === 2) {
        let videoUrl = null;
        if (data.generated_video && data.generated_video.length > 0) {
            videoUrl = data.generated_video[0].video_url;
        }
        // Also check for images
        let imageUrl = null;
        if (data.generated_image && data.generated_image.length > 0) {
            imageUrl = data.generated_image[0].image_url;
        }

        return res.status(200).json({
            success: true,
            status: 'completed',
            done: true,
            url: videoUrl || imageUrl,
            progress: 100
        });

    } else if (status === 3) {
        return res.status(200).json({
            success: false,
            status: 'failed',
            done: true,
            error: data.error_message || 'Generation failed'
        });

    } else {
        return res.status(200).json({
            success: true,
            status: 'processing',
            done: false,
            progress: progress
        });
    }
}

// Video History Handler
async function handleVideoHistory(req: any, res: any, apiKey: string, pageNum: number) {
    const url = `https://api.geminigen.ai/uapi/v1/histories?filter_by=all&items_per_page=6&page=${pageNum}`;
    const response = await fetch(url, {
        headers: { "x-api-key": apiKey }
    });

    const data = await response.json();

    if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch history' });
    }

    const videoHistory = (data.result || []).filter((item: any) =>
        item.type === 'video_generation' || item.model_name?.includes('sora')
    );

    // Fetch detailed history for each video to get actual video URL
    const videos = await Promise.all(videoHistory.map(async (item: any) => {
        let videoUrl = item.generate_result || null;

        // If completed, fetch detailed history to get proper video URL
        if (item.status === 2 && item.uuid) {
            try {
                const detailUrl = `https://api.geminigen.ai/uapi/v1/history/${item.uuid}`;
                const detailRes = await fetch(detailUrl, {
                    headers: { "x-api-key": apiKey }
                });
                const detailData = await detailRes.json();

                if (detailData.generated_video && detailData.generated_video.length > 0) {
                    videoUrl = detailData.generated_video[0].video_url;
                }
            } catch (e) {
                console.error('Failed to fetch video detail:', e);
            }
        }

        return {
            id: item.id,
            uuid: item.uuid,
            prompt: item.input_text,
            model: item.model_name,
            status: item.status,
            thumbnailUrl: item.thumbnail_url || item.generate_result || null,
            videoUrl: videoUrl,
            createdAt: item.created_at,
            expiresAt: item.expired_at
        };
    }));

    return res.status(200).json({
        success: true,
        videos,
        total: data.total || 0,
        page: pageNum,
        totalPages: Math.ceil((data.total || 0) / 6)
    });
}

// Image History Handler
async function handleImageHistory(req: any, res: any, apiKey: string, pageNum: number) {
    const url = `https://api.geminigen.ai/uapi/v1/histories?filter_by=all&items_per_page=6&page=${pageNum}`;
    const response = await fetch(url, {
        headers: { "x-api-key": apiKey }
    });

    const data = await response.json();

    if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch history' });
    }

    const imageHistory = (data.result || []).filter((item: any) =>
        item.type === 'image_generation' || item.model_name?.includes('imagen')
    );

    const images = imageHistory.map((item: any) => ({
        id: item.id,
        uuid: item.uuid,
        prompt: item.input_text,
        model: item.model_name,
        status: item.status,
        imageUrl: item.generate_result || null,
        thumbnailUrl: item.thumbnail_small || item.generate_result || null,
        createdAt: item.created_at,
        expiresAt: item.expired_at
    }));

    return res.status(200).json({
        success: true,
        images,
        total: data.total || 0,
        page: pageNum,
        totalPages: Math.ceil((data.total || 0) / 6)
    });
}

// Telegram Webhook Handler for Upscale Callback
async function handleTelegramWebhook(req: any, res: any) {
    console.log('[Telegram Webhook] Received request');
    console.log('[Telegram Webhook] Body:', JSON.stringify(req.body, null, 2));

    try {
        const update = req.body;

        // Handle callback query (button press)
        if (update.callback_query) {
            console.log('[Telegram Webhook] Processing callback_query');
            const callbackQuery = update.callback_query;
            const callbackData = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            console.log('[Telegram Webhook] Bot token exists:', !!botToken);
            console.log('[Telegram Webhook] Callback data:', callbackData);
            // Handle prompt generation request: prompt_{index}_{adId}
            if (callbackData.startsWith('prompt_')) {
                const parts = callbackData.split('_');
                const adIndex = parseInt(parts[1], 10);
                const adId = parts.slice(2).join('_');

                if (botToken) {
                    // Answer callback with loading message
                    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callback_query_id: callbackQuery.id,
                            text: '🔄 Fetching video & analyzing scenes... Tunggu!'
                        })
                    });

                    // Send analyzing message
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `🎬 *Scene Analysis untuk Ads #${adIndex + 1}*\n\n_Fetching video dan analyzing dengan Gemini..._\n_Ini mungkin ambil 30-60 saat._`,
                            parse_mode: 'Markdown'
                        })
                    });

                    // Get cached ad data from Supabase
                    let cachedData: any = null;
                    let ads: any[] = [];
                    let cacheError: string = '';

                    console.log(`[Prompt Gen] Looking for cache with chat_id: ${chatId}`);

                    try {
                        const { data, error } = await supabase
                            .from('ads_cache')
                            .select('*')
                            .eq('chat_id', String(chatId))
                            .single();

                        console.log(`[Prompt Gen] Supabase response - data: ${!!data}, error: ${error?.message || 'none'}`);

                        if (error) {
                            cacheError = error.message || 'Unknown Supabase error';
                            console.error('[Prompt Gen] Supabase error:', error);
                        } else if (data) {
                            cachedData = data;
                            ads = JSON.parse(data.ads_data || '[]');
                            console.log(`[Prompt Gen] Found ${ads.length} ads in cache`);
                        }
                    } catch (cacheErr: any) {
                        cacheError = cacheErr.message || 'Exception fetching cache';
                        console.error('[Prompt Gen] Cache fetch exception:', cacheErr);
                    }

                    let resultMessage = '';

                    if (!cachedData || !ads[adIndex]) {
                        resultMessage = `❌ *Cache Not Found*\n\nChat ID: ${chatId}\nError: ${cacheError || 'No cache data'}\n\nSila run AI Analysis semula untuk refresh data.`;
                    } else {
                        const ad = ads[adIndex];
                        const fbAccessToken = cachedData.fb_access_token;
                        const geminiApiKey = process.env.GEMINI_3_API;

                        if (!geminiApiKey) {
                            resultMessage = `❌ GEMINI_3_API not configured`;
                        } else {
                            try {
                                const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
                                let videoUrl = null;

                                console.log(`[Prompt Gen] Ad data:`, JSON.stringify(ad));

                                // Fetch video URL from Meta API
                                if (ad.videoId) {
                                    console.log(`[Prompt Gen] Fetching video ${ad.videoId} from Meta...`);
                                    const videoApiUrl = `https://graph.facebook.com/v21.0/${ad.videoId}?fields=source,permalink_url&access_token=${fbAccessToken}`;
                                    const videoRes = await fetch(videoApiUrl);
                                    const videoData = await videoRes.json();
                                    console.log(`[Prompt Gen] Meta API response:`, JSON.stringify(videoData));

                                    if (videoData.source) {
                                        videoUrl = videoData.source;
                                        console.log(`[Prompt Gen] Got video source URL`);
                                    } else if (videoData.error) {
                                        console.error(`[Prompt Gen] Meta API error:`, videoData.error);
                                    }
                                }

                                if (!videoUrl && ad.videoId) {
                                    // Try Instagram media ID fallback
                                    console.log(`[Prompt Gen] Trying Instagram fallback...`);
                                    const igUrl = `https://graph.facebook.com/v21.0/${ad.videoId}?fields=media_url&access_token=${fbAccessToken}`;
                                    const igRes = await fetch(igUrl);
                                    const igData = await igRes.json();
                                    console.log(`[Prompt Gen] IG response:`, JSON.stringify(igData));
                                    videoUrl = igData.media_url;
                                }

                                if (!videoUrl) {
                                    resultMessage = `❌ *Video tidak dijumpai*\n\nVideo ID: ${ad.videoId || 'N/A'}\nAd Name: ${ad.name}\n\nKemungkinan:\n• Video telah dipadam\n• Token expired\n• Permission issue`;
                                } else {
                                    // Download video
                                    console.log(`[Prompt Gen] Downloading video...`);
                                    const videoResponse = await fetch(videoUrl);
                                    const videoBuffer = await videoResponse.arrayBuffer();
                                    const base64Video = Buffer.from(videoBuffer).toString('base64');

                                    // Upload to Gemini Files API
                                    console.log(`[Prompt Gen] Uploading to Gemini...`);
                                    const uploadResult = await genAI.files.upload({
                                        file: new Blob([videoBuffer], { type: 'video/mp4' }),
                                        config: { mimeType: 'video/mp4' }
                                    });

                                    // Wait for processing
                                    let file = uploadResult;
                                    while (file.state === 'PROCESSING') {
                                        await new Promise(r => setTimeout(r, 2000));
                                        file = await genAI.files.get({ name: file.name! });
                                    }

                                    if (file.state === 'FAILED') {
                                        throw new Error('File processing failed');
                                    }

                                    console.log(`[Prompt Gen] Analyzing with Gemini...`);

                                    // Analyze video for scene breakdown
                                    const scenePrompt = `Anda adalah pakar analisis video iklan. Analyze video ini dan berikan:

1. **SCENE FLOW** - Pecahkan video ikut second/timestamp:
Format: [Xs]: [visual description] + [dialog jika ada]
Contoh:
0-1s: Wanita muda di depan rumah kampung, memegang telefon
1-2s: Close-up wajah sedih, dialog: "Rindu mak..."
2-3s: Cut ke interior rumah, orang tua berbaring di katil
(senaraikan SEMUA scene dalam video)

2. **VIDEO GENERATION PROMPT** - Prompt dalam English untuk recreate video ini di Sora 2/Veo 3.1:
- Describe camera movements, lighting, transitions
- Include all visual elements and style
- 100-150 words, single paragraph

Output format:
---SCENE FLOW---
[scene list here]

---VIDEO PROMPT---
[prompt here]`;

                                    const result = await genAI.models.generateContent({
                                        model: 'gemini-3-flash-preview',
                                        contents: [
                                            { text: scenePrompt },
                                            { fileData: { fileUri: file.uri!, mimeType: 'video/mp4' } }
                                        ]
                                    });

                                    const analysis = result.text || 'Unable to analyze';

                                    resultMessage = `🎬 *Scene Analysis: ${ad.name}*\n\n${analysis}\n\n---\n_AI: Gemini 3 Flash | Est. Cost: ~RM0.05_`;

                                    // Cleanup file
                                    try {
                                        await genAI.files.delete({ name: file.name! });
                                    } catch (e) { /* ignore cleanup errors */ }
                                }
                            } catch (analysisError: any) {
                                console.error('[Prompt Gen] Error:', analysisError);
                                resultMessage = `❌ *Error analyzing video*\n\n${analysisError.message || 'Unknown error'}`;
                            }
                        }
                    }

                    // Send the result
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: resultMessage,
                            parse_mode: 'Markdown'
                        })
                    });
                }

                return res.status(200).json({ success: true, action: 'prompt_generated', adId, adIndex });
            }

            // Parse callback data: upscale_yes_{adId} or upscale_no_{adId}
            if (callbackData.startsWith('upscale_yes_')) {
                const adId = callbackData.replace('upscale_yes_', '');

                if (botToken) {
                    // Answer callback to remove loading state
                    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callback_query_id: callbackQuery.id,
                            text: '✅ Upscale request received!'
                        })
                    });

                    // Edit message to show confirmation
                    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            message_id: messageId,
                            text: `✅ *Upscale Confirmed*\n\nAds ID: ${adId}\n\n⚠️ Upscale 20% budget akan dilaksanakan.\n\n_Nota: Feature ini dalam pembangunan. Sila upscale secara manual buat masa ini._`,
                            parse_mode: 'Markdown'
                        })
                    });
                }

                return res.status(200).json({ success: true, action: 'upscale_confirmed', adId });
            }

            if (callbackData.startsWith('upscale_no_')) {
                const adId = callbackData.replace('upscale_no_', '');

                if (botToken) {
                    // Answer callback
                    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callback_query_id: callbackQuery.id,
                            text: 'Okay, tidak upscale.'
                        })
                    });

                    // Edit message
                    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            message_id: messageId,
                            text: `❌ *Upscale Dibatalkan*\n\nAds ini tidak akan di-upscale.\n\n_Anda boleh upscale secara manual jika diperlukan._`,
                            parse_mode: 'Markdown'
                        })
                    });
                }

                return res.status(200).json({ success: true, action: 'upscale_cancelled', adId });
            }
        }

        // Default response for other updates
        return res.status(200).json({ success: true, message: 'Update received' });

    } catch (error: any) {
        console.error('[Telegram Webhook] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
