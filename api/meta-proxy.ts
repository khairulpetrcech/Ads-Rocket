/**
 * Meta Graph API Server-Side Proxy
 * 
 * Keeps FB access tokens secure on the server. The client sends:
 * - fbId: user's Facebook ID (to look up token from Supabase)
 * - graphPath: the Graph API path (e.g. "act_123/campaigns")
 * - params: query params or body (excluding access_token)
 * - method: GET or POST (default GET)
 * 
 * The server fetches the token from DB, attaches it, and forwards to Meta.
 * 
 * Usage:
 * GET  /api/meta-proxy?fbId=123&graphPath=act_123/campaigns&fields=id,name&limit=200
 * POST /api/meta-proxy  body: { fbId, graphPath, params: { name, objective, ... } }
 * POST /api/meta-proxy?type=formdata  (for file uploads - expects multipart)
 */

import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const GRAPH_VIDEO_BASE = 'https://graph-video.facebook.com/v19.0';

// Token cache: avoid DB lookup on every request (TTL: 5 min)
const tokenCache: Record<string, { token: string; ts: number }> = {};
const TOKEN_CACHE_TTL = 5 * 60 * 1000;

async function getAccessToken(fbId: string): Promise<string | null> {
    if (!fbId) return null;

    // Check cache
    const cached = tokenCache[fbId];
    if (cached && Date.now() - cached.ts < TOKEN_CACHE_TTL) {
        return cached.token;
    }

    // Try telegram_users first (primary source)
    const { data: user } = await supabase
        .from('telegram_users')
        .select('fb_access_token')
        .eq('fb_id', fbId)
        .maybeSingle();

    if (user?.fb_access_token) {
        tokenCache[fbId] = { token: user.fb_access_token, ts: Date.now() };
        return user.fb_access_token;
    }

    // Fallback: analysis_schedules
    const { data: schedule } = await supabase
        .from('analysis_schedules')
        .select('fb_access_token')
        .eq('fb_id', fbId)
        .maybeSingle();

    if (schedule?.fb_access_token) {
        tokenCache[fbId] = { token: schedule.fb_access_token, ts: Date.now() };
        return schedule.fb_access_token;
    }

    return null;
}

// Async audit log — fire and forget, never blocks response
function logAudit(fbId: string, graphPath: string, method: string, success: boolean, errorMsg?: string) {
    void (async () => {
        try {
            await supabase.from('meta_api_logs').insert({
                fb_id: fbId,
                graph_path: graphPath,
                method,
                success,
                error_message: errorMsg || null,
                created_at: new Date().toISOString()
            });
        } catch { /* fire and forget */ }
    })();
}

export default async function handler(req: any, res: any) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let fbId: string;
        let graphPath: string;
        let method: string = 'GET';
        let params: Record<string, any> = {};
        let isFormData = false;
        let isVideoUpload = false;
        let isBatchRequest = false;

        if (req.method === 'POST') {
            const body = req.body || {};
            fbId = body.fbId || req.query.fbId;
            graphPath = body.graphPath || req.query.graphPath || '';
            method = body.method || 'POST';
            params = body.params || {};
            isFormData = body.isFormData === true || req.query.type === 'formdata';
            isVideoUpload = body.isVideoUpload === true;
            isBatchRequest = body.isBatchRequest === true;
        } else {
            // GET — extract from query params
            fbId = req.query.fbId;
            graphPath = req.query.graphPath || '';
            const { fbId: _, graphPath: __, ...rest } = req.query;
            params = rest;
        }

        if (!fbId) {
            return res.status(400).json({ error: 'Missing fbId parameter' });
        }
        if (!graphPath && !isBatchRequest) {
            return res.status(400).json({ error: 'Missing graphPath parameter' });
        }

        // Check if user is allowed
        const { data: userRecord } = await supabase
            .from('tracked_users')
            .select('is_allowed')
            .eq('fb_id', fbId)
            .maybeSingle();

        // BLOCK if:
        // 1. User doesn't exist in our DB (Never connected/registered)
        // 2. User exists but is explicitly blocked (is_allowed === false)
        if (!userRecord || userRecord.is_allowed === false) {
            return res.status(403).json({ 
                error: !userRecord 
                    ? 'User not registered with Ads Rocket. Please connect your account first.' 
                    : 'Not allowed to use Ads Rocket API. Please contact admin.' 
            });
        }

        // Get token
        const accessToken = await getAccessToken(fbId);
        if (!accessToken) {
            return res.status(401).json({ error: 'No access token found. Please reconnect your Meta account.' });
        }

        // --- BATCH REQUEST (for daily breakdown) ---
        if (isBatchRequest) {
            const batch = params.batch;
            if (!batch) {
                return res.status(400).json({ error: 'Missing batch parameter' });
            }
            const formData = new URLSearchParams();
            formData.append('batch', typeof batch === 'string' ? batch : JSON.stringify(batch));
            const metaRes = await fetch(`${GRAPH_BASE}/?access_token=${accessToken}`, {
                method: 'POST',
                body: formData
            });
            const data = await metaRes.json();
            logAudit(fbId, 'batch', 'POST', !data.error);
            return res.status(metaRes.status).json(data);
        }

        // Determine base URL
        const baseUrl = isVideoUpload ? GRAPH_VIDEO_BASE : GRAPH_BASE;
        const url = `${baseUrl}/${graphPath}`;

        if (method === 'GET') {
            // Build query string
            const qs = new URLSearchParams({ ...params, access_token: accessToken });
            const fullUrl = `${url}?${qs.toString()}`;
            const metaRes = await fetch(fullUrl);
            const data = await metaRes.json();
            logAudit(fbId, graphPath, 'GET', !data.error, data.error?.message);
            return res.status(metaRes.status).json(data);
        }

        // POST — JSON body
        if (!isFormData) {
            const bodyWithToken = { ...params, access_token: accessToken };
            const metaRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyWithToken)
            });
            const data = await metaRes.json();
            logAudit(fbId, graphPath, 'POST', !data.error, data.error?.message);
            return res.status(metaRes.status).json(data);
        }

        // POST — FormData (file uploads)
        const formData = new FormData();
        formData.append('access_token', accessToken);

        // Forward all params as form fields
        for (const [key, value] of Object.entries(params)) {
            if (key === 'fileBase64' && typeof value === 'string') {
                // Convert base64 to blob for file upload
                const buffer = Buffer.from(value, 'base64');
                const filename = params.filename || 'upload';
                const mimeType = params.mimeType || 'application/octet-stream';
                formData.append(params.fileField || 'filename', new Blob([buffer], { type: mimeType }), filename);
            } else if (key !== 'filename' && key !== 'mimeType' && key !== 'fileField') {
                formData.append(key, String(value));
            }
        }

        const metaRes = await fetch(url, { method: 'POST', body: formData });
        const data = await metaRes.json();
        logAudit(fbId, graphPath, 'POST-FORM', !data.error, data.error?.message);
        return res.status(metaRes.status).json(data);

    } catch (error: any) {
        console.error('[Meta Proxy] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
