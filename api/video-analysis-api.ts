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

/**
 * Attempt to extract a direct video URL from a Facebook post or business URL
 * using the Graph API (requires access token).
 */
async function extractFacebookVideoUrl(postUrl: string, fbAccessToken?: string): Promise<string | null> {
    // Parse various FB URL patterns to get post/video ID
    // business.facebook.com/{page_id}/posts/{post_id}
    // facebook.com/{page}/videos/{video_id}
    // facebook.com/video.php?v={video_id}
    // fb.watch/{code}

    let videoId: string | null = null;
    let pagePostId: string | null = null;

    // Pattern: /videos/{id}
    const videoIdMatch = postUrl.match(/\/videos\/(\d+)/);
    if (videoIdMatch) videoId = videoIdMatch[1];

    // Pattern: video.php?v={id} or ?story_fbid={id}
    if (!videoId) {
        const phpMatch = postUrl.match(/[?&]v=(\d+)/) || postUrl.match(/[?&]story_fbid=(\d+)/);
        if (phpMatch) videoId = phpMatch[1];
    }

    // Pattern: business.facebook.com/{page_id}/posts/{post_id} or facebook.com/{page}/posts/{post_id}
    if (!videoId) {
        const postMatch = postUrl.match(/(\d+)\/posts\/(\d+)/);
        if (postMatch) {
            pagePostId = `${postMatch[1]}_${postMatch[2]}`;
        }
    }

    if (!videoId && !pagePostId) {
        console.log('[FB Extract] Could not parse video/post ID from URL:', postUrl);
        return null;
    }

    if (!fbAccessToken) {
        console.log('[FB Extract] No FB access token provided');
        return null;
    }

    try {
        if (videoId) {
            // Direct video ID — fetch source directly
            const apiUrl = `https://graph.facebook.com/v19.0/${videoId}?fields=source,permalink_url&access_token=${fbAccessToken}`;
            const response = await fetch(apiUrl);
            const data = await response.json();
            if (data.source) return data.source;
        }

        if (pagePostId) {
            // Post ID — fetch attachments to find video
            const apiUrl = `https://graph.facebook.com/v19.0/${pagePostId}?fields=attachments{media,type,url}&access_token=${fbAccessToken}`;
            const response = await fetch(apiUrl);
            const data = await response.json();
            console.log('[FB Extract] Post attachments:', JSON.stringify(data).substring(0, 300));

            const attachments = data?.attachments?.data || [];
            for (const att of attachments) {
                if (att.type === 'video_inline' || att.type === 'video') {
                    const media = att.media;
                    if (media?.source) return media.source;
                    // Try fetching via video ID in media
                    if (media?.video?.id) {
                        const vidUrl = `https://graph.facebook.com/v19.0/${media.video.id}?fields=source&access_token=${fbAccessToken}`;
                        const vidRes = await fetch(vidUrl);
                        const vidData = await vidRes.json();
                        if (vidData.source) return vidData.source;
                    }
                }
            }
        }
    } catch (err) {
        console.error('[FB Extract] Graph API error:', err);
    }

    return null;
}

async function handleAnalyze(req: any, res: any) {
    try {
        const { url, fbAccessToken } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const geminiApiKey = process.env.VITE_GEMINI_3_API;
        if (!geminiApiKey) {
            return res.status(500).json({ error: 'VITE_GEMINI_3_API not configured' });
        }

        console.log(`[Video Analysis] Analyzing video from URL: ${url}`);

        let videoUrl = url;

        // Handle Facebook URLs — try Graph API first (if token provided), then scraping
        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            console.log("[Video Analysis] Facebook URL detected, extracting via Graph API...");

            if (fbAccessToken) {
                const extracted = await extractFacebookVideoUrl(url, fbAccessToken);
                if (extracted) {
                    videoUrl = extracted;
                    console.log('[Video Analysis] ✅ Extracted via Graph API');
                } else {
                    // Fallback: try HTML scraping
                    console.log('[Video Analysis] Graph API failed, trying HTML scraping...');
                    try {
                        const fbResponse = await fetch(url, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            }
                        });
                        const html = await fbResponse.text();
                        const patterns = [
                            /hd_src:"([^"]+)"/,
                            /sd_src:"([^"]+)"/,
                            /"playable_url":"([^"]+)"/,
                            /"playable_url_quality_hd":"([^"]+)"/,
                        ];
                        let scraped: string | null = null;
                        for (const p of patterns) {
                            const m = html.match(p);
                            if (m) { scraped = m[1].replace(/\\/g, ''); break; }
                        }
                        if (scraped) {
                            videoUrl = scraped;
                        } else {
                            return res.status(400).json({
                                error: 'Tidak dapat mengekstrak video dari link Facebook ini. Pastikan link video adalah Public dan ada dalam page anda. Cuba link video terus (klik kanan video → Copy video address).',
                            });
                        }
                    } catch {
                        return res.status(400).json({
                            error: 'Gagal memuat turun dari link Facebook. Sila gunakan direct video URL.'
                        });
                    }
                }
            } else {
                return res.status(400).json({
                    error: 'Token Facebook diperlukan untuk menganalisis video dari Business Manager. Sila login ke akaun Facebook anda dalam apl ini terlebih dahulu.',
                });
            }
        }

        // Fetch the actual video
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }

        const contentType = videoResponse.headers.get('content-type') || '';

        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
            return res.status(400).json({
                error: 'Link yang diberikan tidak mengembalikan video. Sila gunakan direct video URL (mp4 link).',
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
