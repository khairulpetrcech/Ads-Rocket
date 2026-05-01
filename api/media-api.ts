/**
 * Consolidated Media API for Poyo AI + Rapid Import + Logging
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

const TELEGRAM_BOT_COMMANDS = [
    { command: 'create_ads', description: 'Pilih Ad Template untuk buat iklan' },
    { command: 'templates', description: 'Senarai Ad Template' },
    { command: 'analisa', description: 'Analisa ads manager' },
    { command: 'topads', description: 'Tunjuk top ads terakhir' },
    { command: 'status', description: 'Status creative generation' },
    { command: 'start', description: 'Buka menu Ads Rocket' }
];

async function syncTelegramBotCommands(botToken: string) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands: TELEGRAM_BOT_COMMANDS })
        });
        const data = await response.json();
        if (!data.ok) {
            console.warn('[Telegram] setMyCommands failed:', data);
        }
        return data;
    } catch (error) {
        console.warn('[Telegram] setMyCommands error:', error);
        return null;
    }
}

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
        if (action === 'generation-callback') {
            return handleGenerationCallback(req, res);
        }
        // Auto-detect Telegram webhook from body structure (callback_query or message)
        if (req.body && (req.body.callback_query || req.body.message || req.body.update_id)) {
            console.log('[Media API] Auto-detected Telegram webhook from body');
            return handleTelegramWebhook(req, res);
        }
        // Fallback to action query param
        if (action === 'telegram-webhook') {
            return handleTelegramWebhook(req, res);
        }
        if (action === 'telegram-commands') {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (!botToken) {
                return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
            }
            const result = await syncTelegramBotCommands(botToken);
            return res.status(200).json({ success: Boolean(result?.ok), result });
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

    const apiKey = process.env.POYO_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'POYO_API_KEY not configured' });
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

// Task Status Handler (Poyo AI unified status endpoint + Supabase sync)
async function handleVideoStatus(req: any, res: any, apiKey: string, uuid: string) {
    if (!uuid) {
        return res.status(400).json({ error: 'task_id is required' });
    }

    const url = `https://api.poyo.ai/api/generate/status/${uuid}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const data = await response.json();

    if (!response.ok || data.code !== 200) {
        return res.status(response.status || 500).json({ error: 'Failed to fetch status' });
    }

    const taskData = data.data;
    const status = taskData?.status;
    const progress = taskData?.progress || 0;

    if (status === 'finished') {
        let fileUrl = null;
        if (taskData.files && taskData.files.length > 0) {
            fileUrl = taskData.files[0].file_url;
        }

        // Sync to Supabase
        try {
            await supabase.from('generation_tasks')
                .update({ status: 'finished', file_url: fileUrl })
                .eq('task_id', uuid);

            const { data: creative } = await supabase
                .from('generated_creatives')
                .select('*')
                .eq('generation_task_id', uuid)
                .maybeSingle();
            if (creative && !creative.file_url && fileUrl) {
                await supabase.from('generated_creatives')
                    .update({ status: 'ready', file_url: fileUrl, updated_at: new Date().toISOString() })
                    .eq('id', creative.id);
                await sendGeneratedCreativeToTelegram({ ...creative, file_url: fileUrl });
            }
        } catch (e) { console.error('[Status] DB sync error:', e); }

        return res.status(200).json({
            success: true,
            status: 'completed',
            done: true,
            url: fileUrl,
            progress: 100
        });

    } else if (status === 'failed') {
        // Sync to Supabase
        try {
            await supabase.from('generation_tasks')
                .update({ status: 'failed' })
                .eq('task_id', uuid);
        } catch (e) { console.error('[Status] DB sync error:', e); }

        return res.status(200).json({
            success: false,
            status: 'failed',
            done: true,
            error: taskData.error_message || 'Generation failed'
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

// Video History Handler — Query Supabase + poll active tasks from Poyo
async function handleVideoHistory(req: any, res: any, apiKey: string, pageNum: number) {
    try {
        const perPage = 6;
        const offset = (pageNum - 1) * perPage;

        // Get total count
        const { count } = await supabase
            .from('generation_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('task_type', 'video');

        // Get page of tasks
        const { data: tasks, error } = await supabase
            .from('generation_tasks')
            .select('*')
            .eq('task_type', 'video')
            .order('created_at', { ascending: false })
            .range(offset, offset + perPage - 1);

        if (error) {
            console.error('[VideoHistory] DB error:', error);
            return res.status(500).json({ error: 'Failed to fetch history' });
        }

        // For non-finished tasks, poll Poyo for latest status
        const videos = await Promise.all((tasks || []).map(async (task: any, index: number) => {
            let status = task.status;
            let fileUrl = task.file_url;

            // Poll active tasks
            if (status !== 'finished' && status !== 'failed') {
                try {
                    const statusRes = await fetch(`https://api.poyo.ai/api/generate/status/${task.task_id}`, {
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    });
                    const statusData = await statusRes.json();
                    if (statusData.code === 200) {
                        status = statusData.data?.status || status;
                        if (status === 'finished' && statusData.data?.files?.length > 0) {
                            fileUrl = statusData.data.files[0].file_url;
                            // Update DB
                            await supabase.from('generation_tasks')
                                .update({ status: 'finished', file_url: fileUrl })
                                .eq('task_id', task.task_id);
                        } else if (status === 'failed') {
                            await supabase.from('generation_tasks')
                                .update({ status: 'failed' })
                                .eq('task_id', task.task_id);
                        }
                    }
                } catch (e) { /* ignore polling errors */ }
            }

            return {
                id: task.id || index,
                uuid: task.task_id,
                prompt: task.prompt,
                model: task.model,
                status: status === 'finished' ? 2 : status === 'failed' ? 3 : 1,
                thumbnailUrl: null,
                videoUrl: fileUrl,
                createdAt: task.created_at,
                expiresAt: ''
            };
        }));

        return res.status(200).json({
            success: true,
            videos,
            total: count || 0,
            page: pageNum,
            totalPages: Math.max(1, Math.ceil((count || 0) / perPage))
        });
    } catch (err: any) {
        console.error('[VideoHistory] Error:', err);
        return res.status(500).json({ error: err.message });
    }
}

