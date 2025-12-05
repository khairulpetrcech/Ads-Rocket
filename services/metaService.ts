
import { AdCampaign, MetaAdAccount } from '../types';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

// Initialize the SDK with Timeout to prevent hanging
export const initFacebookSdk = (appId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // 1. Setup Timeout (5 seconds)
    const timeoutId = setTimeout(() => {
      reject("Facebook SDK load timeout. Check your ad blocker or network connection.");
    }, 5000);

    const initializeSDK = () => {
      clearTimeout(timeoutId); // Clear timeout on success
      try {
        window.FB.init({
          appId      : appId,
          cookie     : true,
          xfbml      : true,
          version    : 'v19.0'
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    if (window.FB) {
      initializeSDK();
      return;
    }

    window.fbAsyncInit = initializeSDK;
    
    // Only append script if not already present
    if (!document.getElementById('facebook-jssdk')) {
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

    window.FB.login((response: any) => {
      if (response.authResponse) {
        resolve(response.authResponse.accessToken);
      } else {
        if (response.status === 'unknown') {
            reject("Login cancelled or blocked. Please allow popups for this site.");
        } else {
            reject("User did not fully authorize the app.");
        }
      }
    }, { 
      // Minimal scope for Ads Manager
      scope: 'public_profile,ads_read,ads_management' 
    });
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

// Fetch Campaigns and Insights
export const getRealCampaigns = async (
    adAccountId: string, 
    accessToken: string,
    datePreset: string = 'today' // Default updated to today if not provided
): Promise<AdCampaign[]> => {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  
  const fields = [
    'id', 'name', 'status', 'daily_budget', 'effective_status',
    `insights.date_preset(${datePreset}){spend,impressions,clicks,cpc,ctr,actions,action_values}`
  ].join(',');

  // Filter to get ACTIVE, PAUSED, IN_PROCESS (ASC), WITH_ISSUES. 
  // 'effective_status' filtering ensures we don't get deleted/archived campaigns clogging the limit.
  const filtering = `[{field:"effective_status",operator:"IN",value:["ACTIVE","PAUSED","IN_PROCESS","WITH_ISSUES"]}]`;

  try {
    // Increased limit to 200 to capture ASC campaigns that might be pushed down by older campaigns
    const url = `https://graph.facebook.com/v19.0/${accountId}/campaigns?fields=${fields}&access_token=${accessToken}&limit=200&filtering=${filtering}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    
    const campaigns: AdCampaign[] = data.data.map((camp: any) => {
      const insights = camp.insights?.data?.[0] || {};
      
      const purchaseAction = insights.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0;
      
      // FIX: In action_values, the action_type for purchase value is simply 'purchase'
      const purchaseValue = insights.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0;
      
      const landingPageViews = insights.actions?.find((a: any) => a.action_type === 'landing_page_view')?.value || 0;
      
      const spend = parseFloat(insights.spend || '0');
      const revenue = parseFloat(purchaseValue || '0');
      
      return {
        id: camp.id,
        name: camp.name,
        // Use effective_status if available, fallback to status
        status: camp.effective_status || camp.status,
        dailyBudget: parseInt(camp.daily_budget || '0') / 100, 
        metrics: {
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
        },
        history: [] 
      };
    });

    return campaigns;

  } catch (error) {
    console.error("Failed to fetch campaigns", error);
    throw error;
  }
};
