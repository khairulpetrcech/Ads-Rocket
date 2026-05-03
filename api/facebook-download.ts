import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const supabaseWrite = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

const APIFY_ACTOR_ID = 'bytepulselabs~facebook-video-downloader';
const DAILY_DOWNLOAD_LIMIT = 20;
const STORAGE_BUCKET = 'rapid-creatives';

type FacebookDownloadCandidate = {
    videoId: string;
    normalizedUrl: string;
};

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '2mb',
        },
    },
};

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { url, userId, adAccountId } = req.body || {};
        const token = process.env.APIFY_TOKEN;

        if (!token) return res.status(500).json({ success: false, error: 'Missing APIFY_TOKEN' });
        if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ success: false, error: 'Missing SUPABASE_SERVICE_KEY' });
        if (!url) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

        validateFacebookUrl(url);
        const candidates = await resolveFacebookVideoCandidates(url);
        const userKey = normalizeUserKey(userId || adAccountId || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous');

        const usage = await reserveDailyDownload(userKey, url);
        if (!usage.allowed) {
            return res.status(429).json({
                success: false,
                error: `Limit harian cukup. Maksimum ${DAILY_DOWNLOAD_LIMIT} video sehari.`,
                remaining: usage.remaining,
                dailyLimit: DAILY_DOWNLOAD_LIMIT
            });
        }

        try {
            const downloaded = await downloadFirstWorkingCandidate(token, candidates);
            const stored = await downloadAndStoreMp4(downloaded.videoUrl, downloaded.videoId);

            await updateUsageRecord(usage.recordId, {
                video_url: stored.publicUrl,
                apify_run_id: downloaded.run.id,
                status: 'completed'
            });

            return res.status(200).json({
                success: true,
                videoUrl: stored.publicUrl,
                fileName: stored.fileName,
                apifyRunId: downloaded.run.id,
                costUsd: downloaded.run.usageTotalUsd || 0,
                remaining: usage.remainingAfterReserve,
                normalizedUrl: downloaded.normalizedUrl,
                candidateIds: candidates.map((candidate) => candidate.videoId),
                candidateUrls: candidates.map((candidate) => candidate.normalizedUrl)
            });
        } catch (error: any) {
            await releaseUsageRecord(usage.recordId);
            return res.status(400).json({ success: false, error: error.message || 'Facebook video download failed' });
        }
    } catch (error: any) {
        return res.status(400).json({ success: false, error: error.message || 'Invalid request' });
    }
}

function validateFacebookUrl(rawUrl: string): URL {
    const parsed = parseUrl(rawUrl);
    if (!parsed.hostname.includes('facebook.com')) {
        throw new Error('Invalid Facebook URL');
    }
    return parsed;
}

function parseUrl(rawUrl: string): URL {
    try {
        return new URL(rawUrl);
    } catch {
        throw new Error('Invalid Facebook URL');
    }
}

async function resolveFacebookVideoCandidates(rawUrl: string): Promise<FacebookDownloadCandidate[]> {
    const parsed = validateFacebookUrl(rawUrl);
    const directId = extractDirectFacebookVideoId(parsed);
    if (directId) return buildDirectVideoCandidates(directId);

    const postCandidates = buildPostUrlCandidates(rawUrl);

    if (postCandidates.length) {
        try {
            const html = await fetchFacebookHtml(rawUrl);
            for (const videoId of extractVideoIdsFromHtml(html)) {
                postCandidates.push(...buildDirectVideoCandidates(videoId));
            }
        } catch {
            // Facebook often blocks anonymous HTML fetches. Apify can still resolve public post URLs directly.
        }

        return dedupeCandidates(postCandidates);
    }

    throw new Error('Cannot extract Facebook video ID. Paste a Reel, Watch, /videos/, or public post URL with attached video.');
}

function buildDirectVideoCandidates(videoId: string): FacebookDownloadCandidate[] {
    return [
        {
            videoId,
            normalizedUrl: `https://www.facebook.com/facebook/videos/${videoId}`
        },
        {
            videoId,
            normalizedUrl: `https://www.facebook.com/watch/?v=${videoId}`
        },
        {
            videoId,
            normalizedUrl: `https://www.facebook.com/video.php?v=${videoId}`
        }
    ];
}

