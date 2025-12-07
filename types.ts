
export enum AiProvider {
  FREE = 'FREE', // Simulation
  GEMINI = 'GEMINI', // Google Gemini
  CLAUDE = 'CLAUDE', // Anthropic Claude
  OPENAI = 'OPENAI', // OpenAI GPT
  OPENROUTER = 'OPENROUTER', // OpenRouter
}

// Mirrors the 'profiles' table in Supabase
export interface UserSettings {
  // Auth Info
  userId?: string;
  email?: string;
  
  // App State
  isConnected: boolean;
  businessName: string;
  
  // AI Config
  selectedAiProvider: AiProvider;
  selectedModel: string;
  apiKey: string; // Will be decrypted on load
  
  // Meta Config
  fbAppId: string;
  fbAccessToken: string;
  adAccountId: string;
  
  // UI Preferences
  dashboardViewMode?: 'SALES' | 'TRAFFIC';
  
  // Runtime Only (Not stored in DB profile usually, fetched fresh)
  availableAccounts: MetaAdAccount[]; 
}

export interface CommentItem {
  id: string;
  message: string;
  imageBase64?: string;
}

export interface CommentTemplate {
  id: string; // UUID from Supabase
  user_id?: string;
  name: string;
  items: CommentItem[]; // Stored as JSONB
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