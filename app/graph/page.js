"use client";
import React, { useEffect, useState, useRef } from 'react';
// Chart.js and react-chartjs-2 are imported dynamically on the client to avoid server-side
// evaluation that references `window` / `document` during next build.
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';

function storageKey(key) { return `tds_${key}`; }
function loadInitial() { try { const v = localStorage.getItem(storageKey('initial_balance')); return v ? Number(v) : 0; } catch(e){return 0;} }
function loadTrades() { try { const raw = localStorage.getItem(storageKey('graph_trades')); return raw ? JSON.parse(raw) : []; } catch(e){return [];} }

function toLocalDateTimeInputValue(d = new Date()) {
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  const y = dt.getFullYear();
  const m = pad(dt.getMonth() + 1);
  const day = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mm = pad(dt.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function localInputToISOString(input) {
  if (!input) return new Date().toISOString();
  const [datePart, timePart] = input.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0] = (timePart || '').split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
  return dt.toISOString();
}

function computeBalances(initial, trades) {
  const res = [];
  let bal = Number(initial) || 0;
  res.push(+bal.toFixed(2));
  (trades || []).forEach(t => {
    bal = +((bal || 0) + Number(t.amount)).toFixed(2);
    res.push(bal);
  });
  return res;
}

export default function Page() {
  const [initial, setInitial] = useState(0);
  const [trades, setTrades] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [balances, setBalances] = useState([]);
  const chartRef = useRef(null);
  const [LineComponent, setLineComponent] = useState(null);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (typeof window === 'undefined') return;
      try {
        await import('chart.js/auto');
        const zoom = await import('chartjs-plugin-zoom');
        // register plugin if available
        try { const Chart = (await import('chart.js')).Chart; if (Chart && zoom && zoom.default) Chart.register(zoom.default); } catch(e) {}
        const mod = await import('react-chartjs-2');
        if (!mounted) return;
        setLineComponent(() => mod.Line);
        setChartReady(true);
      } catch (e) {
        console.warn('Chart dynamic import failed', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const i = loadInitial();
    const t = loadTrades();
    setInitial(i);
    setTrades(t);
    setBalances(computeBalances(i, t));
  }, []);

  // keep balances in sync when trades or initial change
  useEffect(() => {
    setBalances(computeBalances(initial, trades));
  }, [initial, trades]);

  const [animatedData, setAnimatedData] = useState([]);
  useEffect(() => {
    if (!balances || balances.length === 0) return;
    setAnimatedData([balances[0]]);
    const timers = [];
    const baseDelay = 120;
    const perStep = 500;
    for (let i = 1; i < balances.length; i++) {
      const delay = baseDelay + (i - 1) * perStep;
      timers.push(setTimeout(() => {
        setAnimatedData(prev => prev.concat([balances[prev.length] ?? balances[i]]));
        if (chartRef.current && chartRef.current.update) chartRef.current.update();
      }, delay));
    }
    return () => timers.forEach(t => clearTimeout(t));
  }, [balances]);

  function saveTradesLocal(next) {
    try { localStorage.setItem(storageKey('graph_trades'), JSON.stringify(next)); } catch (e) {}
  }

  function openModal() {
    setAmountInput('');
    setDateInput(toLocalDateTimeInputValue());
    setEditingIndex(null);
    setShowModal(true);
  }

  function openEditModal(index) {
    const t = trades[index];
    if (!t) return;
    setAmountInput(String(t.amount));
    try { setDateInput(toLocalDateTimeInputValue(new Date(t.date))); } catch(e){ setDateInput(toLocalDateTimeInputValue()); }
    setEditingIndex(index);
    setShowModal(true);
  }

  async function handleAddOrEdit() {
    const amt = Number(amountInput);
    if (!amt && amt !== 0) return;
    const dateIso = dateInput ? localInputToISOString(dateInput) : new Date().toISOString();

    if (editingIndex !== null && editingIndex !== undefined) {
      const orig = trades[editingIndex];
      const next = trades.map((t, i) => i === editingIndex ? { ...t, amount: +amt.toFixed(2), date: dateIso } : t);
      setTrades(next);
      saveTradesLocal(next);
      setShowModal(false);
      try {
        const username = typeof window !== 'undefined' ? localStorage.getItem('tds_username') : null;
        const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
        if (username && supabase && orig && orig.date) {
          await supabase.from('tds_trades').update({ pnl: amt, trade_time: dateIso }).eq('username', username).eq('trade_type', 'graph').eq('trade_time', orig.date);
        }
      } catch (e) { console.warn('Graph edit supabase exception', e); }
      return;
    }

    const entry = { id: Date.now(), date: dateIso, amount: +amt.toFixed(2) };
    const next = (trades || []).concat([entry]);
    setTrades(next);
    saveTradesLocal(next);
    setShowModal(false);

    try {
      const username = typeof window !== 'undefined' ? localStorage.getItem('tds_username') : null;
      const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
      if (username && supabase) {
        const now = entry.date;
        const result = amt >= 0 ? 'WIN' : 'LOSS';
        const { error } = await supabase.from('tds_trades').insert([{ 
          username,
          day: 0,
          trade_date: now.slice(0,10),
          trade_time: now,
          result: result,
          trade_amount: 0,
          pnl: amt,
          win_profit_percent: null,
          description: 'graph entry',
          trade_type: 'graph'
        }]);
        if (error) console.warn('Graph save supabase failed', error);
      }
    } catch (e) { console.warn('Graph save supabase exception', e); }
  }

  async function deleteTrade(index) {
    const t = trades[index];
    if (!t) return;
    if (!confirm('Delete this trade?')) return;
    const next = trades.filter((_, i) => i !== index);
    setTrades(next);
    saveTradesLocal(next);
    try {
      const username = typeof window !== 'undefined' ? localStorage.getItem('tds_username') : null;
      const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
      if (username && supabase && t.date) {
        await supabase.from('tds_trades').delete().eq('username', username).eq('trade_type', 'graph').eq('trade_time', t.date);
      }
    } catch (e) { console.warn('Graph delete supabase exception', e); }
  }

  const maxBal = Math.max(...(balances.length ? balances : [initial || 0]));
  const final = balances.length ? balances[balances.length-1] : initial || 0;

  // Y-axis: start at 50, then grow in steps of 50 (50,100,150,...).
  // When balance reaches (>=) a step, move to the next step.
  const rawMaxVal = Math.max(final, maxBal);
  let yMax;
  if (rawMaxVal < 25) {
    yMax = 25;
  } else {
    yMax = (Math.floor(rawMaxVal / 25) + 1) * 25;
  }
  // if small range <=25 use step 1, otherwise step 25
  const yGap = yMax <= 25 ? 1 : 25;

  // Adaptive tick step helpers
  function computeYStepForRange(range) {
    if (!isFinite(range) || range <= 0) return yGap;
    const maxTicks = 6;
    const candidates = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100];
    for (let s of candidates) {
      if (range / s <= maxTicks) return s;
    }
    const base = Math.pow(10, Math.floor(Math.log10(range / maxTicks)));
    return Math.max(base, yGap);
  }

  function computeXStepForRange(range) {
    if (!isFinite(range) || range <= 0) return 1;
    const maxTicks = 10;
    const candidates = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
    for (let s of candidates) {
      if (range / s <= maxTicks) return s;
    }
    const base = Math.pow(10, Math.floor(Math.log10(range / maxTicks)));
    return Math.max(1, base);
  }

  // X-axis cap: steps of 25 up to 100: 25,50,75,100
  const tradesCount = Math.max(0, (balances.length ? balances.length - 1 : 0)); // exclude initial
  const xSteps = [25, 50, 75, 100];
  let capTrades = xSteps[xSteps.length - 1];
  for (let s of xSteps) {
    // increase to next step once trades reach the current boundary
    if (tradesCount < s) { capTrades = s; break; }
  }

  const datasetPoints = animatedData.map((v, i) => ({ x: i, y: v }));

  const data = {
    datasets: [
      {
        label: 'Balance',
        data: datasetPoints,
        fill: true,
        backgroundColor: 'rgba(59,130,246,0.12)',
        borderColor: '#2563eb',
        pointBackgroundColor: '#fff',
        pointBorderColor: '#2563eb',
        pointRadius: 3.5,
        tension: 0
      }
    ]
  };

  // precompute initial Y tick settings so Chart renders correct ticks immediately
  const initialVisibleRange = yMax - 0;
  let initialYStep = computeYStepForRange(initialVisibleRange);
  if (initialVisibleRange <= 50 || (typeof yMax === 'number' && yMax <= 50)) initialYStep = 1;
  const initialAutoSkip = initialYStep !== 1;
  const initialMaxTicksLimit = initialYStep === 1 ? 1000 : Math.max(6, Math.floor(initialVisibleRange / initialYStep) + 1);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { 
      legend: { display: false }, 
      tooltip: { enabled: true },
      zoom: {
        pan: { enabled: true, mode: 'x', onPan: ({chart}) => { try { applyYTickSettings(chart); } catch(e){} } },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', onZoom: ({chart}) => { try { applyYTickSettings(chart); } catch(e){} } }
      }
    },
    scales: {
      x: { type: 'linear', position: 'bottom', min: 0, max: capTrades, ticks: { color: '#475569', stepSize: Math.max(1, Math.floor(capTrades / 10)) }, title: { display: true, text: 'Trade #', color: '#475569' } },
      y: {
        display: true,
        beginAtZero: true,
        suggestedMax: yMax,
        min: initialYStep === 1 ? 0 : undefined,
        max: initialYStep === 1 ? yMax : undefined,
        ticks: {
          stepSize: initialYStep,
          autoSkip: initialAutoSkip,
          maxTicksLimit: initialMaxTicksLimit,
          color: '#475569',
          callback: function(value) {
            if (initialYStep === 1) {
              if (Math.abs(value - Math.round(value)) < 1e-8) return String(Math.round(value));
              return '';
            }
            return String(value);
          }
        }
      }
    },
    animation: { duration: 0 }
  };

  // Apply dynamic Y tick settings based on visible range (force step=1 when visible range <= 25)
  function applyYTickSettings(chart) {
    try {
      const c = chart?.chart ? chart.chart : chart;
      if (!c) return;
      const yScale = c.scales && c.scales.y;
      if (!yScale) return;
      const visibleRange = (yScale.max || 0) - (yScale.min || 0);
      let step = computeYStepForRange(visibleRange);
      // Force integer ticks when the configured yMax or visible range is small (<=50)
      if (visibleRange <= 50 || (typeof yMax === 'number' && yMax <= 50)) step = 1;
      c.options.scales = c.options.scales || {};
      c.options.scales.y = c.options.scales.y || {};
      c.options.scales.y.ticks = c.options.scales.y.ticks || {};
      c.options.scales.y.ticks.stepSize = step;
      c.options.scales.y.ticks.autoSkip = step !== 1;
      // when forcing step=1, allow many ticks so Chart.js doesn't drop them
      if (step === 1) {
        c.options.scales.y.ticks.maxTicksLimit = 1000;
        // lock options scale min/max to integer boundaries matching the visible range
        c.options.scales.y.min = Math.floor(yScale.min || 0);
        c.options.scales.y.max = Math.ceil(yScale.max || (c.options.scales.y.max || 0));
      } else {
        c.options.scales.y.ticks.maxTicksLimit = Math.max(6, Math.floor(visibleRange / step) + 1);
        // clear explicit min/max so Chart.js can choose nice ranges
        if (c.options.scales.y.min !== undefined) delete c.options.scales.y.min;
        if (c.options.scales.y.max !== undefined) delete c.options.scales.y.max;
      }
      // When step=1, hide non-integer tick labels to avoid fractional labels
      c.options.scales.y.ticks.callback = function(value) {
        if (step === 1) {
          if (Math.abs(value - Math.round(value)) < 1e-8) return String(Math.round(value));
          return '';
        }
        return String(value);
      };
      // debug
      try { console.debug('applyYTickSettings', { visibleRange, yMin: yScale.min, yMax: yScale.max, appliedStep: step, autoSkip: c.options.scales.y.ticks.autoSkip, maxTicksLimit: c.options.scales.y.ticks.maxTicksLimit }); } catch(e){}
      c.update('none');
    } catch (e) {
      // silence
    }
  }

  // Ensure ticks are correct after mount / data changes
  useEffect(() => {
    let mounted = true;
    let tries = 0;
    const attempt = () => {
      if (!mounted) return;
      const c = chartRef.current && (chartRef.current.chart ? chartRef.current.chart : chartRef.current);
      if (c && c.scales && c.scales.y) {
        applyYTickSettings(c);
      } else if (tries < 5) {
        tries++;
        setTimeout(attempt, 120);
      }
    };
    attempt();
    return () => { mounted = false; };
  }, [balances, yMax, yGap]);

  return (
    <main className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Balance Graph</h1>
          <a href="/graph_trades" className="text-sm text-blue-600">Edit Trades</a>
        </header>

        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-700">Initial: <span className="font-semibold">${initial.toFixed(2)}</span></div>
            <div className="text-sm text-gray-700">Final: <span className="font-semibold">${final.toFixed(2)}</span></div>
          </div>

          <div className="rounded-lg bg-white" style={{ height: 740 }}>
            {LineComponent && chartReady ? (
              <LineComponent ref={chartRef} options={options} data={data} />
            ) : (
              <div className="p-8 text-center text-sm text-gray-500">Loading chart...</div>
            )}
          </div>

          <div className="mt-3 text-sm text-gray-600">Y-axis max: {yMax} • gap: {yGap}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Trades</h3>
            <div className="flex items-center gap-2">
              <button onClick={openModal} className="px-3 py-1 text-sm rounded bg-green-600 text-white">Add Trade</button>
              <button onClick={() => { if (chartRef.current) { try { chartRef.current.resetZoom?.(); } catch(e){ try { chartRef.current.chart?.resetZoom?.(); } catch(e2){} } } }} className="px-2 py-1 text-sm rounded bg-gray-200 text-gray-800">Reset Zoom</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr className="text-gray-700">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Win/Loss</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y">
                {trades.length === 0 ? (
                  <tr><td colSpan="4" className="py-6 text-center text-gray-500">No trades recorded.</td></tr>
                ) : (() => {
                  const display = [...trades].slice().reverse();
                  return display.map((t, idx) => {
                    const displayIndex = trades.length - idx;
                    return (
                      <tr key={t.id || idx} className="hover:bg-gray-50"> 
                        <td className="px-4 py-2">{displayIndex}</td>
                        <td className="px-4 py-2">{new Date(t.date).toLocaleString()}</td>
                        <td className={`px-4 py-2 ${t.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{t.amount >= 0 ? 'WIN' : 'LOSS'}</td>
                        <td className="px-4 py-2 text-right">{t.amount >= 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">{editingIndex !== null ? 'Edit Trade' : 'Add Trade'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="input-field w-full mb-2"
                />

                <label className="block text-sm text-gray-700 mb-1">Profit / Loss Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="e.g. 1 or -2"
                  className="input-field w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Positive = win, negative = loss</p>
              </div>

              <div className="flex gap-3">
                <button onClick={handleAddOrEdit} className="flex-1 btn bg-blue-600 text-white">{editingIndex !== null ? 'Save' : 'Add'}</button>
                <button onClick={() => setShowModal(false)} className="flex-1 btn bg-gray-200">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