// Image History Handler — Same pattern as video
async function handleImageHistory(req: any, res: any, apiKey: string, pageNum: number) {
    try {
        const perPage = 6;
        const offset = (pageNum - 1) * perPage;

        const { count } = await supabase
            .from('generation_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('task_type', 'image');

        const { data: tasks, error } = await supabase
            .from('generation_tasks')
            .select('*')
            .eq('task_type', 'image')
            .order('created_at', { ascending: false })
            .range(offset, offset + perPage - 1);

        if (error) {
            console.error('[ImageHistory] DB error:', error);
            return res.status(500).json({ error: 'Failed to fetch history' });
        }

        const images = await Promise.all((tasks || []).map(async (task: any, index: number) => {
            let status = task.status;
            let fileUrl = task.file_url;

            if (status !== 'finished' && status !== 'failed') {
                try {
                    const statusRes = await fetch(`https://api.poyo.ai/api/generate/status/${task.task_id}`, {
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    });
                    const statusData = await statusRes.json();
                    if (statusData.code === 200) {
                        status = statusData.data?.status || status;
                        if (status === 'finished' && statusData.data?.files?.length > 0) {
                            fileUrl = statusData.data.files[0].file_url;
                            await supabase.from('generation_tasks')
                                .update({ status: 'finished', file_url: fileUrl })
                                .eq('task_id', task.task_id);
                        } else if (status === 'failed') {
                            await supabase.from('generation_tasks')
                                .update({ status: 'failed' })
                                .eq('task_id', task.task_id);
                        }
                    }
                } catch (e) { /* ignore */ }
            }

            return {
                id: task.id || index,
                uuid: task.task_id,
                prompt: task.prompt,
                model: task.model,
                status: status === 'finished' ? 2 : status === 'failed' ? 3 : 1,
                imageUrl: fileUrl,
                thumbnailUrl: fileUrl,
                createdAt: task.created_at,
                expiresAt: ''
            };
        }));

        return res.status(200).json({
            success: true,
            images,
            total: count || 0,
            page: pageNum,
            totalPages: Math.max(1, Math.ceil((count || 0) / perPage))
        });
    } catch (err: any) {
        console.error('[ImageHistory] Error:', err);
        return res.status(500).json({ error: err.message });
    }
}

// Telegram Webhook Handler for Upscale Callback
// Telegram Webhook Handler for Upscale Callback & Campaign Management
async function handleTelegramWebhook(req: any, res: any) {
    console.log('[Telegram Webhook] Received request');
    const update = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    try {
        // --- 1. Handle Callback Query (Button Press) ---
        if (update.callback_query) {
            console.log('[Telegram Webhook] Processing callback_query');
            const callbackQuery = update.callback_query;
            const callbackData = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;

            // Handle bedah creative (on-demand analysis)
            if (callbackData.startsWith('bedah_')) {
                return await handleBedahCallback(callbackQuery, botToken, res);
            }

            // Handle generated creative approval workflow
            if (callbackData.startsWith('appr_')) {
                return await handleCreativeApprovalCallback(callbackQuery, botToken, 'approved', res);
            }
            if (callbackData.startsWith('rej_')) {
                return await handleCreativeApprovalCallback(callbackQuery, botToken, 'rejected', res);
            }
            if (callbackData.startsWith('lcr_')) {
                return await handleCreativeLaunchTemplateList(callbackQuery, botToken, res);
            }
            if (callbackData.startsWith('crtpl_')) {
                return await handleCreativeTemplateLaunch(callbackQuery, botToken, res);
            }

            // Handle prompt generation request
            if (callbackData.startsWith('p_') || callbackData.startsWith('prompt_')) {
                return await handlePromptGenerationCallback(callbackQuery, botToken, res);
            }

            // Handle upscale confirmation
            if (callbackData.startsWith('upscale_yes_')) {
                return await handleUpscaleCallback(callbackQuery, botToken, true, res);
            }
            if (callbackData.startsWith('upscale_no_')) {
                return await handleUpscaleCallback(callbackQuery, botToken, false, res);
            }

            // Handle Template Selection for Campaign Launch
            if (callbackData.startsWith('tpl_')) {
                const templateId = callbackData.replace('tpl_', '');
                return await handleTemplateSelection(chatId, templateId, botToken, res);
            }

            // Handle Ads Manager account selection for analysis
            if (callbackData.startsWith('analyze_act_')) {
                const adAccountId = callbackData.replace('analyze_act_', '');
                await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '⏳ Menganalisa...' })
                });
                return await runAnalysisForAccount(chatId, adAccountId, botToken!, res);
            }
        }

        // --- 2. Handle Incoming Message (Media or Text Command) ---
        if (update.message) {
            const chatId = update.message.chat.id;
            const text = update.message.text || update.message.caption || '';
            const video = update.message.video;
            const photo = update.message.photo;
            const document = update.message.document;

            // A0. Store uploaded documents for strategy/angle generation
            if (document) {
                return await handleDocumentUpload(chatId, document, botToken!, res);
            }

            // A. Handling Media (Video or Photo)
            if (video || photo) {
                const fileId = video ? video.file_id : photo[photo.length - 1].file_id;
                const mediaType = video ? 'video' : 'image';

                // Save to pending media
                await supabase
                    .from('telegram_pending_media')
                    .upsert({
                        chat_id: String(chatId),
                        file_id: fileId,
                        media_type: mediaType,
                        created_at: new Date().toISOString()
                    }, { onConflict: 'chat_id' });

                let responseText = mediaType === 'video' ? '🎬 *Video diterima!*' : '📷 *Gambar diterima!*';
                responseText += '\n\nSekarang hantar arahan campaign. Contoh:\n• `"Guna Template Wakaf"`\n• `"Guna Template A, bajet RM50"`\n• `"Launch manual budget RM30"`';

                await sendTelegramMessage(botToken!, chatId, responseText);
                return res.status(200).json({ success: true, action: 'media_saved' });
            }

            // B. Handling Text Commands or Instructions
            if (text) {
                // Check for commands
                if (text === '/start') {
                    if (botToken) {
                        await syncTelegramBotCommands(botToken);
                    }
                    const helpText = '👋 *Welcome to Ads Rocket!*\n\n' +
                        '*📊 Analisa:*\n' +
                        '`/analisa` — senarai semua ads manager\n' +
                        '`/analisa Nama Akaun` — analisa akaun tertentu\n' +
                        '`/ads Nama Iklan` — analisa iklan tertentu\n' +
                        '`/topads` — tunjuk top ads terakhir\n\n' +
                        '*🚀 Launch Campaign:*\n' +
                        '`/create-ads` atau `/create_ads` — pilih Ad Template untuk buat iklan\n' +
                        '`/templates` — senarai Ad Template\n' +
                        'Hantar video/gambar → pilih template atau bagi arahan campaign';
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: helpText,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                keyboard: [
                                    [{ text: '/create-ads' }, { text: '/analisa' }],
                                    [{ text: '/topads' }, { text: '/status' }]
                                ],
                                resize_keyboard: true
                            }
                        })
                    });
                    return res.status(200).end();
                }

                if (text === '/create-ads' || text === '/create_ads' || text.startsWith('/create-ads@') || text.startsWith('/create_ads@')) {
                    return await listUserTemplates(chatId, botToken!, res, 'create-ads');
                }

                if (text === '/templates') {
                    return await listUserTemplates(chatId, botToken!, res);
                }

                if (text === '/status') {
                    return await showJobStatus(chatId, botToken!, res);
                }

                // --- Analysis Commands ---
                if (text === '/analisa' || text.startsWith('/analisa ')) {
                    const accountQuery = text.replace('/analisa', '').trim();
                    return await handleAnalysisCommand(chatId, accountQuery, botToken!, res);
                }

                if (text.startsWith('/ads ')) {
                    const adQuery = text.replace('/ads', '').trim();
                    return await handleSpecificAdAnalysis(chatId, adQuery, botToken!, res);
                }

                if (text === '/topads') {
                    return await handleTopAds(chatId, botToken!, res);
                }

                if (
                    text.startsWith('/creative') ||
                    text.startsWith('/generate') ||
                    text.toLowerCase().startsWith('generate creative') ||
                    text.toLowerCase().startsWith('buat creative')
                ) {
                    return await handleCreativeGenerationCommand(chatId, text, botToken!, res);
                }

                // If not a standard command, treat as campaign instructions
                return await processCampaignCommand(chatId, text, botToken!, res);
            }
        }

        return res.status(200).json({ success: true, message: 'Update received' });

    } catch (error: any) {
        console.error('[Telegram Webhook] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// --- AGENTIC CREATIVE WORKFLOW ---

function getPublicBaseUrl(req?: any) {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    const host = req?.headers?.host || 'ads-rocket.vercel.app';
    const proto = req?.headers?.['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
}

function createShortCode() {
    return Math.random().toString(36).slice(2, 10);
}

function extractPoyoTask(payload: any) {
    const data = payload?.data || payload || {};
    const taskId = data.task_id || data.taskId || payload?.task_id || payload?.taskId;
    const status = data.status || payload?.status || 'processing';
    const files = data.files || payload?.files || [];
    const firstFile = Array.isArray(files) ? files[0] : null;
    const fileUrl = firstFile?.file_url || firstFile?.url || data.file_url || data.url || payload?.file_url || payload?.url || null;
    const errorMessage = data.error_message || data.error?.message || payload?.error_message || payload?.error?.message || null;
    return { taskId, status, fileUrl, errorMessage };
}

async function handleGenerationCallback(req: any, res: any) {
    const { taskId, status, fileUrl, errorMessage } = extractPoyoTask(req.body);
    console.log('[Generation Callback] Received:', JSON.stringify({ taskId, status, hasFile: !!fileUrl }));

    if (!taskId) {
        return res.status(400).json({ error: 'Missing task_id' });
    }

    const normalizedStatus = status === 'finished' ? 'finished' : status === 'failed' ? 'failed' : 'processing';

    await supabase
        .from('generation_tasks')
        .update({
            status: normalizedStatus,
            file_url: fileUrl,
            updated_at: new Date().toISOString(),
            metadata: { callback_payload: req.body, error_message: errorMessage }
        })
        .eq('task_id', taskId);

    const { data: creative } = await supabase
        .from('generated_creatives')
        .select('*')
        .eq('generation_task_id', taskId)
        .maybeSingle();

    if (!creative) {
        return res.status(200).json({ success: true, message: 'Task synced; no creative row linked' });
    }

    await supabase
        .from('generated_creatives')
        .update({
            status: normalizedStatus === 'finished' ? 'ready' : normalizedStatus,
            file_url: fileUrl || creative.file_url,
            updated_at: new Date().toISOString()
        })
        .eq('id', creative.id);

    if (normalizedStatus === 'failed') {
        const botToken = await getBotTokenForCreative(creative);
        if (botToken) {
            await sendTelegramMessage(botToken, creative.chat_id, `❌ *Creative generation failed*\n\n${errorMessage || 'PoYo returned failed status.'}`);
        }
        return res.status(200).json({ success: true });
    }

    if (normalizedStatus === 'finished' && fileUrl) {
        await sendGeneratedCreativeToTelegram({ ...creative, file_url: fileUrl });
    }

    return res.status(200).json({ success: true });
}

async function getBotTokenForCreative(creative: any) {
    const { data: user } = await supabase
        .from('telegram_users')
        .select('telegram_bot_token')
        .eq('telegram_chat_id', String(creative.chat_id))
        .maybeSingle();
    return user?.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || null;
}

async function sendGeneratedCreativeToTelegram(creative: any) {
    const botToken = await getBotTokenForCreative(creative);
    if (!botToken || !creative.chat_id || !creative.file_url) return;

    const caption =
        `✅ *Creative siap untuk review*\n\n` +
        `Model: \`${creative.model || '-'}\`\n` +
        `Type: ${creative.media_type}\n\n` +
        `_Approve kalau nak launch guna Ad Template._`;

    const reply_markup = {
        inline_keyboard: [
            [
                { text: '✅ Approve', callback_data: `appr_${creative.short_code}` },
                { text: '❌ Reject', callback_data: `rej_${creative.short_code}` }
            ],
            [
                { text: '🚀 Launch With Template', callback_data: `lcr_${creative.short_code}` }
            ]
        ]
    };

    const endpoint = creative.media_type === 'video' ? 'sendVideo' : 'sendPhoto';
    const mediaKey = creative.media_type === 'video' ? 'video' : 'photo';
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: creative.chat_id,
            [mediaKey]: creative.file_url,
            caption,
            parse_mode: 'Markdown',
            reply_markup
        })
    });

    const data = await response.json();
    if (!data.ok) {
        console.error('[Creative Telegram] Failed to send creative:', data);
        await sendTelegramMessage(botToken, creative.chat_id, `✅ Creative siap, tapi Telegram gagal preview media.\n\nURL: ${creative.file_url}`);
        return;
    }

    const fileId = data.result?.video?.file_id || data.result?.photo?.slice(-1)?.[0]?.file_id || null;
    if (fileId) {
        await supabase
            .from('generated_creatives')
            .update({ telegram_file_id: fileId, updated_at: new Date().toISOString() })
            .eq('id', creative.id);
    }
}

