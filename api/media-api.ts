/**
 * Consolidated Media API for GeminiGen.ai + Rapid Import + Logging
 * Handles: video-status, video-history, image-history, telegram-webhook, import, log-campaign, log-user
 * 
 * Usage:
 * GET /api/media-api?action=video-status&uuid=xxx
 * GET /api/media-api?action=video-history&page=1
 * GET /api/media-api?action=image-history&page=1
 * GET /api/media-api?action=import-list
 * POST /api/media-api?action=telegram-webhook (Telegram callback)
 * POST /api/media-api?action=import (body: {mediaUrl, mediaType, name, sourceUuid, source})
 * POST /api/media-api?action=log-campaign (body: {fbUserId, fbUserName, campaignName, objective, mediaType, adAccountId})
 * POST /api/media-api?action=log-user (body: {fbId, fbName, profilePicture, tokenExpiresAt, adAccountId, adAccountName})
 * DELETE /api/media-api?action=import-delete&id=xxx
 */
import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';

// Vercel function config - allow 60s for video analysis in webhook
export const config = {
    maxDuration: 60
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
        if (action === 'import') {
            return handleImport(req, res);
        }
        if (action === 'log-campaign') {
            return handleLogCampaign(req, res);
        }
        if (action === 'log-user') {
            return handleLogUser(req, res);
        }
        return res.status(400).json({ error: 'Invalid POST request' });
    }

    // Handle DELETE requests
    if (req.method === 'DELETE') {
        if (action === 'import-delete') {
            return handleImportDelete(req, res);
        }
        return res.status(400).json({ error: 'Invalid DELETE request' });
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
            case 'import-list':
                return handleImportList(req, res);
            default:
                return res.status(400).json({ error: 'Invalid action. Use: video-status, video-history, image-history, import-list, import, import-delete, log-campaign, log-user, or telegram-webhook' });
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
            // Handle prompt generation request
            // NEW format: p_{index}_{videoId}_{adName}
            // OLD format: prompt_{index}_{adId} (for backwards compatibility)
            if (callbackData.startsWith('p_') || callbackData.startsWith('prompt_')) {
                const isNewFormat = callbackData.startsWith('p_');
                const parts = callbackData.split('_');

                let adIndex: number;
                let videoId: string | null = null;
                let isImageAd: boolean = false;
                let adName: string = 'Unknown';

                if (isNewFormat) {
                    // p_{index}_{mediaId}_{adName...} 
                    // mediaId = i{igMediaId} or v{videoId} or 'img'
                    adIndex = parseInt(parts[1], 10);
                    const mediaId = parts[2];

                    // Check prefix to determine media type
                    // x{adId} = image ad, i{igMediaId} = IG video, v{videoId} = FB video
                    if (mediaId === 'img' || mediaId === 'none') {
                        isImageAd = true;
                    } else if (mediaId.startsWith('x')) {
                        // Image ad with ad_id - need to fetch image URL
                        isImageAd = true;
                        videoId = mediaId.substring(1); // Actually ad_id, reusing variable
                        console.log(`[Prompt Gen] Image Ad detected, ad_id: ${videoId}`);
                    } else if (mediaId.startsWith('i') && mediaId.length > 3) {
                        // Instagram media ID - use media_url field (check length to avoid 'img')
                        videoId = mediaId.substring(1);
                        console.log(`[Prompt Gen] Instagram Media ID detected: ${videoId}`);
                    } else if (mediaId.startsWith('v')) {
                        // Video ID - use source field  
                        videoId = mediaId.substring(1);
                        console.log(`[Prompt Gen] Video ID detected: ${videoId}`);
                    }
                    adName = parts.slice(3).join('_') || 'Ad';
                } else {
                    // prompt_{index}_{adId}
                    adIndex = parseInt(parts[1], 10);
                }

                // Track media type for API call
                const isInstagramMedia = isNewFormat && parts[2].startsWith('i') && parts[2].length > 3;

                console.log(`[Prompt Gen] Format: ${isNewFormat ? 'NEW' : 'OLD'}, adIndex: ${adIndex}, videoId: ${videoId}, isImageAd: ${isImageAd}, isIG: ${isInstagramMedia}, adName: ${adName}`);

                if (botToken) {
                    // Answer callback with loading message
                    const loadingText = isImageAd ? '🔄 Analyzing image creative... Tunggu!' : '🔄 Fetching video & analyzing scenes... Tunggu!';
                    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callback_query_id: callbackQuery.id,
                            text: loadingText
                        })
                    });

                    // Send analyzing message
                    const analysisTitle = isImageAd ? '📷 *Image Analysis' : '🎬 *Scene Analysis';
                    const analysisDesc = isImageAd ? 'Analyzing image creative' : 'Fetching video dan analyzing';
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `${analysisTitle} untuk Ads #${adIndex + 1}*\n\n_${analysisDesc} dengan Gemini..._\n_Ini mungkin ambil 15-30 saat._`,
                            parse_mode: 'Markdown'
                        })
                    });

                    let resultMessage = '';

                    // Get FB access token from telegram_users table
                    let fbAccessToken: string | null = null;

                    try {
                        console.log(`[Prompt Gen] Looking up FB token for chat_id: ${chatId}`);
                        const { data, error } = await supabase
                            .from('telegram_users')
                            .select('fb_access_token')
                            .eq('telegram_chat_id', String(chatId))
                            .single();

                        if (data && data.fb_access_token) {
                            fbAccessToken = data.fb_access_token;
                            console.log(`[Prompt Gen] Got FB token from telegram_users`);
                        } else if (error) {
                            console.error(`[Prompt Gen] telegram_users error:`, error);
                        }
                    } catch (tokenErr: any) {
                        console.error(`[Prompt Gen] Token lookup error:`, tokenErr);
                    }

                    if (!fbAccessToken) {
                        resultMessage = `❌ *FB Token Not Found*\n\nSila pergi ke Settings dan save Telegram settings semula.`;
                    } else if (!videoId && !isImageAd) {
                        resultMessage = `❌ *Media tidak dijumpai*\n\nSila run AI Analysis semula.`;
                    } else if (isImageAd && videoId) {
                        // Image ad with ad_id - fetch and analyze image
                        const geminiApiKey = process.env.VITE_GEMINI_3_API;

                        if (!geminiApiKey) {
                            resultMessage = `❌ VITE_GEMINI_3_API not configured`;
                        } else {
                            try {
                                console.log(`[Image Analysis] Fetching ad creative for ad_id: ${videoId}`);

                                // Fetch ad creative data from Meta
                                const adUrl = `https://graph.facebook.com/v19.0/${videoId}?fields=creative{image_url,thumbnail_url}&access_token=${fbAccessToken}`;
                                const adRes = await fetch(adUrl);
                                const adData = await adRes.json();
                                console.log(`[Image Analysis] Ad data:`, JSON.stringify(adData));

                                const imageUrl = adData.creative?.image_url || adData.creative?.thumbnail_url;

                                if (!imageUrl) {
                                    resultMessage = `❌ *Image URL tidak dijumpai*\n\nAd ID: ${videoId}`;
                                } else {
                                    console.log(`[Image Analysis] Downloading image...`);
                                    const imgRes = await fetch(imageUrl);
                                    const imgBuffer = await imgRes.arrayBuffer();
                                    const base64Img = Buffer.from(imgBuffer).toString('base64');

                                    const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

                                    const imagePrompt = `Analyze image iklan ini (MESTI kurang 100 patah perkataan TOTAL):

**1. Hook / Stop-Scroll:**
(30-40 patah perkataan - apa yang tarik perhatian, warna, visual, kontras)

**2. Elemen Emosi:**
(30-40 patah perkataan - emosi apa yang dorong action/purchase/wakaf)

**3. IMAGE PROMPT:**
(30 patah perkataan BM - prompt untuk recreate visual tanpa text/tulisan)`;

                                    const result = await genAI.models.generateContent({
                                        model: 'gemini-3-flash-preview',
                                        contents: [
                                            { text: imagePrompt },
                                            {
                                                inlineData: {
                                                    mimeType: 'image/jpeg',
                                                    data: base64Img
                                                }
                                            }
                                        ]
                                    });

                                    const analysis = result.text || 'Unable to analyze';
                                    resultMessage = `📷 *Image Analysis: ${adName}*\n\n${analysis}\n\n---\n_AI: Gemini 3 Flash | Est. Cost: ~RM0.02_`;
                                }
                            } catch (imgErr: any) {
                                console.error(`[Image Analysis] Error:`, imgErr);
                                resultMessage = `❌ *Error analyzing image*\n\n${imgErr.message}`;
                            }
                        }
                    } else if (isImageAd) {
                        resultMessage = `📷 *Image Ad: ${adName}*\n\nTiada image URL tersedia untuk analysis.`;
                    } else {
                        const geminiApiKey = process.env.VITE_GEMINI_3_API;

                        if (!geminiApiKey) {
                            resultMessage = `❌ VITE_GEMINI_3_API not configured`;
                        } else {
                            try {
                                const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
                                let videoUrl = null;

                                console.log(`[Prompt Gen] VideoId: ${videoId}, AdName: ${adName}, isInstagramMedia: ${isInstagramMedia}`);

                                // Fetch video URL - different endpoints for Instagram vs Facebook
                                if (isInstagramMedia) {
                                    // Instagram media - use media_url field
                                    console.log(`[Prompt Gen] Fetching Instagram media ${videoId}...`);
                                    const igUrl = `https://graph.facebook.com/v19.0/${videoId}?fields=media_url&access_token=${fbAccessToken}`;
                                    const igRes = await fetch(igUrl);
                                    const igData = await igRes.json();
                                    console.log(`[Prompt Gen] IG API response:`, JSON.stringify(igData));

                                    if (igData.media_url) {
                                        videoUrl = igData.media_url;
                                        console.log(`[Prompt Gen] Got video from Instagram media_url`);
                                    } else if (igData.error) {
                                        console.error(`[Prompt Gen] IG API error:`, igData.error);
                                    }
                                } else {
                                    // Facebook video - use source field
                                    console.log(`[Prompt Gen] Fetching FB video ${videoId}...`);
                                    const videoApiUrl = `https://graph.facebook.com/v19.0/${videoId}?fields=source,permalink_url&access_token=${fbAccessToken}`;
                                    const videoRes = await fetch(videoApiUrl);
                                    const videoData = await videoRes.json();
                                    console.log(`[Prompt Gen] FB API response:`, JSON.stringify(videoData));

                                    if (videoData.source) {
                                        videoUrl = videoData.source;
                                        console.log(`[Prompt Gen] Got video from FB source`);
                                    } else if (videoData.error) {
                                        console.error(`[Prompt Gen] FB API error:`, videoData.error);
                                    }
                                }

                                if (!videoUrl) {
                                    resultMessage = `❌ *Video tidak dijumpai*\n\nVideo ID: ${videoId}\nAd Name: ${adName}\n\nKemungkinan:\n• Video telah dipadam\n• Token expired\n• Permission issue`;
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

                                    // Analyze video for scene breakdown - BM with dialog, <100 words
                                    const scenePrompt = `Analyze video iklan ini dan berikan (MESTI kurang 100 patah perkataan TOTAL):

1. **SCENE FLOW** - 3-5 scene utama sahaja:
Format: [Xs]: [visual] + [dialog dalam BM]
Contoh: 0-2s: Wanita bertudung di masjid, dialog: "Nak sedekah..."

2. **VIDEO PROMPT** - Prompt BAHASA MALAYSIA untuk recreate video (50-70 patah perkataan):
- WAJIB sertakan dialog dalam BM
- JANGAN masukkan sebarang text/subtitle pada visual
- Fokus: pergerakan kamera, lighting, emosi

PERATURAN:
- Bahasa Malaysia SAHAJA
- JANGAN hasilkan text/tulisan/subtitle dalam video`;

                                    const result = await genAI.models.generateContent({
                                        model: 'gemini-3-flash-preview',
                                        contents: [
                                            { text: scenePrompt },
                                            { fileData: { fileUri: file.uri!, mimeType: 'video/mp4' } }
                                        ]
                                    });

                                    const analysis = result.text || 'Unable to analyze';

                                    resultMessage = `🎬 *Scene Analysis: ${adName}*\n\n${analysis}\n\n---\n_AI: Gemini 3 Flash | Est. Cost: ~RM0.05_`;

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
                return res.status(200).json({ success: true, action: 'prompt_generated', videoId, adIndex });
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

// Import media to Rapid Campaign (from import-to-rapid.ts)
async function handleImportList(req: any, res: any) {
    try {
        const now = new Date().toISOString();

        const { data, error } = await supabase
            .from('rapid_creatives')
            .select('*')
            .gt('expires_at', now)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[RapidImport] Fetch error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ success: true, creatives: data || [] });
    } catch (error: any) {
        console.error('[RapidImport] Server Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

async function handleImport(req: any, res: any) {
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

    if (!SUPABASE_SERVICE_KEY) {
        console.error('[RapidImport] SUPABASE_SERVICE_KEY not configured');
        return res.status(500).json({
            error: 'SUPABASE_SERVICE_KEY not configured. Please add it to your Vercel environment variables.',
            setup_required: true
        });
    }

    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        const { mediaUrl, mediaType, name, sourceUuid, source } = req.body;

        if (!mediaUrl) {
            return res.status(400).json({ error: 'Media URL is required' });
        }

        console.log(`[RapidImport] Downloading media: ${mediaUrl.substring(0, 80)}...`);

        // Download the media from external URL
        const mediaResponse = await fetch(mediaUrl);
        if (!mediaResponse.ok) {
            throw new Error(`Failed to download media: ${mediaResponse.status}`);
        }

        const contentType = mediaResponse.headers.get('content-type') ||
            (mediaType === 'video' ? 'video/mp4' : 'image/png');
        const extension = mediaType === 'video' ? 'mp4' :
            (contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png');

        const buffer = await mediaResponse.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);

        // Generate unique filename
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const fileName = `${timestamp}-${randomId}.${extension}`;
        const filePath = `imports/${fileName}`;

        console.log(`[RapidImport] Uploading to Supabase storage: ${filePath}`);

        // Upload to Supabase storage
        const { error: uploadError } = await supabaseService.storage
            .from('rapid-creatives')
            .upload(filePath, uint8Array, {
                contentType,
                upsert: false
            });

        if (uploadError) {
            console.error('[RapidImport] Upload error:', uploadError);
            return res.status(500).json({ error: 'Failed to upload to storage: ' + uploadError.message });
        }

        // Get public URL
        const { data: urlData } = supabaseService.storage
            .from('rapid-creatives')
            .getPublicUrl(filePath);

        const publicUrl = urlData?.publicUrl;

        // Calculate expiry (7 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Insert record into database
        const { data: insertData, error: insertError } = await supabaseService
            .from('rapid_creatives')
            .insert({
                file_url: publicUrl,
                file_path: filePath,
                media_type: mediaType || 'image',
                original_url: mediaUrl,
                name: name || `Imported ${mediaType}`,
                source_uuid: sourceUuid,
                source: source || null,
                created_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('[RapidImport] Insert error:', insertError);
            // Cleanup uploaded file on insert failure
            await supabaseService.storage.from('rapid-creatives').remove([filePath]);
            return res.status(500).json({ error: 'Failed to save record: ' + insertError.message });
        }

        console.log(`[RapidImport] Success! ID: ${insertData.id}`);

        return res.status(200).json({
            success: true,
            creative: insertData,
            message: 'Media imported successfully'
        });

    } catch (error: any) {
        console.error('[RapidImport] Server Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
}

async function handleImportDelete(req: any, res: any) {
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' });
    }

    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: 'Creative ID is required' });
        }

        // Get the creative to find the file path
        const { data: creative, error: fetchError } = await supabaseService
            .from('rapid_creatives')
            .select('file_path')
            .eq('id', id)
            .single();

        if (fetchError) {
            console.error('[RapidImport] Fetch for delete error:', fetchError);
        }

        // Delete from storage if file path exists
        if (creative?.file_path) {
            const { error: storageError } = await supabaseService.storage
                .from('rapid-creatives')
                .remove([creative.file_path]);

            if (storageError) {
                console.error('[RapidImport] Storage delete error:', storageError);
            }
        }

        // Delete from database
        const { error: deleteError } = await supabaseService
            .from('rapid_creatives')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('[RapidImport] Delete error:', deleteError);
            return res.status(500).json({ error: deleteError.message });
        }

        return res.status(200).json({ success: true, message: 'Creative deleted' });
    } catch (error: any) {
        console.error('[RapidImport] Server Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Log campaign creation (from log-campaign.ts)
async function handleLogCampaign(req: any, res: any) {
    try {
        const {
            fbUserId,
            fbUserName,
            campaignName,
            objective,
            mediaType,
            adAccountId
        } = req.body;

        if (!fbUserId || !campaignName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const now = new Date().toISOString();

        // Insert campaign
        const { data, error } = await supabase
            .from('tracked_campaigns')
            .insert({
                fb_user_id: fbUserId,
                fb_user_name: fbUserName || 'Unknown',
                campaign_name: campaignName,
                objective: objective || 'OUTCOME_SALES',
                media_type: mediaType || 'IMAGE',
                ad_account_id: adAccountId || '',
                created_at: now
            })
            .select();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Update user's last_active
        await supabase
            .from('tracked_users')
            .update({ last_active: now })
            .eq('fb_id', fbUserId);

        console.log(`Campaign logged: ${campaignName} by ${fbUserName}`);

        return res.status(200).json({
            success: true,
            message: 'Campaign logged successfully',
            campaignId: data?.[0]?.id
        });

    } catch (error: any) {
        console.error('Log Campaign Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Log user connection (from log-user.ts)
async function handleLogUser(req: any, res: any) {
    try {
        const {
            fbId,
            fbName,
            profilePicture,
            tokenExpiresAt,
            adAccountId,
            adAccountName
        } = req.body;

        if (!fbId || !fbName) {
            return res.status(400).json({ error: 'Missing required fields: fbId, fbName' });
        }

        const now = new Date().toISOString();

        // Upsert user (insert or update if exists)
        const { data, error } = await supabase
            .from('tracked_users')
            .upsert({
                fb_id: fbId,
                fb_name: fbName,
                profile_picture: profilePicture || '',
                token_expires_at: tokenExpiresAt || null,
                ad_account_id: adAccountId || '',
                ad_account_name: adAccountName || '',
                last_active: now,
                updated_at: now
            }, {
                onConflict: 'fb_id',
                ignoreDuplicates: false
            })
            .select();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log(`User logged: ${fbName} (${fbId})`);

        return res.status(200).json({
            success: true,
            message: 'User logged successfully'
        });

    } catch (error: any) {
        console.error('Log User Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
