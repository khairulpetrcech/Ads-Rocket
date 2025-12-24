
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
          time_range: JSON.stringify({ since: preset.start, until: preset.end }),
          date_preset: null
      };
  }

  // String Presets
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
    landingPageViews: parseInt(landingPageViews),
    costPerLandingPageView: landingPageViews > 0 ? parseFloat((spend / landingPageViews).toFixed(2)) : 0,
    purchases: parseInt(purchaseAction),
    costPerPurchase: purchaseAction > 0 ? parseFloat((spend / purchaseAction).toFixed(2)) : 0,
    results: finalResults,
    costPerResult: finalResults > 0 ? parseFloat((spend / finalResults).toFixed(2)) : 0
  };
};

export const getRealCampaigns = async (adAccountId: string, accessToken: string, datePreset: string | {start: string, end: string} = 'today'): Promise<AdCampaign[]> => {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  
  // Create cache key that supports object param
  const rangeKey = typeof datePreset === 'string' ? datePreset : `${datePreset.start}_${datePreset.end}`;
  const cacheKey = `campaigns-${accountId}-${rangeKey}`;
  
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

export const getAdSets = async (campaignId: string, accessToken: string, datePreset: string | {start: string, end: string} = 'today'): Promise<AdSet[]> => {
    const rangeKey = typeof datePreset === 'string' ? datePreset : `${datePreset.start}_${datePreset.end}`;
    const cacheKey = `adsets-${campaignId}-${rangeKey}`;
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

export const getAds = async (adSetId: string, accessToken: string, datePreset: string | {start: string, end: string} = 'today'): Promise<Ad[]> => {
    const rangeKey = typeof datePreset === 'string' ? datePreset : `${datePreset.start}_${datePreset.end}`;
    const cacheKey = `ads-${adSetId}-${rangeKey}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const insightsQuery = time_range 
      ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,inline_link_click_ctr,actions,action_values}`
      : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,inline_link_click_ctr,actions,action_values}`;

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
    
    const cleanName = sanitizeInput(name);

    try {
        const body1 = {
            name: cleanName,
            objective, 
            status: 'PAUSED',
            special_ad_categories: [],
            buying_type: "AUCTION",
            is_adset_budget_sharing_enabled: false, 
            access_token: accessToken
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
                status: 'PAUSED',
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
    accessToken: string
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
        status: 'PAUSED',
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

// --- CHUNKED VIDEO UPLOAD ---
// Essential for reliability and "speed" (prevents timeouts on large files)
export const uploadAdVideo = async (accountId: string, file: File, accessToken: string, onProgress?: (msg: string) => void) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph-video.facebook.com/v19.0/${actId}/advideos`;
    
    // 1. START SESSION
    onProgress?.("Initializing Video Upload...");
    const startFormData = new FormData();
    startFormData.append('access_token', accessToken);
    startFormData.append('upload_phase', 'start');
    startFormData.append('file_size', file.size.toString());
    
    const startRes = await fetch(url, { method: 'POST', body: startFormData });
    const startData = await startRes.json();
    handleApiError(startData);
    
    const { upload_session_id, start_offset, end_offset, video_id } = startData;
    const finalVideoId = video_id; // Usually returned here
    
    let currentStartOffset = parseInt(start_offset);
    let currentEndOffset = parseInt(end_offset);

    // 2. TRANSFER CHUNKS
    const chunkReader = file.stream().getReader();
    let uploadedBytes = 0;
    
    // Fallback: If browser doesn't support stream well, use slicing
    // Standard chunk size usually ~1MB to 4MB from Meta, but let's loop based on offsets
    
    while (uploadedBytes < file.size) {
        onProgress?.(`Uploading... ${Math.floor((uploadedBytes/file.size)*100)}%`);
        
        const chunkBlob = file.slice(currentStartOffset, currentEndOffset);
        
        const transferFormData = new FormData();
        transferFormData.append('access_token', accessToken);
        transferFormData.append('upload_phase', 'transfer');
        transferFormData.append('upload_session_id', upload_session_id);
        transferFormData.append('start_offset', currentStartOffset.toString());
        transferFormData.append('video_file_chunk', chunkBlob);

        const transRes = await fetch(url, { method: 'POST', body: transferFormData });
        const transData = await transRes.json();
        handleApiError(transData);

        currentStartOffset = parseInt(transData.start_offset);
        currentEndOffset = parseInt(transData.end_offset);
        uploadedBytes = currentStartOffset;

        if (currentStartOffset === currentEndOffset) break; // Finished
    }

    // 3. FINISH SESSION
    onProgress?.("Finalizing Video...");
    const finishFormData = new FormData();
    finishFormData.append('access_token', accessToken);
    finishFormData.append('upload_phase', 'finish');
    finishFormData.append('upload_session_id', upload_session_id);
    
    const finishRes = await fetch(url, { method: 'POST', body: finishFormData });
    const finishData = await finishRes.json();
    handleApiError(finishData);
    
    if (finalVideoId) return finalVideoId;
    if (finishData.id) return finishData.id;
    
    throw new Error("Video upload finished but no ID returned");
};


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
    mediaType: 'image' | 'video' = 'image',
    callToAction: string = 'LEARN_MORE',
    description: string = '',
    advantagePlusConfig?: AdvantagePlusConfig 
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;
    
    const body: any = {
        name: sanitizeInput(name) + " Creative",
        access_token: accessToken,
        published: false,
    };

    // --- ADVANTAGE+ / STANDARD ENHANCEMENTS LOGIC ---
    // If config exists, use it. Otherwise rely on default (Meta usually defaults to OPT_IN for new creatives)
    // To strictly support "Turn Off", we check the enabled flag.
    if (advantagePlusConfig) {
        // Construct the degrees_of_freedom_spec to control Standard Enhancements
        body.degrees_of_freedom_spec = {
            creative_features_spec: {
                standard_enhancements: {
                    enroll_status: advantagePlusConfig.enabled ? 'OPT_IN' : 'OPT_OUT'
                }
            }
        };
        // NOTE: Granular exclusion (e.g. specifically turning off Text Overlay while keeping others)
        // is not fully supported in the standard adcreatives endpoint without using Asset Feeds.
        // We prioritize the 'enroll_status' to ensure the API call succeeds without 400 errors.
        // The backend treats the sub-toggles as indicators for the bundle.
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
                link_description: sanitizeInput(description), // Video uses link_description
                call_to_action: { type: callToAction, value: { link: link } },
                image_url: "https://via.placeholder.com/1200x628?text=Video+Ad" 
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
