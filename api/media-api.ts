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
export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action, uuid, page = '1' } = req.query;

    // Handle POST requests (telegram-webhook)
    if (req.method === 'POST') {
        if (action === 'telegram-webhook') {
            return handleTelegramWebhook(req, res);
        }
        return res.status(400).json({ error: 'Invalid POST action. Use: telegram-webhook' });
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
                            text: '🔄 Analyzing creative with AI... Tunggu sekejap!'
                        })
                    });

                    // Send analyzing message
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `🎬 *AI Prompt Generation*\n\n_Menganalisis creative Ads #${adIndex + 1} dengan Gemini..._`,
                            parse_mode: 'Markdown'
                        })
                    });

                    // Generate AI prompt based on ad creative analysis
                    let videoPrompt = '';
                    try {
                        const geminiApiKey = process.env.GEMINI_3_API;
                        if (geminiApiKey) {
                            const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

                            // Prompt template for video generation
                            const analysisPrompt = `You are an expert video prompt engineer for AI video generation tools like Sora 2 and Google Veo 3.1.

Based on this Facebook/Meta Ad ID: ${adId}

Generate a detailed, specific video generation prompt in English that would recreate this ad's style and flow. The prompt should:
1. Describe the visual style, camera movements, and lighting
2. Include specific scene descriptions and transitions
3. Mention the product/service presentation style
4. Include text overlay suggestions
5. Describe the call-to-action ending

Format the output as a single paragraph prompt, ready to paste into Sora 2 or Veo 3.1.
Keep it between 100-150 words.
Do NOT include any markdown, just plain text prompt.`;

                            const result = await genAI.models.generateContent({
                                model: 'gemini-3-flash-preview',
                                contents: [{ text: analysisPrompt }]
                            });

                            const generatedPrompt = result.text || 'Unable to generate prompt';

                            videoPrompt = `🎬 *Video Prompt untuk Sora 2 / Veo 3.1*

*Ads ID:* \`${adId}\`

---

\`\`\`
${generatedPrompt}
\`\`\`

---
_Copy prompt di atas dan paste ke Sora 2 atau Veo 3.1_
_AI: Gemini 3 Flash | Est. Cost: ~RM0.01_`;
                        } else {
                            videoPrompt = `❌ GEMINI_3_API not configured`;
                        }
                    } catch (aiError: any) {
                        console.error('AI Prompt Generation Error:', aiError);
                        videoPrompt = `❌ *Error generating prompt*\n\n${aiError.message || 'Unknown error'}`;
                    }

                    // Send the generated prompt
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: videoPrompt,
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
