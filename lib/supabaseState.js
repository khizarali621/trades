"use client";
import { getSupabaseClient } from './supabase';

const MAX_TRADES_PER_DAY = 10;

function isoDate(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
}

// Count distinct trading days from database
export async function countTradingDays(username) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tds_trades')
    .select('trade_date')
    .eq('username', username);
  
  if (error || !data) return 0;
  
  // Get unique dates
  const uniqueDates = new Set(data.map(t => t.trade_date));
  return uniqueDates.size;
}

// Fix all day numbers to match chronological order
export async function fixDayNumbers(username) {
  const supabase = getSupabaseClient();
  
  // Get all trades ordered by date
  const { data: trades, error } = await supabase
    .from('tds_trades')
    .select('*')
    .eq('username', username)
    .order('trade_time', { ascending: true });
  
  if (error || !trades || trades.length === 0) {
    console.error('Error fetching trades:', error);
    return { success: false, error };
  }

  // Group by unique dates and assign day numbers
  const dateMap = new Map();
  let currentDay = 1;
  
  trades.forEach(trade => {
    if (!dateMap.has(trade.trade_date)) {
      dateMap.set(trade.trade_date, currentDay);
      currentDay++;
    }
  });

  // Update each trade with correct day number
  const updates = [];
  for (const trade of trades) {
    const correctDay = dateMap.get(trade.trade_date);
    if (trade.day !== correctDay) {
      updates.push(
        supabase
          .from('tds_trades')
          .update({ day: correctDay })
          .eq('id', trade.id)
      );
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates);
    return { success: true, updated: updates.length, totalDays: dateMap.size };
  }

  return { success: true, updated: 0, totalDays: dateMap.size };
}

