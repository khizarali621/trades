"use client";
import React, { useEffect, useState } from 'react';
import { initSession, createInitialState, addTrade as addTradeToSupabase, addDeposit, updateWinProfitPercent } from '../lib/supabaseState';
import { isSupabaseConfigured } from '../lib/supabase';

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
        <div className="text-gray-500">Initializing...</div>
      </main>
    );
  }

  const todaySession = state.dailySession || { trades: [], consecutiveLosses:0, consecutiveWins:0, status:'ACTIVE' };
  const isFailed = state.failed === true;
  const lockedToday = todaySession.status === 'LOCKED';
  const dayNumber = state.currentDay || 1;

  if (isFailed) {
    return (
      <main className="p-6 min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="card max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Challenge Failed</h1>
          <p className="text-sm text-gray-600 mb-4">Anti-cheat detected tampering. Trading disabled permanently.</p>
          <div className="text-gray-500 text-sm">Reason: {state.failedReason || 'anti-cheat'}</div>
        </div>
      </main>
    );
  }

  if (currentPage === 'setup') {
    return <SetupPage state={state} setState={setState} setCurrentPage={setCurrentPage} supabaseEnabled={supabaseEnabled} setSyncStatus={setSyncStatus} syncStatus={syncStatus} />;
  }

  return <TradingPage state={state} setState={setState} setCurrentPage={setCurrentPage} supabaseEnabled={supabaseEnabled} setSyncStatus={setSyncStatus} syncStatus={syncStatus} />;
}

