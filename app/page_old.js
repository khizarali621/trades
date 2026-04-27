"use client";
import React, { useEffect, useState } from 'react';
import storage, { initOrValidate, getState, addTrade, setCapital, syncToSupabase, setWinProfitPercent } from '../lib/localStorage';
import { isSupabaseConfigured } from '../lib/supabase';

export default function Page() {
  const [state, setState] = useState(null);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [supabaseEnabled, setSupabaseEnabled] = useState(false);
  const [currentPage, setCurrentPage] = useState('setup'); // 'setup' or 'trading'

  useEffect(() => {
    const s = initOrValidate();
    setState(s);
    setReady(true);
    setSupabaseEnabled(isSupabaseConfigured());
    
    // If capital is already set, go to trading page
    if (s && s.totalCapital > 0 && s.depositedCapital > 0) {
      setCurrentPage('trading');
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const s = getState();
    if (s && s.failed && !state?.failed) setState(s);
  }, [ready]);

  if (!ready || !state) {
    return (
      <main className="p-6 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Initializing...</div>
      </main>
    );
  }

  const todaySession = state.dailySession || { trades: [], consecutiveLosses:0, consecutiveWins:0, status:'ACTIVE' };
  const todayPnL = (todaySession.trades || []).reduce((s,t) => s + (t.pnl||0), 0).toFixed(2);
  const totalPnL = (state.totalPnL || 0).toFixed(2);
  const isFailed = state.failed === true;
  const lockedToday = todaySession.status === 'LOCKED';
  const dayNumber = state.currentDay || 1;
  const maxTradesLeft = Math.max(0, 10 - (todaySession.trades || []).length);
  const maxDeposit = ((state.totalCapital || 0) * (state.maxDepositPercent || 0.2)).toFixed(2);
  const maxPerTrade = ((state.depositedCapital || 0) * (state.maxTradePercent || 0.2)).toFixed(2);
  const winPct = ((state.winProfitPercent || 0.7) * 100).toFixed(0);
  
  // Trade amount input state
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeError, setTradeError] = useState('');

  function doTrade(result) {
    if (isFailed) return;
    if (lockedToday) return;
    if ((todaySession.trades || []).length >= 10) return;
    
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) {
      setTradeError('Enter valid amount');
      return;
    }
    
    const maxAllowed = parseFloat(maxPerTrade);
    if (amount > maxAllowed) {
      setTradeError(`Max ${maxAllowed} (20% of deposited capital)`);
      return;
    }
    
    setTradeError('');
    const s = addTrade(result);
    setState({ ...s });
    setTradeAmount('');
    
    // try to sync if supabase configured
    if (supabaseEnabled) {
      setSyncStatus('syncing');
      syncToSupabase().then(res => {
        setSyncStatus(res.success ? 'synced' : 'error');
        setTimeout(() => setSyncStatus(null), 2000);
      });
    }
  }

  if (currentPage === 'setup') {
    return <SetupPage state={state} setState={setState} setCurrentPage={setCurrentPage} supabaseEnabled={supabaseEnabled} setSyncStatus={setSyncStatus} />;
  }

  if (isFailed) {
    return (
      <main className="p-6 min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="card max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Challenge Failed</h1>
          <p className="text-sm text-gray-600 mb-4">Anti-cheat detected tampering (localStorage cleared or system clock changed backwards). Trading disabled permanently.</p>
          <div className="text-gray-500 text-sm">Reason: {state.failedReason || 'anti-cheat'}</div>
        </div>
      </main>
    );
  }

  if (lockedToday) {
    return (
      <main className="p-6 min-h-screen flex flex-col items-center bg-gray-50">
        <div className="max-w-lg w-full">
          <div className="card text-center py-10">
            <h2 className="text-3xl font-bold mb-2 text-red-600">MARKET OUT</h2>
            <p className="text-gray-700 mb-4">You've hit 2 consecutive losses — trading locked for today.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="card bg-gray-50">
                <div className="text-sm text-gray-500">Day</div>
                <div className="text-xl font-bold text-gray-900">{dayNumber} / 30</div>
              </div>
              <div className="card bg-gray-50">
                <div className="text-sm text-gray-500">Today PnL</div>
                <div className="text-xl font-bold text-gray-900">${todayPnL}</div>
              </div>
            </div>
          </div>

          <FooterCards state={state} />
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
          <div className="mt-4">
            <h3 className="font-bold text-gray-900">Rewards Unlocked</h3>
            <div className="flex gap-2 mt-2">
              {(state.rewards || []).map(r => (
                <div key={r} className="px-3 py-1 rounded bg-amber-500 text-white">{r}</div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 min-h-screen flex flex-col items-center">
      <div className="w-full max-w-lg">
        {/* Capital / deposit setup */}
        <div className="card mb-4">
          <div className="text-sm text-slate-400">Total Capital</div>
          <div className="flex gap-2 mt-2">
            <input type="number" defaultValue={state.totalCapital || 0} id="totalCap" className="flex-1 p-2 rounded bg-slate-900 border border-slate-700" />
            <input type="number" defaultValue={state.depositedCapital || 0} id="depo" className="w-32 p-2 rounded bg-slate-900 border border-slate-700" />
            <button className="px-3 py-2 bg-indigo-600 rounded" onClick={() => {
              const t = Number(document.getElementById('totalCap').value || 0);
              const d = Number(document.getElementById('depo').value || 0);
              const s = setCapital(t, d);
              setState({ ...s });
            }}>Set</button>
          </div>
          <div className="text-xs text-slate-400 mt-2">Max deposit allowed: {maxDeposit} (20% of total). Max per trade: {maxPerTrade}</div>
        </div>
        <div className="card mb-4">
          <div className="text-sm text-slate-400">Win profit percent</div>
          <div className="flex gap-2 items-center mt-2">
            <select defaultValue={winPct} onChange={e=>{
              const p = Number(e.target.value)/100;
              const s = setWinProfitPercent(p);
              setState({...s});
              syncToSupabase();
            }} className="p-2 rounded bg-slate-900 border border-slate-700">
              <option value={70}>70%</option>
              <option value={80}>80%</option>
            </select>
            <div className="text-xs text-slate-400">Current: {winPct}%</div>
          </div>
        </div>
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Trading Discipline System</h1>
          <div className="flex items-center gap-3">
            {supabaseEnabled && (
              <div className="flex items-center gap-1 text-xs">
                <div className={`w-2 h-2 rounded-full ${
                  syncStatus === 'syncing' ? 'bg-yellow-400 animate-pulse' :
                  syncStatus === 'synced' ? 'bg-emerald-400' :
                  syncStatus === 'error' ? 'bg-red-400' :
                  'bg-slate-600'
                }`} />
                <span className="text-slate-400">
                  {syncStatus === 'syncing' ? 'Syncing...' :
                   syncStatus === 'synced' ? 'Synced' :
                   syncStatus === 'error' ? 'Sync failed' : 'Cloud'}
                </span>
              </div>
            )}
            <div className="text-sm text-slate-400">Day {dayNumber} / 30</div>
          </div>
        </header>

        <div className="card mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-400">Status</div>
              <div className="font-bold">{todaySession.status}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Consec. Losses</div>
              <div className="font-bold">{todaySession.consecutiveLosses}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-400">Today PnL</div>
              <div className="font-bold">${todayPnL}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Total PnL</div>
              <div className="font-bold">${totalPnL}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <button
            onClick={() => doTrade('WIN')}
            className="btn win flex-1"
            aria-label="WIN"
          >
            WIN
          </button>
          <button
            onClick={() => doTrade('LOSS')}
            className="btn loss flex-1"
            aria-label="LOSS"
          >
            LOSS
          </button>
        </div>

        <div className="card mb-4">
          <h3 className="font-bold mb-2">Profit Targets</h3>
          <ProfitChart state={state} />
        </div>

        <FooterCards state={state} />

        <div className="card mt-4">
          <h3 className="font-bold mb-2">Today's Trades</h3>
          <TradesList trades={(state.dailySession && state.dailySession.trades) || []} />
        </div>

        <div className="mt-4 card">
          <div className="text-sm text-slate-400">Streak</div>
          <div className="font-bold text-lg">{state.streak}</div>
          <div className="mt-2 text-sm text-slate-300">Rewards: {(state.rewards || []).join(', ') || 'None'}</div>
        </div>

        <div className="mt-4 text-xs text-slate-500">Fingerprint: {state.fingerprint}</div>
      </div>
    </main>
  );
}

function FooterCards({ state }) {
  const todaySession = state.dailySession || {};
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <div className="card">
        <div className="text-sm text-slate-400">Day</div>
        <div className="text-lg font-bold">{state.currentDay} / 30</div>
      </div>
      <div className="card">
        <div className="text-sm text-slate-400">Status</div>
        <div className="text-lg font-bold">{todaySession.status}</div>
      </div>
      <div className="card">
        <div className="text-sm text-slate-400">Consec. Losses</div>
        <div className="text-lg font-bold">{todaySession.consecutiveLosses}</div>
      </div>
      <div className="card">
        <div className="text-sm text-slate-400">Today PnL</div>
        <div className="text-lg font-bold">${(todaySession.trades||[]).reduce((s,t)=>s+(t.pnl||0),0).toFixed(2)}</div>
      </div>
    </div>
  );
}

function TradesList({ trades }) {
  if (!trades || trades.length === 0) return <div className="text-sm text-slate-400">No trades yet</div>;
  return (
    <ul className="space-y-2">
      {trades.map((t, i) => (
        <li key={i} className="flex justify-between text-sm">
          <div>{new Date(t.time).toLocaleTimeString()} • {t.result}</div>
          <div className={`font-bold ${t.result==='WIN'?'text-emerald-400':'text-rose-400'}`}>${(t.pnl||0).toFixed(2)}</div>
        </li>
      ))}
    </ul>
  );
}

function ProfitChart({ state }) {
  // build cumulative profit timeline: history days end + today's trades
  const points = [];
  let cum = 0;
  // include history daily totals
  (state.history || []).forEach(h => {
    const dayTotal = (h.trades || []).reduce((s,t)=>s+(t.pnl||0),0);
    cum += dayTotal;
    points.push(cum);
  });
  // add today's incremental points
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
        {/* grid targets */}
        {[200,300,500].map((tgt,idx)=>{
          const y = xy(0,tgt)[1];
          return <line key={tgt} x1={padding} x2={width-padding} y1={y} y2={y} stroke="#334155" strokeDasharray="4" />
        })}
        <path d={path} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