async function handleDocumentUpload(chatId: any, document: any, botToken: string, res: any) {
    const { data: user } = await supabase
        .from('telegram_users')
        .select('fb_id')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();

    let contentText: string | null = null;
    const fileName = document.file_name || 'uploaded-document';
    const mimeType = document.mime_type || '';

    try {
        const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${document.file_id}`);
        const fileData = await fileRes.json();
        const filePath = fileData.result?.file_path;
        if (filePath && (mimeType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md'))) {
            const docRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
            contentText = (await docRes.text()).slice(0, 24000);
        }
    } catch (err) {
        console.warn('[Document Upload] Could not read document text:', err);
    }

    await supabase.from('uploaded_documents').insert({
        fb_id: user?.fb_id || null,
        chat_id: String(chatId),
        telegram_file_id: document.file_id,
        file_name: fileName,
        mime_type: mimeType,
        content_text: contentText,
        summary: contentText ? contentText.slice(0, 1000) : null
    });

    await sendTelegramMessage(botToken, chatId,
        `📄 *Document diterima*\n\n${fileName}\n\nSekarang hantar arahan seperti:\n\`/creative image buat 3 angle untuk produk ni\`\natau\n\`/creative video guna winning ads style\``);
    return res.status(200).json({ success: true, action: 'document_saved' });
}

async function handleCreativeGenerationCommand(chatId: any, text: string, botToken: string, res: any) {
    const { data: user } = await supabase
        .from('telegram_users')
        .select('fb_id, ad_account_id')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();

    if (!user) {
        await sendTelegramMessage(botToken, chatId, '❌ *Belum connected*\n\nSila login ke website Ads Rocket dan save Telegram settings dahulu.');
        return res.status(200).end();
    }

    const lower = text.toLowerCase();
    const mediaType = lower.includes('video') ? 'video' : 'image';
    const requestedModel = mediaType === 'video'
        ? 'sora-2-official'
        : (lower.includes('gpt image') ? 'gpt-image-2' : 'nano-banana-pro');

    await sendTelegramMessage(botToken, chatId, `🧠 *Agent sedang bina creative brief...*\n\nType: ${mediaType}\nModel: \`${requestedModel}\``);

    const { data: latestDoc } = await supabase
        .from('uploaded_documents')
        .select('*')
        .eq('chat_id', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const { data: cache } = await supabase
        .from('ads_cache')
        .select('ads_data')
        .eq('chat_id', String(chatId))
        .maybeSingle();

    let topAds: any[] = [];
    try {
        topAds = typeof cache?.ads_data === 'string' ? JSON.parse(cache.ads_data) : (cache?.ads_data || []);
    } catch { topAds = []; }

    const strategy = await buildCreativeStrategy({
        instruction: text,
        mediaType,
        model: requestedModel,
        documentText: latestDoc?.content_text || latestDoc?.summary || '',
        documentName: latestDoc?.file_name || null,
        topAds
    });

    const poyoResult = await submitAgentCreativeToPoyo({
        prompt: strategy.prompt,
        mediaType,
        model: requestedModel,
        fbId: user.fb_id,
        chatId: String(chatId),
        strategy,
        source: 'telegram_agent'
    });

    if (!poyoResult.success) {
        await sendTelegramMessage(botToken, chatId, `❌ *Generation gagal dimulakan*\n\n${poyoResult.error}`);
        return res.status(200).end();
    }

    await sendTelegramMessage(botToken, chatId,
        `🎨 *Creative generation started*\n\n` +
        `Angle: ${strategy.angle || '-'}\n` +
        `Hook: ${strategy.hook || '-'}\n\n` +
        `Task: \`${poyoResult.taskId}\`\n` +
        `_Aku akan hantar creative ke sini bila siap untuk approve/reject._`);

    return res.status(200).json({ success: true, taskId: poyoResult.taskId });
}

async function buildCreativeStrategy(input: any) {
    const fallbackPrompt = `${input.instruction}\n\nCreate a high-converting Meta Ads ${input.mediaType} creative in Malay. Use a strong 0-3 second hook, clear product benefit, native UGC style, readable text, and direct CTA.`;
    const geminiApiKey = process.env.VITE_GEMINI_3_API;
    if (!geminiApiKey) {
        return { prompt: fallbackPrompt, angle: 'Direct response', hook: 'Problem-solution hook', source: 'fallback' };
    }

    try {
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
        const prompt = `You are a senior Meta Ads creative strategist for Malaysian ecommerce.

User instruction:
${input.instruction}

Latest uploaded document:
${input.documentName || 'none'}
${input.documentText || '(no readable document text)'}

Recent top ads context:
${JSON.stringify(input.topAds || []).slice(0, 8000)}

Create ONE production-ready ${input.mediaType} prompt for ${input.model}.
Return JSON only:
{
  "angle": "specific ad angle",
  "hook": "0-3 second scroll-stopper",
  "messaging": "main message",
  "visual": "visual direction",
  "cta": "CTA",
  "prompt": "final generation prompt in English, with Malay ad text if text is needed"
}`;

        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ text: prompt }]
        });
        const raw = (result.text || '').replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        return {
            angle: parsed.angle || 'New winning angle',
            hook: parsed.hook || '',
            messaging: parsed.messaging || '',
            visual: parsed.visual || '',
            cta: parsed.cta || '',
            prompt: parsed.prompt || fallbackPrompt,
            source: 'gemini'
        };
    } catch (err) {
        console.warn('[Creative Strategy] Gemini failed, using fallback:', err);
        return { prompt: fallbackPrompt, angle: 'Direct response', hook: 'Problem-solution hook', source: 'fallback' };
    }
}

