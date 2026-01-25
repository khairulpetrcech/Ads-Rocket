import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGVkZ2FndWJqb2lsdWFncXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODgxNDgsImV4cCI6MjA4MDY2NDE0OH0.02A3J4zzTetBmLFUtEXngdkTV1NARHFcvUHAg6IVFjQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
