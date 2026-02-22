
export enum AiProvider {
  FREE = 'FREE', // Simulation
  GEMINI = 'GEMINI', // Google Gemini
  CLAUDE = 'CLAUDE', // Anthropic Claude
  OPENAI = 'OPENAI', // OpenAI GPT
  OPENROUTER = 'OPENROUTER', // OpenRouter
}

// Local Settings Interface
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
  fbTokenExpiresAt?: string; // ISO date string for long-lived token expiry
  adAccountId: string;

  // Telegram Config
  telegramBotToken?: string;
  telegramChatId?: string;

  // UI Preferences
  dashboardViewMode?: 'SALES' | 'TRAFFIC';

  // Rapid Creator Defaults
  defaultWebsiteUrl?: string;
  defaultPageId?: string;
  defaultPixelId?: string;

  // Runtime Only
  availableAccounts: MetaAdAccount[];
  // Text Presets
  presetPrimaryTexts?: string[];
  presetHeadlines?: string[];
  presetPrimaryTextNames?: string[];
  presetHeadlineNames?: string[];
  adTemplates?: AdTemplate[];

  // Naming Convention Templates
  namingCampaign?: string;
  namingAdSet?: string;
  namingAd?: string;
}

export interface AdTemplate {
  id: string;
  name: string;
  timestamp?: string;
  campaign: {
    name: string;
    objective: string;
    dailyBudget: number;
    selectionType: 'NEW' | 'EXISTING';
    campaignId?: string;
  };
  adSet: {
    name: string;
    dailyBudget: number;
    targeting: 'BROAD' | 'CUSTOM';
    country: string;
    ageMin: number;
    ageMax: number;
    gender: 'ALL' | 'MALE' | 'FEMALE';
    interests: string[];
    enhancementPlus?: boolean;
    scheduleEnabled?: boolean;
    scheduleStartDate?: string;
    scheduleStartTime?: string;
  };
  ads: Array<{
    type: 'image' | 'video';
    adName: string;
    primaryText: string;
    headline: string;
    description: string;
    cta: string;
  }>;
  config?: {
    pageId: string;
    pixelId: string;
    url: string;
  };
}

export interface AdvantagePlusConfig {
  enabled: boolean;
  visualTouchups: boolean;
  textOptimizations: boolean;
  mediaCropping: boolean;
  music: boolean;
}

export interface GlobalProcess {
  active: boolean;
  name: string; // e.g., "Creating Campaign"
  message: string; // e.g., "Uploading Video..."
  type: 'CAMPAIGN_CREATION' | 'VIDEO_GENERATION' | 'IMAGE_GENERATION' | 'NONE';
  progress?: number; // 0-100
  uuid?: string; // For tracking generation status
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

export interface LayoutContextType {
  launchCommentSession: (ad: Ad, template: CommentTemplate) => void;
}

export interface AdMetrics {
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  frequency: number;
  landingPageViews: number;
  costPerLandingPageView: number;
  purchases: number;
  costPerPurchase: number;
  results: number;
  costPerResult: number;
  inline_link_click_ctr: number;
  totalLeads: number;
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

// Admin Dashboard Types
export interface TrackedUser {
  fbId: string;
  fbName: string;
  profilePicture: string;
  connectedAt: string;
  tokenExpiresAt?: string;
  adAccountId: string;
  adAccountName: string;
  lastActive: string;
  campaignCount?: number;
}

export interface TrackedCampaign {
  id: string;
  fbUserId: string;
  fbUserName: string;
  campaignName: string;
  objective: string;
  mediaType: 'IMAGE' | 'VIDEO';
  adAccountId: string;
  createdAt: string;
}

// AI Assistant Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AssistantContext {
  campaigns?: AdCampaign[];
  ads?: Ad[];
  uncategorizedCreatives?: any[];
}
