
import { AdCampaign, MetaAdAccount, AdSet, Ad, AdvantagePlusConfig } from '../types';

declare global {
    interface Window {
        FB: any;
        fbAsyncInit: () => void;
    }
}

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
                scope: 'public_profile,ads_read,ads_management,pages_show_list,pages_read_engagement,pages_manage_engagement,pages_manage_posts,pages_manage_metadata,business_management'
            });
        } catch (e) {
            reject("Failed to open Facebook Login dialog.");
        }
    });
};

export const getAdAccounts = async (accessToken: string): Promise<MetaAdAccount[]> => {
    const cacheKey = `adaccounts-${accessToken.substring(0, 10)}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency&access_token=${accessToken}`);
        const data = await response.json();
        handleApiError(data);
        const accounts = data.data || [];
        setCachedData(cacheKey, accounts);
        return accounts;
    } catch (error) {
        throw error;
    }
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
        const tokenForPageRead = pageAccessToken || accessToken;

        // Step 1: Read page fields without requesting unsupported fields
        const pageInfoRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=id,name,whatsapp_number,phone,about,website&access_token=${tokenForPageRead}`);
        const pageInfoData = await pageInfoRes.json();

        if (pageInfoData.error) {
            console.warn('[WhatsApp][Page Info] Graph API error:', pageInfoData.error);
            // Retry with user token as fallback if page token fails
            const retryRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=id,name,whatsapp_number,phone,about,website&access_token=${accessToken}`);
            const retryData = await retryRes.json();
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
        // Step 1: Get businesses the user has access to
        const businessesRes = await fetch(`https://graph.facebook.com/v19.0/me/businesses?access_token=${accessToken}`);
        const businessesData = await businessesRes.json();

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
                const wabaRes = await fetch(`https://graph.facebook.com/v19.0/${business.id}/owned_whatsapp_business_accounts?access_token=${accessToken}`);
                const wabaData = await wabaRes.json();

                if (wabaData.error || !wabaData.data) continue;

                // Step 3: For each WABA, get phone numbers
                for (const waba of wabaData.data) {
                    try {
                        const phonesRes = await fetch(`https://graph.facebook.com/v19.0/${waba.id}/phone_numbers?fields=display_phone_number,verified_name,quality_rating&access_token=${accessToken}`);
                        const phonesData = await phonesRes.json();

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
        const url = `https://graph.facebook.com/v19.0/${accountId}/campaigns?fields=${fields}&access_token=${accessToken}&limit=200&filtering=${filtering}`;
        const response = await fetch(url);
        const data = await response.json();
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

    try {
        // Fetch more adsets
        const url = `https://graph.facebook.com/v19.0/${campaignId}/adsets?fields=${fields}&access_token=${accessToken}&limit=100`;
        const response = await fetch(url);
        const data = await response.json();
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

    try {
        // Increased limit to 200 to capture more ads
        const url = `https://graph.facebook.com/v19.0/${adSetId}/ads?fields=${fields}&access_token=${accessToken}&limit=200`;
        const response = await fetch(url);
        const data = await response.json();
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
        const url = `https://graph.facebook.com/v19.0/${accountId}/ads?fields=${fields}&access_token=${accessToken}&limit=100&filtering=${filtering}`;
        const response = await fetch(url);
        const data = await response.json();
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
    const response = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=name,id,access_token&access_token=${accessToken}&limit=100`);
    const data = await response.json();
    handleApiError(data);
    return data.data || [];
};

export const getPixels = async (adAccountId: string, accessToken: string) => {
    const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const response = await fetch(`https://graph.facebook.com/v19.0/${actId}/adspixels?fields=name,id&access_token=${accessToken}`);
    const data = await response.json();
    handleApiError(data);
    return data.data || [];
};

// --- CAMPAIGN CREATION ---

const tryCreateCampaign = async (url: string, body: any) => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    handleApiError(data);
    return data;
};

export const createMetaCampaign = async (accountId: string, name: string, objective: string, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/campaigns`;

    // DEBUG: Check token for hidden issues
    console.log(`[createMetaCampaign] Token length: ${accessToken?.length}`);
    console.log(`[createMetaCampaign] Token has whitespace: ${accessToken !== accessToken?.trim()}`);
    console.log(`[createMetaCampaign] Token first20: ${accessToken?.substring(0, 20)}`);
    console.log(`[createMetaCampaign] Token last20: ${accessToken?.substring(accessToken.length - 20)}`);

    // CRITICAL: Trim the token just in case
    const cleanToken = accessToken?.trim();

    const cleanName = sanitizeInput(name);

    try {
        const body1 = {
            name: cleanName,
            objective,
            status: 'ACTIVE',
            special_ad_categories: [],
            buying_type: "AUCTION",
            is_adset_budget_sharing_enabled: false,
            access_token: cleanToken
        };
        const data = await tryCreateCampaign(url, body1);
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
                access_token: accessToken
            };
            const data = await tryCreateCampaign(url, body2);
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
    whatsappNumber?: string
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adsets`;

    const targeting = {
        geo_locations: { countries: ['MY'] },
        age_min: 18,
        age_max: 65,
        publisher_platforms: ['facebook', 'instagram'],
        device_platforms: ['mobile', 'desktop']
    };

    const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().split('.')[0];

    const body: any = {
        name: sanitizeInput(name),
        campaign_id: campaignId,
        daily_budget: Math.floor(dailyBudget * 100),
        targeting: targeting,
        status: 'ACTIVE',
        start_time: startTime,
        access_token: accessToken,
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
        // Engagement -> WhatsApp CTA only if whatsappNumber is provided
        if (whatsappNumber) {
            body.destination_type = "WHATSAPP";
        }
        body.promoted_object = { page_id: pageId };
        body.billing_event = 'IMPRESSIONS';
    }

    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    handleApiError(data);
    invalidateCache();
    return data;
};

// --- ASSET UPLOAD (IMAGE & VIDEO) ---

export const uploadAdImage = async (accountId: string, file: File, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adimages`;
    const formData = new FormData();
    formData.append('access_token', accessToken);
    formData.append('filename', file);
    const response = await fetch(url, { method: 'POST', body: formData });
    const data = await response.json();
    handleApiError(data);
    const images = data.images || {};
    const firstKey = Object.keys(images)[0];
    if (firstKey && images[firstKey].hash) { return images[firstKey].hash; }
    throw new Error("Image upload failed: No hash returned");
};

// Upload image from Blob (for video thumbnails)
export const uploadAdImageBlob = async (accountId: string, blob: Blob, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adimages`;
    const formData = new FormData();
    formData.append('access_token', accessToken);
    formData.append('filename', blob, 'thumbnail.jpg');
    const response = await fetch(url, { method: 'POST', body: formData });
    const data = await response.json();
    handleApiError(data);
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
    const url = `https://graph-video.facebook.com/v19.0/${actId}/advideos`;

    // DEBUG: Log token being used for upload
    console.log(`[Upload] Token length: ${accessToken?.length}, first10: ${accessToken?.substring(0, 10)}...`);
    console.debug(`[Upload] Starting upload for ${file.name} (${file.size} bytes)`);

    // 1. START SESSION
    const startForm = new FormData();
    startForm.append('access_token', accessToken);
    startForm.append('upload_phase', 'start');
    startForm.append('file_size', file.size.toString()); // STEP: Ensure exact bytes as string

    const startRes = await fetch(url, { method: 'POST', body: startForm });
    const startData = await startRes.json();
    handleApiError(startData);

    const { upload_session_id, video_id } = startData;
    let { start_offset, end_offset } = startData;

    // 2. TRANSFER CHUNKS
    while (parseInt(start_offset) < parseInt(end_offset)) {
        const chunk = file.slice(parseInt(start_offset), parseInt(end_offset));

        // DEBUG STEP: Log every chunk details
        console.debug(`[Upload] Transfer: start=${start_offset}, end=${end_offset}, chunk_size=${chunk.size}`);

        const transferForm = new FormData();
        transferForm.append('access_token', accessToken);
        transferForm.append('upload_phase', 'transfer');
        transferForm.append('upload_session_id', upload_session_id);
        transferForm.append('start_offset', start_offset);
        transferForm.append('video_file_chunk', chunk);

        let retries = 3;
        let transData = null;

        while (retries > 0) {
            try {
                // STEP: No AbortController to prevent "Receiving end does not exist" in Chrome
                const transRes = await fetch(url, { method: 'POST', body: transferForm });
                transData = await transRes.json();
                handleApiError(transData);
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

    // 3. FINISH SESSION
    console.debug(`[Upload] Finishing session ${upload_session_id}`);
    const finishForm = new FormData();
    finishForm.append('access_token', accessToken);
    finishForm.append('upload_phase', 'finish');
    finishForm.append('upload_session_id', upload_session_id);

    let finishRetries = 3;
    let finishData = null;
    while (finishRetries > 0) {
        try {
            const finishRes = await fetch(url, { method: 'POST', body: finishForm });
            finishData = await finishRes.json();
            handleApiError(finishData);
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
    // FIX: Only request 'status'. 'processing_progress' is typically inside the status object
    // or not available as a top-level field on generic Video nodes in v19.0.
    const url = `https://graph.facebook.com/v19.0/${videoId}?fields=status&access_token=${accessToken}`;

    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            const data = await res.json();

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
    const url = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;

    // DEBUG + TRIM token
    console.log(`[createMetaCreative] Token length: ${accessToken?.length}, first10: ${accessToken?.substring(0, 10)}`);
    const cleanToken = accessToken?.trim();

    const body: any = {
        name: sanitizeInput(name) + " Creative",
        access_token: cleanToken,
        published: false,
    };

    // --- ADVANTAGE+ / CREATIVE FEATURES LOGIC ---
    // As of API v22.0, standard_enhancements bundle is DEPRECATED.
    // Must set individual features for both image and video ads.
    if (advantagePlusConfig && !advantagePlusConfig.enabled) {
        // OPT OUT of ALL Advantage+ Creative features when disabled
        body.degrees_of_freedom_spec = {
            creative_features_spec: {
                // Image features
                image_touchups: { enroll_status: 'OPT_OUT' },
                image_templates: { enroll_status: 'OPT_OUT' },
                // Video features
                video_auto_crop: { enroll_status: 'OPT_OUT' },
                enhance_cta: { enroll_status: 'OPT_OUT' },
                video_filtering: { enroll_status: 'OPT_OUT' }, // "Add video effects"
                // Text features
                text_optimizations: { enroll_status: 'OPT_OUT' },
                inline_comment: { enroll_status: 'OPT_OUT' }
            }
        };
    }
    // If enabled or not specified, Meta defaults to OPT_IN automatically

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
                image_hash: thumbnailHash // Required thumbnail for video ads
            }
        };
    }

    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    handleApiError(data);
    return data.id;
};

export const createMetaAd = async (accountId: string, adSetId: string, name: string, creativeId: string, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/ads`;

    // DEBUG + TRIM token
    console.log(`[createMetaAd] Token length: ${accessToken?.length}, first10: ${accessToken?.substring(0, 10)}`);
    const cleanToken = accessToken?.trim();

    const body = {
        name: sanitizeInput(name),
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: 'ACTIVE',
        access_token: cleanToken
    };
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    handleApiError(data);
    invalidateCache();
    return data;
};

export const updateEntityStatus = async (id: string, status: 'ACTIVE' | 'PAUSED', accessToken: string) => {
    const url = `https://graph.facebook.com/v19.0/${id}`;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status, access_token: accessToken }) });
    const data = await response.json();
    handleApiError(data);
    if (data.success) { invalidateCache(); return true; }
    return false;
};

export const updateEntityBudget = async (id: string, dailyBudget: number, accessToken: string) => {
    const amountInCents = Math.floor(dailyBudget * 100);
    const url = `https://graph.facebook.com/v19.0/${id}`;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_budget: amountInCents, access_token: accessToken }) });
    const data = await response.json();
    handleApiError(data);
    if (data.success) { invalidateCache(); return true; }
    return false;
};

// --- COMMENTING ---
const getPageAccessToken = async (pageId: string, userAccessToken: string) => {
    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=access_token&access_token=${userAccessToken}`);
        const data = await response.json();
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

    const url = `https://graph.facebook.com/v19.0/${effectiveObjectStoryId}/comments`;

    if (imageBase64) {
        const formData = new FormData();
        formData.append('access_token', pageAccessToken);
        formData.append('message', message);
        try {
            const byteString = atob(imageBase64.split(',')[1]);
            const mimeString = imageBase64.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });
            formData.append('source', blob, 'comment_image.png');

            const response = await fetch(url, { method: 'POST', body: formData });
            const data = await response.json();

            if (data.error && data.error.code === 200) {
                throw new Error("Permission Error: Your App needs 'pages_manage_engagement' to post comments.");
            }
            handleApiError(data);
            return data.id;
        } catch (e: any) {
            console.error("Image conversion failed", e);
            throw new Error(e.message || "Failed to process image for comment.");
        }
    } else {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, access_token: pageAccessToken })
        });
        const data = await response.json();
        if (data.error && data.error.code === 200) {
            throw new Error("Permission Error: Your App needs 'pages_manage_engagement' to post comments.");
        }
        handleApiError(data);
        return data.id;
    }
};
