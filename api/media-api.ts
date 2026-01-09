/**
 * Consolidated Media API for GeminiGen.ai
 * Handles: video-status, video-history, image-history
 * 
 * Usage:
 * GET /api/media-api?action=video-status&uuid=xxx
 * GET /api/media-api?action=video-history&page=1
 * GET /api/media-api?action=image-history&page=1
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

    const { action, uuid, page = '1' } = req.query;

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
                return res.status(400).json({ error: 'Invalid action. Use: video-status, video-history, or image-history' });
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
