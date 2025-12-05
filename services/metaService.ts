
import { AdCampaign, MetaAdAccount, AdSet, Ad } from '../types';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

// --- SMART CACHING SYSTEM ---
// Cache responses for 5 minutes (300s) to avoid hitting Meta's Rate Limit (#80004)
const CACHE_TTL = 5 * 60 * 1000; 
const apiCache: Record<string, { timestamp: number, data: any }> = {};

const getCachedData = (key: string) => {
  const cached = apiCache[key];
  if (!cached) return null;
  
  // Return cached data if valid
  if (Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Meta Cache Hit] ${key}`);
    return cached.data;
  }
  
  // Delete expired cache
  delete apiCache[key];
  return null;
};

const setCachedData = (key: string, data: any) => {
  apiCache[key] = { timestamp: Date.now(), data };
};

// Clear cache when user performs an action (Edit budget, Toggle status)
const invalidateCache = () => {
  console.log('[Meta Cache] Invalidating all cache due to write action.');
  for (const key in apiCache) delete apiCache[key];
};

// Helper to handle API Errors specifically Rate Limits
const handleApiError = (data: any) => {
  if (data.error) {
    const code = data.error.code;
    // 80004: Account level rate limit, 17: User level rate limit, 613: Custom rate limit
    if (code === 80004 || code === 17 || code === 613) {
      throw new Error("Meta API Rate Limit Exceeded. Please wait 1-2 minutes before refreshing.");
    }
    throw new Error(data.error.message || "Unknown Meta API Error");
  }
};

// --- SECURITY HELPER ---
export const isSecureContext = (): boolean => {
  // Facebook requires HTTPS or Localhost
  return window.location.protocol === 'https:' || 
         window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1';
};

// --- HELPER: DATE RANGE PARAMS ---
export const getDateRangeParams = (preset: string) => {
  const today = new Date();
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  if (preset === 'last_4d') {
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(today.getDate() - 3); // Today (1) + 3 days back = 4 days total
    return {
      time_range: JSON.stringify({ since: formatDate(start), until: formatDate(end) }),
      date_preset: null
    };
  }
  
  // Standard presets that Meta supports
  return { 
    date_preset: preset,
    time_range: null
  };
};

// --- FACEBOOK SDK INIT ---

export const initFacebookSdk = (appId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    
    if (!isSecureContext()) {
      return reject("Secure HTTPS connection required for Facebook SDK.");
    }

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
        console.warn("FB Init warning:", e);
        return resolve(); 
      }
    }

    // 2. Set timeout to stop waiting (3s)
    const timeoutId = setTimeout(() => {
      reject("Facebook SDK load timeout (3s). Check AdBlocker or Network.");
    }, 3000);

    // 3. Setup Callback
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

    // 4. Inject script carefully
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
    }
  });
};

export const checkLoginStatus = (): Promise<string | null> => {
  return new Promise((resolve) => {
    // 1. Protocol Check: Skip immediately if insecure
    if (!isSecureContext()) {
        console.warn("Skipping FB.getLoginStatus: HTTPS required.");
        return resolve(null);
    }

    if (!window.FB) return resolve(null);

    // 2. Timeout Safety: If callback never fires (common on insecure origins or adblock)
    const timeoutId = setTimeout(() => {
        console.warn("FB.getLoginStatus timed out.");
        resolve(null);
    }, 2000);

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
    if (!isSecureContext()) return reject("Facebook Login requires a secure HTTPS connection.");
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
            // Added pages_show_list and pages_read_engagement to fetch Pages for Ad Creatives
            scope: 'public_profile,ads_read,ads_management,pages_show_list,pages_read_engagement' 
        });
    } catch (e) {
        console.error("FB.login sync error:", e);
        reject("Failed to open Facebook Login dialog.");
    }
  });
};

export const getAdAccounts = async (accessToken: string): Promise<MetaAdAccount[]> => {
  // Check Cache first
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
    console.error("Failed to fetch ad accounts", error);
    throw error;
  }
};

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

// --- DATA FETCHING WITH CACHE ---

export const getRealCampaigns = async (
    adAccountId: string, 
    accessToken: string,
    datePreset: string = 'today'
): Promise<AdCampaign[]> => {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  
  // Check Cache
  const cacheKey = `campaigns-${accountId}-${datePreset}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  // Determine if we use date_preset or time_range
  const { date_preset, time_range } = getDateRangeParams(datePreset);
  
  const insightsQuery = time_range 
    ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
    : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;

  const fields = [
    'id', 'name', 'status', 'daily_budget', 'effective_status',
    insightsQuery
  ].join(',');

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

    // Save to Cache
    setCachedData(cacheKey, result);
    return result;

  } catch (error) {
    console.error("Failed to fetch campaigns", error);
    throw error;
  }
};

