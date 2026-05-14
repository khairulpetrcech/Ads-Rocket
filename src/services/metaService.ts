
import { AdCampaign, MetaAdAccount, AdSet, Ad, AdvantagePlusConfig } from '../types';

declare global {
    interface Window {
        FB: any;
        fbAsyncInit: () => void;
    }
}

// --- SERVER-SIDE PROXY HELPERS ---
// All Meta Graph API calls go through /api/meta-proxy to keep token server-side

const getFbId = (): string => {
    try {
        const raw = localStorage.getItem('ar_settings');
        if (raw) {
            const s = JSON.parse(raw);
            if (s.userId) return s.userId;
        }
    } catch {}
    return '';
};

/** GET request through proxy */
const proxyGet = async (graphPath: string, params: Record<string, string> = {}): Promise<any> => {
    const fbId = getFbId();
    if (!fbId) throw new Error('SESSION_EXPIRED');
    const qs = new URLSearchParams({ fbId, graphPath, ...params });
    const res = await fetch(`/api/meta-proxy?${qs.toString()}`);
    const data = await res.json();
    if (data.error) handleApiError(data);
    return data;
};

/** POST JSON request through proxy */
const proxyPost = async (graphPath: string, params: Record<string, any> = {}, opts?: { isVideoUpload?: boolean }): Promise<any> => {
    const fbId = getFbId();
    if (!fbId) throw new Error('SESSION_EXPIRED');
    const res = await fetch('/api/meta-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fbId, graphPath, method: 'POST', params, isVideoUpload: opts?.isVideoUpload })
    });
    const data = await res.json();
    if (data.error) handleApiError(data);
    return data;
};

/** POST FormData through proxy (file uploads) */
const proxyPostForm = async (graphPath: string, params: Record<string, any>, opts?: { isVideoUpload?: boolean }): Promise<any> => {
    const fbId = getFbId();
    if (!fbId) throw new Error('SESSION_EXPIRED');
    const res = await fetch('/api/meta-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fbId, graphPath, method: 'POST', params, isFormData: true, isVideoUpload: opts?.isVideoUpload })
    });
    const data = await res.json();
    if (data.error) handleApiError(data);
    return data;
};

/** Batch request through proxy */
const proxyBatch = async (batch: any[]): Promise<any[]> => {
    const fbId = getFbId();
    if (!fbId) throw new Error('SESSION_EXPIRED');
    const res = await fetch('/api/meta-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fbId, graphPath: '', isBatchRequest: true, params: { batch } })
    });
    return await res.json();
};

// --- SMART CACHING SYSTEM ---
const CACHE_TTL = 5 * 60 * 1000;
const apiCache: Record<string, { timestamp: number, data: any }> = {};

const getCachedData = (key: string) => {
    const cached = apiCache[key];
    if (!cached) return null;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    delete apiCache[key];
    return null;
};

const setCachedData = (key: string, data: any) => {
    apiCache[key] = { timestamp: Date.now(), data };
};

const invalidateCache = () => {
    console.log('[Meta Cache] Invalidating all cache due to write action.');
    for (const key in apiCache) delete apiCache[key];
};

const handleApiError = (data: any) => {
    if (data.error) {
        console.error("Meta API FULL ERROR:", JSON.stringify(data, null, 2)); // DEBUGGING CRITICAL

        const code = data.error.code;
        const message = data.error.message || "";
        const userMsg = data.error.error_user_msg || "";
        const subcode = data.error.error_subcode;

        // Combine messages for easier checking
        const fullErrorString = (message + " " + userMsg).toLowerCase();

        // Session / Auth Errors
        if (code === 190 || code === 102) {
            throw new Error("SESSION_EXPIRED");
        }

        if (code === 80004 || code === 17 || code === 613) {
            throw new Error("Meta API Rate Limit Exceeded. Please wait 1-2 minutes before refreshing.");
        }

        // Specific Error: Development Mode Restriction on Creatives
        if (fullErrorString.includes('development mode')) {
            throw new Error("DEVELOPMENT MODE ISSUE: Your Meta App is still in 'Development Mode'. Even if you are an Admin, Meta prevents ad creative creation in this mode. Please go to developers.facebook.com and switch the App Mode to 'Live'.");
        }

        // Provide more context for Invalid Parameter errors
        if (userMsg) {
            throw new Error(`${data.error.error_user_title || 'Error'}: ${userMsg}`);
        }

        if (subcode === 1885316) {
            throw new Error("Invalid Image Hash. Please re-upload the image.");
        }

        // Catch specific CBO/Budget Sharing errors
        if (message.includes('is_adset_budget_sharing_enabled')) {
            throw new Error("BUDGET_SHARING_ERROR"); // Caught by retry logic
        }

        throw new Error(message || "Unknown Meta API Error. Check Console for details.");
    }
};

// --- SECURITY HELPER ---
export const isSecureContext = (): boolean => {
    return true;
};

// Input Sanitization to prevent XSS/Injection
const sanitizeInput = (input: string) => {
    if (!input) return "";
    return input.replace(/<[^>]*>?/gm, "").trim();
};

// --- HELPER: DATE RANGE PARAMS ---
// Updated to handle custom objects { start: string, end: string }
export const getDateRangeParams = (preset: string | { start: string, end: string }) => {
    const today = new Date();
    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Custom Range Object
    if (typeof preset === 'object' && preset.start && preset.end) {
        return {
            time_range: `{"since":"${preset.start}","until":"${preset.end}"}`,
            date_preset: null
        };
    }

    // String Presets
    if (preset === 'last_4d') {
        const end = new Date(today);
        const start = new Date(today);
        start.setDate(today.getDate() - 3);
        return {
            time_range: `{"since":"${formatDate(start)}","until":"${formatDate(end)}"}`,
            date_preset: null
        };
    }

    return { date_preset: preset, time_range: null };
};

// --- FACEBOOK SDK INIT ---

