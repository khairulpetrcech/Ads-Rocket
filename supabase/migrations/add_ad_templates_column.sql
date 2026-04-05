-- Migration: Add ad_templates column to text_presets table
-- Run this in Supabase SQL Editor if ad_templates column does not exist

-- Add ad_templates column if missing
ALTER TABLE text_presets
ADD COLUMN IF NOT EXISTS ad_templates JSONB DEFAULT '[]'::jsonb;

-- Ensure unique constraint on fb_id exists (required for upsert to work correctly)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'text_presets_fb_id_key'
          AND conrelid = 'text_presets'::regclass
    ) THEN
        ALTER TABLE text_presets ADD CONSTRAINT text_presets_fb_id_key UNIQUE (fb_id);
    END IF;
END $$;