export const getAdSets = async (
    campaignId: string,
    accessToken: string,
    datePreset: string = 'today'
): Promise<AdSet[]> => {
    // Check Cache
    const cacheKey = `adsets-${campaignId}-${datePreset}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const insightsQuery = time_range 
      ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
      : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;

    const fields = [
        'id', 'name', 'status', 'daily_budget', 'effective_status', 'campaign_id',
        insightsQuery
    ].join(',');

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
    } catch (error) {
        throw error;
    }
};

export const getAds = async (
    adSetId: string,
    accessToken: string,
    datePreset: string = 'today'
): Promise<Ad[]> => {
    // Check Cache
    const cacheKey = `ads-${adSetId}-${datePreset}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    const { date_preset, time_range } = getDateRangeParams(datePreset);
    const insightsQuery = time_range 
      ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
      : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;

    const fields = [
        'id', 'name', 'status', 'effective_status', 'adset_id',
        'creative{thumbnail_url,image_url}',
        insightsQuery
    ].join(',');

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
    } catch (error) {
        throw error;
    }
};

// Fetch Top 3 Performing Ads Account-Wide for the last 7 days
export const getTopAdsForAccount = async (
    adAccountId: string,
    accessToken: string
): Promise<Ad[]> => {
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    
    // Check Cache
    const cacheKey = `top-ads-${accountId}-last_7d`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    // Use last_7d for AI context
    const { time_range, date_preset } = getDateRangeParams('last_7d');
    
    const insightsQuery = time_range 
      ? `insights.time_range(${time_range}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
      : `insights.date_preset(${date_preset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;

    const fields = [
        'id', 'name', 'status', 'effective_status', 'adset_id',
        'creative{thumbnail_url,image_url}',
        insightsQuery
    ].join(',');

    // Filter Active ads only
    const filtering = `[{field:"effective_status",operator:"IN",value:["ACTIVE"]}]`;

    try {
        // Fetch a batch of ads
        const url = `https://graph.facebook.com/v19.0/${accountId}/ads?fields=${fields}&access_token=${accessToken}&limit=100&filtering=${filtering}`;
        const response = await fetch(url);
        const data = await response.json();
        handleApiError(data);

        // Process Metrics
        let ads: Ad[] = (data.data || []).map((ad: any) => ({
            id: ad.id,
            name: ad.name,
            status: ad.effective_status || ad.status,
            adset_id: ad.adset_id,
            creative: ad.creative || {},
            metrics: mapInsightsToMetrics(ad)
        }));

        // Filter: Must have Spend > 0
        ads = ads.filter(a => a.metrics.spend > 0);

        // Sort by ROAS Descending
        ads.sort((a, b) => b.metrics.roas - a.metrics.roas);

        // Take Top 3
        const top3 = ads.slice(0, 3);
        
        setCachedData(cacheKey, top3);
        return top3;
    } catch (error) {
        console.error("Failed to fetch top ads", error);
        return [];
    }
};

// --- CREATION & UPLOAD ACTIONS ---

export const getPages = async (accessToken: string) => {
    // Requires pages_show_list or pages_read_engagement
    // Increased limit to 100 to ensure all pages are found
    const response = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=name,id,access_token&access_token=${accessToken}&limit=100`);
    const data = await response.json();
    handleApiError(data);
    return data.data || [];
};

export const createMetaCampaign = async (accountId: string, name: string, objective: string, accessToken: string) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/campaigns`;
    
    const body = {
        name,
        objective, // e.g. OUTCOME_SALES, OUTCOME_TRAFFIC
        status: 'PAUSED', // Always pause on creation for safety
        special_ad_categories: [],
        access_token: accessToken
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await response.json();
    handleApiError(data);
    
    invalidateCache();
    return data; // returns { id: ... }
};

export const createMetaAdSet = async (
    accountId: string, 
    campaignId: string, 
    name: string, 
    dailyBudget: number, 
    optimizationGoal: string, 
    accessToken: string
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adsets`;
    
    // Simplified targeting (MY, 18-65+)
    const targeting = {
        geo_locations: { countries: ['MY'] },
        age_min: 18,
        age_max: 65,
    };

    const body: any = {
        name,
        campaign_id: campaignId,
        daily_budget: Math.floor(dailyBudget * 100), // convert to cents
        billing_event: 'IMPRESSIONS',
        optimization_goal: optimizationGoal, // e.g. OFFSITE_CONVERSIONS, LINK_CLICKS
        targeting: targeting,
        status: 'PAUSED',
        start_time: new Date().toISOString(), // Start now
        access_token: accessToken
    };
    
    // Note: Conversion ads usually require a 'promoted_object' (pixel). 
    // For simplicity in this general tool, we might fail if pixel is required for specific objectives.
    // If objective is TRAFFIC/LINK_CLICKS, this usually works without pixel.
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
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

    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    handleApiError(data);
    
    // Response format: { images: { "filename.jpg": { hash: "..." } } }
    const images = data.images || {};
    const firstKey = Object.keys(images)[0];
    if (firstKey && images[firstKey].hash) {
        return images[firstKey].hash;
    }
    throw new Error("Image upload failed: No hash returned");
};

export const createMetaCreative = async (
    accountId: string,
    name: string,
    pageId: string,
    imageHash: string,
    message: string, // Primary Text
    headline: string,
    link: string,
    accessToken: string
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;
    
    const body = {
        name: name + " Creative",
        object_story_spec: {
            page_id: pageId,
            link_data: {
                message: message,
                link: link,
                image_hash: imageHash,
                name: headline,
                call_to_action: {
                    type: "LEARN_MORE"
                }
            }
        },
        access_token: accessToken
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await response.json();
    handleApiError(data);
    return data.id; // Creative ID
};

export const createMetaAd = async (
    accountId: string,
    adSetId: string,
    name: string,
    creativeId: string,
    accessToken: string
) => {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/ads`;

    const body = {
        name,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: 'PAUSED', // Safety first
        access_token: accessToken
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await response.json();
    handleApiError(data);
    invalidateCache();
    return data;
};

// --- ACTIONS (Invalidate Cache on Success) ---

export const updateEntityStatus = async (
    id: string, 
    status: 'ACTIVE' | 'PAUSED',
    accessToken: string
) => {
    const url = `https://graph.facebook.com/v19.0/${id}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status, access_token: accessToken })
    });
    const data = await response.json();
    handleApiError(data);
    
    if (data.success) {
        invalidateCache(); // Clear cache so UI updates instantly on next fetch
        return true;
    }
    return false;
};

export const updateEntityBudget = async (
    id: string, 
    dailyBudget: number, // in Currency Units
    accessToken: string
) => {
    const amountInCents = Math.floor(dailyBudget * 100);
    const url = `https://graph.facebook.com/v19.0/${id}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_budget: amountInCents, access_token: accessToken })
    });
    const data = await response.json();
    handleApiError(data);

    if (data.success) {
        invalidateCache(); // Clear cache so UI updates instantly on next fetch
        return true;
    }
    return false;
};
