// import React, { useEffect, useMemo, useState } from 'react';
// import { api, fmt, fmtMoney, money, curveStats, realizedFIFO, backtestSMA, downloadCSV, pearson } from '../lib.js';
// import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// const tip = { background: '#fff', border: '1px solid #E1E7DF', borderRadius: 10, fontSize: 12 };
// const tick = { fill: '#68796D', fontSize: 10 };

// const SCENARIOS = [
//   { name: 'Market crash', shock: -15, note: 'Broad panic, 2008-style week' },
//   { name: 'Sharp correction', shock: -7, note: 'Risk-off rotation' },
//   { name: 'Mild dip', shock: -3, note: 'Ordinary pullback' },
//   { name: 'Relief rally', shock: 8, note: 'Short-covering bounce' },
//   { name: 'Bull run', shock: 15, note: 'Sustained risk appetite' }
// ];

// export default function RiskLab({ summary }) {
//   const [curve, setCurve] = useState([]);
//   const [orders, setOrders] = useState([]);
//   const [alerts, setAlerts] = useState([]);
//   const [btSym, setBtSym] = useState('AAPL');
//   const [fast, setFast] = useState(20);
//   const [slow, setSlow] = useState(50);
//   const [bt, setBt] = useState(null);
//   const [btLoading, setBtLoading] = useState(false);
//   const [corr, setCorr] = useState(null);

//   useEffect(() => {
//     api.get('/portfolio/curve?days=60').then(r => setCurve(r.data)).catch(() => {});
//     api.get('/trade/orders').then(r => setOrders(r.data)).catch(() => {});
//     api.get('/alerts').then(r => setAlerts(r.data)).catch(() => {});
//   }, [summary]);

//   const stats = useMemo(() => curveStats(curve), [curve]);
//   const journal = useMemo(() => realizedFIFO(orders), [orders]);

//   // portfolio heat: worst-case loss if every armed stop-loss is hit
//   const liveStops = alerts.filter(a => a.active && !a.triggered && a.kind === 'STOP_LOSS');
//   const stopOf = (sym) => liveStops.find(s => s.symbol === sym);
//   const naked = (summary?.positions || []).filter(p => !stopOf(p.symbol));
//   const heat = (summary?.positions || []).reduce((a, p) => {
//     const s = stopOf(p.symbol);
//     return s && s.price < p.lastPrice ? a + (p.lastPrice - s.price) * p.qty : a;
//   }, 0);

//   // discipline: share of executions carrying a written thesis
//   const filled = orders.filter(o => o.status === 'FILLED');
//   const withThesis = filled.filter(o => o.note && o.note.split('|')[0].trim());
//   const confs = withThesis.map(o => parseInt(o.note.split('|')[1] || '3')).filter(n => !Number.isNaN(n));
//   const discipline = filled.length ? Math.round((withThesis.length / filled.length) * 100) : null;
//   const avgConf = confs.length ? (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(1) : null;

//   const invested = summary?.invested || 0;
//   const equity = summary?.equity || 0;
//   const heatPct = equity ? (heat / equity) * 100 : 0;
//   const cashPct = equity ? (summary.cash / equity) * 100 : 100;
//   const topW = summary?.allocation?.[0];
//   const hhi = summary?.allocation?.length ? summary.allocation.reduce((a, x) => a + (x.pct / 100) ** 2, 0) : 0;
//   const diversification = summary?.allocation?.length ? Math.max(0, Math.round((1 - (hhi - 1 / summary.allocation.length) / (1 - 1 / Math.max(summary.allocation.length, 2))) * 100)) : 100;

//   const verdict = !summary?.positions?.length
//     ? { cls: 'ok', text: 'All in cash — no market risk. Put a small position to work from the dealing desk to begin learning.' }
//     : naked.length === summary.positions.length
//       ? { cls: 'risk', text: `No stop-loss armed on any holding — a gap down hits the full ${fmtMoney(invested)}. Set stops on the ticket or the Alerts desk; professionals never trade naked.` }
//       : topW && topW.pct > 60
//         ? { cls: 'risk', text: `Concentrated book — ${topW.symbol} is ${topW.pct}% of invested capital. A single-name shock flows straight to net worth.` }
//         : heatPct > 8
//           ? { cls: 'warn', text: `Stops are armed, but a sweep of all of them still costs ${fmtMoney(heat)} (${fmt(heatPct)}% of net worth). Trim size or tighten stops.` }
//           : cashPct < 15
//             ? { cls: 'warn', text: 'Fully deployed with a thin cash buffer. Keep 15–25% aside so drawdowns become buying opportunities, not margin calls.' }
//             : { cls: 'ok', text: `Defended book — armed stops cap worst-case pain near ${fmtMoney(heat)}, with a sensible buffer. This is how funds survive first years.` };

