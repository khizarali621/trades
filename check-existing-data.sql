-- Run this in Supabase SQL Editor to check if your data exists
-- After unpausing your project

-- Check if tds_state table has data
SELECT * FROM tds_state LIMIT 10;

-- Check if tds_trades table has data
SELECT * FROM tds_trades LIMIT 10;

-- Count total trades
SELECT COUNT(*) as total_trades FROM tds_trades;

-- See all usernames
SELECT username, created_at, deposited_capital, total_pnl 
FROM tds_state 
ORDER BY created_at DESC;
