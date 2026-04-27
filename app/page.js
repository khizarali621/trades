"use client";
import React, { useEffect, useState } from 'react';
import { initSession, createInitialState, addTrade as addTradeToSupabase, addDeposit, updateWinProfitPercent, updateTrade, endSession, updateCapital, countTradingDays, deleteTrade } from '../lib/supabaseState';
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabase';

export default function Page() {
  const [state, setState] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('setup');

  useEffect(() => {
    async function loadState() {
      if (!isSupabaseConfigured()) {
        alert('Supabase is not configured. Please add your credentials to .env.local');
        setReady(true);
        setLoading(false);
        return;
      }

      const s = await initSession();
      setState(s);
      
      // Show setup if: no state OR no capital set OR deposited capital is depleted
      if (!s || s.total_capital <= 0 || s.deposited_capital <= 0) {
        setCurrentPage('setup');
      } else {
        setCurrentPage('trading');
      }
      
      setReady(true);
      setLoading(false);
    }
    
    loadState();
  }, []);

  if (loading || !ready) {
    return (
      <main className="p-6 min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </main>
    );
  }

  if (currentPage === 'setup') {
    return <SetupPage state={state} setState={setState} setCurrentPage={setCurrentPage} />;
  }

  return <TradingPage state={state} setState={setState} setCurrentPage={setCurrentPage} />;
}