function SetupPage({ state, setState, setCurrentPage, supabaseEnabled, setSyncStatus, syncStatus }) {
  const [totalCap, setTotalCap] = useState(state.totalCapital || 0);
  const [depositCap, setDepositCap] = useState(state.depositedCapital || 0);
  const [winPct, setWinPct] = useState(((state.winProfitPercent || 0.7) * 100).toFixed(0));
  const [error, setError] = useState('');

  const maxDeposit = (totalCap * 0.2).toFixed(2);
  const isInitialSetup = !state.totalCapital || state.totalCapital <= 0;

  function handleSave() {
    if (!totalCap || totalCap <= 0) {
      setError('Enter valid total capital');
      return;
    }
    
    const maxDep = totalCap * 0.2;
    if (depositCap > maxDep) {
      setError(`Max deposit is ${maxDep.toFixed(2)} (20% of total)`);
      return;
    }

    if (!depositCap || depositCap <= 0) {
      setError('Enter valid deposited capital');
      return;
    }

    setError('');
    const s = setCapital(totalCap, depositCap);
    const s2 = setWinProfitPercent(Number(winPct) / 100);
    setState({ ...s, ...s2 });
    
    if (supabaseEnabled) {
      setSyncStatus('syncing');
      syncToSupabase().then(res => {
        setSyncStatus(res.success ? 'synced' : 'error');
        setTimeout(() => setSyncStatus(null), 2000);
      });
    }
    
    setCurrentPage('trading');
  }

  return (
    <main className="p-6 min-h-screen flex flex-col items-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {isInitialSetup ? 'Setup Capital' : 'Add Deposit'}
          </h1>
          <p className="text-gray-600 mt-2">
            {isInitialSetup 
              ? 'Configure your trading capital to begin' 
              : 'Your funds are depleted. Add a new deposit to continue trading'}
          </p>
          {supabaseEnabled && (
            <div className="flex items-center gap-2 mt-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${
                syncStatus === 'syncing' ? 'bg-yellow-400 animate-pulse' :
                syncStatus === 'synced' ? 'bg-emerald-400' :
                syncStatus === 'error' ? 'bg-red-400' :
                'bg-gray-400'
              }`} />
              <span className="text-gray-600">
                {syncStatus === 'syncing' ? 'Syncing...' :
                 syncStatus === 'synced' ? 'Synced' :
                 syncStatus === 'error' ? 'Sync failed' : 'Cloud ready'}
              </span>
            </div>
          )}
        </div>

        <div className="card space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total Capital
            </label>
            <input
              type="number"
              step="0.01"
              value={totalCap}
              onChange={(e) => setTotalCap(Number(e.target.value))}
              placeholder="Enter total capital"
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
              onChange={(e) => setDepositCap(Number(e.target.value))}
              placeholder="Enter deposit amount"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum 20% of total capital can be deposited</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Win Profit Percentage
            </label>
            <select 
              value={winPct} 
              onChange={(e) => setWinPct(e.target.value)}
              className="input-field"
            >
              <option value="70">70%</option>
              <option value="80">80%</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Profit percentage on winning trades</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="card bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-gray-900 mb-2">Trading Rules</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Max deposit: 20% of total capital</li>
              <li>• Default trade amount: 10% of deposited capital</li>
              <li>• After 2 consecutive wins: Can increase to 20%</li>
              <li>• 2 consecutive losses = session locked</li>
              <li>• Max 10 trades per day</li>
            </ul>
          </div>

          <button 
            onClick={handleSave}
            className="btn-primary w-full"
          >
            Continue to Trading
          </button>
        </div>
      </div>
    </main>
  );
}

function TradingPage({ state, setState, setCurrentPage, supabaseEnabled, setSyncStatus, syncStatus }) {
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeError, setTradeError] = useState('');

  const todaySession = state.dailySession || { trades: [], consecutiveLosses:0, consecutiveWins:0, status:'ACTIVE' };
  const todayPnL = (todaySession.trades || []).reduce((s,t) => s + (t.pnl||0), 0).toFixed(2);
  const totalPnL = (state.totalPnL || 0).toFixed(2);
  const lockedToday = todaySession.status === 'LOCKED';
  const dayNumber = state.currentDay || 1;
  const maxTradesLeft = Math.max(0, 10 - (todaySession.trades || []).length);
  const consecutiveWins = todaySession.consecutiveWins || 0;
  const maxTradePercent = consecutiveWins >= 2 ? 0.2 : (state.maxTradePercent || 0.1);
  const maxPerTrade = ((state.depositedCapital || 0) * maxTradePercent).toFixed(2);
  const winPct = ((state.winProfitPercent || 0.7) * 100).toFixed(0);

  function doTrade(result) {
    if (lockedToday) return;
    if ((todaySession.trades || []).length >= 10) return;
    
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
    const s = addTrade(result, amount);
    setState({ ...s });
    setTradeAmount('');
    
    if (supabaseEnabled) {
      setSyncStatus('syncing');
      syncToSupabase().then(res => {
        setSyncStatus(res.success ? 'synced' : 'error');
        setTimeout(() => setSyncStatus(null), 2000);
      });
    }
  }

  if (lockedToday) {
    return (
      <main className="p-6 min-h-screen flex flex-col items-center bg-gray-50">
        <div className="max-w-lg w-full">
          <div className="card text-center py-10">
            <h2 className="text-3xl font-bold mb-2 text-red-600">MARKET OUT</h2>
            <p className="text-gray-700 mb-4">You've hit 2 consecutive losses — trading locked for today.</p>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="card bg-gray-50">
                <div className="text-sm text-gray-500">Day</div>
                <div className="text-xl font-bold text-gray-900">{dayNumber} / 30</div>
              </div>
              <div className="card bg-gray-50">
                <div className="text-sm text-gray-500">Today PnL</div>
                <div className={`text-xl font-bold ${parseFloat(todayPnL) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ${todayPnL}
                </div>
              </div>
            </div>
            <a 
              href="/history" 
              className="mt-6 text-blue-600 hover:text-blue-700 inline-block"
            >
              📊 View History
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (dayNumber > 30) {
    return (
      <main className="p-6 min-h-screen flex flex-col items-center bg-gray-50">
        <div className="max-w-xl w-full card">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Challenge Complete</h1>
          <p className="text-gray-600 mb-4">30 days completed. Summary:</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="card bg-gray-50">
              <div className="text-sm text-gray-500">Total PnL</div>
              <div className="text-xl font-bold text-gray-900">${totalPnL}</div>
            </div>
            <div className="card bg-gray-50">
              <div className="text-sm text-gray-500">Streak</div>
              <div className="text-xl font-bold text-gray-900">{state.streak}</div>
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
            {supabaseEnabled && (
              <div className="flex items-center gap-1 text-xs">
                <div className={`w-2 h-2 rounded-full ${
                  syncStatus === 'syncing' ? 'bg-yellow-400 animate-pulse' :
                  syncStatus === 'synced' ? 'bg-emerald-400' :
                  syncStatus === 'error' ? 'bg-red-400' :
                  'bg-gray-400'
                }`} />
                <span className="text-gray-600">
                  {syncStatus === 'syncing' ? 'Syncing...' :
                   syncStatus === 'synced' ? 'Synced' :
                   syncStatus === 'error' ? 'Sync failed' : 'Cloud'}
                </span>
              </div>
            )}
            <a 
              href="/history" 
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              📊 History
            </a>
          </div>
        </header>

        <div className="card mb-4 bg-blue-50 border-blue-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-600">Total Capital</div>
              <div className="text-lg font-bold text-gray-900">${state.totalCapital || 0}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Deposited</div>
              <div className="text-lg font-bold text-gray-900">${state.depositedCapital || 0}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Max/Trade</div>
              <div className="text-lg font-bold text-gray-900">${maxPerTrade}</div>
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Make Trade</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trade Amount (Max: ${maxPerTrade})
            </label>
            <input
              type="number"
              step="0.01"
              value={tradeAmount}
              onChange={(e) => {
                setTradeAmount(e.target.value);
                setTradeError('');
              }}
              placeholder="Enter amount"
              className="input-field"
              disabled={lockedToday || maxTradesLeft === 0}
            />
            {tradeError && <p className="text-sm text-red-600 mt-1">{tradeError}</p>}
            {consecutiveWins >= 2 && (
              <p className="text-sm text-emerald-600 mt-1">
                🎉 2 wins! You can now trade up to ${maxPerTrade} (20% of deposited)
              </p>
            )}
            {consecutiveWins < 2 && (
              <p className="text-xs text-gray-500 mt-1">
                Default max: ${((state.depositedCapital || 0) * 0.1).toFixed(2)} (10%). Get 2 wins to unlock 20%
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => doTrade('WIN')}
              className="btn win flex-1"
              disabled={lockedToday || maxTradesLeft === 0}
            >
              WIN (+{winPct}%)
            </button>
            <button
              onClick={() => doTrade('LOSS')}
              className="btn loss flex-1"
              disabled={lockedToday || maxTradesLeft === 0}
            >
              LOSS (-100%)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card">
            <div className="text-sm text-gray-500">Status</div>
            <div className={`font-bold text-lg ${todaySession.status === 'ACTIVE' ? 'text-emerald-600' : 'text-red-600'}`}>
              {todaySession.status}
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Trades Left</div>
            <div className="font-bold text-lg text-gray-900">{maxTradesLeft} / 10</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Consec. Losses</div>
            <div className={`font-bold text-lg ${todaySession.consecutiveLosses >= 1 ? 'text-red-600' : 'text-gray-900'}`}>
              {todaySession.consecutiveLosses}
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Consec. Wins</div>
            <div className={`font-bold text-lg ${todaySession.consecutiveWins >= 2 ? 'text-emerald-600' : 'text-gray-900'}`}>
              {todaySession.consecutiveWins}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card bg-gray-50">
            <div className="text-sm text-gray-500">Today PnL</div>
            <div className={`text-2xl font-bold ${parseFloat(todayPnL) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ${todayPnL}
            </div>
          </div>
          <div className="card bg-gray-50">
            <div className="text-sm text-gray-500">Total PnL</div>
            <div className={`text-2xl font-bold ${parseFloat(totalPnL) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ${totalPnL}
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <h3 className="font-bold mb-2 text-gray-900">Profit Targets</h3>
          <ProfitChart state={state} />
        </div>

        <div className="card">
          <h3 className="font-bold mb-3 text-gray-900">Today's Trades</h3>
          <TradesList trades={(state.dailySession && state.dailySession.trades) || []} />
        </div>

        <div className="mt-4 text-xs text-gray-400 text-center">
          Fingerprint: {state.fingerprint}
        </div>
      </div>
    </main>
  );
}

function TradesList({ trades }) {
  if (!trades || trades.length === 0) return <div className="text-sm text-gray-400">No trades yet</div>;
  return (
    <ul className="space-y-2">
      {trades.map((t, i) => (
        <li key={i} className="flex justify-between text-sm border-b border-gray-100 pb-2">
          <div className="text-gray-700">{new Date(t.time).toLocaleTimeString()} • {t.result}</div>
          <div className={`font-bold ${t.result==='WIN'?'text-emerald-600':'text-red-600'}`}>${(t.pnl||0).toFixed(2)}</div>
        </li>
      ))}
    </ul>
  );
}

function ProfitChart({ state }) {
  const points = [];
  let cum = 0;
  (state.history || []).forEach(h => {
    const dayTotal = (h.trades || []).reduce((s,t)=>s+(t.pnl||0),0);
    cum += dayTotal;
    points.push(cum);
  });
  (state.dailySession && state.dailySession.trades || []).forEach(t => { cum += (t.pnl||0); points.push(cum); });

  const width = 600, height = 120, padding = 20;
  const len = Math.max(1, points.length);
  const maxVal = Math.max(500, ...points, 0);
  const minVal = Math.min(0, ...points, 0);

  function xy(i, v) {
    const x = padding + (i / Math.max(1, len-1))*(width - padding*2);
    const y = padding + (1 - (v - minVal)/(Math.max(1, maxVal - minVal)))*(height - padding*2);
    return [x,y];
  }

  const path = points.map((v,i)=>{
    const [x,y] = xy(i,v); return `${i===0?'M':'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
        {[200,300,500].map((tgt)=>{
          const y = xy(0,tgt)[1];
          return <line key={tgt} x1={padding} x2={width-padding} y1={y} y2={y} stroke="#cbd5e1" strokeDasharray="4" />
        })}
        <path d={path} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
