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
