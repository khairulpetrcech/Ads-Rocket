/**
 * Sora 2 Video Generation API via GeminiGen.ai
 * Supports text-to-video and image-to-video generation
 */

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

    try {
        const { prompt, model = 'sora-2', seconds = 8, size = '1080x1920', imageBase64 } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const apiKey = process.env.GEMINIGEN_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINIGEN_API_KEY not configured' });
        }

        // Build request body
        const requestBody: any = {
            prompt,
            model, // 'sora-2' or 'sora-2-pro'
            seconds, // 4, 8, or 12
            size // '1080x1920' (portrait), '1920x1080' (landscape), '1080x1080' (square)
        };

        // If image provided, add for image-to-video
        if (imageBase64) {
            requestBody.input_reference = imageBase64;
        }

        console.log(`[Sora 2] Generating video: ${prompt.substring(0, 50)}...`);

        // Call GeminiGen.ai Sora 2 API
        const response = await fetch('https://api.geminigen.ai/v1/videos', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[Sora 2] API Error:', data);
            return res.status(response.status).json({
                error: data.error || 'Video generation failed',
                details: data
            });
        }

        // Return video ID for polling
        console.log(`[Sora 2] Video generation started: ${data.id}`);
        return res.status(200).json({
            success: true,
            videoId: data.id,
            status: data.status,
            message: 'Video generation started. Poll /api/video-status for completion.'
        });

    } catch (error: any) {
        console.error('[Sora 2] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
