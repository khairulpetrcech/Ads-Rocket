/**
 * Video Status Polling API
 * Check status of Veo video generation operation
 */
import { GoogleGenAI } from "@google/genai";

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
        const { operationName } = req.query;

        if (!operationName) {
            return res.status(400).json({ error: 'Operation name is required' });
        }

        const apiKey = process.env.GEMINI_3_API || process.env.GEMINIGEN_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        const genAI = new GoogleGenAI({ apiKey });

        // Poll operation status
        const operation = await genAI.operations.get({ name: operationName });

        if (!operation.done) {
            return res.status(200).json({
                success: true,
                status: 'processing',
                done: false,
                progress: 50 // Estimated
            });
        }

        // Operation complete - get video
        if (operation.response && operation.response.generatedVideos) {
            const video = operation.response.generatedVideos[0];

            // Get video data
            let videoUrl = null;
            if (video.video && video.video.uri) {
                videoUrl = video.video.uri;
            }

            return res.status(200).json({
                success: true,
                status: 'completed',
                done: true,
                url: videoUrl,
                progress: 100
            });
        }

        // Check for error
        if (operation.error) {
            return res.status(200).json({
                success: false,
                status: 'failed',
                done: true,
                error: operation.error.message || 'Video generation failed'
            });
        }

        return res.status(200).json({
            success: true,
            status: 'processing',
            done: false,
            progress: 75
        });

    } catch (error: any) {
        console.error('[Video Status] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
