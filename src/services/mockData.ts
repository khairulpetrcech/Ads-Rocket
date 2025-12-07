import { AdCampaign } from '../types';

const generateHistory = (baseRoas: number, days: number) => {
  return Array.from({ length: days }).map((_, i) => ({
    date: new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    roas: Math.max(0.5, baseRoas + (Math.random() * 1 - 0.5)),
    spend: Math.floor(Math.random() * 50) + 20,
  }));
};

export const MOCK_CAMPAIGNS: AdCampaign[] = [
  {
    id: 'cam_1',
    name: 'Top Funnel - Broad - Interests',
    status: 'ACTIVE',
    dailyBudget: 100,
    objective: 'OUTCOME_SALES',
    metrics: {
      spend: 1250.00,
      revenue: 3125.00,
      roas: 2.5,
      impressions: 45000,
      clicks: 900,
      ctr: 2.0,
      cpc: 1.38,
      landingPageViews: 650,
      costPerLandingPageView: 1.92,
      purchases: 50,
      costPerPurchase: 25.00,
      results: 50,
      costPerResult: 25.00,
      inline_link_click_ctr: 1.5
    },
    history: generateHistory(2.5, 7)
  },
  {
    id: 'cam_2',
    name: 'Retargeting - ATC 30 Days',
    status: 'ACTIVE',
    dailyBudget: 50,
    objective: 'OUTCOME_SALES',
    metrics: {
      spend: 400.00,
      revenue: 1600.00,
      roas: 4.0,
      impressions: 12000,
      clicks: 400,
      ctr: 3.33,
      cpc: 1.00,
      landingPageViews: 350,
      costPerLandingPageView: 1.14,
      purchases: 32,
      costPerPurchase: 12.50,
      results: 32,
      costPerResult: 12.50,
      inline_link_click_ctr: 2.5
    },
    history: generateHistory(4.0, 7)
  },
  {
    id: 'cam_3',
    name: 'Scale - Lookalike 1%',
    status: 'ACTIVE',
    dailyBudget: 200,
    objective: 'OUTCOME_SALES',
    metrics: {
      spend: 1400.00,
      revenue: 1540.00,
      roas: 1.1,
      impressions: 60000,
      clicks: 800,
      ctr: 1.33,
      cpc: 1.75,
      landingPageViews: 400,
      costPerLandingPageView: 3.50,
      purchases: 22,
      costPerPurchase: 63.63,
      results: 22,
      costPerResult: 63.63,
      inline_link_click_ctr: 1.0
    },
    history: generateHistory(1.1, 7)
  },
  {
    id: 'cam_4',
    name: 'Creative Test - UGC Video',
    status: 'PAUSED',
    dailyBudget: 50,
    objective: 'OUTCOME_SALES',
    metrics: {
      spend: 150.00,
      revenue: 75.00,
      roas: 0.5,
      impressions: 5000,
      clicks: 50,
      ctr: 1.0,
      cpc: 3.00,
      landingPageViews: 20,
      costPerLandingPageView: 7.50,
      purchases: 1,
      costPerPurchase: 150.00,
      results: 1,
      costPerResult: 150.00,
      inline_link_click_ctr: 0.8
    },
    history: generateHistory(0.5, 7)
  }
];