function buildPostUrlCandidates(rawUrl: string): FacebookDownloadCandidate[] {
    const parsed = validateFacebookUrl(rawUrl);
    const postMatch = parsed.pathname.match(/^\/([^/]+)\/posts\/(\d+)\/?$/);
    if (!postMatch) return [];

    const pageId = postMatch[1];
    const postId = postMatch[2];
    const hostVariants = ['www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com'];
    const candidates: FacebookDownloadCandidate[] = [];

    const add = (url: string, videoId = postId) => candidates.push({ videoId, normalizedUrl: url });
    add(rawUrl);

    for (const host of hostVariants) {
        add(`https://${host}/${pageId}/posts/${postId}/`);
        add(`https://${host}/${pageId}/videos/${postId}/`);
        add(`https://${host}/story.php?story_fbid=${postId}&id=${pageId}`);
        add(`https://${host}/permalink.php?story_fbid=${postId}&id=${pageId}`);
    }

    return candidates;
}

function dedupeCandidates(candidates: FacebookDownloadCandidate[]): FacebookDownloadCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
        const key = `${candidate.videoId}:${candidate.normalizedUrl}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function extractDirectFacebookVideoId(parsed: URL): string | null {
    const reelMatch = parsed.pathname.match(/\/reel\/(\d+)/);
    if (reelMatch) return reelMatch[1];

    const videosMatch = parsed.pathname.match(/\/videos\/(\d+)/);
    if (videosMatch) return videosMatch[1];

    const nestedVideosMatch = parsed.pathname.match(/\/videos\/[^/]+\/(\d+)/);
    if (nestedVideosMatch) return nestedVideosMatch[1];

    const watchId = parsed.searchParams.get('v');
    if (watchId && /^\d+$/.test(watchId)) return watchId;

    return null;
}

async function fetchFacebookHtml(url: string): Promise<string> {
    const urls = buildFacebookHtmlUrls(url);
    let lastStatus = 0;

    for (const targetUrl of urls) {
        const response = await fetch(targetUrl, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            }
        });

        lastStatus = response.status;
        const html = await response.text();
        if (response.ok && html.length > 500) return html;
    }

    throw new Error(`Failed to fetch Facebook post HTML (${lastStatus || 'no response'})`);
}

function buildFacebookHtmlUrls(rawUrl: string): string[] {
    const parsed = validateFacebookUrl(rawUrl);
    const urls = [rawUrl];
    const hostVariants = ['www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com'];

    for (const host of hostVariants) {
        const next = new URL(rawUrl);
        next.hostname = host;
        urls.push(next.toString());
    }

    const postMatch = parsed.pathname.match(/^\/([^/]+)\/posts\/(\d+)\/?$/);
    if (postMatch) {
        const pageId = postMatch[1];
        const postId = postMatch[2];
        for (const host of hostVariants) {
            urls.push(`https://${host}/${pageId}/posts/${postId}/`);
            urls.push(`https://${host}/story.php?story_fbid=${postId}&id=${pageId}`);
            urls.push(`https://${host}/permalink.php?story_fbid=${postId}&id=${pageId}`);
        }
    }

    return Array.from(new Set(urls));
}

function extractVideoIdsFromHtml(html: string): string[] {
    const candidates: string[] = [];
    const add = (value?: string | null) => {
        if (value && /^\d{8,}$/.test(value) && !candidates.includes(value)) candidates.push(value);
    };

    for (const pattern of [
        /"videoID"\s*:\s*"(\d+)"/g,
        /"videoID"\s*:\s*(\d+)/g,
        /"video_id"\s*:\s*"(\d+)"/g,
        /"video_id"\s*:\s*(\d+)/g,
        /\/videos\/(\d+)/g,
        /\/watch\/?\?v=(\d+)/g,
    ]) {
        for (const match of html.matchAll(pattern)) add(match[1]);
    }

    for (const pattern of [
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/gi,
    ]) {
        for (const match of html.matchAll(pattern)) {
            const imageUrl = decodeHtml(match[1] || '');
            for (const numberMatch of imageUrl.matchAll(/(?:^|[_/-])(\d{12,})(?:[_./-]|$)/g)) add(numberMatch[1]);
        }
    }

    const videoContextPattern = /(?:video|thumbnail|t15\.5256-10)[\s\S]{0,600}?(\d{12,})/gi;
    for (const match of html.matchAll(videoContextPattern)) add(match[1]);

    return candidates.slice(0, 8);
}

function decodeHtml(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\\\//g, '/')
        .replace(/\\u0025/g, '%')
        .replace(/\\u0026/g, '&');
}

function normalizeUserKey(value: string): string {
    return String(value || 'anonymous').trim().slice(0, 160) || 'anonymous';
}