function SetupPage({ state, setState, setCurrentPage }) {
  const [username, setUsername] = useState('');
  const [totalCap, setTotalCap] = useState('');
  const [depositCap, setDepositCap] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const maxDeposit = totalCap ? (Number(totalCap) * 0.2).toFixed(2) : '0';
  const isInitialSetup = !state || !state.total_capital || state.total_capital <= 0;

  async function handleSave() {
    const total = Number(totalCap);
    const deposit = Number(depositCap);
    
    if (!username || username.trim().length < 3) {
      setError('Enter username (at least 3 characters)');
      return;
    }
    
    setError('');
    setSaving(true);

    try {
      // First, check if username already exists
      const { getSupabaseClient } = await import('../lib/supabase');
      const supabase = getSupabaseClient();
      const { data: existingUser } = await supabase
        .from('tds_state')
        .select('*')
        .eq('username', username.trim())
        .single();

      if (existingUser) {
        // Username exists - load existing account
        if (typeof window !== 'undefined') {
          localStorage.setItem('tds_username', username.trim());
        }
        setState(existingUser);
        setCurrentPage('trading');
        return;
      }

      // Username doesn't exist - create new account
      if (!total || total <= 0) {
        setError('Enter valid total capital');
        setSaving(false);
        return;
      }
      
      const maxDep = total * 0.2;
      if (deposit > maxDep) {
        setError(`Max deposit is ${maxDep.toFixed(2)} (20% of total)`);
        setSaving(false);
        return;
      }

      if (!deposit || deposit <= 0) {
        setError('Enter valid deposited capital');
        setSaving(false);
        return;
      }

      let newState;
      if (isInitialSetup) {
        // Create new state (default 70% win profit)
        newState = await createInitialState(username.trim(), total, deposit, 0.7);
      } else {
        // Add deposit to existing state (FIXED - not cumulative)
        newState = await addDeposit(state, total, deposit);
      }
      
      if (newState) {
        setState(newState);
        setCurrentPage('trading');
      } else {
        console.error('createInitialState or addDeposit returned null');
        setError('Failed to save. Check console for details.');
      }
    } catch (err) {
      console.error('Error saving:', err);
      setError(`Error: ${err.message || 'Database error'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 min-h-screen flex flex-col items-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {isInitialSetup ? 'Login or Create Account' : 'Add Deposit'}
          </h1>
          <p className="text-gray-600 mt-2">
            {isInitialSetup 
              ? 'Enter your username to login, or create a new account' 
              : 'Your funds are depleted. Add a new deposit to continue trading'}
          </p>
        </div>

        <div className="card space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="input-field"
              maxLength="30"
            />
            <p className="text-xs text-gray-500 mt-1">
              Existing user? Just enter your username to login. New user? Fill in all fields to create account.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total Capital
            </label>
            <input
              type="number"
              step="0.01"
              value={totalCap}
              onChange={(e) => setTotalCap(e.target.value)}
              placeholder="e.g., 10000"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">Your total available trading capital</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Deposited Capital (Max: {maxDeposit})
            </label>
            <input
              type="number"
              step="0.01"
              value={depositCap}
              onChange={(e) => setDepositCap(e.target.value)}
              placeholder="e.g., 2000"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum 20% of total capital • This amount stays FIXED</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="card bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-gray-900 mb-2">Trading Rules</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Max deposit: 20% of total capital (FIXED amount)</li>
              <li>• Trade amount: Max 10% of deposited capital</li>
              <li>• After 2 consecutive wins: Can increase to 20% of deposited</li>
              <li>• Win profit: Choose 70% or 80% per trade</li>
              <li>• 2 consecutive losses = session locked</li>
              <li>• Max 10 trades per day</li>
            </ul>
          </div>

          <button 
            onClick={handleSave}
            className="btn-primary w-full"
            disabled={saving}
          >
            {saving ? 'Loading...' : 'Continue'}
          </button>
        </div>
      </div>
    </main>
  );
}

function TradingPage({ state, setState, setCurrentPage }) {
  const consecutiveWins = (state.daily_session?.consecutiveWins || 0);
  const maxTradePercent = consecutiveWins >= 2 ? 0.2 : 0.1;
  const defaultTradeAmount = ((state.deposited_capital || 0) * maxTradePercent).toFixed(2);
  
  const [tradeAmount, setTradeAmount] = useState(defaultTradeAmount);
  const [winProfitPct, setWinProfitPct] = useState('80');
  const [tradeError, setTradeError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [todayTrades, setTodayTrades] = useState([]);
  const [description, setDescription] = useState('');
  const [tradeType, setTradeType] = useState(''); // '' = not selected, 'setup', 'random', or 'mistake'
  const [editingCapital, setEditingCapital] = useState(false);
  const [editTotalCapital, setEditTotalCapital] = useState('');
  const [editDepositedCapital, setEditDepositedCapital] = useState('');

  // Fetch today's trades from database (with IDs for editing)
  const fetchTodayTrades = React.useCallback(async () => {
    if (!state?.username) return;
    
    const supabase = getSupabaseClient();
    const today = new Date();
    const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0,10);
    
    const { data, error } = await supabase
      .from('tds_trades')
      .select('*')
      .eq('username', state.username)
      .eq('trade_date', todayStr)
      .order('trade_time', { ascending: true });

    if (!error && data) {
      setTodayTrades(data);
    }
  }, [state?.username]);

  React.useEffect(() => {
    fetchTodayTrades();
  }, [fetchTodayTrades, state.daily_session?.trades?.length]);

  const todaySession = state.daily_session || { trades: [], consecutiveLosses:0, consecutiveWins:0, status:'ACTIVE' };
  
  // Calculate today's P&L from actual database trades (todayTrades), not from state
  const todayPnL = (todayTrades || []).reduce((s,t) => s + (t.pnl||0), 0).toFixed(2);
  
  const totalPnL = (state.total_pnl || 0).toFixed(2);
  const lockedToday = todaySession.status === 'LOCKED';
  const dayNumber = state.current_day || 1;
  const maxTradesLeft = Math.max(0, 10 - (todayTrades || []).length); // Use database count
  const consecutiveLosses = todaySession.consecutiveLosses || 0;
  const maxPerTrade = ((state.deposited_capital || 0) * maxTradePercent).toFixed(2);
  
  // Weekend check (Friday, Saturday, Sunday)
  const todayDayOfWeek = new Date().getDay();
  const isWeekend = todayDayOfWeek === 0 || todayDayOfWeek === 5 || todayDayOfWeek === 6;
  
  // Target tracking (50% of deposited capital)
  const targetAmount = ((state.deposited_capital || 0) * 0.5).toFixed(2);
  const targetReached = parseFloat(todayPnL) >= parseFloat(targetAmount);
  
  // Update default trade amount when consecutive wins change
  React.useEffect(() => {
    setTradeAmount(defaultTradeAmount);
  }, [defaultTradeAmount]);
  
  // Check if session is from a previous date
  const getTodayDate = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
  };
  const todayDate = getTodayDate();
  const sessionDate = todaySession.date || todayDate;
  const isOldSession = sessionDate !== todayDate && (todaySession.trades || []).length > 0;
  
  // Determine lock reason
  const lockReason = consecutiveLosses >= 2 ? 'losses' : 'max_trades';

  async function startNewSession() {
    setProcessing(true);
    try {
      const getTodayDate = () => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
      };
      
      // Manually trigger new session by clearing next_session_start and reloading
      state.next_session_start = null;
      state.daily_session = {
        date: getTodayDate(),
        trades: [],
        consecutiveLosses: 0,
        consecutiveWins: 0,
        status: 'ACTIVE'
      };
      
      // Calculate new day based on actual trading days
      const tradingDays = await countTradingDays(state.username);
      state.current_day = tradingDays + 1; // Next trading day
      
      const { saveState } = await import('../lib/supabaseState');
      const newState = await saveState(state);
      if (newState) {
        setState(newState);
      }
    } catch (err) {
      console.error('Error starting new session:', err);
    } finally {
      setProcessing(false);
    }
  }

  async function doTrade(result) {
    // Block weekend trading (Friday, Saturday, Sunday)
    const today = new Date().getDay();
    const isWeekend = today === 0 || today === 5 || today === 6;
    if (isWeekend) {
      setTradeError('Trading is closed on weekends (Friday-Sunday)');
      return;
    }
    
    if (lockedToday) return;
    if ((todaySession.trades || []).length >= 10) return;
    
    // Trade type is now required
    if (!tradeType) {
      setTradeError('⚠️ Select trade type: Setup, Random, or Minor Mistake');
      return;
    }
    
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) {
      setTradeError('Enter valid amount');
      return;
    }
    
    const maxAllowed = parseFloat(maxPerTrade);
    if (amount > maxAllowed) {
      const pct = consecutiveWins >= 2 ? '20' : '10';
      setTradeError(`Max ${maxAllowed} (${pct}% of deposited capital)`);
      return;
    }
    
    setTradeError('');
    setProcessing(true);

    try {
      const winProfit = Number(winProfitPct) / 100;
      const newState = await addTradeToSupabase(state, result, amount, winProfit, description.trim(), tradeType);
      if (newState) {
        setState(newState);
        // Reset to 10% or 20% based on new consecutive wins
        const newConsecutiveWins = newState.daily_session?.consecutiveWins || 0;
        const newMaxPercent = newConsecutiveWins >= 2 ? 0.2 : 0.1;
        const newDefaultAmount = ((newState.deposited_capital || 0) * newMaxPercent).toFixed(2);
        setTradeAmount(newDefaultAmount);
        setDescription(''); // Clear description after trade
        setTradeType(''); // Reset trade type selection
        
        // Refresh today's trades
        await fetchTodayTrades();
        
        // Check if session is now locked and show appropriate message
        if (newState.daily_session?.status === 'LOCKED') {
          if (tradeType === 'random') {
            setTradeError('⚠️ Session locked: Random trade detected (no setup followed)');
          } else if (tradeType === 'mistake') {
            setTradeError('⚠️ Session locked: 2 minor mistakes detected today');
          }
        }
      } else {
        setTradeError('Failed to save trade');
      }
    } catch (err) {
      console.error('Error adding trade:', err);
      setTradeError('Error saving trade');
    } finally {
      setProcessing(false);
    }
  }

  async function handleUpdateTrade(tradeId, newResult, newAmount, newWinPct, newDescription, newDay = null) {
    setProcessing(true);
    try {
      const winProfit = Number(newWinPct) / 100;
      const newState = await updateTrade(state, tradeId, newResult, newAmount, winProfit, newDescription, newDay);
      if (newState) {
        setState(newState);
      }
    } catch (err) {
      console.error('Error updating trade:', err);
    } finally {
      setProcessing(false);
    }
  }

  async function handleDeleteTrade(tradeId) {
    if (!confirm('Delete this trade? This cannot be undone.')) return;
    
    setProcessing(true);
    try {
      const newState = await deleteTrade(state, tradeId);
      if (newState) {
        setState(newState);
        await fetchTodayTrades(); // Refresh the list
      }
    } catch (err) {
      console.error('Error deleting trade:', err);
    } finally {
      setProcessing(false);
    }
  }

  async function handleEndSession() {
    if (!confirm('End this trading session? You can start a new session tomorrow.')) return;
    
    setProcessing(true);
    try {
      const newState = await endSession(state);
      if (newState) {
        setState(newState);
      }
    } catch (err) {
      console.error('Error ending session:', err);
    } finally {
      setProcessing(false);
    }
  }

  function openCapitalEdit() {
    setEditTotalCapital(state.total_capital.toString());
    setEditDepositedCapital(state.deposited_capital.toString());
    setEditingCapital(true);
  }

  function closeCapitalEdit() {
    setEditingCapital(false);
  }

  async function handleSaveCapital() {
    const totalCap = parseFloat(editTotalCapital);
    const depositedCap = parseFloat(editDepositedCapital);

    if (!totalCap || totalCap <= 0) {
      alert('Enter valid total capital');
      return;
    }

    if (!depositedCap || depositedCap <= 0) {
      alert('Enter valid deposited capital');
      return;
    }

    if (depositedCap > totalCap) {
      alert('Deposited capital cannot exceed total capital');
      return;
    }

    setProcessing(true);
    try {
      const newState = await updateCapital(state, totalCap, depositedCap);
      if (newState) {
        setState(newState);
        closeCapitalEdit();
      }
    } catch (err) {
      console.error('Error updating capital:', err);
      alert('Failed to update capital');
    } finally {
      setProcessing(false);
    }
  }

  if (lockedToday) {
    return (
      <main className="p-6 min-h-screen flex flex-col items-center bg-gray-50">
        <div className="max-w-lg w-full">
          <div className="card text-center py-10">
            <div className="text-6xl mb-4">{lockReason === 'losses' ? '🛑' : '✅'}</div>
            <h2 className={`text-3xl font-bold mb-3 ${lockReason === 'losses' ? 'text-red-600' : 'text-green-600'}`}>
              {lockReason === 'losses' ? 'MARKET OUT' : 'DAILY LIMIT REACHED'}
            </h2>
            <p className="text-lg font-semibold text-gray-900 mb-4">
              {lockReason === 'losses' 
                ? '2 Consecutive Losses - Trading Locked'
                : '10 Trades Completed - Well Done!'}
            </p>
            
            {lockReason === 'losses' ? (
              <>
                <div className="card bg-red-50 border-red-300 text-left mb-6">
                  <h3 className="font-bold text-red-900 mb-3">⚠️ DO NOT TRADE TODAY</h3>
                  <ul className="text-sm text-red-800 space-y-2">
                    <li>✋ <strong>Stop now</strong> - Revenge trading will destroy your capital</li>
                    <li>🧠 <strong>Clear your mind</strong> - Emotions cloud judgment</li>
                    <li>📊 <strong>Analyze your mistakes</strong> - Learn from today's losses</li>
                    <li>💪 <strong>Come back tomorrow</strong> - Fresh start, fresh mindset</li>
                    <li>🎯 <strong>Discipline wins</strong> - Protecting capital is success</li>
                  </ul>
                </div>

                <div className="card bg-yellow-50 border-yellow-300 text-left mb-6">
                  <p className="text-sm text-yellow-900 font-medium">
                    💡 <strong>Remember:</strong> Professional traders protect their capital first. 
                    Taking a break after losses is not weakness—it's wisdom. 
                    You'll thank yourself tomorrow.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="card bg-green-50 border-green-300 text-left mb-6">
                  <h3 className="font-bold text-green-900 mb-3">🎯 EXCELLENT DISCIPLINE!</h3>
                  <ul className="text-sm text-green-800 space-y-2">
                    <li>✅ <strong>10 trades completed</strong> - You followed the plan</li>
                    <li>📊 <strong>Review your performance</strong> - Check what worked</li>
                    <li>💰 <strong>Profit secured</strong> - Discipline creates consistency</li>
                    <li>🔄 <strong>Tomorrow is a new day</strong> - Rest and prepare</li>
                    <li>🚀 <strong>Keep it up</strong> - This is how pros trade</li>
                  </ul>
                </div>

                <div className="card bg-blue-50 border-blue-300 text-left mb-6">
                  <p className="text-sm text-blue-900 font-medium">
                    💡 <strong>Pro Tip:</strong> Completing 10 quality trades is better than forcing more. 
                    Your discipline today builds your success tomorrow.
                  </p>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="card bg-gray-50">
                <div className="text-sm text-gray-500">Day</div>
                <div className="text-xl font-bold text-gray-900">{dayNumber} / 30</div>
              </div>
              <div className="card bg-gray-50">
                <div className="text-sm text-gray-500">Today P&L</div>
                <div className={`text-xl font-bold ${parseFloat(todayPnL) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ${todayPnL}
                </div>
              </div>
            </div>
            
            <a 
              href="/history" 
              className="mt-6 text-blue-600 hover:text-blue-700 inline-block font-medium"
            >
              📊 View History & Learn
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (dayNumber > 30) {
    return (
      <main className="p-6 min-h-screen flex flex-col items-center bg-gray-50">
        <div className="max-w-lg w-full">
          <div className="card text-center py-10">
            <h2 className="text-3xl font-bold mb-2 text-emerald-600">30-DAY CHALLENGE COMPLETE!</h2>
            <p className="text-gray-700 mb-6">Congratulations on completing the trading discipline challenge.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="card bg-emerald-50">
                <div className="text-sm text-emerald-700">Total P&L</div>
                <div className={`text-2xl font-bold ${parseFloat(totalPnL) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ${totalPnL}
                </div>
              </div>
              <div className="card bg-blue-50">
                <div className="text-sm text-blue-700">Badges</div>
                <div className="text-xl font-bold text-blue-600">{(state.rewards || []).length}</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 min-h-screen flex flex-col items-center bg-gray-50">
      <div className="w-full max-w-2xl">
        <header className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Trading Discipline System</h1>
            <p className="text-sm text-gray-500">Day {dayNumber} / 30</p>
          </div>
          <div className="flex items-center gap-3">
            <a 
              href="/calculator" 
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              🧮 Calculator
            </a>
            <a 
              href="/history" 
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              📊 History
            </a>
          </div>
        </header>

        {/* Old Session Warning */}
        {isOldSession && (
          <div className="card mb-4 bg-yellow-50 border-yellow-300">
            <div className="flex items-start gap-3">
              <div className="text-3xl">📅</div>
              <div className="flex-1">
                <h3 className="font-bold text-yellow-900 mb-2">Previous Session Data</h3>
                <p className="text-sm text-yellow-800 mb-3">
                  You're viewing trades from <strong>{sessionDate}</strong>. 
                  Start a new session to begin trading today.
                </p>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={startNewSession}
                    className="btn bg-blue-600 text-white hover:bg-blue-700 font-semibold"
                    disabled={processing}
                  >
                    {processing ? 'Starting...' : '🚀 Start New Session'}
                  </button>
                  <span className="text-xs text-yellow-700">
                    This will save yesterday's trades and reset for today
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card mb-4 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Trading Capital</h3>
            <button
              onClick={openCapitalEdit}
              className="text-xs px-2 py-1 bg-white text-blue-700 rounded hover:bg-blue-50 border border-blue-200 font-medium"
              disabled={processing}
            >
              ✏️ Edit
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-sm text-gray-600">Total Capital</div>
              <div className="text-xl font-bold text-gray-900">${(state.total_capital || 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Deposited Capital</div>
              <div className="text-xl font-bold text-gray-900">${(state.deposited_capital || 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Today P&L</div>
              <div className={`text-xl font-bold ${parseFloat(todayPnL) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${todayPnL}
              </div>
            </div>
          </div>
          <div className="mt-2 text-center">
            <div className="text-sm text-gray-600">Target (50%)</div>
            <div className={`text-2xl font-bold ${targetReached ? 'text-blue-600' : 'text-gray-400'}`}>
              {targetReached ? '✓ ' : ''}${targetAmount}
            </div>
          </div>
        </div>

        {/* Target Reached Message */}
        {targetReached && !lockedToday && (
          <div className="card mb-4 bg-gradient-to-r from-blue-50 to-emerald-50 border-blue-300">
            <div className="flex items-start gap-3">
              <div className="text-4xl">🎯</div>
              <div className="flex-1">
                <h3 className="font-bold text-blue-900 mb-2">Target Reached!</h3>
                <p className="text-sm text-blue-800 mb-3">
                  You've reached 50% profit target (${targetAmount}). Great discipline! 
                  You can continue trading or end the session now to secure your gains.
                </p>
                <button
                  onClick={handleEndSession}
                  className="btn bg-blue-600 text-white hover:bg-blue-700 font-semibold"
                  disabled={processing}
                >
                  {processing ? 'Ending Session...' : '🏁 End Session & Secure Profit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Weekend Trading Warning */}
        {isWeekend && (
          <div className="card mb-4 bg-gradient-to-r from-red-50 to-orange-50 border-red-300">
            <div className="flex items-start gap-3">
              <div className="text-5xl">🛑</div>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 text-xl mb-3">Weekend - Trading Closed</h3>
                <p className="text-base text-red-800 mb-2 font-semibold">
                  Protect Your Capital! 
                </p>
                <p className="text-sm text-red-700 mb-2">
                  Your data shows you lose most on Fridays. Weekend trading (Friday, Saturday, Sunday) is now blocked to protect your capital.
                </p>
                <p className="text-sm text-red-700">
                  Take a break, review your trades, and come back fresh on Monday. Your future self will thank you! 💪
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="card mb-4">
          <h2 className="text-lg font-bold mb-4 text-gray-900">Execute Trade</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trade Amount (Max: ${maxPerTrade})
              </label>
              <input
                type="number"
                step="0.01"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                onWheel={(e) => e.target.blur()}
                placeholder="Enter amount"
                className="input-field"
                disabled={processing || isWeekend}
              />
              <p className="text-xs text-gray-500 mt-1">
                {consecutiveWins >= 2 ? 'After 2 wins: Up to 20%' : 'Max 10% of deposited capital'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Win Profit Percentage
              </label>
              <select
                value={winProfitPct}
                onChange={(e) => setWinProfitPct(e.target.value)}
                className="input-field"
                disabled={processing || isWeekend}
              >
                <option value="70">70%</option>
                <option value="71">71%</option>
                <option value="72">72%</option>
                <option value="73">73%</option>
                <option value="74">74%</option>
                <option value="75">75%</option>
                <option value="76">76%</option>
                <option value="77">77%</option>
                <option value="78">78%</option>
                <option value="79">79%</option>
                <option value="80">80%</option>
                <option value="81">81%</option>
                <option value="82">82%</option>
                <option value="83">83%</option>
                <option value="84">84%</option>
                <option value="85">85%</option>
                <option value="86">86%</option>
                <option value="87">87%</option>
                <option value="88">88%</option>
                <option value="89">89%</option>
                <option value="90">90%</option>
                <option value="91">91%</option>
                <option value="custom">Custom...</option>
              </select>
              {winProfitPct === 'custom' && (
                <input
                  type="number"
                  min="70"
                  max="91"
                  step="1"
                  placeholder="Enter 70-91"
                  className="input-field mt-2"
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (val >= 70 && val <= 91) {
                      setWinProfitPct(e.target.value);
                    }
                  }}
                  onWheel={(e) => e.target.blur()}
                  disabled={processing || isWeekend}
                />
              )}
              <p className="text-xs text-gray-500 mt-1">Profit percentage on winning trades (70-91%)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trade Notes (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Setup used, lesson learned, market conditions..."
                className="input-field resize-none"
                rows="2"
                disabled={processing || isWeekend}
                maxLength="500"
              />
              <p className="text-xs text-gray-500 mt-1">Save your trading setup or notes for review ({description.length}/500)</p>
            </div>

            {/* Trade Type Selection (REQUIRED) */}
            <div className={`border-2 rounded-lg p-4 ${
              !tradeType ? 'border-yellow-400 bg-yellow-50' : 
              tradeType === 'setup' ? 'border-green-300 bg-green-50' : 
              tradeType === 'mistake' ? 'border-orange-300 bg-orange-50' :
              'border-red-300 bg-red-50'
            }`}>
              <label className="block text-sm font-bold mb-3 ${
                !tradeType ? 'text-yellow-900' : 
                tradeType === 'setup' ? 'text-green-900' : 
                tradeType === 'mistake' ? 'text-orange-900' :
                'text-red-900'
              }">
                ⚠️ Trade Type (REQUIRED)
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 border-2 rounded-lg ${
                  tradeType === 'setup' 
                    ? 'border-green-500 bg-green-100' 
                    : 'border-gray-300 bg-white hover:bg-gray-50'
                }">
                  <input
                    type="radio"
                    name="tradeType"
                    value="setup"
                    checked={tradeType === 'setup'}
                    onChange={(e) => setTradeType(e.target.value)}
                    disabled={processing || isWeekend}
                    className="w-5 h-5 text-green-600"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-gray-900">✅ Setup Trade</div>
                    <div className="text-xs text-gray-600">Following my trading rules and setup</div>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer p-3 border-2 rounded-lg ${
                  tradeType === 'mistake' 
                    ? 'border-orange-500 bg-orange-100' 
                    : 'border-gray-300 bg-white hover:bg-gray-50'
                }">
                  <input
                    type="radio"
                    name="tradeType"
                    value="mistake"
                    checked={tradeType === 'mistake'}
                    onChange={(e) => setTradeType(e.target.value)}
                    disabled={processing || isWeekend}
                    className="w-5 h-5 text-orange-600"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-orange-900">⚠️ Minor Mistake</div>
                    <div className="text-xs text-orange-700">Small error - 2 mistakes locks session</div>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer p-3 border-2 rounded-lg ${
                  tradeType === 'random' 
                    ? 'border-red-500 bg-red-100' 
                    : 'border-gray-300 bg-white hover:bg-gray-50'
                }">
                  <input
                    type="radio"
                    name="tradeType"
                    value="random"
                    checked={tradeType === 'random'}
                    onChange={(e) => setTradeType(e.target.value)}
                    disabled={processing || isWeekend}
                    className="w-5 h-5 text-red-600"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-red-900">🛑 Random Trade (No Setup)</div>
                    <div className="text-xs text-red-700">Session will lock after this trade</div>
                  </div>
                </label>
              </div>
            </div>

            {tradeError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {tradeError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => doTrade('WIN')}
                className="btn bg-emerald-600 text-white hover:bg-emerald-700 py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={processing || isWeekend}
              >
                {processing ? 'Processing...' : isWeekend ? '🛑 Weekend' : `WIN (+${winProfitPct}%)`}
              </button>
              <button 
                onClick={() => doTrade('LOSS')}
                className="btn bg-red-600 text-white hover:bg-red-700 py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={processing || isWeekend}
              >
                {processing ? 'Processing...' : isWeekend ? '🛑 Weekend' : 'LOSS (-100%)'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card bg-emerald-50 border-emerald-200">
            <div className="text-sm text-emerald-700">Consecutive Wins</div>
            <div className="text-2xl font-bold text-emerald-600">{consecutiveWins}</div>
          </div>
          <div className="card bg-red-50 border-red-200">
            <div className="text-sm text-red-700">Consecutive Losses</div>
            <div className="text-2xl font-bold text-red-600">{todaySession.consecutiveLosses || 0}</div>
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Trades Today</h3>
            <span className="text-sm text-gray-500">{maxTradesLeft} left</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${((todaySession.trades || []).length / 10) * 100}%` }}
            />
          </div>
        </div>

        <TradesList 
          trades={todayTrades} 
          onUpdate={handleUpdateTrade}
          onDelete={handleDeleteTrade}
          processing={processing}
        />
        
        {/* Manual End Session Button */}
        {!lockedToday && todaySession.trades && todaySession.trades.length > 0 && (
          <div className="card mb-4 bg-gray-50">
            <p className="text-sm text-gray-600 mb-3">
              Want to stop trading for today? You can manually end your session anytime.
            </p>
            <button
              onClick={handleEndSession}
              className="btn bg-gray-600 text-white hover:bg-gray-700 w-full font-semibold"
              disabled={processing}
            >
              {processing ? 'Ending Session...' : '🛑 End Session Early'}
            </button>
          </div>
        )}
        
        {/* Today's Performance Chart */}
        {todaySession.trades && todaySession.trades.length > 0 && (
          <TodayPerformanceChart 
            trades={todaySession.trades} 
            depositedCapital={state.deposited_capital} 
          />
        )}

        {/* Edit Capital Modal */}
        {editingCapital && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4 text-gray-900">Edit Trading Capital</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Capital ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editTotalCapital}
                    onChange={(e) => setEditTotalCapital(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    onWheel={(e) => e.target.blur()}
                    placeholder="Total account balance"
                  />
                  <p className="text-xs text-gray-500 mt-1">Your total trading account size</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Deposited Capital ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editDepositedCapital}
                    onChange={(e) => setEditDepositedCapital(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    onWheel={(e) => e.target.blur()}
                    placeholder="Amount you're trading with"
                  />
                  <p className="text-xs text-gray-500 mt-1">Capital allocated for this challenge</p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveCapital}
                  className="flex-1 btn bg-blue-600 text-white hover:bg-blue-700"
                  disabled={processing}
                >
                  {processing ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={closeCapitalEdit}
                  className="flex-1 btn bg-gray-200 text-gray-700 hover:bg-gray-300"
                  disabled={processing}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function TradesList({ trades, onUpdate, onDelete, processing }) {
  const [editingTrade, setEditingTrade] = useState(null);
  const [editResult, setEditResult] = useState('WIN');
  const [editAmount, setEditAmount] = useState('');
  const [editWinPct, setEditWinPct] = useState('70');
  const [editDescription, setEditDescription] = useState('');
  const [editDay, setEditDay] = useState('');

  if (trades.length === 0) {
    return (
      <div className="card mb-4">
        <h3 className="text-lg font-bold mb-3 text-gray-900">Today's Trades</h3>
        <p className="text-center text-gray-500 py-4">No trades yet</p>
      </div>
    );
  }

  function openEdit(trade) {
    setEditingTrade(trade);
    setEditResult(trade.result);
    setEditAmount(trade.trade_amount.toString());
    setEditWinPct((trade.win_profit_percent * 100).toString());
    setEditDescription(trade.description || '');
    setEditDay(trade.day ? trade.day.toString() : '');
  }

  function closeEdit() {
    setEditingTrade(null);
  }

  function handleSaveEdit() {
    if (editingTrade && onUpdate) {
      const amount = parseFloat(editAmount);
      if (!amount || amount <= 0) {
        alert('Enter a valid trade amount');
        return;
      }
      const day = editDay ? parseInt(editDay) : null;
      if (day !== null && (day < 1 || day > 30)) {
        alert('Day must be between 1 and 30');
        return;
      }
      onUpdate(editingTrade.id, editResult, amount, parseFloat(editWinPct), editDescription.trim(), day);
      closeEdit();
    }
  }

  return (
    <>
      <div className="card mb-4">
        <h3 className="text-lg font-bold mb-3 text-gray-900">Today's Trades</h3>
        <div className="space-y-2">
          {trades.slice().reverse().map((trade) => (
            <div key={trade.id} className={`p-3 rounded-lg border-2 ${
              trade.result === 'WIN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    trade.result === 'WIN' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                  }`}>
                    {trade.result}
                  </span>
                  {trade.trade_type && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      trade.trade_type === 'setup' ? 'bg-green-100 text-green-800' :
                      trade.trade_type === 'mistake' ? 'bg-orange-100 text-orange-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {trade.trade_type === 'setup' ? '✅' : trade.trade_type === 'mistake' ? '⚠️' : '🛑'}
                    </span>
                  )}
                  <span className="text-sm text-gray-600">
                    {new Date(trade.trade_time).toLocaleTimeString()}
                  </span>
                  <span className="text-sm text-gray-700">
                    ${(trade.trade_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-lg font-bold ${
                    parseFloat(trade.pnl) >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {parseFloat(trade.pnl) >= 0 ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                  </div>
                  <button
                    onClick={() => openEdit(trade)}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    disabled={processing}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => onDelete && onDelete(trade.id)}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                    disabled={processing}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
              {trade.description && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-600 italic">📝 {trade.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editingTrade && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 text-gray-900">Edit Trade</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Result
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setEditResult('WIN')}
                    className={`py-2 rounded font-semibold ${
                      editResult === 'WIN' 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    WIN
                  </button>
                  <button
                    onClick={() => setEditResult('LOSS')}
                    className={`py-2 rounded font-semibold ${
                      editResult === 'LOSS' 
                        ? 'bg-red-600 text-white' 
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    LOSS
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trade Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  onWheel={(e) => e.target.blur()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Win Profit % (for WIN trades)
                </label>
                <input
                  type="number"
                  step="1"
                  value={editWinPct}
                  onChange={(e) => setEditWinPct(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  onWheel={(e) => e.target.blur()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trading Day (1-30)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  value={editDay}
                  onChange={(e) => setEditDay(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  onWheel={(e) => e.target.blur()}
                  placeholder="Day number"
                />
                <p className="text-xs text-gray-500 mt-1">Which trading day was this (Day 1, 2, 3...)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trade Notes (Optional)
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Setup used, lesson learned, market conditions..."
                  className="w-full px-3 py-2 border border-gray-300 rounded resize-none"
                  rows="3"
                  maxLength="500"
                />
                <p className="text-xs text-gray-500 mt-1">{editDescription.length}/500</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveEdit}
                className="flex-1 btn bg-blue-600 text-white hover:bg-blue-700"
                disabled={processing}
              >
                {processing ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={closeEdit}
                className="flex-1 btn bg-gray-200 text-gray-700 hover:bg-gray-300"
                disabled={processing}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProfitChart({ state }) {
  const allTrades = [];
  
  if (state.history) {
    state.history.forEach(session => {
      if (session.trades) {
        session.trades.forEach(trade => allTrades.push(trade));
      }
    });
  }
  
  if (state.daily_session && state.daily_session.trades) {
    state.daily_session.trades.forEach(trade => allTrades.push(trade));
  }

  if (allTrades.length === 0) return null;

  let cumulative = 0;
  const points = allTrades.map((trade, idx) => {
    cumulative += trade.pnl || 0;
    return { x: idx, y: cumulative };
  });

  const minY = Math.min(0, ...points.map(p => p.y));
  const maxY = Math.max(500, ...points.map(p => p.y));
  const rangeY = maxY - minY;

  const width = 600;
  const height = 200;
  const padding = 30;

  function scaleY(val) {
    return height - padding - ((val - minY) / rangeY) * (height - 2 * padding);
  }

  function scaleX(idx) {
    return padding + (idx / Math.max(1, points.length - 1)) * (width - 2 * padding);
  }

  const pathData = points.map((p, i) => {
    const x = scaleX(p.x);
    const y = scaleY(p.y);
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');

  return (
    <div className="card">
      <h3 className="text-lg font-bold mb-3 text-gray-900">Profit Chart</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line x1={padding} y1={scaleY(0)} x2={width - padding} y2={scaleY(0)} 
          stroke="#9ca3af" strokeWidth="1" strokeDasharray="4" />
        
        {[200, 300, 500].map(target => (
          <line key={target} 
            x1={padding} y1={scaleY(target)} x2={width - padding} y2={scaleY(target)} 
            stroke="#3b82f6" strokeWidth="1" strokeDasharray="4" 
          />
        ))}
        
        <path d={pathData} stroke="#10b981" strokeWidth="2" fill="none" />
        
        {points.map((p, i) => (
          <circle key={i} cx={scaleX(p.x)} cy={scaleY(p.y)} r="3" 
            fill={p.y >= 0 ? '#10b981' : '#ef4444'} 
          />
        ))}
        
        <text x={width - padding + 5} y={scaleY(200)} fontSize="10" fill="#3b82f6">200</text>
        <text x={width - padding + 5} y={scaleY(300)} fontSize="10" fill="#3b82f6">300</text>
        <text x={width - padding + 5} y={scaleY(500)} fontSize="10" fill="#3b82f6">500</text>
      </svg>
    </div>
  );
}

// Today's Performance Chart - Burnup style showing today's progress
function TodayPerformanceChart({ trades, depositedCapital }) {
  const initialCapital = depositedCapital || 0;
  
  // Calculate cumulative capital for each trade
  let cumulativeCapital = initialCapital;
  const dataPoints = [
    { x: 0, y: initialCapital, result: 'START' }
  ];
  
  trades.forEach((trade, i) => {
    cumulativeCapital += trade.pnl || 0;
    dataPoints.push({
      x: i + 1,
      y: cumulativeCapital,
      result: trade.result,
      trade: trade
    });
  });

  // Y-axis: Show capital values similar to history page
  const allValues = dataPoints.map(p => p.y);
  const minValue = Math.min(...allValues, initialCapital);
  const maxValue = Math.max(...allValues, initialCapital);
  
  // Calculate range and round to nice numbers
  const rawRange = maxValue - minValue;
  const rangeWithPadding = Math.max(rawRange * 1.2, initialCapital * 0.2); // At least 20% of capital
  
  // Round yMin and yMax to nice values
  const yMin = Math.floor((minValue - rangeWithPadding * 0.1) / 5) * 5;
  const yMax = Math.ceil((maxValue + rangeWithPadding * 0.1) / 5) * 5;
  const yRange = yMax - yMin;
  
  // X-axis: from 0 to 10 (max trades)
  const xMax = 10;

  const width = 700;
  const height = 300;
  const padding = { top: 20, right: 60, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Scale functions
  const scaleX = (x) => padding.left + (x / xMax) * chartWidth;
  const scaleY = (y) => padding.top + chartHeight - ((y - yMin) / yRange) * chartHeight;

  // Y-axis labels - use fixed intervals for cleaner capital values
  const yTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const value = yMin + (yRange * i / tickCount);
    yTicks.push(value);
  }

  // X-axis labels
  const xTicks = [0, 2, 4, 6, 8, 10];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Today's Performance</h3>
        <div className="text-right">
          <div className="text-xs text-gray-500">Current Capital</div>
          <div className={`text-xl font-bold ${cumulativeCapital >= initialCapital ? 'text-emerald-600' : 'text-red-600'}`}>
            ${cumulativeCapital.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg width={width} height={height} className="mx-auto">
          {/* Y-axis grid lines and labels */}
          {yTicks.map((tick, i) => (
            <g key={`y-${i}`}>
              <line
                x1={padding.left}
                y1={scaleY(tick)}
                x2={width - padding.right}
                y2={scaleY(tick)}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={scaleY(tick) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#6b7280"
              >
                ${tick.toFixed(0)}
              </text>
            </g>
          ))}

          {/* X-axis grid lines and labels */}
          {xTicks.map((tick, i) => (
            <g key={`x-${i}`}>
              <line
                x1={scaleX(tick)}
                y1={padding.top}
                x2={scaleX(tick)}
                y2={height - padding.bottom}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={scaleX(tick)}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                fontSize="11"
                fill="#6b7280"
              >
                {tick === 0 ? 'Start' : `#${tick}`}
              </text>
            </g>
          ))}

          {/* Initial capital line (baseline) */}
          <line
            x1={padding.left}
            y1={scaleY(initialCapital)}
            x2={width - padding.right}
            y2={scaleY(initialCapital)}
            stroke="#9ca3af"
            strokeWidth="2"
          />

          {/* Plot line */}
          <polyline
            points={dataPoints.map(p => `${scaleX(p.x)},${scaleY(p.y)}`).join(' ')}
            fill="none"
            stroke={cumulativeCapital >= initialCapital ? '#10b981' : '#ef4444'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Plot points */}
          {dataPoints.map((point, i) => (
            <circle
              key={i}
              cx={scaleX(point.x)}
              cy={scaleY(point.y)}
              r="5"
              fill={point.result === 'START' ? '#6b7280' : point.result === 'WIN' ? '#10b981' : '#ef4444'}
              stroke="white"
              strokeWidth="2"
            />
          ))}

          {/* Axes */}
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="#374151"
            strokeWidth="2"
          />
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            stroke="#374151"
            strokeWidth="2"
          />

          {/* Axis labels */}
          <text
            x={width / 2}
            y={height - 5}
            textAnchor="middle"
            fontSize="13"
            fill="#374151"
            fontWeight="bold"
          >
            Trade Number
          </text>
          <text
            x={-height / 2}
            y={15}
            textAnchor="middle"
            fontSize="13"
            fill="#374151"
            fontWeight="bold"
            transform={`rotate(-90, 15, ${height / 2})`}
          >
            Capital ($)
          </text>
        </svg>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-1 bg-gray-400"></div>
          <span className="text-gray-600">Start Capital</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-gray-600">Win</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-gray-600">Loss</span>
        </div>
      </div>
    </div>
  );
}

