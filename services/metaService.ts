import { AdCampaign, MetaAdAccount } from '../types';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

// Initialize the SDK
export const initFacebookSdk = (appId: string): Promise<void> => {
  return new Promise((resolve) => {
    if (window.FB) {
      resolve();
      return;
    }

    window.fbAsyncInit = function() {
      window.FB.init({
        appId      : appId,
        cookie     : true,
        xfbml      : true,
        version    : 'v19.0'
      });
      resolve();
    };
  });
};

// Login and request permissions
export const loginWithFacebook = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!window.FB) return reject("Facebook SDK not loaded");

    window.FB.login((response: any) => {
      if (response.authResponse) {
        resolve(response.authResponse.accessToken);
      } else {
        reject("User cancelled login or did not fully authorize.");
      }
    }, { 
      // Request permissions to read ads and insights
      scope: 'public_profile,email,ads_read,read_insights,ads_management' 
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

// Fetch Campaigns and Insights for a specific Account
export const getRealCampaigns = async (adAccountId: string, accessToken: string): Promise<AdCampaign[]> => {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  
  // Fields to fetch: Name, Status, Budget + Insights (Spend, Impressions, Clicks, Actions for Purchases)
  const fields = [
    'id', 'name', 'status', 'daily_budget',
    'insights.date_preset(maximum){spend,impressions,clicks,cpc,ctr,actions,action_values}'
  ].join(',');

  try {
    const url = `https://graph.facebook.com/v19.0/${accountId}/campaigns?fields=${fields}&access_token=${accessToken}&limit=50`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    
    // Transform Graph API data to our App's format
    const campaigns: AdCampaign[] = data.data.map((camp: any) => {
      const insights = camp.insights?.data?.[0] || {};
      
      // Calculate Purchases and Revenue from 'actions' array
      const purchaseAction = insights.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0;
      const purchaseValue = insights.action_values?.find((a: any) => a.action_type === 'purchase_value')?.value || 0;
      const landingPageViews = insights.actions?.find((a: any) => a.action_type === 'landing_page_view')?.value || 0;
      
      const spend = parseFloat(insights.spend || '0');
      const revenue = parseFloat(purchaseValue || '0');
      
      return {
        id: camp.id,
        name: camp.name,
        status: camp.status,
        dailyBudget: parseInt(camp.daily_budget || '0') / 100, // Meta gives budget in cents usually, but API v19 might be local currency. Assuming standard.
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
        // We simulate history for now as fetching daily breakdown for every campaign requires individual calls
        history: [] 
      };
    });

    return campaigns;

  } catch (error) {
    console.error("Failed to fetch campaigns", error);
    throw error;
  }
};
