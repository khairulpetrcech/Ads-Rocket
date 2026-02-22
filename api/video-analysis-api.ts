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

// Safe JSON fetch
async function gfetch(url: string) {
    try { return await (await fetch(url)).json(); }
    catch { return {}; }
}

/**
 * Parse page ID and post ID from any Facebook post URL.
 * Supports:
 *   business.facebook.com/{page_id}/posts/{post_id}
 *   www.facebook.com/{page}/posts/{post_id}
 *   www.facebook.com/permalink.php?story_fbid=...&id=...
 *   www.facebook.com/video.php?v={video_id}
 *   www.facebook.com/{page}/videos/{video_id}
 */
function parseFbUrl(url: string): { videoId?: string; pageId?: string; postId?: string } {
    // /videos/{id}
    const videoMatch = url.match(/\/videos\/(\d+)/);
    if (videoMatch) return { videoId: videoMatch[1] };

    // ?v={id} or story_fbid={id}
    const phpMatch = url.match(/[?&]v=(\d+)/) || url.match(/story_fbid=(\d+)/);
    if (phpMatch) return { videoId: phpMatch[1] };

    // {page_id}/posts/{post_id}
    const postMatch = url.match(/(\d+)\/posts\/(\d+)/);
    if (postMatch) return { pageId: postMatch[1], postId: postMatch[2] };

    // permalink.php?story_fbid={post_id}&id={page_id}
    const permalinkMatch = url.match(/story_fbid=(\d+).*?[?&]id=(\d+)/) ||
        url.match(/[?&]id=(\d+).*?story_fbid=(\d+)/);
    if (permalinkMatch) return { pageId: permalinkMatch[2], postId: permalinkMatch[1] };

    return {};
}

/**
 * Extract video source using Facebook Graph API.
 * Strategy:
 * 1. If we have a direct video ID → GET /video_id?fields=source
 * 2. If we have pageId + postId:
 *    a. GET /{pageId}_{postId}?fields=attachments{type,media{video{id}}}
 *    b. From the video.id, GET /video_id?fields=source
 *    c. Also try ?fields=source on the post directly
 *    d. Also try ?fields=place,story,attachments{media{source}} etc.
 */
async function extractViaGraphAPI(url: string, token: string): Promise<string | null> {
    const G = 'https://graph.facebook.com/v19.0';
    const { videoId, pageId, postId } = parseFbUrl(url);

    // 1. Direct video ID
    if (videoId) {
        const d = await gfetch(`${G}/${videoId}?fields=source&access_token=${token}`);
        console.log('[Graph] videoId direct:', JSON.stringify(d).substring(0, 200));
        if (d.source) return d.source;
    }

    if (pageId && postId) {
        const ppId = `${pageId}_${postId}`;

        // 2a. Get video.id from attachment
        const d1 = await gfetch(`${G}/${ppId}?fields=attachments{type,media{video{id}}}&access_token=${token}`);
        console.log('[Graph] attachment video.id:', JSON.stringify(d1).substring(0, 300));
        const attachments1 = d1?.attachments?.data || [];
        for (const att of attachments1) {
            const vid = att?.media?.video?.id;
            if (vid) {
                const dv = await gfetch(`${G}/${vid}?fields=source&access_token=${token}`);
                console.log('[Graph] fetched source from video.id:', JSON.stringify(dv).substring(0, 200));
                if (dv.source) return dv.source;
            }
        }

        // 2b. Try source + media source directly on post
        const d2 = await gfetch(`${G}/${ppId}?fields=source,attachments{media{source},type,subattachments{media{source},type}}&access_token=${token}`);
        console.log('[Graph] post source/media:', JSON.stringify(d2).substring(0, 400));
        if (d2.source) return d2.source;
        for (const att of (d2?.attachments?.data || [])) {
            if (att?.media?.source) return att.media.source;
            for (const sub of (att?.subattachments?.data || [])) {
                if (sub?.media?.source) return sub.media.source;
            }
        }

        // 2c. Try by just post ID (some posts are accessible without page prefix)
        const d3 = await gfetch(`${G}/${postId}?fields=source,attachments{type,media{source,video{id}}}&access_token=${token}`);
        console.log('[Graph] postId only:', JSON.stringify(d3).substring(0, 400));
        if (d3.source) return d3.source;
        for (const att of (d3?.attachments?.data || [])) {
            if (att?.media?.source) return att.media.source;
            const vid = att?.media?.video?.id;
            if (vid) {
                const dv = await gfetch(`${G}/${vid}?fields=source&access_token=${token}`);
                if (dv.source) return dv.source;
            }
        }

        // 2d. Try listing page videos — find by matching description/timestamp (best effort search)
        // Don't do this, too unreliable as noted by user.
    }

    return null;
}

/**
 * Try to scrape video URL using mbasic.facebook.com.
 * mbasic returns simplified HTML — same trick used by most public FB video downloaders.
 * This may be blocked from Vercel's server IPs by Facebook.
 */