async function submitAgentCreativeToPoyo(input: any) {
    const apiKey = process.env.POYO_API_KEY;
    if (!apiKey) return { success: false, error: 'POYO_API_KEY not configured' };

    const isVideo = input.mediaType === 'video';
    const poyoInput: any = { prompt: input.prompt };
    if (isVideo) {
        poyoInput.duration = 4;
        poyoInput.aspect_ratio = '9:16';
    } else if (input.model.startsWith('nano-banana')) {
        poyoInput.size = '9:16';
        poyoInput.resolution = '2K';
        poyoInput.output_format = 'png';
        poyoInput.enable_web_search = false;
    } else {
        poyoInput.size = '9:16';
        poyoInput.resolution = '1K';
        poyoInput.quality = 'low';
    }

    const callbackUrl = `${getPublicBaseUrl()}/api/media-api?action=generation-callback`;
    const response = await fetch('https://api.poyo.ai/api/generate/submit', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: input.model,
            callback_url: callbackUrl,
            input: poyoInput
        })
    });
    const data = await response.json();
    if (!response.ok || data.code !== 200) {
        return { success: false, error: data.error?.message || 'PoYo generation failed', details: data };
    }

    const taskId = data.data?.task_id;
    const shortCode = createShortCode();

    await supabase.from('agent_runs').insert({
        fb_id: input.fbId,
        chat_id: input.chatId,
        run_type: 'creative_generation',
        status: 'queued',
        input: { prompt: input.prompt, mediaType: input.mediaType, model: input.model },
        output: { task_id: taskId, strategy: input.strategy }
    });

    await supabase.from('generation_tasks').insert({
        task_id: taskId,
        task_type: input.mediaType,
        prompt: input.prompt,
        model: input.model,
        status: data.data?.status || 'not_started',
        fb_id: input.fbId,
        chat_id: input.chatId,
        source: input.source,
        approval_status: 'pending',
        metadata: { strategy: input.strategy, callback_url: callbackUrl, input: poyoInput }
    });

    await supabase.from('generated_creatives').insert({
        short_code: shortCode,
        fb_id: input.fbId,
        chat_id: input.chatId,
        generation_task_id: taskId,
        media_type: input.mediaType,
        model: input.model,
        prompt: input.prompt,
        source: input.source,
        strategy: input.strategy,
        status: 'generating',
        approval_status: 'pending'
    });

    return { success: true, taskId, shortCode };
}

async function handleCreativeApprovalCallback(callbackQuery: any, botToken: string, action: 'approved' | 'rejected', res: any) {
    const chatId = callbackQuery.message.chat.id;
    const shortCode = callbackQuery.data.replace(action === 'approved' ? 'appr_' : 'rej_', '');
    const now = new Date().toISOString();

    const { data: creative } = await supabase
        .from('generated_creatives')
        .select('*')
        .eq('short_code', shortCode)
        .maybeSingle();

    if (!creative) {
        await answerCallback(botToken, callbackQuery.id, 'Creative tidak dijumpai.');
        return res.status(200).end();
    }

    await supabase
        .from('generated_creatives')
        .update({
            approval_status: action,
            approved_at: action === 'approved' ? now : creative.approved_at,
            rejected_at: action === 'rejected' ? now : creative.rejected_at,
            updated_at: now
        })
        .eq('id', creative.id);

    await supabase
        .from('generation_tasks')
        .update({ approval_status: action, updated_at: now })
        .eq('task_id', creative.generation_task_id);

    await supabase.from('creative_approvals').insert({
        creative_id: creative.id,
        chat_id: String(chatId),
        action
    });

    await answerCallback(botToken, callbackQuery.id, action === 'approved' ? 'Approved.' : 'Rejected.');
    await sendTelegramMessage(botToken, chatId,
        action === 'approved'
            ? `✅ *Creative approved*\n\nTekan *Launch With Template* pada creative tadi, atau hantar \`/templates\` untuk pilih template.`
            : `❌ *Creative rejected*\n\nHantar \`/creative image ...\` untuk generate variation baru.`);
    return res.status(200).end();
}

async function handleCreativeLaunchTemplateList(callbackQuery: any, botToken: string, res: any) {
    const chatId = callbackQuery.message.chat.id;
    const shortCode = callbackQuery.data.replace('lcr_', '');

    const { data: creative } = await supabase
        .from('generated_creatives')
        .select('*')
        .eq('short_code', shortCode)
        .maybeSingle();

    if (!creative) {
        await answerCallback(botToken, callbackQuery.id, 'Creative tidak dijumpai.');
        return res.status(200).end();
    }

    if (creative.approval_status !== 'approved') {
        await answerCallback(botToken, callbackQuery.id, 'Approve creative dulu.');
        await sendTelegramMessage(botToken, chatId, '⚠️ Sila tekan *Approve* dulu sebelum launch.');
        return res.status(200).end();
    }

    const { data: user } = await supabase
        .from('telegram_users')
        .select('fb_id')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();

    const { data: presets } = await supabase
        .from('text_presets')
        .select('ad_templates')
        .eq('fb_id', user?.fb_id || creative.fb_id)
        .maybeSingle();

    const templates = presets?.ad_templates || [];
    if (templates.length === 0) {
        await answerCallback(botToken, callbackQuery.id, 'Tiada template.');
        await sendTelegramMessage(botToken, chatId, '📁 *Tiada Ad Template*\n\nSimpan template dahulu di Rapid Campaign > Global Ad Preset > Ad Templates.');
        return res.status(200).end();
    }

    const buttons = templates.slice(0, 10).map((t: any) => [{
        text: `🚀 ${t.name}`,
        callback_data: `crtpl_${shortCode}_${t.id}`
    }]);

    await answerCallback(botToken, callbackQuery.id, 'Pilih template.');
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: '📋 *Pilih Ad Template untuk creative approved:*',
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        })
    });
    return res.status(200).end();
}

async function handleCreativeTemplateLaunch(callbackQuery: any, botToken: string, res: any) {
    const chatId = callbackQuery.message.chat.id;
    const parts = callbackQuery.data.split('_');
    const shortCode = parts[1];
    const templateId = parts.slice(2).join('_');

    const { data: creative } = await supabase
        .from('generated_creatives')
        .select('*')
        .eq('short_code', shortCode)
        .maybeSingle();

    if (!creative?.file_url) {
        await answerCallback(botToken, callbackQuery.id, 'Creative URL tidak dijumpai.');
        return res.status(200).end();
    }

    const { data: user } = await supabase
        .from('telegram_users')
        .select('fb_id, ad_account_id')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();

    if (!user) {
        await sendTelegramMessage(botToken, chatId, '❌ User settings tidak dijumpai.');
        return res.status(200).end();
    }

    const { data: presetsRow } = await supabase
        .from('text_presets')
        .select('ad_templates, primary_texts, primary_text_names, headlines, headline_names')
        .eq('fb_id', user.fb_id)
        .maybeSingle();

    const template = (presetsRow?.ad_templates || []).find((t: any) => String(t.id) === String(templateId));
    if (!template) {
        await sendTelegramMessage(botToken, chatId, '❌ Template tidak dijumpai.');
        return res.status(200).end();
    }

    const strategy = creative.strategy || {};
    const parsedSettings = {
        templateName: template.name,
        campaignName: `${template.name} - AI Creative ${shortCode}`,
        numberOfAds: 1,
        primaryTextPresets: [],
        headlinePresets: [],
        dailyBudget: null,
        _primaryTexts: presetsRow?.primary_texts || [],
        _primaryTextNames: presetsRow?.primary_text_names || [],
        _headlines: presetsRow?.headlines || [],
        _headlineNames: presetsRow?.headline_names || [],
        _agentStrategy: strategy
    };

    const { data: job, error } = await supabase
        .from('telegram_campaign_jobs')
        .insert({
            chat_id: String(chatId),
            fb_id: user.fb_id,
            ad_account_id: user.ad_account_id,
            command_text: `Launch approved creative ${shortCode} using template ${template.name}`,
            parsed_settings: parsedSettings,
            template_name: template.name,
            template_data: template,
            media_file_id: creative.telegram_file_id || '',
            media_url: creative.file_url,
            media_type: creative.media_type,
            creative_id: creative.id,
            launch_source: 'approved_ai_creative',
            status: 'PENDING',
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        await sendTelegramMessage(botToken, chatId, `❌ Gagal create launch job: ${error.message}`);
        return res.status(200).end();
    }

    await answerCallback(botToken, callbackQuery.id, 'Launch job created.');
    await sendTelegramMessage(botToken, chatId,
        `⏳ *Launching approved creative...*\n\nTemplate: ${template.name}\nCreative: \`${shortCode}\`\n\n_Sila tunggu 30-60 saat._`);

    fetch('https://ads-rocket.vercel.app/api/telegram-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id })
    }).catch(err => console.error('[Creative Launch] Trigger error:', err));

    await supabase
        .from('generated_creatives')
        .update({ campaign_job_id: job.id, updated_at: new Date().toISOString() })
        .eq('id', creative.id);

    return res.status(200).json({ success: true, jobId: job.id });
}

