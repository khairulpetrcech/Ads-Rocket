import { GoogleGenAI } from "@google/genai";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '20mb',
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
        if (action === 'analyze') {
            return handleAnalyze(req, res);
        }
        return res.status(400).json({ error: 'Invalid action. Use: analyze' });
    } catch (error: any) {
        console.error('[Video Analysis API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

async function handleAnalyze(req: any, res: any) {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const geminiApiKey = process.env.VITE_GEMINI_3_API;
        if (!geminiApiKey) {
            return res.status(500).json({ error: 'VITE_GEMINI_3_API not configured' });
        }

        console.log(`[Video Analysis] Analyzing video from URL: ${url}`);

        // 1. Fetch the video content (Bypassing CORS on server)
        // Note: For Facebook URLs, we might need to extract the direct MP4 link first.
        // For now, we attempt to fetch directly. If it's a FB page, this might hit HTML.

        let videoUrl = url;

        // Simple FB URL extraction logic (heuristic)
        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            // In a real production app, you'd use a more robust extractor or a 3rd party API.
            // For now, we'll try to fetch and hope for a direct or redirect link.
            // Many FB downloaders work by fetching the page and parsing 'hd_src' or 'sd_src'.
            console.log("[Video Analysis] Detected Facebook URL, attempting extraction...");

            try {
                const fbResponse = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const html = await fbResponse.text();

                // Regex to find video source in FB HTML
                const hdMatch = html.match(/hd_src:"([^"]+)"/);
                const sdMatch = html.match(/sd_src:"([^"]+)"/);

                if (hdMatch) videoUrl = hdMatch[1].replace(/\\/g, '');
                else if (sdMatch) videoUrl = sdMatch[1].replace(/\\/g, '');

                console.log(`[Video Analysis] Extracted FB Video URL: ${videoUrl.substring(0, 100)}...`);
            } catch (fbErr) {
                console.warn("[Video Analysis] FB Extraction failed, using original URL", fbErr);
            }
        }

        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }

        const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
        const videoBuffer = await videoResponse.arrayBuffer();
        const base64Video = Buffer.from(videoBuffer).toString('base64');

        // 2. Send to Gemini 3 Flash for analysis
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

        const prompt = `Analisa video iklan ini secara mendalam untuk kegunaan Meta Ads.
Berikan maklumat berikut dalam Bahasa Malaysia:
1. **Ringkasan Video**: Apa yang berlaku dalam video ini?
2. **Hook Analisis**: Adakah permulaan video cukup kuat untuk cabut perhatian? Mengapa?
3. **CTA Effectiveness**: Adakah Call to Action jelas dan meyakinkan?
4. **Target Audience**: Siapakah target audience yang paling sesuai untuk video ini?
5. **Cadangan Penambahbaikan**: Bagaimana video ini boleh dihasilkan dengan lebih baik untuk conversion tinggi?

Formatkan jawapan anda dengan kemas menggunakan Markdown. Keputusan mesti dalam Bahasa Malaysia.`;

        // Use the pattern found in analyze-telegram.ts
        const result = await (genAI as any).models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: contentType,
                                data: base64Video
                            }
                        }
                    ]
                }
            ]
        });

        const analysisText = result.text;

        return res.status(200).json({
            success: true,
            analysis: analysisText,
            videoUrl: videoUrl // Send back the extracted URL if available
        });

    } catch (error: any) {
        console.error('[Video Analysis] Server Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            details: error.toString()
        });
    }
}
