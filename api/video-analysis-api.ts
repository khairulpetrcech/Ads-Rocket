import { GoogleGenAI } from "@google/genai";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '20mb',
        },
    },
};

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action } = req.query;
    try {
        if (action === 'analyze') return handleAnalyze(req, res);
        return res.status(400).json({ error: 'Invalid action. Use: analyze' });
    } catch (error: any) {
        console.error('[Video Analysis API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Safe Graph API fetch helper
async function gfetch(url: string) {
    try {
        const r = await fetch(url);
        return await r.json();
    } catch { return {}; }
}

/**
 * Extract a direct video source URL from a Facebook post/video link
 * using the Graph API with the user's access token.
 */
async function extractFacebookVideoUrl(
    postUrl: string,
    fbAccessToken: string,
    adAccountId?: string
): Promise<string | null> {
    let videoId: string | null = null;
    let postId: string | null = null;
    let pageId: string | null = null;

    // Pattern: /videos/{id}
    const videoIdMatch = postUrl.match(/\/videos\/(\d+)/);
    if (videoIdMatch) videoId = videoIdMatch[1];

    // Pattern: video.php?v={id} or ?story_fbid={id}
    if (!videoId) {
        const phpMatch = postUrl.match(/[?&]v=(\d+)/) || postUrl.match(/[?&]story_fbid=(\d+)/);
        if (phpMatch) videoId = phpMatch[1];
    }

    // Pattern: {page_id}/posts/{post_id}
    if (!videoId) {
        const postMatch = postUrl.match(/(\d+)\/posts\/(\d+)/);
        if (postMatch) {
            pageId = postMatch[1];
            postId = postMatch[2];
        }
    }

    const G = 'https://graph.facebook.com/v19.0';
    const token = fbAccessToken;

    // 1. Direct video ID
    if (videoId) {
        const d = await gfetch(`${G}/${videoId}?fields=source&access_token=${token}`);
        console.log('[FB Extract] videoId fetch:', JSON.stringify(d).substring(0, 200));
        if (d.source) return d.source;
    }

    if (pageId && postId) {
        const pagePostId = `${pageId}_${postId}`;

        // 2. page_post_id with source + attachments + subattachments
        const d2 = await gfetch(`${G}/${pagePostId}?fields=source,attachments{media{source},type,subattachments{media{source},type}}&access_token=${token}`);
        console.log('[FB Extract] pagePostId:', JSON.stringify(d2).substring(0, 400));
        if (d2.source) return d2.source;
        for (const att of (d2?.attachments?.data || [])) {
            if (att?.media?.source) return att.media.source;
            for (const sub of (att?.subattachments?.data || [])) {
                if (sub?.media?.source) return sub.media.source;
            }
        }

        // 3. Just postId without page prefix
        const d3 = await gfetch(`${G}/${postId}?fields=source,attachments{media{source},type}&access_token=${token}`);
        console.log('[FB Extract] postId only:', JSON.stringify(d3).substring(0, 400));
        if (d3.source) return d3.source;
        for (const att of (d3?.attachments?.data || [])) {
            if (att?.media?.source) return att.media.source;
        }

        // 4. Fallback: list videos from ad account (most recent first)
        if (adAccountId) {
            const acct = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
            const d4 = await gfetch(`${G}/${acct}/advideos?fields=source,id,created_time&limit=50&access_token=${token}`);
            console.log('[FB Extract] Ad account videos count:', d4?.data?.length);
            if (d4?.data?.length > 0) {
                const sorted = [...d4.data].sort((a: any, b: any) =>
                    new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
                );
                for (const v of sorted) {
                    if (v.source) return v.source;
                }
            }
        }
    }

    return null;
}

async function handleAnalyze(req: any, res: any) {
    try {
        const { url, fbAccessToken, adAccountId } = req.body;

        if (!url) return res.status(400).json({ error: 'URL is required' });

        const geminiApiKey = process.env.VITE_GEMINI_3_API;
        if (!geminiApiKey) return res.status(500).json({ error: 'VITE_GEMINI_3_API not configured' });

        console.log(`[Video Analysis] URL: ${url}`);

        let videoUrl = url;

        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            if (!fbAccessToken) {
                return res.status(400).json({
                    error: 'Token Facebook diperlukan. Sila login ke akaun Facebook dalam apl ini terlebih dahulu.',
                });
            }

            console.log('[Video Analysis] Facebook URL, extracting via Graph API...');
            const extracted = await extractFacebookVideoUrl(url, fbAccessToken, adAccountId);

            if (extracted) {
                videoUrl = extracted;
                console.log('[Video Analysis] ✅ Extracted video URL');
            } else {
                // Fallback: HTML scraping
                console.log('[Video Analysis] Graph API failed, trying HTML scraping...');
                try {
                    const fbRes = await fetch(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    const html = await fbRes.text();
                    const patterns = [/hd_src:"([^"]+)"/, /sd_src:"([^"]+)"/, /"playable_url":"([^"]+)"/, /"playable_url_quality_hd":"([^"]+)"/];
                    let scraped: string | null = null;
                    for (const p of patterns) {
                        const m = html.match(p);
                        if (m) { scraped = m[1].replace(/\\/g, ''); break; }
                    }
                    if (scraped) {
                        videoUrl = scraped;
                    } else {
                        return res.status(400).json({
                            error: 'Tidak dapat mengekstrak video dari link Facebook ini. Pastikan video adalah Public. Cuba klik kanan video di Facebook → "Copy video address" dan gunakan link tersebut.',
                        });
                    }
                } catch {
                    return res.status(400).json({ error: 'Gagal memuat turun dari link Facebook. Sila gunakan direct video URL.' });
                }
            }
        }

        // Fetch the actual video
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);

        const contentType = videoResponse.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
            return res.status(400).json({ error: 'Link tidak mengembalikan video. Sila gunakan direct video URL (mp4 link).' });
        }

        const mimeType = contentType.split(';')[0].trim() || 'video/mp4';
        const videoBuffer = await videoResponse.arrayBuffer();
        const base64Video = Buffer.from(videoBuffer).toString('base64');

        // Gemini 3 Flash analysis
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
            contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Video } }] }]
        });

        return res.status(200).json({
            success: true,
            analysis: result.text,
            videoUrl
        });

    } catch (error: any) {
        console.error('[Video Analysis] Server Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error', details: error.toString() });
    }
}
