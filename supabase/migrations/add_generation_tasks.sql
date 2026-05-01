-- Agentic Meta Ads workflow schema
-- Safe to run repeatedly. Do not drop generation history.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS generation_tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  task_type TEXT NOT NULL DEFAULT 'video',
  prompt TEXT,
  model TEXT,
  status TEXT DEFAULT 'not_started',
  file_url TEXT,
  fb_id TEXT,
  chat_id TEXT,
  source TEXT DEFAULT 'manual',
  approval_status TEXT DEFAULT 'pending',
  campaign_job_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE generation_tasks
  ADD COLUMN IF NOT EXISTS fb_id TEXT,
  ADD COLUMN IF NOT EXISTS chat_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS campaign_job_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_generation_tasks_type_created
  ON generation_tasks (task_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_tasks_chat_created
  ON generation_tasks (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_tasks_status
  ON generation_tasks (status, approval_status);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_id TEXT,
  chat_id TEXT,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_chat_created
  ON agent_runs (chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS uploaded_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_id TEXT,
  chat_id TEXT NOT NULL,
  telegram_file_id TEXT,
  file_name TEXT,
  mime_type TEXT,
  content_text TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_documents_chat_created
  ON uploaded_documents (chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generated_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code TEXT UNIQUE NOT NULL,
  fb_id TEXT,
  chat_id TEXT NOT NULL,
  generation_task_id TEXT UNIQUE,
  media_type TEXT NOT NULL,
  model TEXT,
  prompt TEXT,
  source TEXT DEFAULT 'agent',
  strategy JSONB DEFAULT '{}'::jsonb,
  file_url TEXT,
  telegram_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'generating',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  launched_at TIMESTAMPTZ,
  campaign_job_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_creatives_chat_created
  ON generated_creatives (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_creatives_task
  ON generated_creatives (generation_task_id);

CREATE INDEX IF NOT EXISTS idx_generated_creatives_approval
  ON generated_creatives (approval_status, status);

CREATE TABLE IF NOT EXISTS creative_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID REFERENCES generated_creatives(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_approvals_creative
  ON creative_approvals (creative_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_id TEXT,
  chat_id TEXT,
  memory_type TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_lookup
  ON agent_memory (chat_id, memory_type, key);

DO $$
BEGIN
  IF to_regclass('public.telegram_campaign_jobs') IS NOT NULL THEN
    ALTER TABLE telegram_campaign_jobs
      ADD COLUMN IF NOT EXISTS media_url TEXT,
      ADD COLUMN IF NOT EXISTS creative_id UUID,
      ADD COLUMN IF NOT EXISTS launch_source TEXT DEFAULT 'telegram';
  END IF;
END $$;

-- 30-day winning ads analysis memory.
-- Each Telegram analysis creates a new report row and new ad snapshot rows.
-- Same winning ad can appear every day and will still be stored as a new record.

CREATE TABLE IF NOT EXISTS winning_ads_analysis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_id TEXT,
  chat_id TEXT NOT NULL,
  telegram_message_id TEXT,
  ad_account_id TEXT NOT NULL,
  ad_account_name TEXT,
  source TEXT NOT NULL DEFAULT 'telegram',
  report_window TEXT DEFAULT 'last_7d',
  report_start_date DATE,
  report_end_date DATE,
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  summary_text TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winning_ads_reports_chat_created
  ON winning_ads_analysis_reports (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_winning_ads_reports_account_date
  ON winning_ads_analysis_reports (ad_account_id, analysis_date DESC);

CREATE TABLE IF NOT EXISTS winning_ads_analysis_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES winning_ads_analysis_reports(id) ON DELETE CASCADE,
  fb_id TEXT,
  chat_id TEXT NOT NULL,
  ad_account_id TEXT NOT NULL,
  ad_account_name TEXT,
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rank INTEGER,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  spend NUMERIC DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  cpa NUMERIC DEFAULT 0,
  ctr NUMERIC,
  cpc NUMERIC,
  cpm NUMERIC,
  impressions INTEGER,
  clicks INTEGER,
  media_type TEXT,
  video_id TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  creative_payload JSONB DEFAULT '{}'::jsonb,
  metrics_payload JSONB DEFAULT '{}'::jsonb,
  win_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winning_ads_items_chat_created
  ON winning_ads_analysis_items (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_winning_ads_items_ad_date
  ON winning_ads_analysis_items (ad_id, analysis_date DESC);

CREATE INDEX IF NOT EXISTS idx_winning_ads_items_account_date
  ON winning_ads_analysis_items (ad_account_id, analysis_date DESC, rank);

CREATE TABLE IF NOT EXISTS winning_ads_creative_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winning_ad_item_id UUID REFERENCES winning_ads_analysis_items(id) ON DELETE SET NULL,
  fb_id TEXT,
  chat_id TEXT NOT NULL,
  ad_account_id TEXT,
  ad_id TEXT,
  ad_name TEXT,
  media_id TEXT,
  media_type TEXT,
  analysis_model TEXT DEFAULT 'gemini-3-flash-preview',
  hook TEXT,
  visual_hook TEXT,
  storyline TEXT,
  emotion TEXT,
  cta TEXT,
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  winning_elements JSONB DEFAULT '{}'::jsonb,
  prompt_flow TEXT,
  suggested_prompt TEXT,
  analysis_text TEXT NOT NULL,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winning_ads_breakdowns_chat_created
  ON winning_ads_creative_breakdowns (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_winning_ads_breakdowns_ad_created
  ON winning_ads_creative_breakdowns (ad_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_winning_ads_breakdowns_item
  ON winning_ads_creative_breakdowns (winning_ad_item_id);

CREATE OR REPLACE VIEW winning_ads_last_30_days AS
SELECT
  item.*,
  report.report_window,
  report.report_start_date,
  report.report_end_date,
  report.summary_text
FROM winning_ads_analysis_items item
LEFT JOIN winning_ads_analysis_reports report
  ON report.id = item.report_id
WHERE item.created_at >= NOW() - INTERVAL '30 days';

CREATE OR REPLACE VIEW winning_ads_repeat_winners_30_days AS
SELECT
  chat_id,
  ad_account_id,
  ad_id,
  MAX(ad_name) AS ad_name,
  COUNT(*) AS times_won,
  COUNT(DISTINCT analysis_date) AS days_won,
  MIN(analysis_date) AS first_won_date,
  MAX(analysis_date) AS last_won_date,
  AVG(rank) AS avg_rank,
  AVG(roas) AS avg_roas,
  AVG(cpa) AS avg_cpa,
  SUM(purchases) AS total_purchases,
  SUM(spend) AS total_spend
FROM winning_ads_analysis_items
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY chat_id, ad_account_id, ad_id;

CREATE OR REPLACE FUNCTION cleanup_winning_ads_memory(retention_days INTEGER DEFAULT 30)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM winning_ads_creative_breakdowns
  WHERE created_at < NOW() - make_interval(days => retention_days);

  DELETE FROM winning_ads_analysis_reports
  WHERE created_at < NOW() - make_interval(days => retention_days);
END;
$$;
