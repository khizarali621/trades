"use client";
import React, { useEffect, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';

function storageKey(key) {
  return `tds_${key}`;
}

function loadInitial() {
  try {
    const v = localStorage.getItem(storageKey('initial_balance'));
    return v ? Number(v) : 0;
  } catch (e) {
    return 0;
  }
}

function saveInitial(v) {
  try {
    localStorage.setItem(storageKey('initial_balance'), String(v));
  } catch (e) {}
}

function loadTrades() {
  try {
    const raw = localStorage.getItem(storageKey('graph_trades'));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

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

function saveTrades(trades) {
  try {
    localStorage.setItem(storageKey('graph_trades'), JSON.stringify(trades));
  } catch (e) {}
}

function computeBalances(initial, trades) {
  let bal = Number(initial) || 0;
  (trades || []).forEach(t => { bal = +((bal || 0) + Number(t.amount)).toFixed(2); });
  return bal;
}

export default function Page() {
  const [initial, setInitial] = useState(0);
  const [trades, setTrades] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingInitial, setEditingInitial] = useState(true);
  const [dateInput, setDateInput] = useState('');

  useEffect(() => {
    const i = loadInitial();
    setInitial(i);
    setEditingInitial(!(Number(i) > 0));

    // Try loading from Supabase when possible
    const tryLoad = async () => {
      const username = typeof window !== 'undefined' ? localStorage.getItem('tds_username') : null;
      const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
      if (username && supabase) {
        try {
          const { data, error } = await supabase
            .from('tds_trades')
            .select('*')
            .eq('username', username)
            .eq('trade_type', 'graph')
            .order('trade_time', { ascending: true });

          if (!error && data) {
            const mapped = data.map(d => ({ id: d.id || Date.now() + Math.random(), date: d.trade_time || d.trade_date, amount: Number(d.pnl || 0) }));
            setTrades(mapped);
            saveTrades(mapped);
            return;
          }
        } catch (e) {
          // fall back to local
        }
      }

      setTrades(loadTrades());
    };

    tryLoad();
  }, []);

  function handleSaveInitial() {
    const v = Number(initial) || 0;
    setInitial(v);
    saveInitial(v);
    setEditingInitial(false);
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
    try { setDateInput(toLocalDateTimeInputValue(new Date(t.date))); } catch(e) { setDateInput(toLocalDateTimeInputValue()); }
    setEditingIndex(index);
    setShowModal(true);
  }

  async function handleAddOrEdit() {
    const amt = Number(amountInput);
    if (!amt && amt !== 0) return;

    const dateIso = dateInput ? localInputToISOString(dateInput) : new Date().toISOString();

    // Edit existing
    if (editingIndex !== null && editingIndex !== undefined) {
      const orig = trades[editingIndex];
      const next = trades.map((t, i) => i === editingIndex ? { ...t, amount: +amt.toFixed(2), date: dateIso } : t);
      setTrades(next);
      saveTrades(next);
      setShowModal(false);

      // attempt to update in Supabase by matching trade_time (date)
      try {
        const username = typeof window !== 'undefined' ? localStorage.getItem('tds_username') : null;
        const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
        if (username && supabase && orig && orig.date) {
          await supabase.from('tds_trades').update({ pnl: amt, trade_time: dateIso }).eq('username', username).eq('trade_type', 'graph').eq('trade_time', orig.date);
        }
      } catch (e) {
        console.warn('Graph edit supabase exception', e);
      }

      return;
    }

    // Add new
    const entry = { id: Date.now(), date: dateIso, amount: +amt.toFixed(2) };
    const next = (trades || []).concat([entry]);
    setTrades(next);
    saveTrades(next);
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
    } catch (e) {
      console.warn('Graph save supabase exception', e);
    }
  }

  async function deleteTrade(index) {
    const t = trades[index];
    if (!t) return;
    if (!confirm('Delete this trade?')) return;
    const next = trades.filter((_, i) => i !== index);
    setTrades(next);
    saveTrades(next);

    try {
      const username = typeof window !== 'undefined' ? localStorage.getItem('tds_username') : null;
      const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
      if (username && supabase && t.date) {
        await supabase.from('tds_trades').delete().eq('username', username).eq('trade_type', 'graph').eq('trade_time', t.date);
      }
    } catch (e) {
      console.warn('Graph delete supabase exception', e);
    }
  }

  function clearTrades() {
    if (!confirm('Clear all graph trades?')) return;
    // Clear localStorage and attempt to remove from Supabase for current user
    const username = typeof window !== 'undefined' ? localStorage.getItem('tds_username') : null;
    const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
    if (username && supabase) {
      supabase.from('tds_trades').delete().eq('username', username).eq('trade_type', 'graph').then(() => {
        setTrades([]);
        saveTrades([]);
      }).catch(() => {
        setTrades([]);
        saveTrades([]);
      });
    } else {
      setTrades([]);
      saveTrades([]);
    }
  }

  return (
    <main className="p-6 min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Graph Trades</h1>
          <a href="/graph" className="text-sm text-blue-600">View Graph</a>
        </header>

        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">{/* Initial Amount */} Final: <span className="font-semibold">${computeBalances(initial, trades).toFixed(2)}</span></    label>
            {!editingInitial && Number(initial) > 0 && (
              <div className="text-sm text-gray-600">Initial: <span className="font-semibold">${initial.toFixed(2)}</span> <button onClick={() => setEditingInitial(true)} className="ml-2 text-blue-600 text-xs">Edit</button></div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editingInitial ? (
              <>
                <input
                  type="number"
                  step="0.01"
                  value={initial}
                  onChange={(e) => setInitial(e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-40"
                />
                <button onClick={handleSaveInitial} className="px-3 py-1 text-sm rounded bg-blue-600 text-white">Save</button>
              </>
            ) : (
              <div className="text-sm text-gray-700">&nbsp;</div>
            )}

            <button onClick={openModal} className="px-3 py-1 text-sm rounded bg-green-600 text-white">Add Trade</button>
            {Number(initial) <= 0 && (
              <button onClick={clearTrades} className="px-3 py-1 text-sm rounded bg-red-100 text-red-700">Clear</button>
            )}
          </div>
        </div>

        <div className="card p-4 mb-6">
          <h2 className="font-semibold mb-3">All Trades</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-sm text-gray-700">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Win/Loss</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {(trades || []).length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-gray-500">No trades yet</td>
                  </tr>
                ) : (() => {
                  const display = [...(trades || [])].slice().reverse();
                  return display.map((t, idx) => {
                    const origIndex = (trades || []).length - 1 - idx;
                    return (
                      <tr key={t.id || idx} className={`border-t odd:bg-white even:bg-gray-50 hover:bg-gray-100`}>
                        <td className="px-4 py-2 text-sm">{idx + 1}</td>
                        <td className="px-4 py-2 text-sm">{new Date(t.date).toLocaleString()}</td>
                        <td className={`px-4 py-2 text-sm ${t.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{t.amount >= 0 ? 'WIN' : 'LOSS'}</td>
                        <td className="px-4 py-2 text-sm text-right">{t.amount >= 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-right space-x-2">
                          <button title="Edit" onClick={() => openEditModal(origIndex)} className="text-blue-600 hover:text-blue-800">✏️</button>
                          <button title="Delete" onClick={() => deleteTrade(origIndex)} className="text-red-600 hover:text-red-800">🗑️</button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-sm text-gray-600">Note: Positive amounts indicate wins, negative indicate losses.</p>
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
