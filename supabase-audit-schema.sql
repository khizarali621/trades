-- Anti-Cheat: Immutable Audit Log
-- This table cannot be deleted or modified, only new records added

create table if not exists public.tds_audit_log (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  action text not null, -- 'TRADE', 'DEPOSIT', 'SETUP', 'SESSION_LOCKED'
  trade_result text, -- 'WIN' or 'LOSS'
  amount numeric(10,2),
  pnl numeric(10,2),
  day_number integer,
  deposited_capital_before numeric(10,2),
  deposited_capital_after numeric(10,2),
  consecutive_losses integer,
  consecutive_wins integer,
  session_status text,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.tds_audit_log enable row level security;

-- Allow INSERT only (no updates or deletes)
create policy "Allow insert only" on public.tds_audit_log
  for insert
  with check (true);

-- Allow SELECT for own records
create policy "Allow select own records" on public.tds_audit_log
  for select
  using (true);

-- Prevent DELETE and UPDATE at database level
create policy "Prevent delete" on public.tds_audit_log
  for delete
  using (false);

create policy "Prevent update" on public.tds_audit_log
  for update
  using (false);

-- Create index for faster queries
create index if not exists idx_audit_fingerprint on public.tds_audit_log(fingerprint);
create index if not exists idx_audit_created_at on public.tds_audit_log(created_at);

-- Add trigger to main table to log all trades
create or replace function public.log_trade_action()
returns trigger as $$
declare
  last_trade jsonb;
  day_session jsonb;
begin
  day_session := new.daily_session;
  
  if day_session is not null and jsonb_array_length(day_session->'trades') > 0 then
    last_trade := day_session->'trades'->-1;
    
    insert into public.tds_audit_log (
      fingerprint,
      action,
      trade_result,
      amount,
      pnl,
      day_number,
      deposited_capital_before,
      deposited_capital_after,
      consecutive_losses,
      consecutive_wins,
      session_status,
      metadata
    ) values (
      new.fingerprint,
      'TRADE',
      last_trade->>'result',
      (last_trade->>'tradeAmount')::numeric,
      (last_trade->>'pnl')::numeric,
      new.current_day,
      old.deposited_capital,
      new.deposited_capital,
      (day_session->>'consecutiveLosses')::integer,
      (day_session->>'consecutiveWins')::integer,
      day_session->>'status',
      jsonb_build_object(
        'total_pnl', new.total_pnl,
        'trade_time', last_trade->>'time'
      )
    );
  end if;
  
  return new;
end;
$$ language plpgsql;

create trigger log_trades_trigger
  after update on public.tds_state
  for each row
  when (old.daily_session is distinct from new.daily_session)
  execute function log_trade_action();

-- Function to detect tampering
create or replace function public.check_tampering(p_fingerprint text)
returns jsonb as $$
declare
  audit_count integer;
  state_trade_count integer;
  result jsonb;
begin
  -- Count audit log entries
  select count(*) into audit_count
  from public.tds_audit_log
  where fingerprint = p_fingerprint
    and action = 'TRADE';
  
  -- Count trades in state (history + current session)
  select 
    (
      coalesce(jsonb_array_length(history), 0) +
      coalesce(jsonb_array_length(daily_session->'trades'), 0)
    ) into state_trade_count
  from public.tds_state
  where fingerprint = p_fingerprint;
  
  result := jsonb_build_object(
    'audit_count', audit_count,
    'state_count', state_trade_count,
    'tampered', audit_count != state_trade_count,
    'message', case 
      when audit_count != state_trade_count then 
        'WARNING: Trade count mismatch detected. Database may have been tampered with.'
      else 
        'Integrity verified'
    end
  );
  
  return result;
end;
$$ language plpgsql;