export const initFacebookSdk = (appId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        // 1. Check if FB is already available
        if (window.FB) {
            try {
                window.FB.init({
                    appId: appId,
                    cookie: true,
                    xfbml: false,
                    version: 'v19.0'
                });
                return resolve();
            } catch (e) {
                return resolve();
            }
        }

        const timeoutId = setTimeout(() => {
            reject("Facebook SDK load timeout (3s). Check AdBlocker or Network.");
        }, 3000);

        window.fbAsyncInit = () => {
            clearTimeout(timeoutId);
            try {
                window.FB.init({
                    appId: appId,
                    cookie: true,
                    xfbml: false,
                    version: 'v19.0'
                });
                resolve();
            } catch (e) {
                reject(e);
            }
        };

        const existingScript = document.querySelector('script[src*="connect.facebook.net"]');
        if (!existingScript) {
            const js = document.createElement('script');
            js.id = 'facebook-jssdk';
            js.src = "https://connect.facebook.net/en_US/sdk.js";
            js.async = true;
            js.defer = true;
            js.crossOrigin = "anonymous";
            js.onerror = () => {
                clearTimeout(timeoutId);
                reject("Failed to load Facebook SDK script.");
            };
            document.body.appendChild(js);
        } else {
            // Resolve if script exists but didn't trigger yet (rare race condition fix)
        }
    });
};

export const checkLoginStatus = (): Promise<string | null> => {
    return new Promise((resolve) => {
        if (!window.FB) return resolve(null);

        // Skip status check on HTTP to prevent "method not supported" error in console
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            return resolve(null);
        }

        const timeoutId = setTimeout(() => resolve(null), 2000);

        try {
            window.FB.getLoginStatus((response: any) => {
                clearTimeout(timeoutId);
                if (response.status === 'connected' && response.authResponse) {
                    resolve(response.authResponse.accessToken);
                } else {
                    resolve(null);
                }
            });
        } catch (e) {
            clearTimeout(timeoutId);
            resolve(null);
        }
    });
};

// Force a roundtrip check to Facebook servers to get a fresh token if possible
export const refreshFacebookToken = (): Promise<string | null> => {
    return new Promise((resolve) => {
        if (!window.FB) return resolve(null);
        try {
            // The 'true' parameter forces a roundtrip to Facebook servers
            window.FB.getLoginStatus((response: any) => {
                if (response.status === 'connected' && response.authResponse) {
                    resolve(response.authResponse.accessToken);
                } else {
                    resolve(null);
                }
            }, true);
        } catch (e) {
            resolve(null);
        }
    });
};

export const loginWithFacebook = (): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!window.FB) return reject("Facebook SDK not loaded. Try refreshing the page.");

        try {
            window.FB.login((response: any) => {
                if (response.authResponse) {
                    resolve(response.authResponse.accessToken);
                } else {
                    if (response.status === 'unknown') {
                        reject("Login cancelled or blocked. Please allow popups for this site.");
                    } else {
                        reject(`Login Failed: ${response.status}`);
                    }
                }
            }, {
                // Explicitly set valid permissions for v19.0+
                scope: 'public_profile,ads_read,ads_management,pages_show_list,pages_read_engagement,pages_manage_engagement,pages_manage_posts,pages_manage_metadata,business_management,whatsapp_business_management'
            });
        } catch (e) {
            reject("Failed to open Facebook Login dialog.");
        }
    });
};

export const getAdAccounts = async (accessToken: string): Promise<MetaAdAccount[]> => {
    const cacheKey = `adaccounts-${getFbId() || accessToken.substring(0, 10)}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        // If we have fbId, use proxy; otherwise direct call (bootstrap in Connect page)
        const fbId = getFbId();
        let accounts: MetaAdAccount[];
        if (fbId) {
            const data = await proxyGet('me/adaccounts', { fields: 'name,account_id,currency' });
            accounts = data.data || [];
        } else {
            const response = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency&access_token=${accessToken}`);
            const data = await response.json();
            handleApiError(data);
            accounts = data.data || [];
        }
        setCachedData(cacheKey, accounts);
        return accounts;
    } catch (error) {
        throw error;
    }
};

// --- REPORT: DAILY SPEND PER ACCOUNT (for Report page) ---

export interface DailySpendRow {
    date: string;        // YYYY-MM-DD
    spend: number;
    purchases: number;
    purchaseValue: number; // Revenue from Meta (action_values)
    accountId: string;
    accountName: string;
}

export const getReportDailySpend = async (
    accountIds: string[],
    accessToken: string,
    datePreset: string | { start: string; end: string } = 'last_7d'
): Promise<DailySpendRow[]> => {
    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const purchaseActionTypes = ['purchase', 'omni_purchase', 'onsite_conversion.purchase', 'offsite_conversion.fb_pixel_purchase'];

    const allRows: DailySpendRow[] = [];

    await Promise.all(accountIds.map(async (rawId) => {
        const accountId = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
        const cacheKey = `report-spend-${accountId}-${date_preset || time_range}`;
        const cached = getCachedData(cacheKey);
        if (cached) { allRows.push(...cached); return; }

        try {
            const params: Record<string, string> = { fields: 'spend,actions,action_values', time_increment: '1', action_breakdowns: 'action_type', limit: '90' };
            if (time_range) params.time_range = time_range;
            else if (date_preset) params.date_preset = date_preset;

            const data = await proxyGet(`${accountId}/insights`, params).catch((e: any) => ({ error: { message: e.message } }));
            if (data.error) { console.warn(`[ReportSpend] ${accountId}:`, data.error.message); return; }

            const rows: DailySpendRow[] = (data.data || []).map((row: any) => {
                let purchases = 0;
                let purchaseValue = 0;

                if (row.actions) {
                    let maxPurchase = 0;
                    for (const a of row.actions) {
                        if (purchaseActionTypes.includes(a.action_type)) {
                            const v = parseInt(a.value || '0', 10);
                            if (v > maxPurchase) maxPurchase = v;
                        }
                    }
                    purchases = maxPurchase;
                }

                if (row.action_values) {
                    let maxValue = 0;
                    for (const a of row.action_values) {
                        if (purchaseActionTypes.includes(a.action_type)) {
                            const v = parseFloat(a.value || '0');
                            if (v > maxValue) maxValue = v;
                        }
                    }
                    purchaseValue = maxValue;
                }

                return {
                    date: row.date_start,
                    spend: parseFloat(row.spend || '0'),
                    purchases,
                    purchaseValue,
                    accountId,
                    accountName: rawId,
                };
            });

            setCachedData(cacheKey, rows);
            allRows.push(...rows);
        } catch (e) {
            console.error(`[ReportSpend] Error for ${accountId}:`, e);
        }
    }));

    return allRows.sort((a, b) => b.date.localeCompare(a.date));
};


// --- WHATSAPP BUSINESS ACCOUNT & PHONE NUMBERS ---

export interface WhatsAppPhoneNumber {
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating?: string;
}