async function answerCallback(botToken: string, callbackQueryId: string, text: string) {
    return fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
}

// --- CAMPAIGN LAUNCH HELPERS ---

async function processCampaignCommand(chatId: any, text: string, botToken: string, res: any) {
    console.log(`[Campaign Command] Processing for chat ${chatId}: ${text}`);

    const { data: user } = await supabase.from('telegram_users').select('fb_id, fb_access_token, ad_account_id').eq('telegram_chat_id', String(chatId)).single();
    if (!user) {
        await sendTelegramMessage(botToken, chatId, '❌ *User Not Connected*\n\nSila login ke website Ads Rocket dan save Telegram settings terlebih dahulu.');
        return res.status(200).end();
    }

    const { data: media } = await supabase.from('telegram_pending_media').select('*').eq('chat_id', String(chatId)).single();
    if (!media) {
        await sendTelegramMessage(botToken, chatId, '🎬 *Media tidak dijumpai*\n\nSila hantar video atau gambar dahulu sebelum memberi arahan.');
        return res.status(200).end();
    }

    // Fetch ALL presets data — ad templates AND copywriting presets by name
    const { data: presetsRow } = await supabase
        .from('text_presets')
        .select('ad_templates, primary_texts, primary_text_names, headlines, headline_names')
        .eq('fb_id', user.fb_id).single();

    const templates = presetsRow?.ad_templates || [];
    const primaryTextNames: string[] = presetsRow?.primary_text_names?.filter((n: string) => n?.trim()) || [];
    const headlineNames: string[] = presetsRow?.headline_names?.filter((n: string) => n?.trim()) || [];

    const geminiApiKey = process.env.VITE_GEMINI_3_API;
    const genAI = new GoogleGenAI({ apiKey: geminiApiKey || '' });

    const templateNames = templates.map((t: any) => t.name).join(', ');
    const prompt = `Analisa arahan user untuk launch campaign Meta Ads: "${text}"

Data sedia ada dalam sistem:
- Ad Setting Templates: [${templateNames || 'tiada'}]
- Text Preset (Primary Text) names: [${primaryTextNames.join(', ') || 'tiada'}]
- Text Preset (Headline) names: [${headlineNames.join(', ') || 'tiada'}]

Tugas: Extract maklumat dari arahan dan padankan dengan data sedia ada.
Balas JSON sahaja, tiada teks lain:
{
  "templateName": "nama template setting yang paling padan (null jika tiada)",
  "campaignName": "nama campaign yang disebut user (null jika tiada)",
  "adAccountName": "nama ads manager/akaun yang disebut user (null jika tiada)",
  "numberOfAds": bilangan integer ads (default 1),
  "primaryTextPresets": ["senarai nama preset primary text yang disebut, padankan dengan senarai sedia ada"],
  "headlinePresets": ["senarai nama preset headline yang disebut, padankan dengan senarai sedia ada"],
  "dailyBudget": angka bajet sahaja atau null
}`;

    const result = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ text: prompt }]
    });
    const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
    console.log(`[Campaign Command] Parsed command:`, JSON.stringify(parsed));

    const matchedTemplate = templates.find((t: any) =>
        t.name.toLowerCase().includes(parsed.templateName?.toLowerCase()) ||
        (parsed.templateName && t.name.toLowerCase() === parsed.templateName.toLowerCase())
    );

    const { data: job, error: jobErr } = await supabase
        .from('telegram_campaign_jobs')
        .insert({
            chat_id: String(chatId),
            fb_id: user.fb_id,
            ad_account_id: user.ad_account_id,
            command_text: text,
            parsed_settings: {
                ...parsed,
                // Store full preset content so telegram-launch.ts can resolve by name
                _primaryTexts: presetsRow?.primary_texts || [],
                _primaryTextNames: presetsRow?.primary_text_names || [],
                _headlines: presetsRow?.headlines || [],
                _headlineNames: presetsRow?.headline_names || [],
            },
            template_name: matchedTemplate?.name || null,
            template_data: matchedTemplate || null,
            media_file_id: media.file_id,
            media_type: media.media_type,
            status: 'PENDING',
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (jobErr) throw jobErr;

    const numAds = parsed.numberOfAds || 1;
    const presetList = parsed.primaryTextPresets?.length > 0
        ? parsed.primaryTextPresets.join(', ')
        : null;

    let confirmText = `⏳ *Processing Campaign Launch...*\n\n`;
    if (matchedTemplate) confirmText += `📋 *Template:* ${matchedTemplate.name}\n`;
    if (parsed.campaignName) confirmText += `🚀 *Campaign:* ${parsed.campaignName}\n`;
    if (parsed.dailyBudget) confirmText += `💰 *Budget:* RM${parsed.dailyBudget}/hari\n`;
    confirmText += `🎬 *Media:* ${media.media_type === 'video' ? 'Video' : 'Gambar'}\n`;
    confirmText += `📝 *Ads:* ${numAds} ads`;
    if (presetList) confirmText += ` (${presetList})`;
    confirmText += `\n\n_Sila tunggu, proses ini mengambil masa 30-60 saat._`;

    await sendTelegramMessage(botToken, chatId, confirmText);

    // Always use production URL to avoid Vercel deployment protection on preview deployments
    const apiUrl = 'https://ads-rocket.vercel.app/api/telegram-launch';

    console.log(`[Campaign Command] Triggering launch API for job: ${job.id}`);

    fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id })
    }).then(async (response) => {
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Webhook] Launch API Error (${response.status}):`, errorText);
        } else {
            console.log('[Webhook] Launch API triggered successfully');
        }
    }).catch(err => console.error('[Webhook] Launch Trigger Error:', err));

    await supabase.from('telegram_pending_media').delete().eq('chat_id', String(chatId));
    return res.status(200).json({ success: true, jobId: job.id });
}

async function listUserTemplates(chatId: any, botToken: string, res: any, mode: 'templates' | 'create-ads' = 'templates') {
    const { data: user } = await supabase.from('telegram_users').select('fb_id').eq('telegram_chat_id', String(chatId)).single();
    if (!user) {
        await sendTelegramMessage(botToken, chatId, '❌ Login dahulu di website.');
        return res.status(200).end();
    }
    const { data } = await supabase.from('text_presets').select('ad_templates').eq('fb_id', user.fb_id).single();
    const templates = data?.ad_templates || [];

    if (templates.length === 0) {
        await sendTelegramMessage(botToken, chatId, '📁 *Tiada Ad Template*\n\nSimpan template dahulu di Rapid Campaign > Global Ad Preset > Ad Templates.');
    } else {
        const buttons = templates.slice(0, 10).map((t: any) => [{ text: `🚀 ${t.name}`, callback_data: `tpl_${t.id}` }]);
        const text = mode === 'create-ads'
            ? '🚀 *Create Ads*\n\nPilih Ad Template untuk buat iklan.\n\n_Note: Kalau belum hantar media, hantar video/gambar dahulu sebelum pilih template._'
            : '📋 *Pilih Ad Template:*';
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            })
        });
    }
    return res.status(200).end();
}

async function handleTemplateSelection(chatId: any, templateId: string, botToken: string | undefined, res: any) {
    const { data: user } = await supabase.from('telegram_users').select('fb_id').eq('telegram_chat_id', String(chatId)).single();
    const { data: presets } = await supabase.from('text_presets').select('ad_templates').eq('fb_id', user?.fb_id).single();
    const template = presets?.ad_templates?.find((t: any) => t.id === templateId);

    if (template) {
        await processCampaignCommand(chatId, `Guna template ${template.name}`, botToken!, res);
    } else {
        await sendTelegramMessage(botToken!, chatId, '❌ Template tidak dijumpai.');
        return res.status(200).end();
    }
}

async function showJobStatus(chatId: any, botToken: string, res: any) {
    const { data: jobs } = await supabase
        .from('telegram_campaign_jobs')
        .select('*')
        .eq('chat_id', String(chatId))
        .order('created_at', { ascending: false })
        .limit(5);

    if (!jobs || jobs.length === 0) {
        await sendTelegramMessage(botToken, chatId, '📭 *Tiada history campaign.*');
    } else {
        let text = '📊 *Status Campaign Terkini:*\n\n';
        jobs.forEach((j: any) => {
            const statusIcon = j.status === 'COMPLETED' ? '✅' : j.status === 'FAILED' ? '❌' : '⏳';
            text += `${statusIcon} ${j.template_name || 'Manual Launch'}\nStatus: ${j.status}\n\n`;
        });
        await sendTelegramMessage(botToken, chatId, text);
    }
    return res.status(200).end();
}

// --- ANALYSIS COMMAND HANDLERS ---

/**
 * /analisa [optional account name]
 * Lists all configured ad accounts, or directly triggers analysis if name provided
 */
async function handleAnalysisCommand(chatId: any, accountQuery: string, botToken: string, res: any) {
    const { data: user } = await supabase
        .from('telegram_users')
        .select('fb_id, fb_access_token, ad_account_id')
        .eq('telegram_chat_id', String(chatId))
        .single();

    if (!user) {
        await sendTelegramMessage(botToken, chatId, '❌ *Belum connected*\n\nSila login ke website Ads Rocket dan save Telegram settings dahulu.');
        return res.status(200).end();
    }

    if (!user.fb_access_token) {
        await sendTelegramMessage(botToken, chatId, '❌ *Token tidak dijumpai*\n\nSila reconnect semula di Settings → Telegram.');
        return res.status(200).end();
    }

    // Fetch all ad accounts with enabled schedules for this user
    const { data: schedules } = await supabase
        .from('analysis_schedules')
        .select('ad_account_id')
        .eq('fb_id', user.fb_id);

    // Collect unique account IDs from schedules + the default one
    const accountIds: string[] = [];
    if (user.ad_account_id) accountIds.push(user.ad_account_id);
    if (schedules) {
        for (const s of schedules) {
            if (s.ad_account_id && !accountIds.includes(s.ad_account_id)) {
                accountIds.push(s.ad_account_id);
            }
        }
    }

    if (accountIds.length === 0) {
        await sendTelegramMessage(botToken, chatId, '❌ *Tiada Ads Manager dikonfigurasi.*\n\nSila setup di Settings → Telegram.');
        return res.status(200).end();
    }

    // Fetch account names from Meta API
    const accountInfoList: { id: string; name: string }[] = [];
    for (const accountId of accountIds) {
        const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
        try {
            const r = await fetch(`https://graph.facebook.com/v19.0/${actId}?fields=name&access_token=${user.fb_access_token}`);
            const d = await r.json();
            accountInfoList.push({ id: accountId, name: d.name || accountId });
        } catch {
            accountInfoList.push({ id: accountId, name: accountId });
        }
    }

    // If user specified an account name, fuzzy-match and run immediately
    if (accountQuery) {
        const matched = accountInfoList.find(a =>
            a.name.toLowerCase().includes(accountQuery.toLowerCase()) ||
            a.id.includes(accountQuery)
        );
        if (matched) {
            return await runAnalysisForAccount(chatId, matched.id, botToken, res);
        } else {
            await sendTelegramMessage(botToken, chatId,
                `❌ Ads Manager *"${accountQuery}"* tidak dijumpai.\n\nAkaun yang ada:\n${accountInfoList.map(a => `• ${a.name}`).join('\n')}`);
            return res.status(200).end();
        }
    }

    // No name given → show button list
    if (accountInfoList.length === 1) {
        // Only one account — run directly
        return await runAnalysisForAccount(chatId, accountInfoList[0].id, botToken, res);
    }

    const buttons = accountInfoList.map(a => [{
        text: `📊 ${a.name}`,
        callback_data: `analyze_act_${a.id}`
    }]);

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: '📊 *Pilih Ads Manager untuk analisa:*',
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        })
    });
    return res.status(200).end();
}

