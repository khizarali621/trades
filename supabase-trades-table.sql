-- Create trades table for proper data storage
CREATE TABLE IF NOT EXISTS public.tds_trades (
  id bigserial PRIMARY KEY,
  fingerprint text NOT NULL,
  day integer NOT NULL,
  trade_date date NOT NULL,
  trade_time timestamp with time zone NOT NULL,
  result text NOT NULL CHECK (result IN ('WIN', 'LOSS')),
  trade_amount numeric(10,2) NOT NULL,
  pnl numeric(10,2) NOT NULL,
  win_profit_percent numeric(3,2),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Create indexes for better query performance
CREATE INDEX idx_tds_trades_fingerprint ON public.tds_trades(fingerprint);
CREATE INDEX idx_tds_trades_date ON public.tds_trades(trade_date);
CREATE INDEX idx_tds_trades_fingerprint_date ON public.tds_trades(fingerprint, trade_date);

-- Enable RLS
ALTER TABLE public.tds_trades ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Allow all for now" ON public.tds_trades
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add foreign key reference to tds_state
ALTER TABLE public.tds_trades 
  ADD CONSTRAINT fk_tds_trades_fingerprint 
  FOREIGN KEY (fingerprint) 
  REFERENCES public.tds_state(fingerprint) 
  ON DELETE CASCADE;