//   const runBacktest = async () => {
//     setBtLoading(true);
//     try {
//       const { data: hist } = await api.get(`/market/history?symbol=${btSym}&days=140`);
//       setBt({ symbol: btSym.toUpperCase(), ...backtestSMA(hist, +fast || 20, +slow || 50) });
//     } finally { setBtLoading(false); }
//   };
//   useEffect(() => { runBacktest(); }, []);

//   // diversification matrix: pairwise correlation of daily returns across holdings
//   useEffect(() => {
//     const syms = (summary?.positions || []).map(p => p.symbol);
//     if (syms.length < 2) { setCorr(null); return; }
//     Promise.all(syms.map(s => api.get(`/market/history?symbol=${s}&days=60`).then(r => ({ s, h: r.data })).catch(() => null)))
//       .then(rows => {
//         const valid = rows.filter(Boolean);
//         if (valid.length < 2) { setCorr(null); return; }
//         const dates = valid[0].h.map(x => x.date);
//         const series = valid.map(v => {
//           const m = Object.fromEntries(v.h.map(x => [x.date, x.close]));
//           const r = [];
//           for (let i = 1; i < dates.length; i++) {
//             if (m[dates[i]] && m[dates[i - 1]]) r.push((m[dates[i]] - m[dates[i - 1]]) / m[dates[i - 1]]);
//           }
//           return { s: v.s, r };
//         });
//         const n = Math.min(...series.map(x => x.r.length));
//         setCorr(series.map(a => ({ s: a.s, row: series.map(b => pearson(a.r.slice(-n), b.r.slice(-n))) })));
//       });
//   }, [summary]);

//   return (
//     <>
//       <div className="kpis num">
//         <div className="kpi"><label>Value at risk · 95%</label><div className="v">{stats ? fmtMoney(stats.var95) : '…'}</div><div className="s">daily loss rarely exceeded</div></div>
//         <div className="kpi"><label>Max drawdown</label><div className={`v ${stats && stats.maxDDPct < -5 ? 'neg' : ''}`}>{stats ? `${fmt(stats.maxDDPct)}%` : '…'}</div><div className="s">peak-to-trough, 60 sessions</div></div>
//         <div className="kpi"><label>Sharpe · ann.</label><div className="v">{stats ? fmt(stats.sharpe) : '…'}</div><div className="s">{stats ? (stats.sharpe > 1 ? 'strong risk-adjusted return' : stats.sharpe > 0 ? 'modest, room to improve' : 'negative — review sizing') : ''}</div></div>
//         <div className="kpi"><label>Diversification</label><div className="v">{summary ? `${diversification}/100` : '…'}</div><div className="s">{summary?.allocation?.length || 0} holdings</div></div>
//         <div className="kpi"><label>Cash buffer</label><div className="v">{summary ? `${fmt(cashPct)}%` : '…'}</div><div className="s">of net worth in cash</div></div>
//         <div className="kpi"><label>Heat · all stops hit</label><div className={`v ${heatPct > 8 ? 'neg' : ''}`}>{summary ? fmtMoney(heat) : '…'}</div><div className="s">{summary ? `${fmt(heatPct)}% of net worth · ${naked.length} naked holding(s)` : 'worst case under stops'}</div></div>
//       </div>

//       <div className={`verdict ${verdict.cls}`}><b>House view — </b>{verdict.text}</div>

//       <div className="grid2e">
//         <div className="panel">
//           <h3>Stress test</h3>
//           <p className="sub">What each market weather would do to today's book of {fmtMoney(invested)} invested.</p>
//           <table className="num"><thead><tr><th>Scenario</th><th>Shock</th><th>Est. impact</th><th>Net worth after</th></tr></thead>
//             <tbody>{SCENARIOS.map(s => {
//               const impact = invested * (s.shock / 100);
//               return (
//                 <tr key={s.name}>
//                   <td><span className="scen">{s.name}</span><br /><span className="muted" style={{ fontSize: 11 }}>{s.note}</span></td>
//                   <td className={s.shock >= 0 ? 'pos' : 'neg'}><b>{s.shock >= 0 ? '+' : ''}{s.shock}%</b></td>
//                   <td className={impact >= 0 ? 'pos' : 'neg'}><b>{fmtMoney(impact)}</b></td>
//                   <td><b>₹{fmt(equity + impact)}</b></td>
//                 </tr>
//               );
//             })}</tbody></table>
//           {summary?.positions?.length > 0 && (
//             <>
//               <hr className="rule" />
//               <p className="sub">Crash drill — every holding under a −15% shock.</p>
//               <table className="num"><thead><tr><th>Holding</th><th>Value now</th><th>After shock</th><th>Loss</th></tr></thead>
//                 <tbody>{summary.positions.map(p => {
//                   const v = p.lastPrice * p.qty, after = v * 0.85;
//                   return <tr key={p.symbol}><td><b className="sym">{p.symbol}</b></td><td>{money(v, p.symbol)}</td><td>{money(after, p.symbol)}</td><td className="neg"><b>{money(after - v, p.symbol)}</b></td></tr>;
//                 })}</tbody></table>
//             </>
//           )}
//         </div>