function todayMalaysiaIsoStart(): string {
    const now = new Date();
    const malaysiaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    malaysiaNow.setUTCHours(0, 0, 0, 0);
    return new Date(malaysiaNow.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

async function reserveDailyDownload(userKey: string, sourceUrl: string) {
    const { count, error: countError } = await supabaseWrite
        .from('video_analysis_usage')
        .select('id', { count: 'exact', head: true })
        .eq('user_key', userKey)
        .eq('source', 'facebook_download_apify')
        .gte('created_at', todayMalaysiaIsoStart());

    if (isMissingUsageTableError(countError)) {
        console.warn('[Facebook Download] video_analysis_usage table missing; skipping daily limit.');
        return {
            allowed: true,
            remaining: DAILY_DOWNLOAD_LIMIT,
            remainingAfterReserve: DAILY_DOWNLOAD_LIMIT,
            recordId: null
        };
    }

    if (countError) throw new Error(`Rate limit check failed: ${countError.message}`);

    const usedToday = count || 0;
    const remaining = Math.max(DAILY_DOWNLOAD_LIMIT - usedToday, 0);
    if (remaining <= 0) {
        return { allowed: false, remaining, remainingAfterReserve: remaining, recordId: null };
    }

    const { data, error } = await supabaseWrite
        .from('video_analysis_usage')
        .insert({
            user_key: userKey,
            source_url: sourceUrl,
            source: 'facebook_download_apify',
            status: 'queued'
        })
        .select('id')
        .single();

    if (isMissingUsageTableError(error)) {
        console.warn('[Facebook Download] video_analysis_usage table missing; download will continue without usage tracking.');
        return {
            allowed: true,
            remaining,
            remainingAfterReserve: remaining,
            recordId: null
        };
    }

    if (error) throw new Error(`Rate limit save failed: ${error.message}`);

    return {
        allowed: true,
        remaining,
        remainingAfterReserve: Math.max(remaining - 1, 0),
        recordId: data?.id || null
    };
}

async function updateUsageRecord(id: string | null, patch: Record<string, any>) {
    if (!id) return;
    await supabaseWrite.from('video_analysis_usage').update(patch).eq('id', id);
}

async function releaseUsageRecord(id: string | null) {
    if (!id) return;
    await supabaseWrite.from('video_analysis_usage').delete().eq('id', id).eq('status', 'queued');
}

function isMissingUsageTableError(error: any): boolean {
    const message = String(error?.message || '');
    return error?.code === 'PGRST205' || message.includes("Could not find the table 'public.video_analysis_usage'");
}

async function downloadFirstWorkingCandidate(token: string, candidates: FacebookDownloadCandidate[]) {
    let lastError = 'Facebook video download failed';

    for (const candidate of candidates) {
        const { videoId, normalizedUrl } = candidate;
        const run = await runApifyFacebookDownloader(token, normalizedUrl);

        if (run.status !== 'SUCCEEDED') {
            lastError = run.statusMessage || `Apify run failed for video ${videoId}`;
            continue;
        }

        const items = await fetchApifyDatasetItems(token, run.defaultDatasetId);
        const videoUrl = items?.[0]?.videoUrl;
        if (videoUrl) return { videoId, normalizedUrl, videoUrl, run };

        lastError = `Apify run succeeded but returned no videoUrl for candidate ${videoId}`;
    }

    throw new Error(lastError);
}

async function runApifyFacebookDownloader(token: string, normalizedUrl: string) {
    const response = await fetch(
        `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?waitForFinish=300`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                urls: [{ url: normalizedUrl }],
                quality: '1080',
                proxy: { useApifyProxy: false },
            }),
        }
    );

    const json = await response.json();
    if (!response.ok) {
        throw new Error(json.error?.message || 'Apify failed');
    }

    return json.data;
}

async function fetchApifyDatasetItems(token: string, datasetId: string) {
    if (!datasetId) throw new Error('Apify did not return a dataset ID');

    const response = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) throw new Error(`Failed to read Apify dataset (${response.status})`);
    return response.json();
}

async function downloadAndStoreMp4(videoUrl: string, videoId: string) {
    const mediaResponse = await fetch(videoUrl);
    if (!mediaResponse.ok) throw new Error(`Failed to download MP4 from Apify (${mediaResponse.status})`);

    const contentType = mediaResponse.headers.get('content-type') || 'video/mp4';
    const buffer = await mediaResponse.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    const fileName = `facebook-video-${videoId}-${Date.now()}.mp4`;
    const filePath = `facebook-downloads/${fileName}`;

    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await supabaseService.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, uint8Array, {
            contentType,
            upsert: false
        });

    if (error) throw new Error(`Failed to store MP4: ${error.message}`);

    const { data } = supabaseService.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return { publicUrl: data.publicUrl, fileName };
}
