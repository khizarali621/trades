'use client';
import { useState, useEffect } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { initSession, updateTrade, deleteTrade } from '../../lib/supabaseState';

export default function HistoryPage() {
  const [state, setState] = useState(null);
  const [allTrades, setAllTrades] = useState([]);
  const [filter, setFilter] = useState('7days'); // '7days', 'month', 'all'
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Edit trade state
  const [editingTrade, setEditingTrade] = useState(null);
  const [editResult, setEditResult] = useState('WIN');
  const [editAmount, setEditAmount] = useState('');
  const [editWinPct, setEditWinPct] = useState('70');
  const [editDescription, setEditDescription] = useState('');
  const [editDay, setEditDay] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!isSupabaseConfigured()) {
        alert('Supabase is not configured. Please add your credentials to .env.local');
        setLoading(false);
        return;
      }

      const s = await initSession();
      setState(s);

      if (s && s.username) {
        // Fetch all trades from database table
        const supabase = getSupabaseClient();
        const { data: trades, error } = await supabase
          .from('tds_trades')
          .select('*')
          .eq('username', s.username)
          .order('trade_time', { ascending: false });
        
        if (!error && trades) {
          // Convert database trades to match our format
          const formattedTrades = trades.map(trade => ({
            ...trade,
            date: trade.trade_date,
            time: new Date(trade.trade_time).toLocaleTimeString(),
            pnl: parseFloat(trade.pnl),
            tradeAmount: parseFloat(trade.trade_amount)
          }));
          setAllTrades(formattedTrades);
        } else if (error) {
          console.error('Error fetching trades:', error);
        }
      }

      setReady(true);
      setLoading(false);
    }
    
    loadData();
  }, []);

  // Edit trade functions
  async function refreshTrades() {
    if (!state || !state.username) return;
    
    const supabase = getSupabaseClient();
    const { data: trades, error } = await supabase
      .from('tds_trades')
      .select('*')
      .eq('username', state.username)
      .order('trade_time', { ascending: false });
    
    if (!error && trades) {
      const formattedTrades = trades.map(trade => ({
        ...trade,
        date: trade.trade_date,
        time: new Date(trade.trade_time).toLocaleTimeString(),
        pnl: parseFloat(trade.pnl),
        tradeAmount: parseFloat(trade.trade_amount)
      }));
      setAllTrades(formattedTrades);
    }
  }

  function openEdit(trade) {
    setEditingTrade(trade);
    setEditResult(trade.result);
    setEditAmount(trade.trade_amount ? trade.trade_amount.toString() : trade.tradeAmount?.toString() || '');
    setEditWinPct(trade.win_profit_percent ? (trade.win_profit_percent * 100).toString() : '70');
    setEditDescription(trade.description || '');
    setEditDay(trade.day ? trade.day.toString() : '');
  }

  function closeEdit() {
    setEditingTrade(null);
  }

  async function handleSaveEdit() {
    if (!editingTrade) return;
    
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
    
    setProcessing(true);
    try {
      const winProfit = Number(editWinPct) / 100;
      const newState = await updateTrade(
        state, 
        editingTrade.id, 
        editResult, 
        amount, 
        winProfit, 
        editDescription.trim(), 
        day
      );
      
      if (newState) {
        setState(newState);
        await refreshTrades(); // Refresh the trades list
        closeEdit();
      }
    } catch (err) {
      console.error('Error updating trade:', err);
      alert('Failed to update trade');
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
        await refreshTrades(); // Refresh the trades list
      }
    } catch (err) {
      console.error('Error deleting trade:', err);
      alert('Failed to delete trade');
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className="p-6 min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading history...</div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="p-6 min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="p-6 min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">No data found</div>
      </main>
    );
  }

  // Filter trades based on selection
  const now = new Date();
  const filteredTrades = allTrades.filter(trade => {
    const tradeDate = new Date(trade.trade_time);
    const diffDays = Math.floor((now - tradeDate) / (1000 * 60 * 60 * 24));
    
    if (filter === '7days') return diffDays <= 7;
    if (filter === 'month') return diffDays <= 30;
    return true; // 'all'
  });

  // Calculate stats
  const totalTrades = filteredTrades.length;
  const winTrades = filteredTrades.filter(t => t.result === 'WIN').length;
  const lossTrades = filteredTrades.filter(t => t.result === 'LOSS').length;
  const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : '0';
  const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0).toFixed(2);

  return (
    <main className="p-4 min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Trade History</h1>
              <p className="text-gray-600 mt-1">Review your trading performance</p>
            </div>
            <div className="flex items-center gap-2">
              <a 
                href="/calculator" 
                className="btn text-purple-600 hover:bg-purple-50 border border-purple-300"
              >
                🧮 Calculator
              </a>
              <a 
                href="/" 
                className="btn text-gray-700 hover:bg-gray-100"
              >
                ← Back
              </a>
            </div>
          </div>

          {/* Filter buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFilter('7days')}
              className={`btn ${filter === '7days' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setFilter('month')}
              className={`btn ${filter === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              This Month
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`btn ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              All Time
            </button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="card bg-white">
              <div className="text-sm text-gray-500 mb-1">Total Trades</div>
              <div className="text-2xl font-bold text-gray-900">{totalTrades}</div>
            </div>
            <div className="card bg-emerald-50 border-emerald-200">
              <div className="text-sm text-emerald-700 mb-1">Wins</div>
              <div className="text-2xl font-bold text-emerald-600">{winTrades}</div>
            </div>
            <div className="card bg-red-50 border-red-200">
              <div className="text-sm text-red-700 mb-1">Losses</div>
              <div className="text-2xl font-bold text-red-600">{lossTrades}</div>
            </div>
            <div className="card bg-blue-50 border-blue-200">
              <div className="text-sm text-blue-700 mb-1">Win Rate</div>
              <div className="text-2xl font-bold text-blue-600">{winRate}%</div>
            </div>
          </div>

          {/* Total PnL */}
          <div className={`card ${parseFloat(totalPnL) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${parseFloat(totalPnL) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                Total P&L ({filter === '7days' ? 'Last 7 Days' : filter === 'month' ? 'This Month' : 'All Time'})
              </span>
              <span className={`text-3xl font-bold ${parseFloat(totalPnL) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${totalPnL}
              </span>
            </div>
          </div>
        </div>

        {/* Cumulative P&L Chart */}
        {filteredTrades.length > 0 && (
          <CumulativePnLChart trades={filteredTrades} depositedCapital={state.deposited_capital} />
        )}

        {/* Trades list */}
        <div className="card bg-white">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Trade Details</h2>
          
          {filteredTrades.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No trades found for this period
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTrades.map((trade, idx) => (
                <div 
                  key={idx} 
                  className={`p-4 rounded-lg border-2 ${
                    trade.result === 'WIN' 
                      ? 'bg-emerald-50 border-emerald-200' 
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          trade.result === 'WIN' 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-red-600 text-white'
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
                          Day {trade.day} • {trade.date}
                        </span>
                        <span className="text-xs text-gray-500">
                          {trade.time}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">Amount:</span> ${(trade.tradeAmount || 0).toFixed(2)}
                      </div>
                      {trade.description && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-600 italic">📝 {trade.description}</p>
                        </div>
                      )}
                    </div>
                    <div className="text-right flex items-start gap-2">
                      <div className={`text-2xl font-bold ${
                        parseFloat(trade.pnl) >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {parseFloat(trade.pnl) >= 0 ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => openEdit(trade)}
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          disabled={processing}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTrade(trade.id)}
                          className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                          disabled={processing}
                        >
                          🗑️ Del
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daily breakdown */}
        {filteredTrades.length > 0 && (
          <div className="mt-6 card bg-white">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Daily Breakdown</h2>
            <div className="space-y-3">
              {Object.entries(
                filteredTrades.reduce((acc, trade) => {
                  const date = trade.date;
                  if (!acc[date]) {
                    acc[date] = { trades: 0, wins: 0, losses: 0, pnl: 0, day: trade.day };
                  }
                  acc[date].trades++;
                  if (trade.result === 'WIN') acc[date].wins++;
                  else acc[date].losses++;
                  acc[date].pnl += trade.pnl || 0;
                  return acc;
                }, {})
              )
              .sort((a, b) => new Date(b[0]) - new Date(a[0]))
              .map(([date, stats]) => (
                <div key={date} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">
                      Day {stats.day} • {date}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {stats.trades} trades • {stats.wins}W / {stats.losses}L
                    </div>
                  </div>
                  <div className={`text-xl font-bold ${
                    stats.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {stats.pnl >= 0 ? '+' : ''}${stats.pnl.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Trade Modal */}
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
    </main>
  );
}

// Cumulative P&L Chart Component
function CumulativePnLChart({ trades, depositedCapital }) {
  // Sort trades chronologically (oldest first)
  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = new Date(a.date + ' ' + (a.time || '00:00'));
    const dateB = new Date(b.date + ' ' + (b.time || '00:00'));
    return dateA - dateB;
  });

  // Use actual deposited capital from state
  const initialCapital = depositedCapital || 10000;

  // Calculate cumulative capital for each trade, starting from initial capital
  let cumulativeCapital = initialCapital;
  
  // Get start date from first trade
  const firstTradeDate = sortedTrades.length > 0 
    ? (sortedTrades[0].time ? new Date(sortedTrades[0].time) : new Date(sortedTrades[0].date))
    : new Date();
  
  const dataPoints = [
    // Start point at initial capital
    {
      date: firstTradeDate,
      capital: initialCapital,
      trade: null
    },
    // Add each trade's effect
    ...sortedTrades.map((trade, idx) => {
      cumulativeCapital += trade.pnl || 0;
      const tradeDate = trade.time ? new Date(trade.time) : new Date(trade.date);
      return {
        date: tradeDate,
        capital: cumulativeCapital,
        trade: trade
      };
    })
  ];

  if (dataPoints.length <= 1) return null;

  // Fixed chart range for consistent scale - from 50% of initial to double initial
  // This allows seeing both losses (down to -50%) and profits (up to +100%)
  const minCapital = initialCapital * 0.5; // 50% of initial capital
  const maxCapital = initialCapital * 2; // Double the initial capital
  const target = initialCapital + 200; // $200 profit target
  const range = maxCapital - minCapital;
  
  const width = 800;
  const height = 300;
  const padding = 60;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;

  // Scale functions - X axis is trade number, Y axis is capital
  const scaleX = (tradeIndex) => {
    const maxTrades = Math.max(dataPoints.length - 1, 30); // Show at least 30 trades worth of space
    return padding + (tradeIndex / maxTrades) * chartWidth;
  };
  const scaleY = (value) => padding + chartHeight - ((value - minCapital) / range) * chartHeight;

  // Generate path for actual progress line
  const actualPath = 'M ' + scaleX(0) + ' ' + scaleY(dataPoints[0].capital) + ' ' +
    dataPoints.slice(1).map((p, i) => {
      return `L ${scaleX(i + 1)} ${scaleY(p.capital)}`;
    }).join(' ');

  // Generate area between initial capital line and actual progress
  const areaPath = 'M ' + scaleX(0) + ' ' + scaleY(initialCapital) + ' ' +
    'L ' + scaleX(0) + ' ' + scaleY(dataPoints[0].capital) + ' ' +
    dataPoints.slice(1).map((p, i) => {
      return `L ${scaleX(i + 1)} ${scaleY(p.capital)}`;
    }).join(' ') +
    ' L ' + scaleX(dataPoints.length - 1) + ' ' + scaleY(initialCapital) + ' Z';

  const currentCapital = dataPoints.length > 1 ? dataPoints[dataPoints.length - 1].capital : initialCapital;
  const profit = currentCapital - initialCapital;
  const progressPercent = ((profit / (maxCapital - initialCapital)) * 100).toFixed(1);
  const targetReached = currentCapital >= target;

  console.log('Chart Debug:', {
    initialCapital,
    currentCapital,
    profit,
    dataPointsCount: dataPoints.length,
    firstPoint: dataPoints[0],
    lastPoint: dataPoints[dataPoints.length - 1]
  });

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Capital Growth Chart</h3>
          <p className="text-sm text-gray-600">
            Started: ${initialCapital.toFixed(0)} | 
            Goal: ${(initialCapital + 200).toFixed(0)} (+$200) | 
            Chart Range: ${minCapital.toFixed(0)} - ${maxCapital.toFixed(0)}
          </p>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <div className="text-xs text-gray-500">Current Capital</div>
            <div className={`text-2xl font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ${currentCapital.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Profit/Loss</div>
            <div className={`text-2xl font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">$200 Target</div>
            <div className={`text-2xl font-bold ${targetReached ? 'text-blue-600' : 'text-gray-400'}`}>
              {targetReached ? '✓ Reached' : 
               profit < 0 ? `${Math.abs(profit).toFixed(0)} loss` :
               `$${(target - currentCapital).toFixed(0)} to go`}
            </div>
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: '300px' }}>
        {/* Grid lines at capital intervals */}
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const value = minCapital + (range * ratio);
          return (
            <line
              key={ratio}
              x1={padding}
              y1={scaleY(value)}
              x2={width - padding}
              y2={scaleY(value)}
              stroke="#f3f4f6"
              strokeWidth="1"
            />
          );
        })}

        {/* Initial capital line (baseline) */}
        <line
          x1={padding}
          y1={scaleY(initialCapital)}
          x2={width - padding}
          y2={scaleY(initialCapital)}
          stroke="#9ca3af"
          strokeWidth="2"
        />
        <text
          x={padding - 10}
          y={scaleY(initialCapital)}
          fontSize="12"
          fill="#9ca3af"
          fontWeight="bold"
          textAnchor="end"
          dominantBaseline="middle"
        >
          Start
        </text>

        {/* Target line at +$200 */}
        <line
          x1={padding}
          y1={scaleY(target)}
          x2={width - padding}
          y2={scaleY(target)}
          stroke="#3b82f6"
          strokeWidth="2"
          strokeDasharray="8 4"
        />
        <text
          x={padding - 10}
          y={scaleY(target)}
          fontSize="12"
          fill="#3b82f6"
          fontWeight="bold"
          textAnchor="end"
          dominantBaseline="middle"
        >
          +$200
        </text>

        {/* Double capital line (goal) */}
        <line
          x1={padding}
          y1={scaleY(maxCapital)}
          x2={width - padding}
          y2={scaleY(maxCapital)}
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeDasharray="8 4"
        />

        {/* Area under progress line */}
        <path
          d={areaPath}
          fill={profit >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}
        />

        {/* Actual capital progress line */}
        <path
          d={actualPath}
          fill="none"
          stroke={profit >= 0 ? '#10b981' : '#ef4444'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points on progress line */}
        {dataPoints.map((p, i) => {
          // Skip the initial point (just a starting marker)
          if (i === 0) return null;
          
          return (
            <g key={i}>
              <circle
                cx={scaleX(i)}
                cy={scaleY(p.capital)}
                r="4"
                fill={p.trade?.result === 'WIN' ? '#10b981' : '#ef4444'}
                stroke="white"
                strokeWidth="2"
              />
            </g>
          );
        })}

        {/* Y-axis labels (capital amounts) */}
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const value = minCapital + (range * ratio);
          return (
            <text 
              key={ratio}
              x={padding - 10} 
              y={scaleY(value)} 
              fontSize="12" 
              fill="#6b7280" 
              textAnchor="end" 
              dominantBaseline="middle"
            >
              ${Math.round(value)}
            </text>
          );
        })}

        {/* X-axis labels (trade numbers) */}
        {dataPoints.length > 1 && (
          <>
            <text x={scaleX(0)} y={height - padding + 20} fontSize="11" fill="#6b7280" textAnchor="middle">
              Start
            </text>
            {dataPoints.length > 5 && (
              <>
                <text x={scaleX(5)} y={height - padding + 20} fontSize="11" fill="#6b7280" textAnchor="middle">
                  #5
                </text>
                {dataPoints.length > 10 && (
                  <text x={scaleX(10)} y={height - padding + 20} fontSize="11" fill="#6b7280" textAnchor="middle">
                    #10
                  </text>
                )}
              </>
            )}
            <text x={scaleX(dataPoints.length - 1)} y={height - padding + 20} fontSize="11" fill="#6b7280" textAnchor="middle">
              #{dataPoints.length - 1}
            </text>
          </>
        )}
      </svg>

      <div className="mt-4 flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-1 bg-gray-400"></div>
          <span className="text-gray-600">Initial Capital</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5" style={{ borderTop: '2px dashed #3b82f6' }}></div>
          <span className="text-gray-600">+$200 Target</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-1 bg-emerald-500"></div>
          <span className="text-gray-600">Progress</span>
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