//         <div className="panel">
//           <h3>Strategy backtester</h3>
//           <p className="sub">Trend-following rule: hold when the fast average sits above the slow one, else stand in cash. ₹100 model capital.</p>
//           <div className="row" style={{ marginBottom: 10 }}>
//             <div className="field"><label>Symbol</label><input value={btSym} onChange={e => setBtSym(e.target.value.toUpperCase())} style={{ width: 110 }} /></div>
//             <div className="field"><label>Fast SMA</label><input type="number" value={fast} onChange={e => setFast(e.target.value)} style={{ width: 80 }} /></div>
//             <div className="field"><label>Slow SMA</label><input type="number" value={slow} onChange={e => setSlow(e.target.value)} style={{ width: 80 }} /></div>
//             <button className="btn" onClick={runBacktest} disabled={btLoading}>{btLoading ? 'Running…' : 'Run test'}</button>
//           </div>
//           {bt && (
//             <>
//               <div className="kpis num" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
//                 <div className="kpi"><label>Strategy</label><div className="v" style={{ fontSize: 20 }}><span className={bt.stratRet >= 0 ? 'pos' : 'neg'}>{bt.stratRet >= 0 ? '+' : ''}{bt.stratRet}%</span></div></div>
//                 <div className="kpi"><label>Buy & hold</label><div className="v" style={{ fontSize: 20 }}><span className={bt.holdRet >= 0 ? 'pos' : 'neg'}>{bt.holdRet >= 0 ? '+' : ''}{bt.holdRet}%</span></div></div>
//                 <div className="kpi"><label>Trades</label><div className="v" style={{ fontSize: 20 }}>{bt.trades}</div></div>
//                 <div className="kpi"><label>Win rate</label><div className="v" style={{ fontSize: 20 }}>{bt.winRate}%</div></div>
//               </div>
//               <ResponsiveContainer width="100%" height={200}>
//                 <LineChart data={bt.curve}>
//                   <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={50} /><YAxis tick={tick} domain={['auto', 'auto']} width={56} />
//                   <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
//                   <Line type="monotone" dataKey="strat" name={`${bt.symbol} SMA ${fast}/${slow}`} stroke="#0C6B43" strokeWidth={2} dot={false} />
//                   <Line type="monotone" dataKey="hold" name="Buy & hold" stroke="#9A7B24" strokeDasharray="5 4" strokeWidth={1.8} dot={false} />
//                 </LineChart>
//               </ResponsiveContainer>
//               <p className="note">Verdict: {bt.stratRet > bt.holdRet ? 'the rule beat buy-and-hold on this window — trends were clean.' : 'buy-and-hold won here — choppy, whipsaw market punished the rule.'} Past paper performance implies nothing about tomorrow.</p>
//             </>
//           )}
//         </div>
//       </div>

//       <div className="panel">
//         <h3>Diversification matrix</h3>
//         <p className="sub">Pairwise correlation of daily returns, 60 sessions. Deep green = move together (no shelter); pale = genuine diversification. Anything above 0.8 is basically one bet.</p>
//         {!corr ? <p className="note">Hold two or more securities to map how they move together.</p> : (
//           <table className="num matrix"><thead><tr><th className="sym">Holding</th>{corr.map(c => <th key={c.s}>{c.s}</th>)}</tr></thead>
//             <tbody>{corr.map((r, i) => (
//               <tr key={r.s}><td className="sym"><b className="sym">{r.s}</b></td>
//                 {r.row.map((v, j) => {
//                   const diag = i === j;
//                   const bg = diag ? '#0A3D26' : v >= 0 ? `rgba(12,107,67,${(0.07 + v * 0.55).toFixed(2)})` : `rgba(174,58,48,${(0.07 + Math.abs(v) * 0.55).toFixed(2)})`;
//                   return <td key={j} style={{ background: bg, color: diag ? '#fff' : '#17241C', fontWeight: 700 }}>{diag ? '1.00' : fmt(v)}</td>;
//                 })}
//               </tr>))}
//             </tbody></table>
//         )}
//       </div>

