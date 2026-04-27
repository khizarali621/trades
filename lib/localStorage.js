"use client";
import { getSupabaseClient, isSupabaseConfigured } from './supabase';

// LocalStorage-backed state for Trading Discipline System (TDS)
const LS_KEY = 'tds_state_v1';

const DEFAULT_STATE = (todayStr, fingerprint) => ({
  startDate: todayStr,
  currentDay: 1,
  totalPnL: 0,
  // trading capital settings
  totalCapital: 1000,
  depositedCapital: 100, // must be <= 20% of totalCapital
  maxDepositPercent: 0.2,
  maxTradePercent: 0.1, // default 10% of deposited capital per trade
  maxTradePercentAfter2Wins: 0.2, // can increase to 20% after 2 consecutive wins
  winProfitPercent: 0.7, // default 70% profit on win
  dailySession: {
    date: todayStr,
    trades: [],
    consecutiveLosses: 0,
    status: 'ACTIVE'
  },
  history: [],
  rewards: [],
  streak: 0,
  failed: false,
  fingerprint: fingerprint,
  lastSeenDate: todayStr
});

function readRaw() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function save(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function isoDate(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
}

function genFingerprint() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'fp-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function initOrValidate() {
  if (typeof window === 'undefined') return null;
  const today = isoDate();
  const raw = readRaw();

  // Fresh install
  if (!raw) {
    const fp = genFingerprint();
    const s = DEFAULT_STATE(today, fp);
    save(s);
    return s;
  }

  // If there's a startDate but fingerprint missing -> FAILED (localStorage cleared or tampered)
  if (raw.startDate && !raw.fingerprint) {
    raw.failed = true;
    save(raw);
    return raw;
  }

  // Anti-cheat: detect system date moved backwards
  if (raw.lastSeenDate && today < raw.lastSeenDate) {
    raw.failed = true;
    save(raw);
    return raw;
  }

  // If day changed, roll to next day session(s)
  const start = new Date(raw.startDate);
  const sd = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const now = new Date();
  const daysElapsed = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - sd) / (1000*60*60*24));
  const dayIndex = daysElapsed + 1; // 1-based

  // If past 30 days, permanently lock (complete)
  if (dayIndex > 30) {
    raw.currentDay = 30;
    raw.dailySession = raw.dailySession || {};
    raw.dailySession.status = 'LOCKED';
    save(raw);
    return raw;
  }

  // If the stored dailySession date differs from today, finalize previous and start new
  if (!raw.dailySession || raw.dailySession.date !== today) {
    // finalize previous
    if (raw.dailySession) {
      const prev = raw.dailySession;
      // determine if previous day counts as successful (no market out)
      const success = prev.status !== 'LOCKED' && !raw.failed;
      if (success) {
        raw.streak = (raw.streak || 0) + 1;
      } else {
        raw.streak = 0;
      }
      raw.history = raw.history || [];
      raw.history.push(prev);
      // unlock rewards based on history success count
      const successCount = raw.history.filter(h => h.status !== 'LOCKED' && !raw.failed).length;
      const thresholds = [5,10,20,30];
      raw.rewards = raw.rewards || [];
      thresholds.forEach((t, idx) => {
        const names = ['Bronze','Silver','Gold','Legend'];
        if (successCount >= t && !raw.rewards.includes(names[idx])) raw.rewards.push(names[idx]);
      });
    }

    // start new session
    raw.currentDay = dayIndex;
    raw.dailySession = {
      date: today,
      trades: [],
      consecutiveLosses: 0,
      status: 'ACTIVE'
    };
  }

  // update last seen
  raw.lastSeenDate = today;
  save(raw);
  return raw;
}

export function getState() {
  return readRaw();
}

export function addTrade(result, manualAmount = null) {
  const s = readRaw();
  if (!s || s.failed) return s;
  if (!s.dailySession) return s;
  if (s.dailySession.status === 'LOCKED') return s;
  // enforce max trades per day
  s.dailySession.trades = s.dailySession.trades || [];
  const MAX_TRADES_PER_DAY = 10;
  if (s.dailySession.trades.length >= MAX_TRADES_PER_DAY) {
    s.dailySession.status = 'LOCKED';
    save(s);
    return s;
  }
  
  // Use manual amount if provided, otherwise calculate based on deposited capital
  let tradeAmount = manualAmount;
  if (!tradeAmount) {
    // Default is 10%, but after 2 consecutive wins can go up to 20%
    s.dailySession.consecutiveWins = s.dailySession.consecutiveWins || 0;
    const basePercent = s.maxTradePercent || 0.1;
    const maxPercent = s.dailySession.consecutiveWins >= 2 ? (s.maxTradePercentAfter2Wins || 0.2) : basePercent;
    tradeAmount = (s.depositedCapital || 0) * maxPercent;
  }

  let pnl = 0;
  if (result === 'WIN') pnl = +(tradeAmount * (s.winProfitPercent || 0.7)).toFixed(2);
  if (result === 'LOSS') pnl = -Math.round(tradeAmount*100)/100;

  s.dailySession.trades.push({ result, pnl, time: new Date().toISOString(), tradeAmount });
  s.totalPnL = +( (s.totalPnL || 0) + pnl ).toFixed(2);
  
  // Deduct trade amount from deposited capital (it's at risk)
  // On win, add back the trade amount plus profit
  // On loss, the amount is lost
  if (result === 'WIN') {
    s.depositedCapital = +((s.depositedCapital || 0) + pnl).toFixed(2);
  } else {
    s.depositedCapital = +((s.depositedCapital || 0) + pnl).toFixed(2); // pnl is negative
  }
  
  // Ensure deposited capital doesn't go negative
  if (s.depositedCapital < 0) s.depositedCapital = 0;

  if (result === 'WIN') {
    s.dailySession.consecutiveLosses = 0;
    s.dailySession.consecutiveWins = (s.dailySession.consecutiveWins || 0) + 1;
  } else {
    s.dailySession.consecutiveWins = 0;
    s.dailySession.consecutiveLosses = (s.dailySession.consecutiveLosses || 0) + 1;
    if (s.dailySession.consecutiveLosses >= 2) {
      s.dailySession.status = 'LOCKED';
    }
  }

  // if exceeded max trades after adding, lock
  if (s.dailySession.trades.length >= MAX_TRADES_PER_DAY) s.dailySession.status = 'LOCKED';

  save(s);
  return s;
}