const DEFAULT_STATE = (todayStr, username) => ({
  username: username,
  start_date: todayStr,
  current_day: 1,
  total_pnl: 0,
  total_capital: 0,
  deposited_capital: 0,
  max_deposit_percent: 0.2,
  max_trade_percent: 0.1,
  max_trade_percent_after_2_wins: 0.2,
  win_profit_percent: 0.7,
  streak: 0,
  failed: false,
  failed_reason: null,
  last_seen_date: todayStr,
  next_session_start: null, // Timestamp when next session starts (null = can trade now)
  rewards: [],
  history: [],
  daily_session: {
    date: todayStr,
    trades: [],
    consecutiveLosses: 0,
    consecutiveWins: 0,
    status: 'ACTIVE'
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

// Get or create user session
export async function initSession() {
  const supabase = getSupabaseClient();
  
  // Try to get username from localStorage (persists across browser sessions)
  let username = null;
  if (typeof window !== 'undefined') {
    username = localStorage.getItem('tds_username');
  }
  
  if (!username) {
    // No username stored = user needs to setup
    return null;
  }

  // Try to fetch existing state
  const { data, error } = await supabase
    .from('tds_state')
    .select('*')
    .eq('username', username)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error fetching state:', error);
    return null;
  }

  const today = isoDate();

  // If no data exists, return null (setup needed)
  if (!data) {
    return null;
  }

  // Check if next_session_start has passed (time-based unlock)
  const now = new Date();
  if (data.next_session_start) {
    const nextStart = new Date(data.next_session_start);
    if (now >= nextStart) {
      // Time has passed, unlock new session
      const today = isoDate();

      // Calculate new day index based on actual trading days
      const tradingDays = await countTradingDays(data.username);
      const dayIndex = tradingDays + 1; // Next trading day

      // Check if past 30 trading days
      if (dayIndex > 30) {
        data.current_day = 30;
        data.daily_session.status = 'LOCKED';
        data.next_session_start = null;
        await saveState(data);
        return data;
      }

      // Start fresh session (trades are already in database)
      data.current_day = dayIndex;
      data.daily_session = {
        date: today,
        trades: [],
        consecutiveLosses: 0,
        consecutiveWins: 0,
        status: 'ACTIVE'
      };
      data.next_session_start = null; // Clear the lock
      data.last_seen_date = today;

      // Update rewards
      if (!data.rewards) data.rewards = [];
      if (dayIndex >= 5 && !data.rewards.includes('Bronze')) data.rewards.push('Bronze');
      if (dayIndex >= 10 && !data.rewards.includes('Silver')) data.rewards.push('Silver');
      if (dayIndex >= 20 && !data.rewards.includes('Gold')) data.rewards.push('Gold');
      if (dayIndex >= 30 && !data.rewards.includes('Legend')) data.rewards.push('Legend');

      await saveState(data);
      return data;
    }
  }

  // Ensure current_day reflects actual trading days (fix for existing users)
  const tradingDays = await countTradingDays(data.username);
  
  // Check if user has traded today
  const { data: todayTrades } = await supabase
    .from('tds_trades')
    .select('id')
    .eq('username', data.username)
    .eq('trade_date', today)
    .limit(1);
  
  const hasTradedToday = todayTrades && todayTrades.length > 0;
  
  // If traded today, check for locking conditions (random trade or 2+ minor mistakes)
  if (hasTradedToday) {
    const { data: todayTrades } = await supabase
      .from('tds_trades')
      .select('trade_type')
      .eq('username', data.username)
      .eq('trade_date', today);
    
    // Check for random trade
    const hasRandomTrade = todayTrades?.some(t => t.trade_type === 'random');
    
    // Check for 2+ minor mistakes
    const mistakeCount = todayTrades?.filter(t => t.trade_type === 'mistake').length || 0;
    
    if (hasRandomTrade || mistakeCount >= 2) {
      // Lock session until tomorrow
      data.daily_session.status = 'LOCKED';
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      data.next_session_start = tomorrow.toISOString();
      await saveState(data);
      return data;
    }
  }
  
  // If traded today, current_day = tradingDays
  // If not traded today yet, current_day = tradingDays + 1 (next day to trade)
  const correctDay = hasTradedToday ? tradingDays : tradingDays + 1;
  
  if (tradingDays > 0 && data.current_day !== correctDay) {
    data.current_day = correctDay;
    await saveState(data);
  }

  // Recalculate total_pnl from ALL trades in database to ensure accuracy
  const { data: allTrades } = await supabase
    .from('tds_trades')
    .select('pnl')
    .eq('username', data.username);
  
  if (allTrades) {
    data.total_pnl = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    data.total_pnl = +data.total_pnl.toFixed(2);
  }

  // Recalculate today's session from database trades
  const { data: todayTradesData } = await supabase
    .from('tds_trades')
    .select('*')
    .eq('username', data.username)
    .eq('trade_date', today)
    .order('trade_time', { ascending: true });
  
  if (todayTradesData) {
    // Reset and rebuild daily session from database
    data.daily_session = {
      date: today,
      trades: [],
      consecutiveLosses: 0,
      consecutiveWins: 0,
      status: 'ACTIVE'
    };
    
    let currentLossStreak = 0;
    let currentWinStreak = 0;
    
    todayTradesData.forEach(trade => {
      data.daily_session.trades.push({
        result: trade.result,
        pnl: trade.pnl,
        time: trade.trade_time,
        tradeAmount: trade.trade_amount,
        winProfitPercent: trade.win_profit_percent,
        description: trade.description || ''
      });
      
      if (trade.result === 'WIN') {
        currentWinStreak++;
        currentLossStreak = 0;
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
      }
    });
    
    data.daily_session.consecutiveWins = currentWinStreak;
    data.daily_session.consecutiveLosses = currentLossStreak;
    
    // Check all lock conditions
    const hasRandomTrade = todayTradesData.some(t => t.trade_type === 'random');
    const mistakeCount = todayTradesData.filter(t => t.trade_type === 'mistake').length;
    
    if (hasRandomTrade || mistakeCount >= 2 || currentLossStreak >= 2 || todayTradesData.length >= 10) {
      data.daily_session.status = 'LOCKED';
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      data.next_session_start = tomorrow.toISOString();
    }
  }

  return data;
}

// Create new state (initial setup)
export async function createInitialState(username, totalCapital, depositedCapital, winProfitPercent) {
  const supabase = getSupabaseClient();
  
  // Store username in localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('tds_username', username);
  }

  const today = isoDate();
  const state = DEFAULT_STATE(today, username);
  
  // Validate deposit
  const maxDep = totalCapital * 0.2;
  if (depositedCapital > maxDep) {
    depositedCapital = maxDep;
  }

  state.total_capital = Number(totalCapital);
  state.deposited_capital = Number(depositedCapital);
  state.win_profit_percent = Number(winProfitPercent);

  const { data, error } = await supabase
    .from('tds_state')
    .insert([state])
    .select()
    .single();

  if (error) {
    console.error('Error creating state:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    return null;
  }

  return data;
}

// Save state to Supabase
export async function saveState(state) {
  const supabase = getSupabaseClient();
  
  state.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('tds_state')
    .update(state)
    .eq('username', state.username)
    .select()
    .single();

  if (error) {
    console.error('Error saving state:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    return null;
  }

  return data;
}

// Add a trade
export async function addTrade(state, result, manualAmount, winProfitPercent = 0.7, description = '', tradeType = 'setup') {
  const supabase = getSupabaseClient();
  
  if (!state.daily_session) {
    state.daily_session = {
      date: isoDate(),
      trades: [],
      consecutiveLosses: 0,
      consecutiveWins: 0,
      status: 'ACTIVE'
    };
  }

  if (state.daily_session.status === 'LOCKED') {
    return state;
  }

  if (state.daily_session.trades.length >= MAX_TRADES_PER_DAY) {
    state.daily_session.status = 'LOCKED';
    return await saveState(state);
  }

  // Calculate trade amount
  let tradeAmount = manualAmount;
  if (!tradeAmount) {
    const consecutiveWins = state.daily_session.consecutiveWins || 0;
    const basePercent = 0.1;
    const maxPercent = consecutiveWins >= 2 ? 0.2 : basePercent;
    tradeAmount = (state.deposited_capital || 0) * maxPercent;
  }

  // Calculate PnL
  let pnl = 0;
  if (result === 'WIN') {
    pnl = +(tradeAmount * winProfitPercent).toFixed(2);
  } else {
    pnl = -Math.round(tradeAmount * 100) / 100;
  }

  const now = new Date();
  
  // Insert trade into trades table
  const { error: tradeError } = await supabase
    .from('tds_trades')
    .insert([{
      username: state.username,
      day: state.current_day,
      trade_date: isoDate(),
      trade_time: now.toISOString(),
      result: result,
      trade_amount: tradeAmount,
      pnl: pnl,
      win_profit_percent: winProfitPercent,
      description: description || '',
      trade_type: tradeType || 'setup'
    }]);

  if (tradeError) {
    console.error('Error saving trade:', tradeError);
    return null;
  }

  // Update session counters (keep in memory for UI)
  state.daily_session.trades.push({
    result,
    pnl,
    time: now.toISOString(),
    tradeAmount,
    winProfitPercent,
    description: description || ''
  });

  // Update total PnL
  state.total_pnl = +((state.total_pnl || 0) + pnl).toFixed(2);

  // Update consecutive wins/losses
  if (result === 'WIN') {
    state.daily_session.consecutiveLosses = 0;
    state.daily_session.consecutiveWins = (state.daily_session.consecutiveWins || 0) + 1;
  } else {
    state.daily_session.consecutiveWins = 0;
    state.daily_session.consecutiveLosses = (state.daily_session.consecutiveLosses || 0) + 1;
    if (state.daily_session.consecutiveLosses >= 2) {
      state.daily_session.status = 'LOCKED';
      // Set next session to start tomorrow at midnight
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      state.next_session_start = tomorrow.toISOString();
    }
  }

  // Lock if max trades reached
  if (state.daily_session.trades.length >= MAX_TRADES_PER_DAY) {
    state.daily_session.status = 'LOCKED';
    // Set next session to start tomorrow at midnight
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    state.next_session_start = tomorrow.toISOString();
  }

  // Check if this was a random trade (no setup) - lock session immediately
  if (tradeType === 'random') {
    state.daily_session.status = 'LOCKED';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    state.next_session_start = tomorrow.toISOString();
  }

  // Check if this was a minor mistake - count today's mistakes and lock if 2+
  if (tradeType === 'mistake') {
    const { data: mistakeTrades } = await supabase
      .from('tds_trades')
      .select('id')
      .eq('username', state.username)
      .eq('trade_date', isoDate())
      .eq('trade_type', 'mistake');
    
    if (mistakeTrades && mistakeTrades.length >= 2) {
      state.daily_session.status = 'LOCKED';
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      state.next_session_start = tomorrow.toISOString();
    }
  }

  return await saveState(state);
}

// Add new deposit (replaces current deposited capital, not cumulative)
export async function addDeposit(state, totalCapital, depositAmount) {
  const maxDep = totalCapital * 0.2;
  if (depositAmount > maxDep) {
    depositAmount = maxDep;
  }

  state.total_capital = Number(totalCapital);
  state.deposited_capital = Number(depositAmount); // FIXED amount, not added

  return await saveState(state);
}

// Update capital amounts (for live trading adjustments)
export async function updateCapital(state, totalCapital, depositedCapital) {
  state.total_capital = Number(totalCapital);
  state.deposited_capital = Number(depositedCapital);

  return await saveState(state);
}

// Update win profit percentage
export async function updateWinProfitPercent(state, percent) {
  state.win_profit_percent = Number(percent);
  return await saveState(state);
}

// Update an existing trade
export async function updateTrade(state, tradeId, newResult, newTradeAmount, newWinProfitPercent, newDescription = '', newDay = null) {
  const supabase = getSupabaseClient();
  
  // Get the original trade
  const { data: originalTrade, error: fetchError } = await supabase
    .from('tds_trades')
    .select('*')
    .eq('id', tradeId)
    .eq('username', state.username)
    .single();

  if (fetchError || !originalTrade) {
    console.error('Error fetching trade:', fetchError);
    return null;
  }

  // Calculate new PnL
  let newPnl = 0;
  if (newResult === 'WIN') {
    newPnl = +(newTradeAmount * newWinProfitPercent).toFixed(2);
  } else {
    newPnl = -Math.round(newTradeAmount * 100) / 100;
  }

  // Prepare update data
  const updateData = {
    result: newResult,
    trade_amount: newTradeAmount,
    pnl: newPnl,
    win_profit_percent: newWinProfitPercent,
    description: newDescription || ''
  };

  // Include day if provided
  if (newDay !== null && newDay > 0) {
    updateData.day = newDay;
  }

  // Update trade in database
  const { error: updateError } = await supabase
    .from('tds_trades')
    .update(updateData)
    .eq('id', tradeId);

  if (updateError) {
    console.error('Error updating trade:', updateError);
    return null;
  }

  // Recalculate state from all trades
  return await recalculateStateFromTrades(state);
}

// Manually end the session (lock it)
export async function endSession(state) {
  if (!state.daily_session) return state;
  
  state.daily_session.status = 'LOCKED';
  
  // Set next session to start tomorrow at midnight
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  state.next_session_start = tomorrow.toISOString();
  
  return await saveState(state);
}

// Delete a trade
export async function deleteTrade(state, tradeId) {
  const supabase = getSupabaseClient();
  
  // Delete from database
  const { error } = await supabase
    .from('tds_trades')
    .delete()
    .eq('id', tradeId)
    .eq('username', state.username);

  if (error) {
    console.error('Error deleting trade:', error);
    return null;
  }

  // Recalculate state from remaining trades
  return await recalculateStateFromTrades(state);
}

// Recalculate state from all trades in database
async function recalculateStateFromTrades(state) {
  const supabase = getSupabaseClient();
  
  // Fetch all trades for today
  const { data: todayTrades, error } = await supabase
    .from('tds_trades')
    .select('*')
    .eq('username', state.username)
    .eq('trade_date', isoDate())
    .order('trade_time', { ascending: true });

  if (error) {
    console.error('Error fetching trades:', error);
    return null;
  }

  // Reset daily session
  state.daily_session = {
    date: isoDate(),
    trades: [],
    consecutiveLosses: 0,
    consecutiveWins: 0,
    status: 'ACTIVE'
  };

  // Recalculate total PnL from ALL trades (not just today)
  const { data: allTrades } = await supabase
    .from('tds_trades')
    .select('pnl')
    .eq('username', state.username);

  state.total_pnl = allTrades ? allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) : 0;
  state.total_pnl = +state.total_pnl.toFixed(2);

  // Rebuild today's session from today's trades
  let currentLossStreak = 0;
  let currentWinStreak = 0;

  todayTrades.forEach(trade => {
    // Add to session trades
    state.daily_session.trades.push({
      result: trade.result,
      pnl: trade.pnl,
      time: trade.trade_time,
      tradeAmount: trade.trade_amount,
      winProfitPercent: trade.win_profit_percent,
      description: trade.description || ''
    });

    // Update streaks
    if (trade.result === 'WIN') {
      currentWinStreak++;
      currentLossStreak = 0;
    } else {
      currentLossStreak++;
      currentWinStreak = 0;
    }
  });

  state.daily_session.consecutiveWins = currentWinStreak;
  state.daily_session.consecutiveLosses = currentLossStreak;

  // Check lock conditions
  // 1. Check for random trade
  const hasRandomTrade = todayTrades.some(t => t.trade_type === 'random');
  
  // 2. Check for 2+ minor mistakes
  const mistakeCount = todayTrades.filter(t => t.trade_type === 'mistake').length;
  
  // 3. Check for 2+ consecutive losses
  // 4. Check for max trades reached
  
  if (hasRandomTrade || mistakeCount >= 2 || currentLossStreak >= 2 || state.daily_session.trades.length >= MAX_TRADES_PER_DAY) {
    state.daily_session.status = 'LOCKED';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    state.next_session_start = tomorrow.toISOString();
  } else {
    state.next_session_start = null;
  }

  return await saveState(state);
}