//       <div className="panel">
//         <div className="row">
//           <div style={{ marginRight: 'auto' }}>
//             <h3>Trade journal — realised P&L</h3>
//             <p className="sub">Profits locked in via sells, FIFO-matched. Total <b className={journal.total >= 0 ? 'pos' : 'neg'}>{fmtMoney(journal.total)}</b> across {journal.trades.length} round trips.
//               {discipline == null ? ' No executions yet — discipline starts with your first ticketed thesis.' : <> Discipline <b>{discipline}%</b> of executions carried a written thesis{avgConf ? <> · average conviction {avgConf}/5</> : ''}.</>}</p>
//           </div>
//           <div className="row">
//             <button className="btn ghost" disabled={!journal.trades.length} onClick={() => downloadCSV('stockpulse-journal.csv', journal.trades)}>Export journal</button>
//             <button className="btn ghost" disabled={!orders.length} onClick={() => downloadCSV('stockpulse-orders.csv', orders.map(o => ({ time: o.createdAt, symbol: o.symbol, side: o.side, type: o.type, qty: o.qty, limit: o.limitPrice || '', exec: o.execPrice || '', status: o.status, thesis: (o.note || '').split('|')[0] })))}>Export orders</button>
//           </div>
//         </div>
//         {!journal.trades.length ? <p className="note">No completed round trips yet — sell a position to book your first entry here.</p> : (
//           <table className="num"><thead><tr><th>Closed</th><th>Security</th><th>Qty</th><th>Bought</th><th>Sold</th><th>P&L</th></tr></thead>
//             <tbody>{journal.trades.map((t, i) => (
//               <tr key={i}><td className="muted">{new Date(t.closed).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
//                 <td><b className="sym">{t.symbol}</b></td><td>{t.qty}</td><td>₹{fmt(t.buy)}</td><td>₹{fmt(t.sell)}</td>
//                 <td className={t.pnl >= 0 ? 'pos' : 'neg'}><b>{fmtMoney(t.pnl)}</b> <span className="muted">({t.pnlPct}%)</span></td></tr>))}
//             </tbody></table>
//         )}
//       </div>
//     </>
//   );
// }

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fmt, fmtMoney, money, curveStats, realizedFIFO, backtestSMA, downloadCSV, pearson } from '../lib.js';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import './risklab.css';

const tip = { background: '#fff', border: '1px solid #E1E7DF', borderRadius: 10, fontSize: 12 };
const tick = { fill: '#68796D', fontSize: 10 };
const signed = n => `${n >= 0 ? '+' : ''}${n}%`;

const SCENARIOS = [
  { name: 'Market crash', shock: -15, note: 'Broad panic, 2008-style week' },
  { name: 'Sharp correction', shock: -7, note: 'Risk-off rotation' },
  { name: 'Mild dip', shock: -3, note: 'Ordinary pullback' },
  { name: 'Relief rally', shock: 8, note: 'Short-covering bounce' },
  { name: 'Bull run', shock: 15, note: 'Sustained risk appetite' }
];

/* ---------- pure calculations ---------- */

function computeHeat(positions = [], alerts = []) {
  const stops = alerts.filter(a => a.active && !a.triggered && a.kind === 'STOP_LOSS');
  const stopOf = sym => stops.find(s => s.symbol === sym);
  const naked = positions.filter(p => !stopOf(p.symbol));
  const heat = positions.reduce((a, p) => {
    const s = stopOf(p.symbol);
    return s && s.price < p.lastPrice ? a + (p.lastPrice - s.price) * p.qty : a;
  }, 0);
  return { heat, naked };
}