// update capital / deposit settings with enforcement
export function setCapital(totalCapital, depositedCapital) {
  const s = readRaw() || {};
  
  // If this is a new deposit (adding more funds), add to existing deposited capital
  // Otherwise, this is initial setup
  const isAddingDeposit = s.totalCapital > 0 && s.depositedCapital !== undefined;
  
  s.totalCapital = Number(totalCapital) || s.totalCapital || 0;
  const maxDep = (s.maxDepositPercent || 0.2) * s.totalCapital;
  
  let newDeposit = Number(depositedCapital) || 0;
  if (newDeposit > maxDep) {
    newDeposit = +maxDep.toFixed(2);
  }
  
  if (isAddingDeposit) {
    // Add to existing deposited capital
    s.depositedCapital = +((s.depositedCapital || 0) + newDeposit).toFixed(2);
  } else {
    // Initial setup
    s.depositedCapital = newDeposit;
  }
  
  save(s);
  return s;
}

// Sync state to Supabase
export async function syncToSupabase() {
  if (typeof window === 'undefined') return { success: false, error: 'Not in browser' };
  
  const supabase = getSupabaseClient();
  console.log('🔄 Attempting Supabase sync...', { hasClient: !!supabase });
  
  if (!supabase) {
    console.warn('❌ Supabase not configured');
    return { success: false, error: 'Supabase not configured' };
  }
  
  const state = readRaw();
  if (!state) return { success: false, error: 'No state to sync' };
  
  console.log('📤 Syncing state:', { fingerprint: state.fingerprint, totalPnL: state.totalPnL });
  
  try {
    const { data, error } = await supabase
      .from('tds_state')
      .upsert({
        fingerprint: state.fingerprint,
        start_date: state.startDate,
        current_day: state.currentDay,
        total_pnl: state.totalPnL,
        total_capital: state.totalCapital,
        deposited_capital: state.depositedCapital,
        max_deposit_percent: state.maxDepositPercent,
        max_trade_percent: state.maxTradePercent,
        win_profit_percent: state.winProfitPercent,
        streak: state.streak,
        failed: state.failed,
        failed_reason: state.failedReason,
        last_seen_date: state.lastSeenDate,
        rewards: state.rewards,
        history: state.history,
        daily_session: state.dailySession
      }, {
        onConflict: 'fingerprint'
      });
    
    if (error) {
      console.error('❌ Supabase sync error:', error);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Supabase sync successful!', data);
    return { success: true, data };
  } catch (e) {
    console.error('❌ Supabase sync exception:', e);
    return { success: false, error: e.message };
  }
}

// Load state from Supabase (optional - for cross-device sync)
export async function loadFromSupabase(fingerprint) {
  if (typeof window === 'undefined') return null;
  
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('tds_state')
      .select('*')
      .eq('fingerprint', fingerprint)
      .single();
    
    if (error || !data) return null;
    
    // Map DB columns back to state structure
    const state = {
      fingerprint: data.fingerprint,
      startDate: data.start_date,
      currentDay: data.current_day,
      totalPnL: Number(data.total_pnl),
      totalCapital: Number(data.total_capital),
      depositedCapital: Number(data.deposited_capital),
      maxDepositPercent: Number(data.max_deposit_percent),
      maxTradePercent: Number(data.max_trade_percent),
      winProfitPercent: Number(data.win_profit_percent),
      streak: data.streak,
      failed: data.failed,
      failedReason: data.failed_reason,
      lastSeenDate: data.last_seen_date,
      rewards: data.rewards || [],
      history: data.history || [],
      dailySession: data.daily_session
    };
    
    return state;
  } catch (e) {
    console.error('Load from Supabase error:', e);
    return null;
  }
}

export function setWinProfitPercent(pct) {
  const s = readRaw() || {};
  s.winProfitPercent = Number(pct) || s.winProfitPercent || 0.7;
  save(s);
  return s;
}

export function markFailed(reason) {
  const s = readRaw() || {};
  s.failed = true;
  s.failedReason = reason || 'anti-cheat';
  save(s);
  return s;
}

export function lockToday() {
  const s = readRaw();
  if (!s) return s;
  s.dailySession = s.dailySession || {};
  s.dailySession.status = 'LOCKED';
  save(s);
  return s;
}

export function getRewards() {
  const s = readRaw();
  return (s && s.rewards) || [];
}

export function isCompleted() {
  const s = readRaw();
  if (!s) return false;
  return s.currentDay >= 30 && (new Date(isoDate()) > new Date(s.startDate));
}

export default { initOrValidate, getState, addTrade, markFailed, lockToday, getRewards };