async function extractViaScraping(url: string): Promise<string | null> {
    // Try multiple URL variants for mbasic
    const urlVariants: string[] = [];

    const { pageId, postId, videoId } = parseFbUrl(url);

    // Canonical mbasic URLs to try
    if (pageId && postId) {
        urlVariants.push(`https://mbasic.facebook.com/${pageId}/posts/${postId}/`);
        urlVariants.push(`https://mbasic.facebook.com/story.php?story_fbid=${postId}&id=${pageId}`);
        urlVariants.push(`https://mbasic.facebook.com/permalink.php?story_fbid=${postId}&id=${pageId}`);
    }
    if (videoId) {
        urlVariants.push(`https://mbasic.facebook.com/video.php?v=${videoId}`);
        urlVariants.push(`https://mbasic.facebook.com/watch/?v=${videoId}`);
    }
    // Try original URL converted to mbasic
    urlVariants.push(url
        .replace('https://business.facebook.com/', 'https://mbasic.facebook.com/')
        .replace('https://www.facebook.com/', 'https://mbasic.facebook.com/')
    );

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    };

    const patterns = [
        /hd_src_no_ratelimit:"(https[^"]+\.mp4[^"]*)"/,
        /sd_src_no_ratelimit:"(https[^"]+\.mp4[^"]*)"/,
        /hd_src:"(https[^"]+\.mp4[^"]*)"/,
        /sd_src:"(https[^"]+\.mp4[^"]*)"/,
        /"playable_url_quality_hd":"(https[^"]+)"/,
        /"playable_url":"(https[^"]+)"/,
        /"browser_native_hd_url":"(https[^"]+)"/,
        /"browser_native_sd_url":"(https[^"]+)"/,
        // mbasic may have video directly in <a href>
        /href="(https:\/\/video[^"]*\.mp4[^"]*)"/,
        /<source[^>]+src="(https[^"]+\.mp4[^"]*)"/,
        /(https:\/\/video\.f[^\.]+\.[^\.]+\.fna\.fbcdn\.net[^\s"'<>]+\.mp4[^\s"'<>]*)/,
        /(https:\/\/scontent[^\.]+\.[^\.]+\.fna\.fbcdn\.net[^\s"'<>]+\.mp4[^\s"'<>]*)/,
    ];

    for (const mbasicUrl of urlVariants) {
        try {
            console.log(`[Scrape] Trying: ${mbasicUrl}`);
            const response = await fetch(mbasicUrl, { headers });
            const html = await response.text();
            console.log(`[Scrape] Status: ${response.status}, HTML length: ${html.length}`);

            // Check if we hit a login wall
            if (html.includes('login') && html.length < 5000) {
                console.log(`[Scrape] Got login wall for ${mbasicUrl}`);
                continue;
            }

            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match?.[1]) {
                    const cleaned = match[1]
                        .replace(/\\u0026/g, '&')
                        .replace(/\\/g, '')
                        .split('"')[0];
                    console.log(`[Scrape] ✅ Found: ${cleaned.substring(0, 100)}`);
                    return cleaned;
                }
            }
        } catch (err) {
            console.log(`[Scrape] Error for ${mbasicUrl}:`, err);
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

        console.log(`[Video Analysis] Processing: ${url}`);

        let videoUrl = url;

        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            let extracted: string | null = null;

            // Method 1: Graph API (primary for authenticated users — most reliable for ad pages)
            if (fbAccessToken) {
                console.log('[Video Analysis] Trying Graph API...');
                extracted = await extractViaGraphAPI(url, fbAccessToken);
                if (extracted) console.log('[Video Analysis] ✅ Graph API success');
            }

            // Method 2: mbasic.facebook.com scraping (fallback)
            if (!extracted) {
                console.log('[Video Analysis] Trying mbasic scraping...');
                extracted = await extractViaScraping(url);
                if (extracted) console.log('[Video Analysis] ✅ mbasic scraping success');
            }

            if (!extracted) {
                return res.status(400).json({
                    error: 'Tidak dapat mengekstrak video dari link ini secara automatik.\n\nCara paling mudah:\n1. Buka video di Facebook\n2. Klik ikon (...) → "Copy link"\n3. Pergi ke fbdown.net, paste link tersebut\n4. Download & dapatkan direct .mp4 link\n5. Paste direct .mp4 link di sini untuk analisis',
                });
            }

            videoUrl = extracted;
        }

        // Fetch video binary
        const videoResponse = await fetch(videoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video (${videoResponse.status}): ${videoResponse.statusText}`);
        }

        const contentType = videoResponse.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            return res.status(400).json({ error: 'Extracted link tidak mengandungi video. Sila cuba direct .mp4 URL.' });
        }

        const mimeType = contentType.split(';')[0].trim() || 'video/mp4';
        const videoBuffer = await videoResponse.arrayBuffer();
        const base64Video = Buffer.from(videoBuffer).toString('base64');

        console.log(`[Video Analysis] Fetched ${Math.round(videoBuffer.byteLength / 1024)}KB, type: ${mimeType}`);

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

        return res.status(200).json({ success: true, analysis: result.text, videoUrl });

    } catch (error: any) {
        console.error('[Video Analysis] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error', details: error.toString() });
    }
}
