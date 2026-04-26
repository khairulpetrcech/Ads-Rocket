-- Drop if exists (in case partially created)
DROP TABLE IF EXISTS generation_tasks;

-- Create generation_tasks table for tracking Poyo AI generation history
CREATE TABLE generation_tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  task_type TEXT NOT NULL DEFAULT 'video',
  prompt TEXT,
  model TEXT,
  status TEXT DEFAULT 'not_started',
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups by type and recency
CREATE INDEX idx_generation_tasks_type_created 
  ON generation_tasks (task_type, created_at DESC);