/**
 * Triggers analysis for a specific adAccountId by calling analyze-telegram API
 */
async function runAnalysisForAccount(chatId: any, adAccountId: string, botToken: string, res: any) {
    const { data: user } = await supabase
        .from('telegram_users')
        .select('fb_access_token')
        .eq('telegram_chat_id', String(chatId))
        .single();

    // Also try from schedules if not in telegram_users
    const { data: schedule } = await supabase
        .from('analysis_schedules')
        .select('fb_access_token, telegram_bot_token, fb_id')
        .eq('ad_account_id', adAccountId)
        .maybeSingle();

    const fbAccessToken = user?.fb_access_token || schedule?.fb_access_token;

    if (!fbAccessToken) {
        await sendTelegramMessage(botToken, chatId, '❌ Token tidak dijumpai. Sila reconnect di Settings.');
        return res.status(200).end();
    }

    // Fetch account name for display
    const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    let accountName = adAccountId;
    try {
        const r = await fetch(`https://graph.facebook.com/v19.0/${actId}?fields=name&access_token=${fbAccessToken}`);
        const d = await r.json();
        if (d.name) accountName = d.name;
    } catch { /* ignore */ }

    await sendTelegramMessage(botToken, chatId, `⏳ *Menganalisa ${accountName}...*\n\nSila tunggu ~30 saat.`);

    // Call the existing analyze-telegram API
    const apiUrl = 'https://ads-rocket.vercel.app/api/analyze-telegram';
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adAccountId,
                fbAccessToken,
                telegramChatId: String(chatId),
                telegramBotToken: botToken,
                fbName: 'telegram-user'
            })
        });
        const data = await response.json();
        if (!data.success && data.error) {
            await sendTelegramMessage(botToken, chatId, `❌ *Analisa gagal:* ${data.error}`);
        }
    } catch (err: any) {
        await sendTelegramMessage(botToken, chatId, `❌ *Ralat:* ${err.message}`);
    }

    return res.status(200).end();
}

/**
 * /ads [ad name] — fetch all ads and analyze the matched one specifically
 */