const normalizePhoneNumber = (raw: string): string => {
    return (raw || '').replace(/[^\d+]/g, '').trim();
};

const pushUniquePhone = (list: WhatsAppPhoneNumber[], phone: WhatsAppPhoneNumber) => {
    if (!phone.display_phone_number) return;
    const normalized = normalizePhoneNumber(phone.display_phone_number);
    if (!normalized) return;
    if (list.some((p) => normalizePhoneNumber(p.display_phone_number) === normalized)) return;
    list.push({ ...phone, display_phone_number: normalized });
};

const extractWhatsAppFromText = (text: string): string[] => {
    if (!text) return [];
    const matches: string[] = [];

    // wa.me/60123456789
    const waMe = text.match(/wa\.me\/(\d{8,15})/gi) || [];
    for (const m of waMe) {
        const found = m.match(/wa\.me\/(\d{8,15})/i);
        if (found?.[1]) matches.push(found[1]);
    }

    // api.whatsapp.com/send?phone=60123456789
    const apiWa = text.match(/phone=(\d{8,15})/gi) || [];
    for (const m of apiWa) {
        const found = m.match(/phone=(\d{8,15})/i);
        if (found?.[1]) matches.push(found[1]);
    }

    return matches;
};

const extractPhoneFromText = (text: string): string[] => {
    if (!text) return [];
    const matches = text.match(/(?:\+?\d[\d\s-]{7,}\d)/g) || [];
    return matches.map((m) => normalizePhoneNumber(m)).filter(Boolean);
};

export const getWhatsAppPhoneNumbersForPage = async (
    pageId: string,
    accessToken: string,
    pageAccessToken?: string
): Promise<WhatsAppPhoneNumber[]> => {
    if (!pageId || !accessToken) return [];

    const cacheKey = `whatsapp-phones-page-v2-${pageId}-${accessToken.substring(0, 10)}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        const numbers: WhatsAppPhoneNumber[] = [];

        // Step 1: Read page fields via proxy
        let pageInfoData: any;
        try {
            pageInfoData = await proxyGet(`${pageId}`, { fields: 'id,name,whatsapp_number,phone,about,website' });
        } catch { pageInfoData = { error: true }; }

        if (pageInfoData.error) {
            console.warn('[WhatsApp][Page Info] Graph API error:', pageInfoData.error);
            // Retry via proxy
            let retryData: any;
            try { retryData = await proxyGet(`${pageId}`, { fields: 'id,name,whatsapp_number,phone,about,website' }); } catch { retryData = { error: true }; }
            if (retryData.error) {
                console.warn('[WhatsApp][Page Info Retry] Graph API error:', retryData.error);
            } else {
                if (retryData.whatsapp_number) {
                    pushUniquePhone(numbers, {
                        id: `page-${pageId}`,
                        display_phone_number: retryData.whatsapp_number,
                        verified_name: retryData.name || 'WhatsApp Number'
                    });
                }
                if (retryData.phone) {
                    pushUniquePhone(numbers, {
                        id: `page-phone-${pageId}`,
                        display_phone_number: retryData.phone,
                        verified_name: retryData.name || 'Page Phone'
                    });
                }
                const textBlob = [retryData.about, retryData.website].filter(Boolean).join(' ');
                for (const parsed of [...extractWhatsAppFromText(textBlob), ...extractPhoneFromText(textBlob)]) {
                    pushUniquePhone(numbers, {
                        id: `page-text-${pageId}-${parsed}`,
                        display_phone_number: parsed,
                        verified_name: retryData.name || 'WhatsApp Number'
                    });
                }
            }
        } else {
            if (pageInfoData.whatsapp_number) {
                pushUniquePhone(numbers, {
                    id: `page-${pageId}`,
                    display_phone_number: pageInfoData.whatsapp_number,
                    verified_name: pageInfoData.name || 'WhatsApp Number'
                });
            }
            if (pageInfoData.phone) {
                pushUniquePhone(numbers, {
                    id: `page-phone-${pageId}`,
                    display_phone_number: pageInfoData.phone,
                    verified_name: pageInfoData.name || 'Page Phone'
                });
            }
            const textBlob = [pageInfoData.about, pageInfoData.website].filter(Boolean).join(' ');
            for (const parsed of [...extractWhatsAppFromText(textBlob), ...extractPhoneFromText(textBlob)]) {
                pushUniquePhone(numbers, {
                    id: `page-text-${pageId}-${parsed}`,
                    display_phone_number: parsed,
                    verified_name: pageInfoData.name || 'WhatsApp Number'
                });
            }
        }

        setCachedData(cacheKey, numbers);
        return numbers;
    } catch (error) {
        console.error('Error fetching WhatsApp phone numbers for page:', pageId, error);
        setCachedData(cacheKey, []);
        return [];
    }
};

export const getWhatsAppPhoneNumbers = async (accessToken: string): Promise<WhatsAppPhoneNumber[]> => {
    const cacheKey = `whatsapp-phones-${accessToken.substring(0, 10)}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        // Step 1: Get businesses via proxy
        let businessesData: any;
        try { businessesData = await proxyGet('me/businesses'); } catch { businessesData = { error: true }; }

        if (businessesData.error) {
            console.log('No businesses found or no permission:', businessesData.error);
            return [];
        }

        const businesses = businessesData.data || [];
        if (businesses.length === 0) return [];

        const allPhoneNumbers: WhatsAppPhoneNumber[] = [];

        // Step 2: For each business, get WhatsApp Business Accounts
        for (const business of businesses) {
            try {
                const wabaData = await proxyGet(`${business.id}/owned_whatsapp_business_accounts`);

                if (wabaData.error || !wabaData.data) continue;

                // Step 3: For each WABA, get phone numbers
                for (const waba of wabaData.data) {
                    try {
                        const phonesData = await proxyGet(`${waba.id}/phone_numbers`, { fields: 'display_phone_number,verified_name,quality_rating' });

                        if (phonesData.error || !phonesData.data) continue;

                        for (const phone of phonesData.data) {
                            allPhoneNumbers.push({
                                id: phone.id,
                                display_phone_number: phone.display_phone_number,
                                verified_name: phone.verified_name || waba.name || 'WhatsApp Number',
                                quality_rating: phone.quality_rating
                            });
                        }
                    } catch (e) {
                        console.log('Error fetching phones for WABA:', waba.id, e);
                    }
                }
            } catch (e) {
                console.log('Error fetching WABA for business:', business.id, e);
            }
        }

        setCachedData(cacheKey, allPhoneNumbers);
        return allPhoneNumbers;
    } catch (error) {
        console.error('Error fetching WhatsApp phone numbers:', error);
        return [];
    }
};

