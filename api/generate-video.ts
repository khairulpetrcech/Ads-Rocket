/**
 * Video Generation API via Google Veo (Gemini)
 * Supports text-to-video and image-to-video generation
 */
import { GoogleGenAI } from "@google/genai";

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
        const { prompt, duration = 8, aspectRatio = '9:16', imageBase64 } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Use GEMINI_3_API for Veo video generation
        const apiKey = process.env.GEMINI_3_API || process.env.GEMINIGEN_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_3_API or GEMINIGEN_API_KEY not configured' });
        }

        console.log(`[Veo] Generating video: ${prompt.substring(0, 50)}...`);

        const genAI = new GoogleGenAI({ apiKey });

        // Generate video using Veo 2
        const result = await genAI.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: prompt,
            config: {
                aspectRatio: aspectRatio, // '9:16', '16:9', or '1:1'
                numberOfVideos: 1,
                durationSeconds: duration, // 4, 8, 12, or 15
                personGeneration: 'allow_adult'
            }
        });

        // Video generation is async - result is the operation
        if (!result || !result.name) {
            return res.status(500).json({
                error: 'Failed to start video generation',
                details: 'No operation returned'
            });
        }

        console.log(`[Veo] Video generation started: ${result.name}`);

        return res.status(200).json({
            success: true,
            operationName: result.name,
            status: 'processing',
            message: 'Video generation started. Poll /api/video-status for completion.'
        });

    } catch (error: any) {
        console.error('[Veo] Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            details: error.toString()
        });
    }
}