async function handleSpecificAdAnalysis(chatId: any, adQuery: string, botToken: string, res: any) {
    if (!adQuery) {
        await sendTelegramMessage(botToken, chatId,
            '❌ Sila nyatakan nama iklan. Contoh: `/ads Nama Iklan Win`');
        return res.status(200).end();
    }

    const { data: user } = await supabase
        .from('telegram_users')
        .select('fb_access_token, ad_account_id')
        .eq('telegram_chat_id', String(chatId))
        .single();

    if (!user?.fb_access_token || !user?.ad_account_id) {
        await sendTelegramMessage(botToken, chatId, '❌ *Belum connected*\n\nSila login ke website dan setup Telegram settings.');
        return res.status(200).end();
    }

    await sendTelegramMessage(botToken, chatId, `🔍 *Mencari iklan "${adQuery}"...*`);

    const actId = user.ad_account_id.startsWith('act_') ? user.ad_account_id : `act_${user.ad_account_id}`;
    const fbAccessToken = user.fb_access_token;

    // Fetch ads from Meta
    const today = new Date();
    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(today.getDate() - 3);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const timeRange = JSON.stringify({ since: fmt(fourDaysAgo), until: fmt(today) });

    const insightsQuery = `insights.time_range(${timeRange}){spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type}`;
    const creativeFields = 'creative{video_id,image_url,thumbnail_url,effective_instagram_media_id}';
    const fields = ['id', 'name', 'status', 'effective_status', creativeFields, insightsQuery].join(',');
    const filtering = encodeURIComponent(`[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]}]`);
    const metaUrl = `https://graph.facebook.com/v19.0/${actId}/ads?fields=${encodeURIComponent(fields)}&access_token=${fbAccessToken}&limit=50&filtering=${filtering}`;

    const metaRes = await fetch(metaUrl);
    const metaData = await metaRes.json();

    if (metaData.error) {
        await sendTelegramMessage(botToken, chatId, `❌ Meta API error: ${metaData.error.message}`);
        return res.status(200).end();
    }

    const ads = metaData.data || [];
    const matched = ads.filter((ad: any) =>
        ad.name.toLowerCase().includes(adQuery.toLowerCase())
    );

    if (matched.length === 0) {
        const adNames = ads.slice(0, 10).map((a: any) => `• ${a.name}`).join('\n');
        await sendTelegramMessage(botToken, chatId,
            `❌ Iklan *"${adQuery}"* tidak dijumpai.\n\n*Senarai iklan ada:*\n${adNames || '(tiada)'}`);
        return res.status(200).end();
    }

    // Analyze first matched ad
    const ad = matched[0];
    const insights = ad.insights?.data?.[0] || {};
    const spend = parseFloat(insights.spend || '0');
    const purchaseValue = insights.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0;
    const revenue = parseFloat(purchaseValue || '0');
    const purchaseCount = parseInt(insights.actions?.find((a: any) => a.action_type === 'purchase')?.value || '0');
    const adRoas = spend > 0 ? revenue / spend : 0;

    const adData = {
        id: ad.id,
        name: ad.name,
        purchases: purchaseCount,
        roas: adRoas,
        spend,
        creative: ad.creative || {}
    };

    await sendTelegramMessage(botToken, chatId,
        `🎯 *Menganalisa: ${ad.name}*\n\nSpend: RM${spend.toFixed(2)} | ${purchaseCount} purchases | ROAS ${adRoas.toFixed(2)}x\n\n_Sedang analisa creative..._`);

    // Run Gemini analysis using the same logic as analyze-telegram.ts
    const geminiApiKey = process.env.VITE_GEMINI_3_API;
    if (!geminiApiKey) {
        await sendTelegramMessage(botToken, chatId, '❌ Gemini API tidak dikonfigurasi.');
        return res.status(200).end();
    }

    try {
        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

        const creative = adData.creative;
        let analysisText = '(Tiada kreativiti untuk dianalisa)';

        if (creative.video_id) {
            const videoRes = await fetch(`https://graph.facebook.com/v19.0/${creative.video_id}?fields=source,picture&access_token=${fbAccessToken}`);
            const videoData = await videoRes.json();
            let videoSourceUrl = videoData.source;

            if (!videoSourceUrl && creative.effective_instagram_media_id) {
                const igRes = await fetch(`https://graph.facebook.com/v19.0/${creative.effective_instagram_media_id}?fields=media_url&access_token=${fbAccessToken}`);
                const igData = await igRes.json();
                if (igData.media_url) videoSourceUrl = igData.media_url;
            }

            if (videoSourceUrl) {
                const vfRes = await fetch(videoSourceUrl);
                const videoBlob = new Blob([await vfRes.arrayBuffer()], { type: 'video/mp4' });
                const uploadResult = await genAI.files.upload({ file: videoBlob });

                // Poll until ACTIVE
                for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    const fileStatus = await genAI.files.get({ name: uploadResult.name });
                    if (fileStatus.state === 'ACTIVE') break;
                }

                const prompt = `Analisa video iklan ini (${adData.purchases} purchases, ROAS ${adData.roas.toFixed(2)}x).\n\nBerikan analisa LENGKAP:\n\n*Hook:* (apa yang buat orang stop scroll)\n*Emosi:* (emosi yang drive action)\n*Tawaran:* (offer/value proposition yang kuat)\n*Cadangan:* (apa yang boleh diimprove)\n\nBM ringkas, praktikal.`;

                const result = await genAI.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: [
                        { text: prompt },
                        { fileData: { fileUri: uploadResult.uri, mimeType: 'video/mp4' } }
                    ]
                });
                await genAI.files.delete({ name: uploadResult.name });
                analysisText = result.text || analysisText;
            } else {
                // Fallback to thumbnail
                const thumbUrl = videoData.picture || creative.thumbnail_url || creative.image_url;
                if (thumbUrl) {
                    const imgRes = await fetch(thumbUrl);
                    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
                    const imgMime = imgRes.headers.get('content-type') || 'image/jpeg';
                    const prompt = `Analisa thumbnail/poster iklan ini (${adData.purchases} purchases, ROAS ${adData.roas.toFixed(2)}x).\n\n*Hook:* *Emosi:* *Tawaran:* *Cadangan:*\n\nBM ringkas.`;
                    const result = await genAI.models.generateContent({
                        model: 'gemini-3-flash-preview',
                        contents: [{ text: prompt }, { inlineData: { mimeType: imgMime, data: base64 } }]
                    });
                    analysisText = result.text || analysisText;
                }
            }
        } else if (creative.image_url || creative.thumbnail_url) {
            const imageUrl = creative.image_url || creative.thumbnail_url;
            const imgRes = await fetch(imageUrl);
            const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
            const imgMime = imgRes.headers.get('content-type') || 'image/jpeg';
            const prompt = `Analisa poster iklan ini (${adData.purchases} purchases, ROAS ${adData.roas.toFixed(2)}x).\n\n*Hook:* *Emosi:* *Tawaran:* *Cadangan:*\n\nBM ringkas.`;
            const result = await genAI.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ text: prompt }, { inlineData: { mimeType: imgMime, data: base64 } }]
            });
            analysisText = result.text || analysisText;
        }

        const finalMsg = `🎯 *Analisa: ${ad.name}*\n\n${analysisText}\n\n---\n_AI: Gemini 3 Flash_`;
        await sendTelegramMessage(botToken, chatId, finalMsg);
    } catch (err: any) {
        console.error('[/ads] Analysis error:', err);
        await sendTelegramMessage(botToken, chatId, `❌ Analisa gagal: ${err.message}`);
    }

    return res.status(200).end();
}

/**
 * /topads — show last cached top ads from Supabase ads_cache
 */
async function handleTopAds(chatId: any, botToken: string, res: any) {
    const { data: cache } = await supabase
        .from('ads_cache')
        .select('ads_data, updated_at')
        .eq('chat_id', String(chatId))
        .maybeSingle();

    if (!cache || !cache.ads_data) {
        await sendTelegramMessage(botToken, chatId,
            '📭 *Tiada data top ads.*\n\nJalankan `/analisa` dahulu untuk mendapatkan data.');
        return res.status(200).end();
    }

    let ads: any[] = [];
    try { ads = typeof cache.ads_data === 'string' ? JSON.parse(cache.ads_data) : cache.ads_data; } catch { ads = []; }

    if (ads.length === 0) {
        await sendTelegramMessage(botToken, chatId, '📭 *Tiada top ads disimpan.*');
        return res.status(200).end();
    }

    const updatedAt = cache.updated_at ? new Date(cache.updated_at).toLocaleDateString('ms-MY') : 'Tidak diketahui';
    const emojis = ['🥇', '🥈', '🥉'];
    let msg = `📊 *Top Ads Terakhir*\n_Dikemas kini: ${updatedAt}_\n\n`;
    ads.forEach((ad: any, i: number) => {
        msg += `${emojis[i] || `${i + 1}.`} *${ad.name}*\n`;
        if (ad.id) msg += `   ID: \`${ad.id}\`\n`;
    });
    msg += `\n_Guna /ads [nama] untuk analisa iklan tertentu._`;

    await sendTelegramMessage(botToken, chatId, msg);
    return res.status(200).end();
}