// --- DATA FETCHING ---

const mapInsightsToMetrics = (data: any) => {
    const insights = data.insights?.data?.[0] || {};

    // DEBUG: Log all action types to see what Meta returns
    if (insights.actions && insights.actions.length > 0) {
        const actionTypes = insights.actions.map((a: any) => `${a.action_type}:${a.value}`).join(', ');
        console.log(`[Meta Actions] ${data.name || data.id}: ${actionTypes}`);
    }

    // Purchase Metrics - Find MAX value among purchase types to capture the superset
    // We check ALL purchase-related action types and take the highest value.
    // This avoids double counting (summing) and under-counting (priority logic).
    const purchaseActionTypes = [
        'purchase',
        'omni_purchase',
        'onsite_conversion.purchase',
        'offsite_conversion.fb_pixel_purchase'
    ];

    let maxPurchaseCount = 0;

    // Check actions for count
    if (insights.actions) {
        for (const action of insights.actions) {
            if (purchaseActionTypes.includes(action.action_type)) {
                const val = parseInt(action.value || '0');
                if (val > maxPurchaseCount) maxPurchaseCount = val;
            }
        }
    }

    // Check action_values for value (revenue)
    // We try to match revenue to the max count, but taking max revenue directly is safer 
    // to ensure we capture all attributable value.
    let maxPurchaseValue = 0;
    if (insights.action_values) {
        for (const action of insights.action_values) {
            if (purchaseActionTypes.includes(action.action_type)) {
                const val = parseFloat(action.value || '0');
                if (val > maxPurchaseValue) maxPurchaseValue = val;
            }
        }
    }

    const landingPageViews = insights.actions?.find((a: any) => a.action_type === 'landing_page_view')?.value || 0;
    const spend = parseFloat(insights.spend || '0');
    const revenue = maxPurchaseValue;

    // New Metrics for Whatsapp/Leads/Engagement
    const leads = insights.actions?.find((a: any) => a.action_type === 'lead')?.value || 0;
    const messagingStarted = insights.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0;
    const messagingInitiated = insights.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_initiated')?.value || 0;
    const linkClicks = insights.actions?.find((a: any) => a.action_type === 'link_click')?.value || 0;

    // Engagement Metrics (Added for robustness)
    const postEngagement = insights.actions?.find((a: any) => a.action_type === 'post_engagement')?.value || 0;
    const videoViews = insights.actions?.find((a: any) => a.action_type === 'video_view')?.value || 0;
    const thruPlay = insights.actions?.find((a: any) => a.action_type === 'video_thruplay_watched_actions')?.value || 0;

    // Heuristic for "Results" based on common objectives hierarchy
    // 1. Leads / Messages
    let results = parseInt(leads) + parseInt(messagingStarted) + parseInt(messagingInitiated);

    // 2. Link Clicks (if no leads)
    if (results === 0) results = parseInt(linkClicks);

    // 3. Engagement (if no clicks)
    if (results === 0) results = parseInt(postEngagement) + parseInt(videoViews) + parseInt(thruPlay);

    const finalResults = results;

    return {
        spend: spend,
        revenue: revenue,
        roas: spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0,
        impressions: parseInt(insights.impressions || '0'),
        clicks: parseInt(insights.clicks || '0'),
        ctr: parseFloat(insights.ctr || '0'),
        inline_link_click_ctr: parseFloat(insights.inline_link_click_ctr || '0'),
        cpc: parseFloat(insights.cpc || '0'),
        frequency: parseFloat(insights.frequency || '0'),
        landingPageViews: parseInt(landingPageViews),
        costPerLandingPageView: landingPageViews > 0 ? parseFloat((spend / landingPageViews).toFixed(2)) : 0,
        purchases: maxPurchaseCount,
        costPerPurchase: maxPurchaseCount > 0 ? parseFloat((spend / maxPurchaseCount).toFixed(2)) : 0,
        results: finalResults,
        costPerResult: finalResults > 0 ? parseFloat((spend / finalResults).toFixed(2)) : 0,
        totalLeads: parseInt(leads) + parseInt(messagingStarted) + parseInt(messagingInitiated)
    };
};

export const getRealCampaigns = async (adAccountId: string, accessToken: string, datePreset: string | { start: string, end: string } = 'today'): Promise<AdCampaign[]> => {
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    // Create cache key that supports object param
    const rangeKey = typeof datePreset === 'string' ? datePreset : `${datePreset.start}_${datePreset.end}`;
    const cacheKey = `campaigns-${accountId}-${rangeKey}`;

    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const insightsQuery = time_range
        ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,frequency,inline_link_click_ctr,actions,action_values}`
        : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,frequency,inline_link_click_ctr,actions,action_values}`;

    const fields = ['id', 'name', 'status', 'objective', 'daily_budget', 'effective_status', insightsQuery].join(',');
    // Include all relevant statuses so campaigns with spend data show up regardless of current status
    const filtering = `[{field:"effective_status",operator:"IN",value:["ACTIVE","PAUSED","IN_PROCESS","WITH_ISSUES","CAMPAIGN_PAUSED"]}]`;

    try {
        const data = await proxyGet(`${accountId}/campaigns`, { fields, limit: '200', filtering });
        handleApiError(data);

        const result = data.data.map((camp: any) => ({
            id: camp.id,
            name: camp.name,
            status: camp.effective_status || camp.status,
            objective: camp.objective,
            dailyBudget: parseInt(camp.daily_budget || '0') / 100,
            metrics: mapInsightsToMetrics(camp),
            history: []
        }));

        setCachedData(cacheKey, result);
        return result;
    } catch (error) {
        throw error;
    }
};

