export enum AiProvider {
  FREE = 'FREE', // OpenRouter/Free Tier Simulation
  GEMINI = 'GEMINI',
  OPENAI = 'OPENAI',
  CLAUDE = 'CLAUDE'
}

export interface UserSettings {
  isConnected: boolean;
  businessName: string;
  selectedAiProvider: AiProvider;
}

export interface AdMetrics {
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  landingPageViews: number;
  costPerLandingPageView: number;
  purchases: number;
  costPerPurchase: number;
}

export interface AdCampaign {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  dailyBudget: number;
  metrics: AdMetrics;
  history: { date: string; roas: number; spend: number }[]; // For charts
}

export interface AiAnalysisResult {
  summary: string;
  actionPlan: string[];
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
}