/**
 * Video Status Polling API via GeminiGen.ai History
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
        const { uuid } = req.query; // Use UUID from GeminiGen response

        if (!uuid) {
            return res.status(400).json({ error: 'UUID is required' });
        }

        const apiKey = process.env.GEMINIGEN_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINIGEN_API_KEY not configured' });
        }

        // Poll GeminiGen.ai History API
        const url = `https://api.geminigen.ai/uapi/v1/history/${uuid}`;
        const response = await fetch(url, {
            headers: {
                "x-api-key": apiKey
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch status' });
        }

        /* 
         GeminiGen Status:
         1: Processing
         2: Completed
         3: Failed
        */
        const status = data.status;
        const progress = data.status_percentage || 0;

        if (status === 2) {
            // Completed
            // Video availability checking logic
            let videoUrl = null;
            if (data.generated_video && data.generated_video.length > 0) {
                videoUrl = data.generated_video[0].video_url; // Assuming first video
            }

            return res.status(200).json({
                success: true,
                status: 'completed',
                done: true,
                url: videoUrl,
                progress: 100
            });

        } else if (status === 3) {
            // Failed
            return res.status(200).json({
                success: false,
                status: 'failed',
                done: true,
                error: data.error_message || 'Video generation failed'
            });

        } else {
            // Processing (Status 1)
            return res.status(200).json({
                success: true,
                status: 'processing',
                done: false,
                progress: progress
            });
        }

    } catch (error: any) {
        console.error('[Video Status] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
