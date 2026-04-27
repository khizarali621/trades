-- Trading Discipline System - Supabase Schema

-- Create tds_state table to store user state
create table if not exists public.tds_state (
  fingerprint text primary key,
  start_date date,
  current_day integer,
  total_pnl numeric(10,2),
  total_capital numeric(10,2),
  deposited_capital numeric(10,2),
  max_deposit_percent numeric(3,2) default 0.20,
  max_trade_percent numeric(3,2) default 0.10,
  max_trade_percent_after_2_wins numeric(3,2) default 0.20,
  win_profit_percent numeric(3,2) default 0.70,
  streak integer default 0,
  failed boolean default false,
  failed_reason text,
  last_seen_date date,
  next_session_start timestamp with time zone,
  rewards jsonb default '[]'::jsonb,
  history jsonb default '[]'::jsonb,
  daily_session jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable Row Level Security
alter table public.tds_state enable row level security;

-- Create policy to allow all operations for now (refine based on your auth setup)
create policy "Allow all for now" on public.tds_state
  for all
  using (true)
  with check (true);

-- Create updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.tds_state
  for each row
  execute function handle_updated_at();
