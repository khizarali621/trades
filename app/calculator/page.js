'use client';
import { useState } from 'react';

export default function CalculatorPage() {
  const [capital, setCapital] = useState('');
  const [tradeAmount, setTradeAmount] = useState('');
  const [winRate, setWinRate] = useState('70');
  const [winProfit, setWinProfit] = useState('80');
  const [result, setResult] = useState(null);

  function calculateTrades() {
    const startCapital = parseFloat(capital);
    const amount = parseFloat(tradeAmount);
    const winPct = parseFloat(winRate);
    const profitPct = parseFloat(winProfit) / 100;

    if (!startCapital || startCapital <= 0) {
      alert('Enter valid starting capital');
      return;
    }

    if (!amount || amount <= 0) {
      alert('Enter valid trade amount');
      return;
    }

    const targetCapital = startCapital * 2;
    const trades = [];
    let currentCapital = startCapital;
    let tradeCount = 0;
    let wins = 0;
    let losses = 0;

    // Simulate trades until we double capital or hit max trades
    while (currentCapital < targetCapital && tradeCount < 1000) {
      tradeCount++;
      
      // Determine win or loss based on win rate
      const isWin = Math.random() * 100 < winPct;
      
      if (isWin) {
        const profit = amount * profitPct;
        currentCapital += profit;
        wins++;
        trades.push({
          num: tradeCount,
          result: 'WIN',
          amount: amount,
          pnl: profit,
          capital: currentCapital
        });
      } else {
        currentCapital -= amount;
        losses++;
        trades.push({
          num: tradeCount,
          result: 'LOSS',
          amount: amount,
          pnl: -amount,
          capital: currentCapital
        });
      }

      // Stop if capital depleted
      if (currentCapital <= 0) break;
    }

    const achieved = currentCapital >= targetCapital;
    const finalWinRate = ((wins / tradeCount) * 100).toFixed(1);

    setResult({
      startCapital,
      targetCapital,
      finalCapital: currentCapital,
      totalTrades: tradeCount,
      wins,
      losses,
      winRate: finalWinRate,
      achieved,
      trades: trades.slice(-20) // Show last 20 trades
    });
  }

  function reset() {
    setResult(null);
  }

  return (
    <main className="p-4 min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Capital Doubling Calculator</h1>
              <p className="text-gray-600 mt-1">See how many trades to double your capital</p>
            </div>
            <a 
              href="/" 
              className="btn text-gray-700 hover:bg-gray-100"
            >
              ← Back
            </a>
          </div>
        </div>

        {!result ? (
          /* Input Form */
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Enter Your Parameters</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Starting Capital ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  placeholder="e.g., 100"
                  className="input-field"
                  onWheel={(e) => e.target.blur()}
                />
                <p className="text-xs text-gray-500 mt-1">How much capital you're starting with</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount Per Trade ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  placeholder="e.g., 3"
                  className="input-field"
                  onWheel={(e) => e.target.blur()}
                />
                <p className="text-xs text-gray-500 mt-1">Fixed amount you risk per trade</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expected Win Rate (%)
                </label>
                <select
                  value={winRate}
                  onChange={(e) => setWinRate(e.target.value)}
                  className="input-field"
                >
                  <option value="50">50% - Conservative</option>
                  <option value="55">55%</option>
                  <option value="60">60%</option>
                  <option value="65">65%</option>
                  <option value="70">70% - Realistic</option>
                  <option value="75">75%</option>
                  <option value="80">80% - Optimistic</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Your estimated win percentage</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Win Profit (%)
                </label>
                <select
                  value={winProfit}
                  onChange={(e) => setWinProfit(e.target.value)}
                  className="input-field"
                >
                  {Array.from({ length: 22 }, (_, i) => 70 + i).map(pct => (
                    <option key={pct} value={pct}>{pct}%</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Profit percentage on winning trades</p>
              </div>

              <button
                onClick={calculateTrades}
                className="btn bg-blue-600 text-white hover:bg-blue-700 w-full py-4 text-lg font-bold"
              >
                📊 Calculate Trades Needed
              </button>
            </div>
          </div>
        ) : (
          /* Results Display */
          <div className="space-y-4">
            {/* Summary Card */}
            <div className={`card ${result.achieved ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
              <div className="flex items-start gap-4">
                <div className="text-5xl">{result.achieved ? '🎯' : '❌'}</div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {result.achieved ? 'Goal Achieved!' : 'Goal Not Reached'}
                  </h2>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-sm text-gray-600">Starting Capital</div>
                      <div className="text-xl font-bold text-gray-900">${result.startCapital.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Target Capital</div>
                      <div className="text-xl font-bold text-blue-600">${result.targetCapital.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Final Capital</div>
                      <div className={`text-xl font-bold ${result.finalCapital >= result.targetCapital ? 'text-emerald-600' : 'text-red-600'}`}>
                        ${result.finalCapital.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Total Trades</div>
                      <div className="text-xl font-bold text-gray-900">{result.totalTrades}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-white rounded p-2">
                      <div className="text-sm text-gray-600">Wins</div>
                      <div className="text-lg font-bold text-emerald-600">{result.wins}</div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-sm text-gray-600">Losses</div>
                      <div className="text-lg font-bold text-red-600">{result.losses}</div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-sm text-gray-600">Win Rate</div>
                      <div className="text-lg font-bold text-blue-600">{result.winRate}%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Chart */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Capital Growth Chart</h3>
              <CapitalChart 
                trades={result.trades} 
                startCapital={result.startCapital}
                targetCapital={result.targetCapital}
              />
            </div>

            {/* Last 20 Trades */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Last 20 Trades</h3>
              <div className="space-y-2">
                {result.trades.map((trade, idx) => (
                  <div 
                    key={idx}
                    className={`p-3 rounded-lg border-2 ${
                      trade.result === 'WIN' 
                        ? 'bg-emerald-50 border-emerald-200' 
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 font-mono">#{trade.num}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          trade.result === 'WIN' 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-red-600 text-white'
                        }`}>
                          {trade.result}
                        </span>
                        <span className="text-sm text-gray-700">${trade.amount.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${
                          trade.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Balance: ${trade.capital.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={calculateTrades}
                className="flex-1 btn bg-blue-600 text-white hover:bg-blue-700"
              >
                🔄 Run Again
              </button>
              <button
                onClick={reset}
                className="flex-1 btn bg-gray-600 text-white hover:bg-gray-700"
              >
                ← New Calculation
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function CapitalChart({ trades, startCapital, targetCapital }) {
  if (!trades || trades.length === 0) return null;

  const width = 700;
  const height = 300;
  const padding = { top: 20, right: 60, bottom: 40, left: 60 };

  // Data points
  const dataPoints = [{ x: 0, y: startCapital }];
  trades.forEach((trade, i) => {
    dataPoints.push({ x: i + 1, y: trade.capital });
  });

  // Calculate scales
  const allValues = dataPoints.map(p => p.y);
  const minValue = Math.min(...allValues, startCapital);
  const maxValue = Math.max(...allValues, targetCapital);
  const yMin = Math.floor(minValue * 0.95);
  const yMax = Math.ceil(maxValue * 1.05);
  const yRange = yMax - yMin;
  const xMax = dataPoints.length - 1;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const scaleX = (x) => padding.left + (x / xMax) * chartWidth;
  const scaleY = (y) => padding.top + chartHeight - ((y - yMin) / yRange) * chartHeight;

  // Y-axis ticks
  const yTicks = [yMin, startCapital, targetCapital, yMax];

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} className="mx-auto">
        {/* Grid lines */}
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

        {/* Target line */}
        <line
          x1={padding.left}
          y1={scaleY(targetCapital)}
          x2={width - padding.right}
          y2={scaleY(targetCapital)}
          stroke="#3b82f6"
          strokeWidth="2"
          strokeDasharray="4"
        />

        {/* Start line */}
        <line
          x1={padding.left}
          y1={scaleY(startCapital)}
          x2={width - padding.right}
          y2={scaleY(startCapital)}
          stroke="#9ca3af"
          strokeWidth="2"
        />

        {/* Progress line */}
        <polyline
          points={dataPoints.map(p => `${scaleX(p.x)},${scaleY(p.y)}`).join(' ')}
          fill="none"
          stroke={dataPoints[dataPoints.length - 1].y >= targetCapital ? '#10b981' : '#ef4444'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {dataPoints.map((point, i) => {
          if (i === 0 || i === dataPoints.length - 1 || i % 5 === 0) {
            return (
              <circle
                key={i}
                cx={scaleX(point.x)}
                cy={scaleY(point.y)}
                r="4"
                fill={point.y >= targetCapital ? '#10b981' : '#ef4444'}
                stroke="white"
                strokeWidth="2"
              />
            );
          }
          return null;
        })}

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

        {/* Labels */}
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
  );
}
