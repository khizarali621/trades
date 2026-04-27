-- Backup your data regularly - Run this to export all your trades
-- Copy the results and save to a file

-- Full data export
SELECT 
  t.*,
  s.deposited_capital,
  s.total_capital
FROM tds_trades t
JOIN tds_state s ON t.username = s.username
ORDER BY t.trade_time DESC;

-- Summary export
SELECT 
  username,
  deposited_capital,
  total_capital,
  total_pnl,
  current_day,
  start_date,
  created_at
FROM tds_state;
