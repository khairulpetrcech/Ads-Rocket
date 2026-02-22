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

        let videoUrl = url;

        // Attempt to extract a direct video URL from Facebook page links
        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            console.log("[Video Analysis] Detected Facebook URL, attempting extraction...");

            try {
                const fbResponse = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                    }
                });
                const html = await fbResponse.text();

                // Multiple regex patterns to find video source
                const patterns = [
                    /hd_src:"([^"]+)"/,
                    /sd_src:"([^"]+)"/,
                    /"playable_url":"([^"]+)"/,
                    /"playable_url_quality_hd":"([^"]+)"/,
                    /browser_native_hd_url":"([^"]+)"/,
                    /browser_native_sd_url":"([^"]+)"/,
                ];

                let extractedUrl: string | null = null;
                for (const pattern of patterns) {
                    const match = html.match(pattern);
                    if (match) {
                        extractedUrl = match[1].replace(/\\/g, '');
                        break;
                    }
                }

                if (extractedUrl) {
                    videoUrl = extractedUrl;
                    console.log(`[Video Analysis] Successfully extracted video URL`);
                } else {
                    return res.status(400).json({
                        error: 'Tidak dapat mengekstrak video dari link Facebook ini. Sila gunakan direct video URL (link .mp4). Cuba klik kanan video di Facebook → "Copy video address" dan gunakan link tersebut.',
                    });
                }
            } catch (fbErr) {
                console.warn("[Video Analysis] FB Extraction failed", fbErr);
                return res.status(400).json({
                    error: 'Gagal memuat turun dari link Facebook. Sila gunakan direct video URL (mp4 link) bukan link ke post atau halaman Facebook.',
                });
            }
        }

        // Fetch the actual video
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }

        const contentType = videoResponse.headers.get('content-type') || '';

        // Reject if we got HTML instead of a video file
        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
            return res.status(400).json({
                error: 'Link yang diberikan tidak mengembalikan video. Sila gunakan direct video URL (mp4 link), bukan link ke post Facebook. Cuba klik kanan pada video di Facebook → "Copy video address".',
            });
        }

        const mimeType = contentType.split(';')[0].trim() || 'video/mp4';
        const videoBuffer = await videoResponse.arrayBuffer();
        const base64Video = Buffer.from(videoBuffer).toString('base64');

        // Send to Gemini 3 Flash for analysis
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

        const prompt = `Analisa video iklan ini secara mendalam untuk kegunaan Meta Ads.
Berikan maklumat berikut dalam Bahasa Malaysia:
1. **Ringkasan Video**: Apa yang berlaku dalam video ini?
2. **Hook Analisis**: Adakah permulaan video cukup kuat untuk cabut perhatian? Mengapa?
3. **CTA Effectiveness**: Adakah Call to Action jelas dan meyakinkan?
4. **Target Audience**: Siapakah target audience yang paling sesuai untuk video ini?
5. **Cadangan Penambahbaikan**: Bagaimana video ini boleh dihasilkan dengan lebih baik untuk conversion tinggi?

Formatkan jawapan anda dengan kemas menggunakan Markdown. Keputusan mesti dalam Bahasa Malaysia.`;

        const result = await (genAI as any).models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
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
            videoUrl: videoUrl
        });

    } catch (error: any) {
        console.error('[Video Analysis] Server Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error',
            details: error.toString()
        });
    }
}
