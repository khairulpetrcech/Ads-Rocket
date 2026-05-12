-- Meta API Proxy Audit Logs
CREATE TABLE IF NOT EXISTS meta_api_logs (
    id BIGSERIAL PRIMARY KEY,
    fb_id TEXT NOT NULL,
    graph_path TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_meta_api_logs_fb_id ON meta_api_logs(fb_id);
-- Index for time-based cleanup
CREATE INDEX IF NOT EXISTS idx_meta_api_logs_created_at ON meta_api_logs(created_at);

-- RLS: allow inserts from serverless (anon key)
ALTER TABLE meta_api_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert for all" ON meta_api_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select for all" ON meta_api_logs FOR SELECT USING (true);
