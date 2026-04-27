-- =============================================
-- Migration: Change from fingerprint to username
-- =============================================

-- Step 1: Drop existing foreign key constraint on tds_trades
ALTER TABLE public.tds_trades 
  DROP CONSTRAINT IF EXISTS fk_tds_trades_fingerprint;

-- Step 2: Add username column to tds_state (if not exists)
ALTER TABLE public.tds_state 
  ADD COLUMN IF NOT EXISTS username text;

-- Step 3: Make username unique and set it as the new primary key
-- First, drop the old primary key
ALTER TABLE public.tds_state 
  DROP CONSTRAINT IF EXISTS tds_state_pkey;

-- Create unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS tds_state_username_key ON public.tds_state(username);

-- Set username as primary key
ALTER TABLE public.tds_state 
  ADD PRIMARY KEY (username);

-- Step 4: Drop fingerprint column from tds_state (after migration)
-- ALTER TABLE public.tds_state DROP COLUMN IF EXISTS fingerprint;

-- Step 5: Add username column to tds_trades (if not exists)
ALTER TABLE public.tds_trades 
  ADD COLUMN IF NOT EXISTS username text;

-- Step 6: Drop fingerprint column from tds_trades (after migration)
-- ALTER TABLE public.tds_trades DROP COLUMN IF EXISTS fingerprint;

-- Step 7: Create new foreign key constraint
ALTER TABLE public.tds_trades 
  ADD CONSTRAINT fk_tds_trades_username 
  FOREIGN KEY (username) 
  REFERENCES public.tds_state(username) 
  ON DELETE CASCADE;

-- Step 8: Create index on username in tds_trades for performance
DROP INDEX IF EXISTS idx_tds_trades_fingerprint;
CREATE INDEX IF NOT EXISTS idx_tds_trades_username ON public.tds_trades(username);

-- Step 9: Update composite index
DROP INDEX IF EXISTS idx_tds_trades_fingerprint_date;
CREATE INDEX IF NOT EXISTS idx_tds_trades_username_date ON public.tds_trades(username, trade_date);

-- =============================================
-- IMPORTANT: After running this migration
-- =============================================
-- 1. All existing data will be lost (fingerprint can't convert to username)
-- 2. Users need to create new accounts with usernames
-- 3. Consider backing up data before running this migration
-- 4. Uncomment the DROP COLUMN statements above after confirming migration works
