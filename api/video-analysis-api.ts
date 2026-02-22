import { GoogleGenAI } from "@google/genai";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
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

/**
 * Convert any facebook.com URL to mbasic.facebook.com equivalent.
 * mbasic returns simplified HTML that exposes video sources directly — 
 * same trick used by fbdown.net, getfvid, etc.
 */
function toMbasicUrl(url: string): string {
    return url
        .replace('https://business.facebook.com/', 'https://mbasic.facebook.com/')
        .replace('https://www.facebook.com/', 'https://mbasic.facebook.com/')
        .replace('https://m.facebook.com/', 'https://mbasic.facebook.com/')
        .replace('https://fb.watch/', 'https://mbasic.facebook.com/watch/?v=')
        // strip trailing slash
        .replace(/\/$/, '');
}

/**
 * Scrape a Facebook video URL using the mbasic.facebook.com trick.
 * mbasic returns plain HTML with the video source embedded in <a> or <video> tags.
 * This is how most public FB video downloaders work.
 */
async function scrapeFacebookVideo(originalUrl: string): Promise<string | null> {
    const mbasicUrl = toMbasicUrl(originalUrl);
    console.log(`[FB Scrape] Fetching mbasic URL: ${mbasicUrl}`);

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
    };

    try {
        const response = await fetch(mbasicUrl, { headers });
        const html = await response.text();

        console.log(`[FB Scrape] Got HTML length: ${html.length}`);

        // Ordered list of patterns — try most specific first
        const patterns = [
            // HD video URL in mbasic page
            /hd_src_no_ratelimit:"(https[^"]+\.mp4[^"]*)"/,
            /sd_src_no_ratelimit:"(https[^"]+\.mp4[^"]*)"/,
            /hd_src:"(https[^"]+\.mp4[^"]*)"/,
            /sd_src:"(https[^"]+\.mp4[^"]*)"/,
            // playable_url fields (newer FB HTML)
            /"playable_url_quality_hd":"(https[^"]+)"/,
            /"playable_url":"(https[^"]+)"/,
            // browser_native fields
            /"browser_native_hd_url":"(https[^"]+)"/,
            /"browser_native_sd_url":"(https[^"]+)"/,
            // mbasic direct anchor tags (simplest approach)
            /href="(https:\/\/video[^"]*\.mp4[^"]*)"/,
            // video source tag
            /<source\s+src="(https[^"]+\.mp4[^"]*)"/,
            // CDN video links
            /(https:\/\/video\.f[^\.]+\.[^\.]+\.fna\.fbcdn\.net[^\s"'<>]+\.mp4[^\s"'<>]*)/,
            /(https:\/\/scontent[^\.]+\.[^\.]+\.fna\.fbcdn\.net[^\s"'<>]+\.mp4[^\s"'<>]*)/,
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match?.[1]) {
                const rawUrl = match[1]
                    .replace(/\\u0026/g, '&')
                    .replace(/\\u003C/g, '<')
                    .replace(/\\/g, '')
                    .split('"')[0]; // truncate at any stray quote
                console.log(`[FB Scrape] ✅ Found with pattern: ${pattern.source.substring(0, 40)}... => ${rawUrl.substring(0, 80)}`);
                return rawUrl;
            }
        }

        // Log a snippet for debugging
        console.log(`[FB Scrape] ❌ No video URL found. HTML snippet:`, html.substring(0, 500));
        return null;

    } catch (err) {
        console.error('[FB Scrape] Fetch error:', err);
        return null;
    }
}

/**
 * Try Graph API as a secondary method (for users with token).
 */
async function extractViaGraphAPI(postUrl: string, fbAccessToken: string): Promise<string | null> {
    const G = 'https://graph.facebook.com/v19.0';

    async function gfetch(url: string) {
        try { return await (await fetch(url)).json(); }
        catch { return {}; }
    }

    let videoId: string | null = null;
    let pageId: string | null = null;
    let postId: string | null = null;

    const videoMatch = postUrl.match(/\/videos\/(\d+)/);
    if (videoMatch) videoId = videoMatch[1];

    if (!videoId) {
        const phpMatch = postUrl.match(/[?&]v=(\d+)/) || postUrl.match(/story_fbid=(\d+)/);
        if (phpMatch) videoId = phpMatch[1];
    }

    if (!videoId) {
        const postMatch = postUrl.match(/(\d+)\/posts\/(\d+)/);
        if (postMatch) { pageId = postMatch[1]; postId = postMatch[2]; }
    }

    if (videoId) {
        const d = await gfetch(`${G}/${videoId}?fields=source&access_token=${fbAccessToken}`);
        if (d.source) return d.source;
    }

    if (pageId && postId) {
        const d = await gfetch(`${G}/${pageId}_${postId}?fields=source,attachments{media{source},type,subattachments{media{source},type}}&access_token=${fbAccessToken}`);
        if (d.source) return d.source;
        for (const att of (d?.attachments?.data || [])) {
            if (att?.media?.source) return att.media.source;
            for (const sub of (att?.subattachments?.data || [])) {
                if (sub?.media?.source) return sub.media.source;
            }
        }

        // Try just post ID
        const d2 = await gfetch(`${G}/${postId}?fields=source,attachments{media{source},type}&access_token=${fbAccessToken}`);
        if (d2.source) return d2.source;
        for (const att of (d2?.attachments?.data || [])) {
            if (att?.media?.source) return att.media.source;
        }
    }

    return null;
}

async function handleAnalyze(req: any, res: any) {
    try {
        const { url, fbAccessToken } = req.body;

        if (!url) return res.status(400).json({ error: 'URL is required' });

        const geminiApiKey = process.env.VITE_GEMINI_3_API;
        if (!geminiApiKey) return res.status(500).json({ error: 'VITE_GEMINI_3_API not configured' });

        console.log(`[Video Analysis] Processing URL: ${url}`);

        let videoUrl = url;

        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            // Method 1: mbasic.facebook.com scraping (primary — works without token)
            let extracted = await scrapeFacebookVideo(url);

            // Method 2: Graph API (if token available and Method 1 failed)
            if (!extracted && fbAccessToken) {
                console.log('[Video Analysis] mbasic scraping failed, trying Graph API...');
                extracted = await extractViaGraphAPI(url, fbAccessToken);
            }

            if (!extracted) {
                return res.status(400).json({
                    error: 'Tidak dapat mengekstrak video dari link ini. Pastikan video adalah Public. Cuba tangan dapatkan link video terus (.mp4) dengan:\n• Klik kanan video di Facebook → "Save video as"\n• Atau guna laman fbdown.net untuk dapatkan direct link, kemudian paste link .mp4 tersebut di sini.',
                });
            }

            videoUrl = extracted;
            console.log('[Video Analysis] ✅ Got video URL:', videoUrl.substring(0, 100));
        }

        // Fetch the actual video binary
        const videoResponse = await fetch(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
        });

        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video (${videoResponse.status}): ${videoResponse.statusText}`);
        }

        const contentType = videoResponse.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            return res.status(400).json({ error: 'Link ini mengembalikan HTML bukan video. Sila gunakan direct .mp4 link.' });
        }

        const mimeType = contentType.split(';')[0].trim() || 'video/mp4';
        const videoBuffer = await videoResponse.arrayBuffer();
        const base64Video = Buffer.from(videoBuffer).toString('base64');

        console.log(`[Video Analysis] Video fetched: ${Math.round(videoBuffer.byteLength / 1024)}KB, type: ${mimeType}`);

        // Gemini 3 Flash multimodal analysis
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