export const getAdSets = async (campaignId: string, accessToken: string, datePreset: string | { start: string, end: string } = 'today'): Promise<AdSet[]> => {
    const rangeKey = typeof datePreset === 'string' ? datePreset : `${datePreset.start}_${datePreset.end}`;
    const cacheKey = `adsets-${campaignId}-${rangeKey}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const insightsQuery = time_range
        ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,frequency,inline_link_click_ctr,actions,action_values}`
        : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,frequency,inline_link_click_ctr,actions,action_values}`;

    const fields = ['id', 'name', 'status', 'daily_budget', 'effective_status', 'campaign_id', insightsQuery].join(',');
    // Include all relevant statuses — same approach as campaigns, so no active adset is hidden by Meta's default filter
    const adsetFiltering = encodeURIComponent(JSON.stringify([{field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED']}]));

    try {
        // Fetch more adsets — filtering ensures ALL adsets with spend show up, not just Meta's default subset
        const data = await proxyGet(`${campaignId}/adsets`, { fields, limit: '200', filtering: adsetFiltering });
        handleApiError(data);
        const result = data.data.map((adset: any) => ({
            id: adset.id,
            name: adset.name,
            status: adset.effective_status || adset.status,
            dailyBudget: parseInt(adset.daily_budget || '0') / 100,
            campaign_id: adset.campaign_id,
            metrics: mapInsightsToMetrics(adset)
        }));
        setCachedData(cacheKey, result);
        return result;
    } catch (error) { throw error; }
};

export const getAds = async (adSetId: string, accessToken: string, datePreset: string | { start: string, end: string } = 'today'): Promise<Ad[]> => {
    const rangeKey = typeof datePreset === 'string' ? datePreset : `${datePreset.start}_${datePreset.end}`;
    const cacheKey = `ads-${adSetId}-${rangeKey}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const insightsQuery = time_range
        ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,frequency,inline_link_click_ctr,actions,action_values}`
        : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,frequency,inline_link_click_ctr,actions,action_values}`;

    const fields = ['id', 'name', 'status', 'effective_status', 'adset_id', 'creative{thumbnail_url,image_url,effective_object_story_id}', insightsQuery].join(',');
    // Include all relevant statuses so ads with spend are never hidden
    const adFiltering = encodeURIComponent(JSON.stringify([{field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED', 'PENDING_REVIEW', 'DISAPPROVED']}]));

    try {
        // Filtering ensures ALL ads show up including those in review or with issues
        const data = await proxyGet(`${adSetId}/ads`, { fields, limit: '200', filtering: adFiltering });
        handleApiError(data);
        const result = data.data.map((ad: any) => ({
            id: ad.id,
            name: ad.name,
            status: ad.effective_status || ad.status,
            adset_id: ad.adset_id,
            creative: ad.creative || {},
            metrics: mapInsightsToMetrics(ad)
        }));

        // SORT BY PURCHASES DESCENDING
        result.sort((a: Ad, b: Ad) => b.metrics.purchases - a.metrics.purchases);

        setCachedData(cacheKey, result);
        return result;
    } catch (error) { throw error; }
};

// --- DAILY BREAKDOWN METRICS (L1-L4) ---
// L1 = yesterday, L2 = 2 days ago, L3 = 3 days ago, L4 = 4 days ago

export interface DailyMetrics {
    roas: number;
    spend: number;
    revenue: number;
    costPerResult: number; // CPL for leads
    totalLeads: number;
    purchases: number;
}

export type EntityDailyBreakdown = {
    L1: DailyMetrics;
    L2: DailyMetrics;
    L3: DailyMetrics;
    L4: DailyMetrics;
};

const mapRawDailyInsights = (row: any): DailyMetrics => {
    const purchaseActionTypes = [
        'purchase', 'omni_purchase',
        'onsite_conversion.purchase',
        'offsite_conversion.fb_pixel_purchase'
    ];
    let maxPurchaseCount = 0;
    let maxPurchaseValue = 0;
    if (row.actions) {
        for (const action of row.actions) {
            if (purchaseActionTypes.includes(action.action_type)) {
                const val = parseInt(action.value || '0');
                if (val > maxPurchaseCount) maxPurchaseCount = val;
            }
        }
    }
    if (row.action_values) {
        for (const action of row.action_values) {
            if (purchaseActionTypes.includes(action.action_type)) {
                const val = parseFloat(action.value || '0');
                if (val > maxPurchaseValue) maxPurchaseValue = val;
            }
        }
    }
    const leads = parseInt(row.actions?.find((a: any) => a.action_type === 'lead')?.value || '0');
    const msgStarted = parseInt(row.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || '0');
    const msgInitiated = parseInt(row.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_initiated')?.value || '0');
    const totalLeads = leads + msgStarted + msgInitiated;
    const spend = parseFloat(row.spend || '0');
    const revenue = maxPurchaseValue;
    return {
        roas: spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0,
        spend,
        revenue,
        costPerResult: totalLeads > 0 ? parseFloat((spend / totalLeads).toFixed(2)) : 0,
        totalLeads,
        purchases: maxPurchaseCount,
    };
};

const emptyDailyMetrics = (): DailyMetrics => ({
    roas: 0, spend: 0, revenue: 0, costPerResult: 0, totalLeads: 0, purchases: 0,
});

export const getDailyBreakdownMetrics = async (
    entityIds: string[],
    accessToken: string
): Promise<Record<string, EntityDailyBreakdown>> => {
    if (!entityIds.length) return {};

    const fmt = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const today = new Date();
    const until = new Date(today); until.setDate(today.getDate() - 1);
    const since = new Date(today); since.setDate(today.getDate() - 4);

    // Map each date to its slot label (L1=yesterday, L4=4 days ago)
    const dateToSlot: Record<string, 'L1' | 'L2' | 'L3' | 'L4'> = {};
    for (let i = 1; i <= 4; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dateToSlot[fmt(d)] = `L${i}` as 'L1' | 'L2' | 'L3' | 'L4';
    }

    const timeRange = `{"since":"${fmt(since)}","until":"${fmt(until)}"}`;
    const insightsFields = `spend,actions,action_values`;
    const BATCH_SIZE = 10;
    const result: Record<string, EntityDailyBreakdown> = {};

    for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
        const chunk = entityIds.slice(i, i + BATCH_SIZE);
        const batch = chunk.map(id => ({
            method: 'GET',
            relative_url: `${id}/insights?fields=${insightsFields}&time_range=${encodeURIComponent(timeRange)}&time_increment=1&limit=10`
        }));

        try {
            const batchResult = await proxyBatch(batch);
            if (!Array.isArray(batchResult)) continue;

            batchResult.forEach((item: any, idx: number) => {
                const entityId = chunk[idx];
                const breakdown: EntityDailyBreakdown = {
                    L1: emptyDailyMetrics(), L2: emptyDailyMetrics(),
                    L3: emptyDailyMetrics(), L4: emptyDailyMetrics(),
                };
                if (item && item.code === 200) {
                    try {
                        const body = JSON.parse(item.body);
                        (body.data || []).forEach((row: any) => {
                            const slot = dateToSlot[row.date_start];
                            if (slot) breakdown[slot] = mapRawDailyInsights(row);
                        });
                    } catch { /* silent fail */ }
                }
                result[entityId] = breakdown;
            });
        } catch (e) {
            console.error('[getDailyBreakdown] Batch error:', e);
        }
    }

    return result;
};

// --- HOURLY PURCHASE BREAKDOWN (for Heatmap) ---
// Returns an array of 24 numbers: index 0 = 12am, index 23 = 11pm
// Uses Meta's hourly_stats_aggregated_by_advertiser_time_zone breakdown

export interface HourlyPurchaseData {
    purchases: number[]; // length 24
    maxPurchases: number;
    totalPurchases: number;
}

export const getHourlyPurchaseData = async (
    adAccountId: string,
    accessToken: string,
    datePreset: string | { start: string; end: string } = 'today'
): Promise<HourlyPurchaseData> => {
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const rangeKey = typeof datePreset === 'string' ? datePreset : `${datePreset.start}_${datePreset.end}`;
    const cacheKey = `hourly-purchases-${accountId}-${rangeKey}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);

    const purchaseTypes = [
        'purchase',
        'omni_purchase',
        'onsite_conversion.purchase',
        'offsite_conversion.fb_pixel_purchase',
    ];

    // Initialize 24-slot array
    const purchases = new Array(24).fill(0);

    try {
        const params: Record<string, string> = { fields: 'actions,action_values', breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', action_breakdowns: 'action_type', limit: '100' };
        if (time_range) params.time_range = time_range;
        else if (date_preset) params.date_preset = date_preset;

        const data = await proxyGet(`${accountId}/insights`, params).catch(() => ({ error: { message: 'Proxy error' } }));

        if (data.error) {
            console.warn('[HourlyPurchase] API error:', data.error.message);
            // Return empty data gracefully — don't throw, heatmap just stays grey
            const empty: HourlyPurchaseData = { purchases, maxPurchases: 0, totalPurchases: 0 };
            return empty;
        }

        (data.data || []).forEach((row: any) => {
            // hourly_stats_aggregated_by_advertiser_time_zone returns e.g. "00:00:00 - 01:00:00"
            const hourStr = (row.hourly_stats_aggregated_by_advertiser_time_zone || '').slice(0, 2);
            const hour = parseInt(hourStr, 10);
            if (isNaN(hour) || hour < 0 || hour > 23) return;

            let maxVal = 0;
            if (row.actions) {
                for (const action of row.actions) {
                    if (purchaseTypes.includes(action.action_type)) {
                        const val = parseInt(action.value || '0');
                        if (val > maxVal) maxVal = val;
                    }
                }
            }
            purchases[hour] += maxVal;
        });

        const maxPurchases = Math.max(...purchases);
        const totalPurchases = purchases.reduce((a, b) => a + b, 0);
        const result: HourlyPurchaseData = { purchases, maxPurchases, totalPurchases };
        setCachedData(cacheKey, result);
        return result;
    } catch (error) {
        console.error('[HourlyPurchase] Fetch error:', error);
        return { purchases, maxPurchases: 0, totalPurchases: 0 };
    }
};

export const getTopAdsForAccount = async (adAccountId: string, accessToken: string): Promise<Ad[]> => {
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const cacheKey = `top-ads-${accountId}-last_7d`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;
    // For AI analysis, usually 7 days is a good default
    const { time_range } = getDateRangeParams('last_7d');
    const insightsQuery = `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,frequency,actions,action_values}`;
    const fields = ['id', 'name', 'status', 'effective_status', 'adset_id', 'creative{thumbnail_url,image_url}', insightsQuery].join(',');
    const filtering = `[{field:"effective_status",operator:"IN",value:["ACTIVE"]}]`;
    try {
        const data = await proxyGet(`${accountId}/ads`, { fields, limit: '100', filtering });
        handleApiError(data);
        let ads: Ad[] = (data.data || []).map((ad: any) => ({
            id: ad.id,
            name: ad.name,
            status: ad.effective_status || ad.status,
            adset_id: ad.adset_id,
            creative: ad.creative || {},
            metrics: mapInsightsToMetrics(ad)
        }));
        ads = ads.filter(a => a.metrics.spend > 0);
        ads.sort((a, b) => b.metrics.roas - a.metrics.roas);
        const top3 = ads.slice(0, 3);
        setCachedData(cacheKey, top3);
        return top3;
    } catch (error) { return []; }
};

// --- CREATION UTILS ---

export const getPages = async (accessToken: string) => {
    const fbId = getFbId();
    if (fbId) {
        const data = await proxyGet('me/accounts', { fields: 'name,id,access_token', limit: '100' });
        return data.data || [];
    }
    // Fallback for bootstrap (Connect page)
    const response = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=name,id,access_token&access_token=${accessToken}&limit=100`);
    const data = await response.json();
    handleApiError(data);
    return data.data || [];
};

export const getPixels = async (adAccountId: string, accessToken: string) => {
    const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const data = await proxyGet(`${actId}/adspixels`, { fields: 'name,id' });
    return data.data || [];
};

// --- CAMPAIGN CREATION ---

const tryCreateCampaign = async (graphPath: string, body: any) => {
    const { access_token, ...params } = body;
    const data = await proxyPost(graphPath, params);
    return data;
};

export const createMetaCampaign = async (accountId: string, name: string, objective: string, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const graphPath = `${actId}/campaigns`;

    const cleanName = sanitizeInput(name);

    try {
        const body1 = {
            name: cleanName,
            objective,
            status: 'ACTIVE',
            special_ad_categories: [],
            buying_type: "AUCTION",
            is_adset_budget_sharing_enabled: false,
        };
        const data = await tryCreateCampaign(graphPath, body1);
        invalidateCache();
        return data;
    } catch (error: any) {
        if (error.message === "BUDGET_SHARING_ERROR" || error.message.includes("is_adset_budget_sharing_enabled")) {
            console.warn("Retrying Campaign Creation with alternative parameters...");
            const body2 = {
                name: cleanName,
                objective,
                status: 'ACTIVE',
                special_ad_categories: [],
                buying_type: "AUCTION",
                advantage_plus_create: { enabled: false },
            };
            const data = await tryCreateCampaign(graphPath, body2);
            invalidateCache();
            return data;
        }
        throw error;
    }
};

export const createMetaAdSet = async (
    accountId: string,
    campaignId: string,
    name: string,
    dailyBudget: number,
    optimizationGoal: string,
    pixelId: string | null,
    accessToken: string,
    pageId?: string,
    whatsappNumber?: string,
    startTime?: string
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

    const targeting = {
        geo_locations: { countries: ['MY'] },
        age_min: 18,
        age_max: 65,
        publisher_platforms: ['facebook', 'instagram'],
        device_platforms: ['mobile', 'desktop']
    };

    // Use provided startTime or default to 1 hour from now
    const finalStartTime = startTime || new Date(Date.now() + 60 * 60 * 1000).toISOString().split('.')[0];

    const body: any = {
        name: sanitizeInput(name),
        campaign_id: campaignId,
        daily_budget: Math.floor(dailyBudget * 100),
        targeting: targeting,
        status: 'ACTIVE',
        start_time: finalStartTime,
        optimization_goal: optimizationGoal,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        billing_event: 'IMPRESSIONS'
    };

    if (optimizationGoal === 'OFFSITE_CONVERSIONS') {
        if (!pixelId) throw new Error("A Pixel is required for Conversion campaigns.");
        body.destination_type = "WEBSITE";
        body.promoted_object = {
            pixel_id: pixelId,
            custom_event_type: "PURCHASE"
        };
        body.billing_event = 'IMPRESSIONS';
    } else if (optimizationGoal === 'CONVERSATIONS' && pageId) {
        if (whatsappNumber) {
            body.destination_type = "WHATSAPP";
        }
        body.promoted_object = { page_id: pageId };
        body.billing_event = 'IMPRESSIONS';
    }

    const data = await proxyPost(`${actId}/adsets`, body);
    invalidateCache();
    return data;
};

// --- ASSET UPLOAD (IMAGE & VIDEO) ---

export const uploadAdImage = async (accountId: string, file: File, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    // Convert file to base64 for proxy upload
    const buffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const data = await proxyPostForm(`${actId}/adimages`, {
        fileBase64: base64,
        filename: file.name || 'image.jpg',
        mimeType: file.type || 'image/jpeg',
        fileField: 'filename'
    });
    const images = data.images || {};
    const firstKey = Object.keys(images)[0];
    if (firstKey && images[firstKey].hash) { return images[firstKey].hash; }
    throw new Error("Image upload failed: No hash returned");
};

// Upload image from Blob (for video thumbnails)
export const uploadAdImageBlob = async (accountId: string, blob: Blob, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const data = await proxyPostForm(`${actId}/adimages`, {
        fileBase64: base64,
        filename: 'thumbnail.jpg',
        mimeType: 'image/jpeg',
        fileField: 'filename'
    });
    const images = data.images || {};
    const firstKey = Object.keys(images)[0];
    if (firstKey && images[firstKey].hash) { return images[firstKey].hash; }
    throw new Error("Thumbnail upload failed: No hash returned");
};

// Extract thumbnail from video file at 1 second mark
export const extractVideoThumbnail = (videoFile: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const url = URL.createObjectURL(videoFile);
        video.src = url;

        video.onloadeddata = () => {
            // Seek to 1 second or 10% of video duration, whichever is smaller
            video.currentTime = Math.min(1, video.duration * 0.1);
        };

        video.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Canvas context failed");
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("Failed to generate thumbnail blob"));
                    }
                }, 'image/jpeg', 0.85);
            } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
            }
        };

        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load video for thumbnail extraction"));
        };
    });
};

