import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const supabaseWrite = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

const DAILY_VIDEO_ANALYSIS_LIMIT = 20;
const FACEBOOK_DOWNLOADER_ACTOR = process.env.APIFY_FACEBOOK_VIDEO_DOWNLOADER_ACTOR || 'bytepulselabs/facebook-video-downloader';

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
        const { url, urls, fbAccessToken, userId, adAccountId } = req.body;
        const requestedUrls = normalizeUrls(urls || url);

        if (!requestedUrls.length) return res.status(400).json({ error: 'Sila masukkan sekurang-kurangnya 1 URL Facebook.' });
        if (requestedUrls.length > DAILY_VIDEO_ANALYSIS_LIMIT) return res.status(400).json({ error: `Maksimum ${DAILY_VIDEO_ANALYSIS_LIMIT} video sekali proses.` });

        const geminiApiKey = process.env.VITE_GEMINI_3_API;
        if (!geminiApiKey) return res.status(500).json({ error: 'VITE_GEMINI_3_API not configured' });

        const apifyToken = process.env.APIFY_TOKEN;
        if (!apifyToken) return res.status(500).json({ error: 'APIFY_TOKEN not configured' });

        const userKey = normalizeUserKey(userId || adAccountId || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous');
        const usage = await reserveDailyUsage(userKey, requestedUrls);
        if (!usage.allowed) {
            return res.status(429).json({
                error: `Limit harian cukup. Maksimum ${DAILY_VIDEO_ANALYSIS_LIMIT} video sehari. Baki hari ini: ${usage.remaining}.`,
                remaining: usage.remaining,
                usedToday: usage.usedToday,
                dailyLimit: DAILY_VIDEO_ANALYSIS_LIMIT
            });
        }

        console.log(`[Video Analysis] Processing ${requestedUrls.length} URL(s) for ${userKey}`);
        const results = [];

        for (const item of usage.records) {
            const sourceUrl = item.url;

            try {
                let videoUrl = sourceUrl;
                let apifyRunId: string | null = null;

                if (sourceUrl.includes('facebook.com') || sourceUrl.includes('fb.watch')) {
                    const apifyResult = await downloadFacebookVideoWithApify(sourceUrl, apifyToken);
                    videoUrl = apifyResult.videoUrl;
                    apifyRunId = apifyResult.runId;
                } else if (sourceUrl.includes('.mp4')) {
                    videoUrl = sourceUrl;
                } else if (fbAccessToken) {
                    const extracted = await extractViaGraphAPI(sourceUrl, fbAccessToken);
                    if (extracted) videoUrl = extracted;
                }

                const analysis = await analyzeVideoUrl(videoUrl, geminiApiKey);
                await updateUsageRecord(item.id, {
                    video_url: videoUrl,
                    apify_run_id: apifyRunId,
                    status: 'completed',
                    analysis_text: analysis,
                    analysis_model: 'gemini-3-flash-preview'
                });

                results.push({ url: sourceUrl, videoUrl, downloadUrl: videoUrl, analysis, success: true });
            } catch (error: any) {
                console.error(`[Video Analysis] Failed for ${sourceUrl}:`, error);
                await updateUsageRecord(item.id, {
                    status: 'failed',
                    error_message: error.message || 'Unknown error'
                });
                results.push({ url: sourceUrl, error: error.message || 'Gagal proses video', success: false });
            }
        }

        const completed = results.filter((item) => item.success);
        if (!completed.length) {
            return res.status(500).json({ error: 'Semua video gagal diproses.', results, remaining: usage.remainingAfterReserve, dailyLimit: DAILY_VIDEO_ANALYSIS_LIMIT });
        }

        return res.status(200).json({
            success: true,
            analysis: completed[0]?.analysis,
            videoUrl: completed[0]?.videoUrl,
            results,
            remaining: usage.remainingAfterReserve,
            dailyLimit: DAILY_VIDEO_ANALYSIS_LIMIT
        });

    } catch (error: any) {
        console.error('[Video Analysis] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error', details: error.toString() });
    }
}

