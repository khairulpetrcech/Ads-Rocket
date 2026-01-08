/**
 * Video Generation API via GeminiGen.ai (Sora 2)
 * Supports text-to-video and image-to-video generation
 */
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // Setup limit for image uploads
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
