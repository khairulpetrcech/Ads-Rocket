-- Add is_allowed column to tracked_users table
-- Default true so existing users are not blocked
ALTER TABLE tracked_users ADD COLUMN IF NOT EXISTS is_allowed BOOLEAN NOT NULL DEFAULT true;

-- Index for fast lookup in meta-proxy
CREATE INDEX IF NOT EXISTS idx_tracked_users_is_allowed ON tracked_users(fb_id, is_allowed);