function computeDiscipline(orders = []) {
  const filled = orders.filter(o => o.status === 'FILLED');
  const parts = o => (o.note || '').split('|');
  const withThesis = filled.filter(o => parts(o)[0].trim());
  // only count a conviction score when one was actually written
  const confs = withThesis.map(o => parseInt(parts(o)[1], 10)).filter(n => Number.isFinite(n));
  return {
    pct: filled.length ? Math.round((withThesis.length / filled.length) * 100) : null,
    avgConf: confs.length ? (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(1) : null
  };
}

// 100 = perfectly even weights, 0 = everything in one name (normalised HHI)
function computeDiversification(allocation = []) {
  const n = allocation.length;
  if (n < 2) return n === 1 ? 0 : 100;
  const hhi = allocation.reduce((a, x) => a + (x.pct / 100) ** 2, 0);
  return Math.max(0, Math.round((1 - (hhi - 1 / n) / (1 - 1 / n)) * 100));
}

function buildVerdict({ summary, naked, heat, heatPct, cashPct }) {
  const positions = summary?.positions || [];
  const topW = summary?.allocation?.[0];
  if (!positions.length) return { cls: 'ok', text: 'All in cash — no market risk. Put a small position to work from the dealing desk to begin learning.' };
  if (naked.length === positions.length) return { cls: 'risk', text: `No stop-loss armed on any holding — a gap down hits the full ${fmtMoney(summary.invested || 0)}. Set stops on the ticket or the Alerts desk; professionals never trade naked.` };
  if (topW && topW.pct > 60) return { cls: 'risk', text: `Concentrated book — ${topW.symbol} is ${topW.pct}% of invested capital. A single-name shock flows straight to net worth.` };
  if (heatPct > 8) return { cls: 'warn', text: `Stops are armed, but a sweep of all of them still costs ${fmtMoney(heat)} (${fmt(heatPct)}% of net worth). Trim size or tighten stops.` };
  if (cashPct < 15) return { cls: 'warn', text: 'Fully deployed with a thin cash buffer. Keep 15–25% aside so drawdowns become buying opportunities, not margin calls.' };
  return { cls: 'ok', text: `Defended book — armed stops cap worst-case pain near ${fmtMoney(heat)}, with a sensible buffer. This is how funds survive first years.` };
}

// Correlate daily returns on dates common to ALL holdings (handles mixed trading calendars).
function buildCorrelation(histories) {
  const maps = histories.map(({ s, h }) => ({ s, m: new Map(h.map(x => [x.date, x.close])) }));
  const dates = [...maps[0].m.keys()].filter(d => maps.every(x => x.m.has(d))).sort();
  if (dates.length < 8) return null;
  const series = maps.map(({ s, m }) => ({
    s,
    r: dates.slice(1).map((d, i) => (m.get(d) - m.get(dates[i])) / m.get(dates[i]))
  }));
  return {
    sessions: dates.length - 1,
    rows: series.map(a => ({ s: a.s, row: series.map(b => pearson(a.r, b.r)) }))
  };
}

function highPairs(corr, limit = 0.8) {
  const out = [];
  corr.rows.forEach((r, i) => r.row.forEach((v, j) => {
    if (j > i && v > limit) out.push({ a: r.s, b: corr.rows[j].s, v });
  }));
  return out;
}

/* ---------- data hooks ---------- */

function useRiskData(summary) {
  const [data, setData] = useState({ curve: [], orders: [], alerts: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    Promise.all([
      api.get('/portfolio/curve?days=60'),
      api.get('/trade/orders'),
      api.get('/alerts')
    ])
      .then(([c, o, a]) => { if (live) { setData({ curve: c.data, orders: o.data, alerts: a.data }); setError(''); } })
      .catch(() => live && setError('Some risk data could not be loaded. Figures below may be incomplete.'));
    return () => { live = false; };
  }, [summary]);
  return { ...data, error };
}

function useBacktest() {
  const [state, setState] = useState({ bt: null, loading: false, error: '' });
  const ticket = useRef(0);
  const run = useCallback(async (symbol, fast, slow) => {
    const sym = symbol.trim().toUpperCase();
    const f = parseInt(fast, 10), s = parseInt(slow, 10);
    if (!sym) return setState(p => ({ ...p, error: 'Enter a symbol to test.' }));
    if (!(f >= 2) || !(s > f)) return setState(p => ({ ...p, error: 'Fast SMA must be at least 2 and shorter than slow SMA.' }));
    const id = ++ticket.current;
    setState(p => ({ ...p, loading: true, error: '' }));
    try {
      const { data: hist } = await api.get(`/market/history?symbol=${sym}&days=140`);
      if (id !== ticket.current) return; // a newer run superseded this one
      if (!Array.isArray(hist) || hist.length <= s) throw new Error(`Only ${hist?.length || 0} sessions of history for ${sym} — need more than ${s}.`);
      setState({ bt: { symbol: sym, fast: f, slow: s, ...backtestSMA(hist, f, s) }, loading: false, error: '' });
    } catch (e) {
      if (id === ticket.current) setState(p => ({
        ...p, loading: false,
        error: e.message?.startsWith('Only') ? e.message : `Couldn't run the test for ${sym}. Check the symbol and try again.`
      }));
    }
  }, []);
  return { ...state, run };
}

function useCorrelation(positions) {
  const key = useMemo(() => [...new Set((positions || []).map(p => p.symbol))].sort().join(','), [positions]);
  const [state, setState] = useState({ corr: null, loading: false });
  useEffect(() => {
    const syms = key ? key.split(',') : [];
    if (syms.length < 2) { setState({ corr: null, loading: false }); return; }
    let live = true;
    setState(p => ({ ...p, loading: true }));
    Promise.all(syms.map(s => api.get(`/market/history?symbol=${s}&days=60`).then(r => ({ s, h: r.data })).catch(() => null)))
      .then(rows => {
        if (!live) return;
        const valid = rows.filter(Boolean);
        setState({ corr: valid.length >= 2 ? buildCorrelation(valid) : null, loading: false });
      });
    return () => { live = false; };
  }, [key]); // refetch only when the set of holdings changes, not on every price tick
  return state;
}

/* ---------- components ---------- */

function Kpi({ label, value, sub, bad, ready = true }) {
  return (
    <div className={`kpi ${ready ? '' : 'skeleton'}`}>
      <label>{label}</label>
      <div className={`v ${bad ? 'neg' : ''}`}>{ready ? value : '…'}</div>
      <div className="s">{sub}</div>
    </div>
  );
}

function KpiStrip({ stats, summary, diversification, cashPct, heat, heatPct, naked }) {
  const sharpeNote = !stats ? '' : stats.sharpe > 1 ? 'strong risk-adjusted return' : stats.sharpe > 0 ? 'modest, room to improve' : 'negative — review sizing';
  return (
    <div className="kpis num">
      <Kpi label="Value at risk · 95%" ready={!!stats} value={stats && fmtMoney(stats.var95)} sub="daily loss rarely exceeded" />
      <Kpi label="Max drawdown" ready={!!stats} bad={stats && stats.maxDDPct < -5} value={stats && `${fmt(stats.maxDDPct)}%`} sub="peak-to-trough, 60 sessions" />
      <Kpi label="Sharpe · ann." ready={!!stats} value={stats && fmt(stats.sharpe)} sub={sharpeNote} />
      <Kpi label="Diversification" ready={!!summary} value={`${diversification}/100`} sub={`${summary?.allocation?.length || 0} holdings`} />
      <Kpi label="Cash buffer" ready={!!summary} value={`${fmt(cashPct)}%`} sub="of net worth in cash" />
      <Kpi label="Heat · all stops hit" ready={!!summary} bad={heatPct > 8} value={fmtMoney(heat)} sub={summary ? `${fmt(heatPct)}% of net worth · ${naked.length} naked holding(s)` : 'worst case under stops'} />
    </div>
  );
}

function StressTest({ summary, invested, equity }) {
  const [custom, setCustom] = useState(-10);
  const rows = [{ name: 'Your scenario', shock: custom, note: 'Set with the slider above' }, ...SCENARIOS];
  return (
    <div className="panel">
      <h3>Stress test</h3>
      <p className="sub">What each market weather would do to today's book of {fmtMoney(invested)} invested.</p>
      <div className="shock">
        <label htmlFor="shock">Custom shock</label>
        <input id="shock" type="range" min={-50} max={50} step={1} value={custom} onChange={e => setCustom(+e.target.value)} />
        <b className="num" style={{ minWidth: 48 }}>{signed(custom)}</b>
      </div>
      <div className="tablewrap">
        <table className="num"><thead><tr><th>Scenario</th><th>Shock</th><th>Est. impact</th><th>Net worth after</th></tr></thead>
          <tbody>{rows.map(s => {
            const impact = invested * (s.shock / 100);
            return (
              <tr key={s.name}>
                <td><span className="scen">{s.name}</span><br /><span className="muted" style={{ fontSize: 11 }}>{s.note}</span></td>
                <td className={s.shock >= 0 ? 'pos' : 'neg'}><b>{signed(s.shock)}</b></td>
                <td className={impact >= 0 ? 'pos' : 'neg'}><b>{fmtMoney(impact)}</b></td>
                <td><b>₹{fmt(equity + impact)}</b></td>
              </tr>
            );
          })}</tbody></table>
      </div>
      {summary?.positions?.length > 0 && (
        <>
          <hr className="rule" />
          <p className="sub">Crash drill — every holding under a −15% shock.</p>
          <div className="tablewrap">
            <table className="num"><thead><tr><th>Holding</th><th>Value now</th><th>After shock</th><th>Loss</th></tr></thead>
              <tbody>{summary.positions.map(p => {
                const v = p.lastPrice * p.qty, after = v * 0.85;
                return <tr key={p.symbol}><td><b className="sym">{p.symbol}</b></td><td>{money(v, p.symbol)}</td><td>{money(after, p.symbol)}</td><td className="neg"><b>{money(after - v, p.symbol)}</b></td></tr>;
              })}</tbody></table>
          </div>
        </>
      )}
    </div>
  );
}

function Backtester() {
  const [sym, setSym] = useState('AAPL');
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(50);
  const { bt, loading, error, run } = useBacktest();
  useEffect(() => { run(sym, fast, slow); }, [run]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSubmit = e => { e.preventDefault(); run(sym, fast, slow); };
  const Ret = ({ v }) => <span className={v >= 0 ? 'pos' : 'neg'}>{v >= 0 ? '+' : ''}{v}%</span>;

  return (
    <div className="panel">
      <h3>Strategy backtester</h3>
      <p className="sub">Trend-following rule: hold when the fast average sits above the slow one, else stand in cash. ₹100 model capital.</p>
      <form className="row" style={{ marginBottom: 10 }} onSubmit={onSubmit}>
        <div className="field"><label htmlFor="bt-sym">Symbol</label><input id="bt-sym" value={sym} onChange={e => setSym(e.target.value.toUpperCase())} style={{ width: 110 }} /></div>
        <div className="field"><label htmlFor="bt-fast">Fast SMA</label><input id="bt-fast" type="number" min={2} value={fast} onChange={e => setFast(e.target.value)} style={{ width: 80 }} /></div>
        <div className="field"><label htmlFor="bt-slow">Slow SMA</label><input id="bt-slow" type="number" min={3} value={slow} onChange={e => setSlow(e.target.value)} style={{ width: 80 }} /></div>
        <button className="btn" type="submit" disabled={loading}>{loading ? 'Running…' : 'Run test'}</button>
      </form>
      {error && <div className="banner err" role="alert">{error}</div>}
      {bt && (
        <>
          <div className="kpis num" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', opacity: loading ? 0.6 : 1 }}>
            <div className="kpi"><label>Strategy</label><div className="v" style={{ fontSize: 20 }}><Ret v={bt.stratRet} /></div></div>
            <div className="kpi"><label>Buy & hold</label><div className="v" style={{ fontSize: 20 }}><Ret v={bt.holdRet} /></div></div>
            <div className="kpi"><label>Trades</label><div className="v" style={{ fontSize: 20 }}>{bt.trades}</div></div>
            <div className="kpi"><label>Win rate</label><div className="v" style={{ fontSize: 20 }}>{bt.winRate}%</div></div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={bt.curve}>
              <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={50} /><YAxis tick={tick} domain={['auto', 'auto']} width={56} />
              <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="strat" name={`${bt.symbol} SMA ${bt.fast}/${bt.slow}`} stroke="#0C6B43" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="hold" name="Buy & hold" stroke="#9A7B24" strokeDasharray="5 4" strokeWidth={1.8} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="note">Verdict: {bt.stratRet > bt.holdRet ? 'the rule beat buy-and-hold on this window — trends were clean.' : 'buy-and-hold won here — choppy, whipsaw market punished the rule.'} Past paper performance implies nothing about tomorrow.</p>
        </>
      )}
    </div>
  );
}

function CorrelationMatrix({ positions }) {
  const { corr, loading } = useCorrelation(positions);
  const pairs = useMemo(() => (corr ? highPairs(corr) : []), [corr]);
  const exportCsv = () => downloadCSV('stockpulse-correlation.csv',
    corr.rows.map(r => ({ holding: r.s, ...Object.fromEntries(r.row.map((v, j) => [corr.rows[j].s, v.toFixed(2)])) })));

  return (
    <div className="panel">
      <div className="row">
        <div style={{ marginRight: 'auto' }}>
          <h3>Diversification matrix</h3>
          <p className="sub">Pairwise correlation of daily returns{corr ? `, ${corr.sessions} shared sessions` : ''}. Deep green = move together (no shelter); pale = genuine diversification. Anything above 0.8 is basically one bet.</p>
        </div>
        <button className="btn ghost" disabled={!corr} onClick={exportCsv}>Export matrix</button>
      </div>
      {loading && !corr ? <p className="note">Loading price history…</p>
        : !corr ? <p className="note">Hold two or more securities with overlapping trading days to map how they move together.</p> : (
          <>
            <div className="tablewrap">
              <table className="num matrix"><thead><tr><th className="sym">Holding</th>{corr.rows.map(c => <th key={c.s}>{c.s}</th>)}</tr></thead>
                <tbody>{corr.rows.map((r, i) => (
                  <tr key={r.s}><td className="sym"><b className="sym">{r.s}</b></td>
                    {r.row.map((v, j) => {
                      const diag = i === j;
                      const a = (0.07 + Math.abs(v) * 0.55).toFixed(2);
                      const bg = diag ? '#0A3D26' : v >= 0 ? `rgba(12,107,67,${a})` : `rgba(174,58,48,${a})`;
                      return <td key={j} style={{ background: bg, color: diag ? '#fff' : '#17241C', fontWeight: 700 }}>{diag ? '1.00' : fmt(v)}</td>;
                    })}
                  </tr>))}
                </tbody></table>
            </div>
            <div className="legend"><span>−1</span><i /><span>+1</span></div>
            {pairs.length > 0 && (
              <div className="chips" aria-label="Highly correlated pairs">
                {pairs.map(p => <span className="chip" key={p.a + p.b}>{p.a} + {p.b}: {fmt(p.v)} — effectively one bet</span>)}
              </div>
            )}
          </>
        )}
    </div>
  );
}

function TradeJournal({ journal, orders, discipline }) {
  const orderRows = () => orders.map(o => ({
    time: o.createdAt, symbol: o.symbol, side: o.side, type: o.type, qty: o.qty,
    limit: o.limitPrice || '', exec: o.execPrice || '', status: o.status, thesis: (o.note || '').split('|')[0]
  }));
  return (
    <div className="panel">
      <div className="row">
        <div style={{ marginRight: 'auto' }}>
          <h3>Trade journal — realised P&L</h3>
          <p className="sub">Profits locked in via sells, FIFO-matched. Total <b className={journal.total >= 0 ? 'pos' : 'neg'}>{fmtMoney(journal.total)}</b> across {journal.trades.length} round trips.
            {discipline.pct == null
              ? ' No executions yet — discipline starts with your first ticketed thesis.'
              : <> Discipline <b>{discipline.pct}%</b> of executions carried a written thesis{discipline.avgConf ? <> · average conviction {discipline.avgConf}/5</> : ''}.</>}</p>
        </div>
        <div className="row">
          <button className="btn ghost" disabled={!journal.trades.length} onClick={() => downloadCSV('stockpulse-journal.csv', journal.trades)}>Export journal</button>
          <button className="btn ghost" disabled={!orders.length} onClick={() => downloadCSV('stockpulse-orders.csv', orderRows())}>Export orders</button>
        </div>
      </div>
      {!journal.trades.length ? <p className="note">No completed round trips yet — sell a position to book your first entry here.</p> : (
        <div className="tablewrap">
          <table className="num"><thead><tr><th>Closed</th><th>Security</th><th>Qty</th><th>Bought</th><th>Sold</th><th>P&L</th></tr></thead>
            <tbody>{journal.trades.map((t, i) => (
              <tr key={i}><td className="muted">{new Date(t.closed).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                <td><b className="sym">{t.symbol}</b></td><td>{t.qty}</td><td>₹{fmt(t.buy)}</td><td>₹{fmt(t.sell)}</td>
                <td className={t.pnl >= 0 ? 'pos' : 'neg'}><b>{fmtMoney(t.pnl)}</b> <span className="muted">({t.pnlPct}%)</span></td></tr>))}
            </tbody></table>
        </div>
      )}
    </div>
  );
}

/* ---------- page ---------- */

export default function RiskLab({ summary }) {
  const { curve, orders, alerts, error } = useRiskData(summary);
  const stats = useMemo(() => (curve.length ? curveStats(curve) : null), [curve]);
  const journal = useMemo(() => realizedFIFO(orders), [orders]);
  const discipline = useMemo(() => computeDiscipline(orders), [orders]);

  const positions = summary?.positions || [];
  const { heat, naked } = useMemo(() => computeHeat(positions, alerts), [positions, alerts]);
  const invested = summary?.invested || 0;
  const equity = summary?.equity || 0;
  const heatPct = equity ? (heat / equity) * 100 : 0;
  const cashPct = equity ? ((summary?.cash || 0) / equity) * 100 : 100;
  const diversification = computeDiversification(summary?.allocation);
  const verdict = buildVerdict({ summary, naked, heat, heatPct, cashPct });

  return (
    <>
      {error && <div className="banner err" role="alert">{error}</div>}
      <KpiStrip {...{ stats, summary, diversification, cashPct, heat, heatPct, naked }} />
      <div className={`verdict ${verdict.cls}`}><b>House view — </b>{verdict.text}</div>
      <div className="grid2e">
        <StressTest summary={summary} invested={invested} equity={equity} />
        <Backtester />
      </div>
      <CorrelationMatrix positions={positions} />
      <TradeJournal journal={journal} orders={orders} discipline={discipline} />
    </>
  );
}
