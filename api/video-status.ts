/**
 * Video Status Polling API
 * Check status of video generation and return URL when complete
 */

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { videoId } = req.query;

        if (!videoId) {
            return res.status(400).json({ error: 'Video ID is required' });
        }

        const apiKey = process.env.GEMINIGEN_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINIGEN_API_KEY not configured' });
        }

        // Call GeminiGen.ai to get video status
        const response = await fetch(`https://api.geminigen.ai/v1/videos/${videoId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[Video Status] API Error:', data);
            return res.status(response.status).json({
                error: data.error || 'Failed to get video status',
                details: data
            });
        }

        return res.status(200).json({
            success: true,
            videoId: data.id,
            status: data.status, // 'processing', 'completed', 'failed'
            url: data.url || null, // Video URL when completed
            progress: data.progress || 0
        });

    } catch (error: any) {
        console.error('[Video Status] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
