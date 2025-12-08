
export enum AiProvider {
  FREE = 'FREE', 
  GEMINI = 'GEMINI', 
  CLAUDE = 'CLAUDE', 
  OPENAI = 'OPENAI', 
  OPENROUTER = 'OPENROUTER', 
}

export interface UserSettings {
  isConnected: boolean;
  businessName: string;
  selectedAiProvider: AiProvider;
  selectedModel: string;
  apiKey: string; 
  fbAppId: string;
  fbAccessToken: string;
  adAccountId: string;
  dashboardViewMode?: 'SALES' | 'TRAFFIC';
  availableAccounts: MetaAdAccount[]; 
}

export interface CommentItem {
  id: string;
  message: string;
  imageBase64?: string;
}

export interface CommentTemplate {
  id: string; 
  name: string;
  items: CommentItem[];
  created_at?: string;
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
  results: number;
  costPerResult: number;
  inline_link_click_ctr: number;
}

export interface BaseEntity {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'WITH_ISSUES' | 'IN_PROCESS';
  metrics: AdMetrics;
}

export interface AdCampaign extends BaseEntity {
  objective: string;
  dailyBudget: number;
  history: { date: string; roas: number; spend: number }[];
}

export interface AdSet extends BaseEntity {
  dailyBudget: number;
  campaign_id: string;
}

export interface Ad extends BaseEntity {
  adset_id: string;
  creative: {
    thumbnail_url?: string;
    image_url?: string;
    effective_object_story_id?: string;
  };
}

export interface AiAnalysisResult {
  summary: string;
  actionPlan: string[];
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string;
}