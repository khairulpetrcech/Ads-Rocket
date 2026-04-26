/**
 * Consolidated Generation API via Poyo AI
 * Handles both poster (GPT Image 2) and video (Sora 2 Official) generation
 * 
 * Usage:
 * POST /api/generate-api?action=poster
 * POST /api/generate-api?action=video
 */
import { createClient } from '@supabase/supabase-js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

const POYO_BASE_URL = 'https://api.poyo.ai/api/generate/submit';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action } = req.query;

    try {
        if (action === 'poster') {
            return handleGeneratePoster(req, res);
        }
        if (action === 'video') {
            return handleGenerateVideo(req, res);
        }
        return res.status(400).json({ error: 'Invalid action. Use: poster or video' });
    } catch (error: any) {
        console.error('[Generate API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Generate Poster (GPT Image 2 via Poyo AI)
async function handleGeneratePoster(req: any, res: any) {
    try {
        const { prompt, aspectRatio = '1:1', quality = 'low', imageBase64 } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const apiKey = process.env.POYO_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'POYO_API_KEY not configured' });
        }

        // Map aspect ratio to Poyo size format (already compatible: 1:1, 16:9, 9:16)
        const size = aspectRatio || '1:1';

        console.log(`[Poyo AI] Generating image (gpt-image-2): ${prompt.substring(0, 50)}...`);

        // Build request body
        const body: any = {
            model: imageBase64 ? 'gpt-image-2-edit' : 'gpt-image-2',
            input: {
                prompt,
                quality,
                size,
                resolution: '1K'
            }
        };

        // Handle Reference Image (if present) — upload to a temp URL or use image_urls
        if (imageBase64) {
            // For gpt-image-2-edit, we need image_urls
            // Since we have base64, we'll use data URI (Poyo may not support this)
            // Fallback: skip reference image for now if it's base64
            console.log('[Poyo AI] Reference image provided — using gpt-image-2-edit model');
            // Note: Poyo requires actual URLs for image_urls, not base64
            // For now we'll skip the reference image unless it's a URL
        }

        // Send Request to Poyo AI
        const response = await fetch(POYO_BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok || data.code !== 200) {
            console.error('[Poyo AI] API Error:', data);
            return res.status(response.status).json({
                error: data.error?.message || 'Failed to generate image',
                details: data
            });
        }

        const taskId = data.data?.task_id;
        console.log(`[Poyo AI] Image generation started! Task ID: ${taskId}`);

        // Save to Supabase for history tracking
        try {
            await supabase.from('generation_tasks').insert({
                task_id: taskId,
                task_type: 'image',
                prompt,
                model: body.model,
                status: 'not_started'
            });
        } catch (e) {
            console.error('[Poyo AI] Failed to save task to DB:', e);
        }

        return res.status(200).json({
            success: true,
            task_id: taskId,
            uuid: taskId,
            status: 'not_started',
            message: 'Image generation started.'
        });

    } catch (error: any) {
        console.error('[Poyo AI] Server Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            details: error.toString()
        });
    }
}

// Generate Video (Sora 2 Official via Poyo AI)
async function handleGenerateVideo(req: any, res: any) {
    try {
        const { prompt, duration = 4, aspectRatio = '16:9' } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const apiKey = process.env.POYO_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'POYO_API_KEY not configured' });
        }

        // Map aspect ratio: frontend sends 'portrait'/'landscape', Poyo expects '9:16'/'16:9'
        let mappedAspectRatio = aspectRatio;
        if (aspectRatio === 'portrait') mappedAspectRatio = '9:16';
        if (aspectRatio === 'landscape') mappedAspectRatio = '16:9';

        // Validate duration (Poyo supports: 4, 8, 12, 16, 20)
        const validDurations = [4, 8, 12, 16, 20];
        const mappedDuration = validDurations.includes(Number(duration)) ? Number(duration) : 4;

        console.log(`[Poyo AI] Generating video (sora-2-official): ${prompt.substring(0, 50)}...`);

        const body: any = {
            model: 'sora-2-official',
            input: {
                prompt,
                duration: mappedDuration,
                aspect_ratio: mappedAspectRatio
            }
        };

        // Send Request to Poyo AI
        const response = await fetch(POYO_BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok || data.code !== 200) {
            console.error('[Poyo AI] API Error:', data);
            return res.status(response.status).json({
                error: data.error?.message || 'Failed to start video generation',
                details: data
            });
        }

        const taskId = data.data?.task_id;
        console.log(`[Poyo AI] Video generation started! Task ID: ${taskId}`);

        // Save to Supabase for history tracking
        try {
            await supabase.from('generation_tasks').insert({
                task_id: taskId,
                task_type: 'video',
                prompt,
                model: 'sora-2-official',
                status: 'not_started'
            });
        } catch (e) {
            console.error('[Poyo AI] Failed to save task to DB:', e);
        }

        return res.status(200).json({
            success: true,
            task_id: taskId,
            uuid: taskId,
            status: 'not_started',
            message: 'Video generation started.'
        });

    } catch (error: any) {
        console.error('[Poyo AI] Server Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            details: error.toString()
        });
    }
}
