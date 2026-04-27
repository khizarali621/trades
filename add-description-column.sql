-- Add description column to tds_trades table
-- Run this in your Supabase SQL Editor

ALTER TABLE public.tds_trades 
ADD COLUMN IF NOT EXISTS description text;

-- Optional: Add index if you plan to search by description
-- CREATE INDEX IF NOT EXISTS idx_tds_trades_description ON public.tds_trades USING gin(to_tsvector('english', description));
