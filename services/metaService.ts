
import { AdCampaign, MetaAdAccount, AdSet, Ad } from '../types';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

// Initialize the SDK with Timeout to prevent hanging
export const initFacebookSdk = (appId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // 1. Check if FB is already available (Script loaded from index.html)
    if (window.FB) {
      try {
        window.FB.init({
          appId      : appId,
          cookie     : true,
          xfbml      : false, // Optimized: Don't parse DOM for plugins
          version    : 'v19.0'
        });
        return resolve();
      } catch (e) {
        console.warn("FB Init warning:", e);
        return resolve(); // Assuming previously working
      }
    }

    // 2. Set timeout to stop waiting if AdBlocker blocks it
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

    // 4. Inject script only if missing (index.html usually has it)
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

// Check if user is already connected
export const checkLoginStatus = (): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!window.FB) return resolve(null);
    window.FB.getLoginStatus((response: any) => {
      if (response.status === 'connected' && response.authResponse) {
        resolve(response.authResponse.accessToken);
      } else {
        resolve(null);
      }
    });
  });
};

// Login and request permissions
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
            scope: 'public_profile,ads_read,ads_management' 
        });
    } catch (e) {
        console.error("FB.login sync error:", e);
        reject("Failed to open Facebook Login dialog.");
    }
  });
};

// Get List of Ad Accounts
export const getAdAccounts = async (accessToken: string): Promise<MetaAdAccount[]> => {
  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency&access_token=${accessToken}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.data || [];
  } catch (error) {
    console.error("Failed to fetch ad accounts", error);
    throw error;
  }
};

// HELPER: Map insights to metrics
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

// Fetch Campaigns
export const getRealCampaigns = async (
    adAccountId: string, 
    accessToken: string,
    datePreset: string = 'today'
): Promise<AdCampaign[]> => {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  
  const fields = [
    'id', 'name', 'status', 'daily_budget', 'effective_status',
    `insights.date_preset(${datePreset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
  ].join(',');

  const filtering = `[{field:"effective_status",operator:"IN",value:["ACTIVE","PAUSED","IN_PROCESS","WITH_ISSUES"]}]`;

  try {
    const url = `https://graph.facebook.com/v19.0/${accountId}/campaigns?fields=${fields}&access_token=${accessToken}&limit=200&filtering=${filtering}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    
    return data.data.map((camp: any) => ({
        id: camp.id,
        name: camp.name,
        status: camp.effective_status || camp.status,
        dailyBudget: parseInt(camp.daily_budget || '0') / 100, 
        metrics: mapInsightsToMetrics(camp),
        history: [] 
    }));
  } catch (error) {
    console.error("Failed to fetch campaigns", error);
    throw error;
  }
};

// Fetch Ad Sets
export const getAdSets = async (
    campaignId: string,
    accessToken: string,
    datePreset: string = 'today'
): Promise<AdSet[]> => {
    const fields = [
        'id', 'name', 'status', 'daily_budget', 'effective_status', 'campaign_id',
        `insights.date_preset(${datePreset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
    ].join(',');

    const url = `https://graph.facebook.com/v19.0/${campaignId}/adsets?fields=${fields}&access_token=${accessToken}&limit=50`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return data.data.map((adset: any) => ({
        id: adset.id,
        name: adset.name,
        status: adset.effective_status || adset.status,
        dailyBudget: parseInt(adset.daily_budget || '0') / 100,
        campaign_id: adset.campaign_id,
        metrics: mapInsightsToMetrics(adset)
    }));
};

// Fetch Ads
export const getAds = async (
    adSetId: string,
    accessToken: string,
    datePreset: string = 'today'
): Promise<Ad[]> => {
    const fields = [
        'id', 'name', 'status', 'effective_status', 'adset_id',
        'creative{thumbnail_url,image_url}',
        `insights.date_preset(${datePreset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
    ].join(',');

    const url = `https://graph.facebook.com/v19.0/${adSetId}/ads?fields=${fields}&access_token=${accessToken}&limit=50`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return data.data.map((ad: any) => ({
        id: ad.id,
        name: ad.name,
        status: ad.effective_status || ad.status,
        adset_id: ad.adset_id,
        creative: ad.creative || {},
        metrics: mapInsightsToMetrics(ad)
    }));
};

// ACTIONS: Toggle Status
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
    if (data.error) throw new Error(data.error.message);
    return data.success;
};

// ACTIONS: Update Budget
export const updateEntityBudget = async (
    id: string, 
    dailyBudget: number, // in Currency Units (e.g. RM)
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
    if (data.error) throw new Error(data.error.message);
    return data.success;
};