// --- CHUNKED VIDEO UPLOAD (RESUMABLE) ---
// DEBUG: Using strict steps from user request
export const uploadAdVideo = async (
    accountId: string,
    file: File,
    accessToken: string,
    onProgress?: (percent: number) => void
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const graphPath = `${actId}/advideos`;

    console.debug(`[Upload] Starting upload for ${file.name} (${file.size} bytes)`);

    // 1. START SESSION
    const startData = await proxyPostForm(graphPath, {
        upload_phase: 'start',
        file_size: file.size.toString()
    }, { isVideoUpload: true });

    const { upload_session_id, video_id } = startData;
    let { start_offset, end_offset } = startData;

    // 2. TRANSFER CHUNKS
    while (parseInt(start_offset) < parseInt(end_offset)) {
        const chunk = file.slice(parseInt(start_offset), parseInt(end_offset));

        console.debug(`[Upload] Transfer: start=${start_offset}, end=${end_offset}, chunk_size=${chunk.size}`);

        // Convert chunk to base64 for proxy
        const chunkBuffer = await chunk.arrayBuffer();
        const chunkBase64 = btoa(String.fromCharCode(...new Uint8Array(chunkBuffer)));

        let retries = 3;
        let transData = null;

        while (retries > 0) {
            try {
                transData = await proxyPostForm(graphPath, {
                    upload_phase: 'transfer',
                    upload_session_id,
                    start_offset,
                    fileBase64: chunkBase64,
                    filename: 'video.mp4',
                    mimeType: 'video/mp4',
                    fileField: 'video_file_chunk'
                }, { isVideoUpload: true });
                break; // Success
            } catch (e) {
                retries--;
                console.warn(`[Upload] Chunk failed. Retries left: ${retries}`, e);
                if (retries === 0) throw new Error("Video chunk upload failed after 3 attempts.");
                await new Promise(r => setTimeout(r, 2000)); // Wait before retry
            }
        }

        if (onProgress) {
            const percent = Math.round((parseInt(start_offset) / file.size) * 100);
            onProgress(percent);
        }

        // Prepare next loop from response
        start_offset = transData.start_offset;
        end_offset = transData.end_offset;

        if (start_offset === end_offset) break; // Finished
    }

    console.debug(`[Upload] Finishing session ${upload_session_id}`);

    let finishRetries = 3;
    let finishData: any = null;
    while (finishRetries > 0) {
        try {
            finishData = await proxyPostForm(graphPath, {
                upload_phase: 'finish',
                upload_session_id
            }, { isVideoUpload: true });
            break;
        } catch (e) {
            finishRetries--;
            if (finishRetries === 0) throw new Error("Video upload finish phase failed.");
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    if (onProgress) onProgress(100);

    if (video_id) return video_id;
    if (finishData.id) return finishData.id;

    throw new Error("Video upload finished but no ID returned");
};


export const waitForVideoReady = async (
    videoId: string,
    accessToken: string,
    onProgressUpdate?: (status: string) => void,
    retries = 120
): Promise<boolean> => {

    for (let i = 0; i < retries; i++) {
        try {
            // Use proxy for video status polling
            const data = await proxyGet(videoId, { fields: 'status' });

            if (data.error) {
                console.error("Video Polling API Error:", data.error);
                if (data.error.code === 190) throw new Error("Session expired during video processing.");
                // Retry other errors, but fail fast if critical
                if (data.error.code === 100) throw new Error(data.error.message); // Invalid Parameter
            }

            const statusObj = data.status || {};
            const status = statusObj.video_status;
            // processing_progress is often nested in status, or simply unavailable.
            const progress = statusObj.processing_progress || 0;

            // STEP: Debug Log Status
            console.debug(`[Video Poll] Status: ${status}, Progress: ${progress}%`);

            // Update UI with granular status if callback provided
            if (onProgressUpdate) {
                if (status === 'PROCESSING') {
                    onProgressUpdate(`Processing Video: ${progress}%...`);
                } else if (status === 'READY') {
                    onProgressUpdate('Video Ready.');
                } else {
                    onProgressUpdate(`Video Status: ${status}...`);
                }
            }

            // STEP: Only proceed if READY
            if (status === 'READY') {
                return true;
            }

            // STEP: Fail Fast on Error
            if (status === 'ERROR') {
                throw new Error(`Meta Video Processing Failed. Status: ERROR.`);
            }

        } catch (e: any) {
            console.warn("Polling exception", e);
            if (e.message && (e.message.includes("Session expired") || e.message.includes("Processing Failed"))) throw e;
        }
        await new Promise(r => setTimeout(r, 3000)); // Wait 3s
    }
    return false;
};


export const createMetaCreative = async (
    accountId: string,
    name: string,
    pageId: string,
    assetId: string, // hash for image, id for video
    message: string,
    headline: string,
    link: string,
    accessToken: string,
    mediaType: 'image' | 'video' = 'image',
    callToAction: string = 'LEARN_MORE',
    description: string = '',
    advantagePlusConfig?: AdvantagePlusConfig,
    thumbnailHash?: string // For video ads - required thumbnail image hash
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

    const body: any = {
        name: sanitizeInput(name) + " Creative",
        published: false,
    };

    // --- ADVANTAGE+ / CREATIVE FEATURES LOGIC ---
    // As of API v22.0, standard_enhancements bundle is DEPRECATED.
    // Must set individual features for both image and video ads.
    if (advantagePlusConfig && !advantagePlusConfig.enabled) {
        body.degrees_of_freedom_spec = {
            creative_features_spec: {
                image_touchups: { enroll_status: 'OPT_OUT' },
                image_templates: { enroll_status: 'OPT_OUT' },
                video_auto_crop: { enroll_status: 'OPT_OUT' },
                enhance_cta: { enroll_status: 'OPT_OUT' },
                video_filtering: { enroll_status: 'OPT_OUT' },
                text_optimizations: { enroll_status: 'OPT_OUT' },
                inline_comment: { enroll_status: 'OPT_OUT' }
            }
        };
    }

    if (mediaType === 'image') {
        body.object_story_spec = {
            page_id: pageId,
            link_data: {
                message: sanitizeInput(message),
                link: link,
                image_hash: assetId,
                name: sanitizeInput(headline),
                description: sanitizeInput(description),
                call_to_action: { type: callToAction }
            }
        };
    } else {
        body.object_story_spec = {
            page_id: pageId,
            video_data: {
                video_id: assetId,
                message: sanitizeInput(message),
                title: sanitizeInput(headline),
                link_description: sanitizeInput(description),
                call_to_action: { type: callToAction, value: { link: link } },
                image_hash: thumbnailHash
            }
        };
    }

    const data = await proxyPost(`${actId}/adcreatives`, body);
    return data.id;
};

export const createMetaAd = async (accountId: string, adSetId: string, name: string, creativeId: string, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

    const body = {
        name: sanitizeInput(name),
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: 'ACTIVE',
    };
    const data = await proxyPost(`${actId}/ads`, body);
    invalidateCache();
    return data;
};

export const updateEntityStatus = async (id: string, status: 'ACTIVE' | 'PAUSED', accessToken: string) => {
    const data = await proxyPost(id, { status });
    if (data.success) { invalidateCache(); return true; }
    return false;
};

export const updateEntityBudget = async (id: string, dailyBudget: number, accessToken: string) => {
    const amountInCents = Math.floor(dailyBudget * 100);
    const data = await proxyPost(id, { daily_budget: amountInCents });
    if (data.success) { invalidateCache(); return true; }
    return false;
};

const getPageAccessToken = async (pageId: string, userAccessToken: string) => {
    try {
        const data = await proxyGet(pageId, { fields: 'access_token' });
        if (data.error) throw new Error(data.error.message);
        return data.access_token;
    } catch (e) {
        console.error("Failed to fetch Page Access Token", e);
        throw new Error("Could not retrieve permissions to comment as Page. Please reconnect your account.");
    }
};

export const publishComment = async (
    effectiveObjectStoryId: string,
    message: string,
    imageBase64: string | undefined,
    userAccessToken: string
) => {
    const parts = effectiveObjectStoryId.split('_');
    if (parts.length < 2) throw new Error("Invalid Post ID format. Cannot identify Page.");

    const pageId = parts[0];
    const pageAccessToken = await getPageAccessToken(pageId, userAccessToken);
    if (!pageAccessToken) throw new Error("Failed to authenticate as Page.");

    if (imageBase64) {
        try {
            // Extract raw base64 data
            const rawBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
            const data = await proxyPostForm(`${effectiveObjectStoryId}/comments`, {
                message,
                fileBase64: rawBase64,
                filename: 'comment_image.png',
                mimeType: 'image/png',
                fileField: 'source'
            });
            if (data.error && data.error.code === 200) {
                throw new Error("Permission Error: Your App needs 'pages_manage_engagement' to post comments.");
            }
            return data.id;
        } catch (e: any) {
            console.error("Image comment failed", e);
            throw new Error(e.message || "Failed to process image for comment.");
        }
    } else {
        const data = await proxyPost(`${effectiveObjectStoryId}/comments`, { message });
        if (data.error && data.error.code === 200) {
            throw new Error("Permission Error: Your App needs 'pages_manage_engagement' to post comments.");
        }
        return data.id;
    }
};