function normalizeUrls(input: any): string[] {
    const raw = Array.isArray(input) ? input.join('\n') : String(input || '');
    const matches = raw.match(/https?:\/\/[^\s,]+/g) || [];
    return Array.from(new Set(matches.map((item) => item.trim().replace(/[)\].,]+$/, ''))));
}

function normalizeUserKey(value: string): string {
    return String(value || 'anonymous').trim().slice(0, 160) || 'anonymous';
}

function todayIsoStart(): string {
    const now = new Date();
    const malaysiaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    malaysiaNow.setUTCHours(0, 0, 0, 0);
    return new Date(malaysiaNow.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

async function reserveDailyUsage(userKey: string, urls: string[]) {
    const { count, error: countError } = await supabaseWrite
        .from('video_analysis_usage')
        .select('id', { count: 'exact', head: true })
        .eq('user_key', userKey)
        .gte('created_at', todayIsoStart());

    if (countError) {
        console.warn('[Video Analysis] Usage count failed:', countError.message);
    }

    const usedToday = count || 0;
    const remaining = Math.max(DAILY_VIDEO_ANALYSIS_LIMIT - usedToday, 0);
    if (urls.length > remaining) {
        return { allowed: false, usedToday, remaining, remainingAfterReserve: remaining, records: [] };
    }

    const rows = urls.map((item) => ({
        user_key: userKey,
        source_url: item,
        source: 'epic_video_apify',
        status: 'queued'
    }));

    const { data, error } = await supabaseWrite
        .from('video_analysis_usage')
        .insert(rows)
        .select('id, source_url');

    if (error) {
        console.warn('[Video Analysis] Usage reserve failed:', error.message);
        return {
            allowed: true,
            usedToday,
            remaining,
            remainingAfterReserve: Math.max(remaining - urls.length, 0),
            records: urls.map((item) => ({ id: null, url: item }))
        };
    }

    return {
        allowed: true,
        usedToday,
        remaining,
        remainingAfterReserve: Math.max(remaining - urls.length, 0),
        records: (data || []).map((item: any) => ({ id: item.id, url: item.source_url }))
    };
}

async function updateUsageRecord(id: string | null, patch: Record<string, any>) {
    if (!id) return;
    const { error } = await supabaseWrite
        .from('video_analysis_usage')
        .update(patch)
        .eq('id', id);
    if (error) console.warn('[Video Analysis] Usage update failed:', error.message);
}

async function downloadFacebookVideoWithApify(url: string, token: string): Promise<{ videoUrl: string; runId: string | null }> {
    const actorId = FACEBOOK_DOWNLOADER_ACTOR.replace('/', '~');
    const apiUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true&format=json&timeout=300`;
    const input = {
        urls: [{ url }],
        quality: '480',
        proxy: { useApifyProxy: false }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Apify gagal (${response.status}): ${text.slice(0, 180)}`);
    }

    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('Apify response bukan JSON.');
    }

    const items = Array.isArray(data) ? data : [data];
    const videoUrl = findVideoUrl(items);
    if (!videoUrl) throw new Error('Apify siap, tapi tiada videoUrl dalam output.');

    const runId = items.find((item: any) => item?.runId || item?.apifyRunId)?.runId || null;
    return { videoUrl, runId };
}

function findVideoUrl(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') {
        return /^https?:\/\//.test(value) && (value.includes('.mp4') || value.includes('/records/')) ? value : null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findVideoUrl(item);
            if (found) return found;
        }
        return null;
    }
    if (typeof value === 'object') {
        const preferredKeys = ['videoUrl', 'downloadUrl', 'url', 'source', 'mediaUrl'];
        for (const key of preferredKeys) {
            const found = findVideoUrl(value[key]);
            if (found) return found;
        }
        for (const item of Object.values(value)) {
            const found = findVideoUrl(item);
            if (found) return found;
        }
    }
    return null;
}

async function analyzeVideoUrl(videoUrl: string, geminiApiKey: string): Promise<string> {
    const videoResponse = await fetch(videoUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video (${videoResponse.status}): ${videoResponse.statusText}`);
    }

    const contentType = videoResponse.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
        throw new Error('Download link tidak mengandungi video.');
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

    return result.text || '';
}
