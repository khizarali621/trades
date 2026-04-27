-- =============================================
-- Fresh Schema with Username (Recommended for new setup)
-- =============================================
-- If you're setting up fresh, use this instead of the migration

-- Drop existing tables if you want to start fresh
-- DROP TABLE IF EXISTS public.tds_trades;
-- DROP TABLE IF EXISTS public.tds_state;

-- Main state table with username as primary key
CREATE TABLE IF NOT EXISTS public.tds_state (
  username text PRIMARY KEY,
  start_date date NOT NULL,
  current_day integer DEFAULT 1,
  total_pnl numeric(10,2) DEFAULT 0,
  total_capital numeric(10,2) DEFAULT 0,
  deposited_capital numeric(10,2) DEFAULT 0,
  max_deposit_percent numeric(3,2) DEFAULT 0.20,
  max_trade_percent numeric(3,2) DEFAULT 0.10,
  max_trade_percent_after_2_wins numeric(3,2) DEFAULT 0.20,
  win_profit_percent numeric(3,2) DEFAULT 0.70,
  streak integer DEFAULT 0,
  failed boolean DEFAULT false,
  failed_reason text,
  last_seen_date date,
  next_session_start timestamp with time zone,
  rewards jsonb DEFAULT '[]'::jsonb,
  history jsonb DEFAULT '[]'::jsonb,
  daily_session jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Trades table with username foreign key
CREATE TABLE IF NOT EXISTS public.tds_trades (
  id bigserial PRIMARY KEY,
  username text NOT NULL REFERENCES public.tds_state(username) ON DELETE CASCADE,
  day integer NOT NULL,
  trade_date date NOT NULL,
  trade_time timestamp with time zone NOT NULL,
  result text NOT NULL CHECK (result IN ('WIN', 'LOSS')),
  trade_amount numeric(10,2) NOT NULL,
  pnl numeric(10,2) NOT NULL,
  win_profit_percent numeric(3,2),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tds_trades_username ON public.tds_trades(username);
CREATE INDEX IF NOT EXISTS idx_tds_trades_date ON public.tds_trades(trade_date);
CREATE INDEX IF NOT EXISTS idx_tds_trades_username_date ON public.tds_trades(username, trade_date);

-- Enable RLS
ALTER TABLE public.tds_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_trades ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Allow all for now" ON public.tds_state;
DROP POLICY IF EXISTS "Allow all for now" ON public.tds_trades;

-- Create permissive policies (you can make these more restrictive later)
CREATE POLICY "Allow all for now" ON public.tds_state
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for now" ON public.tds_trades
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.tds_state;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.tds_state
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
