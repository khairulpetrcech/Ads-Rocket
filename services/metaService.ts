
import { AdCampaign, MetaAdAccount, AdSet, Ad } from '../types';

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
    if (code === 80004 || code === 17 || code === 613) {
      throw new Error("Meta API Rate Limit Exceeded. Please wait 1-2 minutes before refreshing.");
    }
    
    // Provide more context for Invalid Parameter errors
    if (data.error.error_user_msg) {
        throw new Error(`${data.error.error_user_title || 'Error'}: ${data.error.error_user_msg}`);
    }

    if (data.error.error_subcode === 1885316) {
        throw new Error("Invalid Image Hash. Please re-upload the image.");
    }
    
    // Catch specific CBO/Budget Sharing errors
    if (data.error.message && data.error.message.includes('is_adset_budget_sharing_enabled')) {
        throw new Error("BUDGET_SHARING_ERROR"); // Caught by retry logic
    }

    // Catch Dev Mode Creative errors
    if (data.error.message && data.error.message.includes('development mode')) {
        throw new Error("Dev Mode Error: Your App is in Development Mode. Only Admins can see/create ads. Try switching your Meta App to Live Mode.");
    }
    
    throw new Error(data.error.message || "Unknown Meta API Error. Check Console for details.");
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
export const getDateRangeParams = (preset: string) => {
  const today = new Date();
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  if (preset === 'last_4d') {
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(today.getDate() - 3); 
    return {
      time_range: JSON.stringify({ since: formatDate(start), until: formatDate(end) }),
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
          appId      : appId,
          cookie     : true,
          xfbml      : false, 
          version    : 'v19.0'
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
          appId      : appId,
          cookie     : true,
          xfbml      : false,
          version    : 'v19.0'
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
            // Re-added pages_manage_engagement and pages_manage_posts because user enabled the Use Case
            scope: 'public_profile,ads_read,ads_management,pages_show_list,pages_read_engagement,pages_manage_engagement,pages_manage_posts' 
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

// --- DATA FETCHING ---

const mapInsightsToMetrics = (data: any) => {
  const insights = data.insights?.data?.[0] || {};
  
  // Existing Metrics
  const purchaseAction = insights.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0;
  const purchaseValue = insights.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0;
  const landingPageViews = insights.actions?.find((a: any) => a.action_type === 'landing_page_view')?.value || 0;
  const spend = parseFloat(insights.spend || '0');
  const revenue = parseFloat(purchaseValue || '0');

  // New Metrics for Whatsapp/Leads
  // Result calculation: Looks for Leads OR Messaging Conversations OR Link Clicks (Fallback)
  const leads = insights.actions?.find((a: any) => a.action_type === 'lead')?.value || 0;
  const messagingStarted = insights.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0;
  const messagingInitiated = insights.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_initiated')?.value || 0;
  const linkClicks = insights.actions?.find((a: any) => a.action_type === 'link_click')?.value || 0;

  // Heuristic for "Results" based on common objectives
  const results = parseInt(leads) + parseInt(messagingStarted) + parseInt(messagingInitiated);
  const finalResults = results > 0 ? results : parseInt(linkClicks); // Fallback to link clicks if no leads/messages

  return {
    spend: spend,
    revenue: revenue,
    roas: spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0,
    impressions: parseInt(insights.impressions || '0'),
    clicks: parseInt(insights.clicks || '0'),
    ctr: parseFloat(insights.ctr || '0'), // CTR (All)
    inline_link_click_ctr: parseFloat(insights.inline_link_click_ctr || '0'), // CTR (Link Click-Through)
    cpc: parseFloat(insights.cpc || '0'),
    landingPageViews: parseInt(landingPageViews),
    costPerLandingPageView: landingPageViews > 0 ? parseFloat((spend / landingPageViews).toFixed(2)) : 0,
    purchases: parseInt(purchaseAction),
    costPerPurchase: purchaseAction > 0 ? parseFloat((spend / purchaseAction).toFixed(2)) : 0,
    // Whatsapp/Leads specific
    results: finalResults,
    costPerResult: finalResults > 0 ? parseFloat((spend / finalResults).toFixed(2)) : 0
  };
};

export const getRealCampaigns = async (adAccountId: string, accessToken: string, datePreset: string = 'today'): Promise<AdCampaign[]> => {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const cacheKey = `campaigns-${accountId}-${datePreset}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const { date_preset, time_range } = getDateRangeParams(datePreset);
  const insightsQuery = time_range 
    ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,inline_link_click_ctr,actions,action_values}`
    : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,inline_link_click_ctr,actions,action_values}`;

  const fields = ['id', 'name', 'status', 'objective', 'daily_budget', 'effective_status', insightsQuery].join(',');
  const filtering = `[{field:"effective_status",operator:"IN",value:["ACTIVE","PAUSED","IN_PROCESS","WITH_ISSUES"]}]`;

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

export const getAdSets = async (campaignId: string, accessToken: string, datePreset: string = 'today'): Promise<AdSet[]> => {
    const cacheKey = `adsets-${campaignId}-${datePreset}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const insightsQuery = time_range 
      ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,inline_link_click_ctr,actions,action_values}`
      : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,inline_link_click_ctr,actions,action_values}`;

    const fields = ['id', 'name', 'status', 'daily_budget', 'effective_status', 'campaign_id', insightsQuery].join(',');

    try {
        const url = `https://graph.facebook.com/v19.0/${campaignId}/adsets?fields=${fields}&access_token=${accessToken}&limit=50`;
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

export const getAds = async (adSetId: string, accessToken: string, datePreset: string = 'today'): Promise<Ad[]> => {
    const cacheKey = `ads-${adSetId}-${datePreset}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const insightsQuery = time_range 
      ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,inline_link_click_ctr,actions,action_values}`
      : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,inline_link_click_ctr,actions,action_values}`;

    // Added effective_object_story_id to fetch the post ID for linking
    const fields = ['id', 'name', 'status', 'effective_status', 'adset_id', 'creative{thumbnail_url,image_url,effective_object_story_id}', insightsQuery].join(',');

    try {
        const url = `https://graph.facebook.com/v19.0/${adSetId}/ads?fields=${fields}&access_token=${accessToken}&limit=50`;
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
        setCachedData(cacheKey, result);
        return result;
    } catch (error) { throw error; }
};

export const getTopAdsForAccount = async (adAccountId: string, accessToken: string): Promise<Ad[]> => {
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const cacheKey = `top-ads-${accountId}-last_7d`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;
    const { time_range } = getDateRangeParams('last_7d');
    const insightsQuery = `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;
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

// --- CAMPAIGN CREATION WITH RETRY LOGIC ---
const tryCreateCampaign = async (url: string, body: any) => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    handleApiError(data);
    return data;
};

export const createMetaCampaign = async (accountId: string, name: string, objective: string, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/campaigns`;
    
    const cleanName = sanitizeInput(name);

    // ATTEMPT 1: With explicit CBO disabled flag (Standard for new accounts)
    try {
        const body1 = {
            name: cleanName,
            objective, 
            status: 'PAUSED',
            special_ad_categories: [],
            buying_type: "AUCTION",
            is_adset_budget_sharing_enabled: false, // Explicitly disable CBO
            access_token: accessToken
        };
        const data = await tryCreateCampaign(url, body1);
        invalidateCache();
        return data;
    } catch (error: any) {
        // ATTEMPT 2: If attempt 1 fails with Budget Sharing error, try different payload for older/migrated accounts
        if (error.message === "BUDGET_SHARING_ERROR" || error.message.includes("is_adset_budget_sharing_enabled")) {
            console.warn("Retrying Campaign Creation with alternative parameters...");
            const body2 = {
                name: cleanName,
                objective, 
                status: 'PAUSED',
                special_ad_categories: [],
                buying_type: "AUCTION",
                // Remove the flag, try sending Advantage+ config disabled
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
    accessToken: string
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adsets`;
    
    // Targeting (Basic Setup)
    const targeting = {
        geo_locations: { countries: ['MY'] },
        age_min: 18,
        age_max: 65,
        publisher_platforms: ['facebook', 'instagram'],
        device_platforms: ['mobile', 'desktop']
    };

    // START TIME FIX: Must be future (>15m). Remove MS.
    const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().split('.')[0]; 

    const body: any = {
        name: sanitizeInput(name),
        campaign_id: campaignId,
        daily_budget: Math.floor(dailyBudget * 100),
        targeting: targeting,
        status: 'PAUSED',
        start_time: startTime,
        access_token: accessToken,
        optimization_goal: optimizationGoal,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP', // Explicitly set bid strategy
        billing_event: 'IMPRESSIONS'
    };
    
    // FIX: If Conversion, we need promoted_object (Pixel) and billing event
    if (optimizationGoal === 'OFFSITE_CONVERSIONS') {
        if (!pixelId) throw new Error("A Pixel is required for Conversion campaigns.");
        body.destination_type = "WEBSITE";
        body.promoted_object = {
            pixel_id: pixelId,
            custom_event_type: "PURCHASE" 
        };
        // Some accounts require IMPRESSIONS for billing event on conversions
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

export const uploadAdVideo = async (accountId: string, file: File, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    // Use advideos endpoint
    const url = `https://graph-video.facebook.com/v19.0/${actId}/advideos`;
    const formData = new FormData();
    formData.append('access_token', accessToken);
    formData.append('source', file);
    
    const response = await fetch(url, { method: 'POST', body: formData });
    const data = await response.json();
    handleApiError(data);
    
    if (data.id) { return data.id; }
    throw new Error("Video upload failed: No ID returned");
};

// Polling to wait for video to be ready
export const waitForVideoReady = async (videoId: string, accessToken: string, retries = 20): Promise<boolean> => {
    const url = `https://graph.facebook.com/v19.0/${videoId}?fields=status&access_token=${accessToken}`;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.status && data.status.video_status === 'READY') {
                return true;
            }
        } catch (e) { console.warn("Polling video status failed", e); }
        // Wait 3 seconds
        await new Promise(r => setTimeout(r, 3000));
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
    mediaType: 'image' | 'video' = 'image'
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;
    
    // DEV MODE FIX: 
    // Removed degrees_of_freedom_spec. Including it (even OPT_OUT) can trigger "Standard Enhancements" checks
    // which fail in Dev Mode if not Public. Default behavior creates a Dark Post.
    
    const body: any = {
        name: sanitizeInput(name) + " Creative",
        access_token: accessToken,
        published: false // Force Dark Post
    };

    if (mediaType === 'image') {
        body.object_story_spec = {
            page_id: pageId,
            link_data: {
                message: sanitizeInput(message),
                link: link, 
                image_hash: assetId,
                name: sanitizeInput(headline),
                call_to_action: { type: "LEARN_MORE" }
            }
        };
    } else {
        // VIDEO CREATIVE STRUCTURE
        body.object_story_spec = {
            page_id: pageId,
            video_data: {
                video_id: assetId,
                message: sanitizeInput(message),
                title: sanitizeInput(headline),
                call_to_action: { type: "LEARN_MORE", value: { link: link } },
                image_url: "https://via.placeholder.com/1200x628?text=Video+Ad" // Fallback thumbnail
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
    const body = {
        name: sanitizeInput(name),
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: 'PAUSED',
        access_token: accessToken
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

// Helper to get Page Access Token for a specific page
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
    // effectiveObjectStoryId is typically PageID_PostID for Ad Posts
    // We need to extract the Page ID to get the Page Access Token
    const parts = effectiveObjectStoryId.split('_');
    if (parts.length < 2) throw new Error("Invalid Post ID format. Cannot identify Page.");
    
    const pageId = parts[0];
    
    // 1. Get Page Token (Swapping User Token)
    const pageAccessToken = await getPageAccessToken(pageId, userAccessToken);
    if (!pageAccessToken) throw new Error("Failed to authenticate as Page.");

    const url = `https://graph.facebook.com/v19.0/${effectiveObjectStoryId}/comments`;
    
    // If we have an image, we must use FormData
    if (imageBase64) {
        const formData = new FormData();
        formData.append('access_token', pageAccessToken); // Use Page Token
        formData.append('message', message);
        
        // Convert base64 to blob
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
            
            // Custom error handling for missing permission
            if (data.error && data.error.code === 200) {
                throw new Error("Permission Error: Your App needs 'pages_manage_engagement' to post comments. Add it in Meta Developer Portal.");
            }
            handleApiError(data);
            return data.id;
        } catch (e: any) {
            console.error("Image conversion failed", e);
            throw new Error(e.message || "Failed to process image for comment.");
        }
    } else {
        // Text only
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, access_token: pageAccessToken }) // Use Page Token
        });
        const data = await response.json();
        
        // Custom error handling for missing permission
        if (data.error && data.error.code === 200) {
            throw new Error("Permission Error: Your App needs 'pages_manage_engagement' to post comments. Add it in Meta Developer Portal.");
        }

        handleApiError(data);
        return data.id;
    }
};