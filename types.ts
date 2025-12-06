
export enum AiProvider {
  FREE = 'FREE', // Simulation
  GEMINI = 'GEMINI', // Google Gemini
  CLAUDE = 'CLAUDE', // Anthropic Claude
  OPENAI = 'OPENAI', // OpenAI GPT
  OPENROUTER = 'OPENROUTER', // OpenRouter
}

export interface UserSettings {
  isConnected: boolean;
  businessName: string;
  selectedAiProvider: AiProvider;
  selectedModel: string; // Specific model version
  apiKey: string; // User provided key for AI
  // Meta Configuration
  fbAppId: string;
  fbAccessToken: string;
  adAccountId: string;
  availableAccounts: MetaAdAccount[]; // List of all accounts user can access
  // UI Preferences
  dashboardViewMode?: 'SALES' | 'TRAFFIC';
}

export interface CommentTemplate {
  id: string;
  name: string;
  message: string;
  imageBase64?: string;
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
  // New Metrics for Traffic/Leads
  results: number; // Messaging conversations, Leads, or Link Clicks
  costPerResult: number;
  inline_link_click_ctr: number; // CTR (Link Click-through)
}

export interface BaseEntity {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'WITH_ISSUES' | 'IN_PROCESS';
  metrics: AdMetrics;
}

export interface AdCampaign extends BaseEntity {
  objective: string; // OUTCOME_SALES, OUTCOME_TRAFFIC, etc.
  dailyBudget: number;
  history: { date: string; roas: number; spend: number }[]; // For charts
}

export interface AdSet extends BaseEntity {
  dailyBudget: number; // Ad Sets can also have budgets if CBO is off, or just for reference
  campaign_id: string;
}

export interface Ad extends BaseEntity {
  adset_id: string;
  creative: {
    thumbnail_url?: string;
    image_url?: string;
    effective_object_story_id?: string; // For linking to the post
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