async function sendTelegramMessage(botToken: string, chatId: any, text: string) {
    return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
}
// --- Bedah Creative (On-demand analysis via Telegram button) ---
async function handleBedahCallback(callbackQuery: any, botToken: any, res: any) {
    const callbackData = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const parts = callbackData.split('_');
    // Format: bedah_{index}_{mediaId}_{adName}
    const adIndex = parseInt(parts[1], 10);
    const mediaId = parts[2] || 'none';
    const adName = parts.slice(3).join('_') || `Ads ${adIndex + 1}`;

    // Acknowledge button press
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: '🔍 Sedang bedah creative...'
        })
    });

    // Send "analyzing" message
    await sendTelegramMessage(botToken, chatId, `🔍 *Bedah Creative: ${adName}*\n\n⏳ Sedang analisa creative...`);

    try {
        const geminiApiKey = process.env.VITE_GEMINI_3_API;
        if (!geminiApiKey) {
            await sendTelegramMessage(botToken, chatId, '❌ Gemini API key not configured.');
            return res.status(200).end();
        }

        // Get FB token from Supabase cache
        const { data: cacheData } = await supabase
            .from('ads_cache')
            .select('fb_access_token')
            .eq('chat_id', String(chatId))
            .single();

        const fbAccessToken = cacheData?.fb_access_token;
        if (!fbAccessToken) {
            await sendTelegramMessage(botToken, chatId, '❌ Session expired. Please run analisa again.');
            return res.status(200).end();
        }

        // Initialize Gemini
        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

        // Determine media type from mediaId prefix
        let analysisText: string | null = null;
        const mediaIdValue = mediaId.substring(1); // Remove prefix

        if (mediaId.startsWith('v')) {
            // Video via FB video_id
            const videoUrl = `https://graph.facebook.com/v19.0/${mediaIdValue}?fields=source,picture&access_token=${fbAccessToken}`;
            const videoResponse = await fetch(videoUrl);
            const videoData = await videoResponse.json();

            if (videoData.source) {
                const videoFileRes = await fetch(videoData.source);
                const videoBuffer = await videoFileRes.arrayBuffer();
                const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

                const uploadResult = await genAI.files.upload({ file: videoBlob });

                // Wait for file processing
                let fileReady = false;
                for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    const fileStatus = await genAI.files.get({ name: uploadResult.name });
                    if (fileStatus.state === 'ACTIVE') { fileReady = true; break; }
                }

                if (fileReady) {
                    const result = await genAI.models.generateContent({
                        model: 'gemini-3-flash-preview',
                        contents: [
                            { text: `Analisa video iklan ini secara mendalam.\n\nFormat jawapan:\n\n*Hook (0-3s):* Apa yang buat orang stop scroll?\n*Storyline:* Flow cerita dari awal sampai akhir\n*Emosi:* Emosi apa yang digunakan?\n*CTA:* Apa call-to-action yang digunakan?\n*Kekuatan:* 2-3 perkara yang buat iklan ni berkesan\n*Kelemahan:* 1-2 perkara yang boleh improve\n\nPERATURAN: Jawab dalam BM ringkas. Max 150 patah perkataan.` },
                            { fileData: { fileUri: uploadResult.uri, mimeType: 'video/mp4' } }
                        ]
                    });
                    analysisText = result.text || null;
                    await genAI.files.delete({ name: uploadResult.name });
                }
            }
        } else if (mediaId.startsWith('i')) {
            // Video via Instagram media_id
            const igUrl = `https://graph.facebook.com/v19.0/${mediaIdValue}?fields=media_url&access_token=${fbAccessToken}`;
            const igResponse = await fetch(igUrl);
            const igData = await igResponse.json();

            if (igData.media_url) {
                const videoFileRes = await fetch(igData.media_url);
                const videoBuffer = await videoFileRes.arrayBuffer();
                const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

                const uploadResult = await genAI.files.upload({ file: videoBlob });

                let fileReady = false;
                for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    const fileStatus = await genAI.files.get({ name: uploadResult.name });
                    if (fileStatus.state === 'ACTIVE') { fileReady = true; break; }
                }

                if (fileReady) {
                    const result = await genAI.models.generateContent({
                        model: 'gemini-3-flash-preview',
                        contents: [
                            { text: `Analisa video iklan ini secara mendalam.\n\nFormat jawapan:\n\n*Hook (0-3s):* Apa yang buat orang stop scroll?\n*Storyline:* Flow cerita dari awal sampai akhir\n*Emosi:* Emosi apa yang digunakan?\n*CTA:* Apa call-to-action yang digunakan?\n*Kekuatan:* 2-3 perkara yang buat iklan ni berkesan\n*Kelemahan:* 1-2 perkara yang boleh improve\n\nPERATURAN: Jawab dalam BM ringkas. Max 150 patah perkataan.` },
                            { fileData: { fileUri: uploadResult.uri, mimeType: 'video/mp4' } }
                        ]
                    });
                    analysisText = result.text || null;
                    await genAI.files.delete({ name: uploadResult.name });
                }
            }
        } else if (mediaId.startsWith('x')) {
            // Image ad — fetch creative image
            const adUrl = `https://graph.facebook.com/v19.0/${mediaIdValue}?fields=creative{image_url,thumbnail_url}&access_token=${fbAccessToken}`;
            const adResponse = await fetch(adUrl);
            const adData = await adResponse.json();
            const imageUrl = adData.creative?.image_url || adData.creative?.thumbnail_url;

            if (imageUrl) {
                const imageResponse = await fetch(imageUrl);
                const imageBuffer = await imageResponse.arrayBuffer();
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

                const result = await genAI.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: [
                        { text: `Analisa image iklan ini secara mendalam.\n\nFormat jawapan:\n\n*Visual Hook:* Apa yang grab attention?\n*Copywriting:* Analisa text/headline dalam image\n*Emosi:* Emosi apa yang digunakan?\n*CTA:* Apa call-to-action yang digunakan?\n*Kekuatan:* 2-3 perkara yang buat iklan ni berkesan\n*Kelemahan:* 1-2 perkara yang boleh improve\n\nPERATURAN: Jawab dalam BM ringkas. Max 150 patah perkataan.` },
                        { inlineData: { mimeType, data: base64Image } }
                    ]
                });
                analysisText = result.text || null;
            }
        }

        if (analysisText) {
            await sendTelegramMessage(botToken, chatId, `🔍 *Bedah Creative: ${adName}*\n\n${analysisText}`);
        } else {
            await sendTelegramMessage(botToken, chatId, `❌ Tidak dapat analisa creative untuk *${adName}*. Creative mungkin tidak tersedia.`);
        }

    } catch (err: any) {
        console.error('[Bedah] Error:', err);
        await sendTelegramMessage(botToken, chatId, `❌ Error: ${err.message || 'Unknown error'}`);
    }

    return res.status(200).end();
}

// --- ORIGINAL HELPERS (Modified to accept botToken) ---

async function handlePromptGenerationCallback(callbackQuery: any, botToken: any, res: any) {
    const callbackData = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const isNewFormat = callbackData.startsWith('p_');
    const parts = callbackData.split('_');
    const adIndex = isNewFormat ? parseInt(parts[1], 10) : parseInt(parts[1], 10);

    await answerCallback(botToken, callbackQuery.id, 'Generating new creative...');

    const { data: cache } = await supabase
        .from('ads_cache')
        .select('ads_data')
        .eq('chat_id', String(chatId))
        .maybeSingle();

    let ads: any[] = [];
    try {
        ads = typeof cache?.ads_data === 'string' ? JSON.parse(cache.ads_data) : (cache?.ads_data || []);
    } catch { ads = []; }

    const ad = ads[adIndex];
    const adName = ad?.name || `Top ad ${adIndex + 1}`;

    return handleCreativeGenerationCommand(
        chatId,
        `/creative image Generate a fresh Meta Ads creative inspired by winning ad "${adName}". Keep the same winning psychology, but create a new angle, new hook, and new visual concept. Use Malay market messaging.`,
        botToken,
        res
    );
}

async function handleUpscaleCallback(callbackQuery: any, botToken: any, confirm: boolean, res: any) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const adId = callbackQuery.data.split('_').pop();

    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id, text: confirm ? '✅ Upscale confirmed!' : '❌ Upscale cancelled' })
    });

    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: confirm ? `✅ *Upscale Confirmed*\nAds ID: ${adId}` : `❌ *Upscale Dibatalkan*`,
            parse_mode: 'Markdown'
        })
    });
    return res.status(200).end();
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
