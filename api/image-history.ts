/**
 * Image History API - Fetch image generation history from GeminiGen.ai
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
        const { page = '1' } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;

        const apiKey = process.env.GEMINIGEN_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINIGEN_API_KEY not configured' });
        }

        const url = `https://api.geminigen.ai/uapi/v1/histories?filter_by=all&items_per_page=6&page=${pageNum}`;
        const response = await fetch(url, {
            headers: {
                "x-api-key": apiKey
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch history' });
        }

        // Filter only image type items
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

    } catch (error: any) {
        console.error('[Image History] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
