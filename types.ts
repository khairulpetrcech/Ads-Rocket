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
  apiKey: string; // User provided key
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