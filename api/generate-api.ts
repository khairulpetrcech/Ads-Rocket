/**
 * Consolidated Generation API via GeminiGen.ai
 * Handles both poster (Imagen) and video (Sora 2) generation
 * 
 * Usage:
 * POST /api/generate-api?action=poster
 * POST /api/generate-api?action=video
 */
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

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

// Generate Poster (Imagen)
async function handleGeneratePoster(req: any, res: any) {
    try {
        const { prompt, model = 'nano-banana-pro', aspectRatio = '1:1', style = 'Photorealistic', imageBase64 } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const apiKey = process.env.GEMINIGEN_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINIGEN_API_KEY not configured' });
        }

        console.log(`[GeminiGen] Generating image (${model}): ${prompt.substring(0, 50)}...`);

        // Prepare FormData
        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("model", model); // nano-banana-pro, nano-banana, imagen-4-ultra
        formData.append("aspect_ratio", aspectRatio); // 1:1, 16:9, 9:16
        formData.append("style", style);

        // Handle Reference Image (if present)
        if (imageBase64) {
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer], { type: 'image/png' });
            formData.append("files", blob, "reference_image.png");
        }

        // Send Request to GeminiGen.ai
        const response = await fetch("https://api.geminigen.ai/uapi/v1/generate_image", {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
            },
            body: formData as any
        });

        const data = await response.json();

        if (!response.ok || data.error_code) {
            console.error('[GeminiGen] API Error:', data);
            return res.status(response.status).json({
                error: data.error_message || data.message || 'Failed to generate image',
                details: data
            });
        }

        console.log(`[GeminiGen] Image generation started! UUID: ${data.uuid}`);

        return res.status(200).json({
            success: true,
            uuid: data.uuid,
            id: data.id,
            imageUrl: data.generate_result || null,
            status: data.status, // 1=processing, 2=completed
            message: 'Image generation started.'
        });

    } catch (error: any) {
        console.error('[GeminiGen] Server Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            details: error.toString()
        });
    }
}

// Generate Video (Sora 2)
async function handleGenerateVideo(req: any, res: any) {
    try {
        const { prompt, duration, aspectRatio, model = 'sora-2', resolution = 'small', imageBase64 } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const apiKey = process.env.GEMINIGEN_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINIGEN_API_KEY not configured' });
        }

        console.log(`[GeminiGen] Generating video (${model}): ${prompt.substring(0, 50)}...`);

        // Prepare FormData
        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("model", model);
        formData.append("duration", duration.toString());
        formData.append("resolution", resolution);
        formData.append("aspect_ratio", aspectRatio); // 'landscape' or 'portrait'

        // Handle Image Upload (if present)
        if (imageBase64) {
            // Convert Base64 to Blob/File for FormData
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer], { type: 'image/png' });
            formData.append("files", blob, "reference_image.png");
        }

        // Send Request to GeminiGen.ai
        const response = await fetch("https://api.geminigen.ai/uapi/v1/video-gen/sora", {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
                // Do NOT set Content-Type header manually for FormData, fetch does it automatically with boundary
            },
            body: formData as any // Type assertion for fetch compatibility
        });

        const data = await response.json();

        if (!response.ok || data.error_code) {
            console.error('[GeminiGen] API Error:', data);
            return res.status(response.status).json({
                error: data.error_message || data.message || 'Failed to start video generation',
                details: data
            });
        }

        console.log(`[GeminiGen] Generation started! UUID: ${data.uuid}, ID: ${data.id}`);

        return res.status(200).json({
            success: true,
            uuid: data.uuid, // Use UUID for status polling
            id: data.id,
            status: 'processing',
            message: 'Video generation started.'
        });

    } catch (error: any) {
        console.error('[GeminiGen] Server Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            details: error.toString()
        });
    }
}
