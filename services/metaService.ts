
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
        throw new Error("Budget Sharing Configuration Error. Retrying with explicit CBO flag...");
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
            scope: 'public_profile,ads_read,ads_management,pages_show_list,pages_read_engagement' 
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
  const purchaseAction = insights.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0;
  const purchaseValue = insights.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0;
  const landingPageViews = insights.actions?.find((a: any) => a.action_type === 'landing_page_view')?.value || 0;
  const spend = parseFloat(insights.spend || '0');
  const revenue = parseFloat(purchaseValue || '0');

  return {
    spend: spend,
    revenue: revenue,
    roas: spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0,
    impressions: parseInt(insights.impressions || '0'),
    clicks: parseInt(insights.clicks || '0'),
    ctr: parseFloat(insights.ctr || '0'),
    cpc: parseFloat(insights.cpc || '0'),
    landingPageViews: parseInt(landingPageViews),
    costPerLandingPageView: landingPageViews > 0 ? parseFloat((spend / landingPageViews).toFixed(2)) : 0,
    purchases: parseInt(purchaseAction),
    costPerPurchase: purchaseAction > 0 ? parseFloat((spend / purchaseAction).toFixed(2)) : 0
  };
};

export const getRealCampaigns = async (adAccountId: string, accessToken: string, datePreset: string = 'today'): Promise<AdCampaign[]> => {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const cacheKey = `campaigns-${accountId}-${datePreset}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const { date_preset, time_range } = getDateRangeParams(datePreset);
  const insightsQuery = time_range 
    ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
    : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;

  const fields = ['id', 'name', 'status', 'daily_budget', 'effective_status', insightsQuery].join(',');
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
      ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
      : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;

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
      ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
      : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;

    const fields = ['id', 'name', 'status', 'effective_status', 'adset_id', 'creative{thumbnail_url,image_url}', insightsQuery].join(',');

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

export const createMetaCampaign = async (accountId: string, name: string, objective: string, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/campaigns`;
    
    // SECURITY: Sanitize Name
    const cleanName = sanitizeInput(name);

    // FIXED PARAMETERS FOR API COMPATIBILITY
    const body: any = {
        name: cleanName,
        objective, 
        status: 'PAUSED',
        special_ad_categories: [], // Required empty array for standard ads
        buying_type: "AUCTION",    // Explicitly set buying type
        is_adset_budget_sharing_enabled: false, // EXPLICITLY DISABLE CBO (Ad Set Budget Sharing) based on user error report
        access_token: accessToken
    };

    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    handleApiError(data);
    invalidateCache();
    return data; 
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

export const createMetaCreative = async (
    accountId: string,
    name: string,
    pageId: string,
    imageHash: string,
    message: string,
    headline: string,
    link: string,
    accessToken: string
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;
    const body = {
        name: sanitizeInput(name) + " Creative",
        object_story_spec: {
            page_id: pageId,
            link_data: {
                message: sanitizeInput(message),
                link: link, // Do not sanitize URL, it might break it
                image_hash: imageHash,
                name: sanitizeInput(headline),
                call_to_action: { type: "LEARN_MORE" }
            }
        },
        access_token: accessToken
    };
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
