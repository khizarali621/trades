-- Add trade_type column to tds_trades table
-- This supports three trade types:
-- 'setup' = Following trading rules and setup (default)
-- 'mistake' = Minor mistake trade (2 mistakes locks session for the day)
-- 'random' = Random trade without setup (locks session immediately)

ALTER TABLE tds_trades 
ADD COLUMN IF NOT EXISTS trade_type TEXT DEFAULT 'setup';

-- Update existing trades to have 'setup' as default
UPDATE tds_trades 
SET trade_type = 'setup' 
WHERE trade_type IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN tds_trades.trade_type IS 'Type of trade: setup (default), mistake (2 locks session), random (immediate lock)';
