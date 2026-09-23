import React, { useEffect, useState } from 'react';
import { api, fmtMoney, fmt, money, realizedFIFO } from '../lib.js';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

const SLICE = ['#0C6B43', '#2E9E63', '#9A7B24', '#3E5C4B', '#8FB89F', '#C9B37E', '#5B7A68', '#B0BFAE'];
const tip = { background: '#fff', border: '1px solid #E1E7DF', borderRadius: 10, fontSize: 12 };
const tick = { fill: '#68796D', fontSize: 10 };

export default function Dashboard({ summary }) {
  const [curve, setCurve] = useState([]);
  const [watch, setWatch] = useState([]);
  const [sym, setSym] = useState('');
  const [realized, setRealized] = useState(0);
  const [sparks, setSparks] = useState({});
  const [orders, setOrders] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [desks] = useState(() => { try { return JSON.parse(localStorage.getItem('sp_desks') || '[]'); } catch { return []; } });

  useEffect(() => {
    api.get('/portfolio/curve?days=30').then(r => setCurve(r.data)).catch(() => {});
    api.get('/portfolio/watchlist').then(r => setWatch(r.data)).catch(() => {});
    api.get('/trade/orders').then(r => { setOrders(r.data); setRealized(realizedFIFO(r.data).total); }).catch(() => {});
    api.get('/alerts').then(r => setAlerts(r.data)).catch(() => {});
  }, [summary]);

  useEffect(() => {
    if (!watch.length) return;
    Promise.all(watch.slice(0, 8).map(q => api.get(`/market/history?symbol=${q.symbol}&days=30`).then(r => ({ s: q.symbol, h: r.data })).catch(() => null)))
      .then(rows => { const m = {}; rows.filter(Boolean).forEach(r => { m[r.s] = r.h; }); setSparks(m); });
  }, [watch]);

  const addWatch = async () => {
    if (!sym) return;
    await api.post('/portfolio/watchlist', { symbol: sym });
    setSym('');
    const { data } = await api.get('/portfolio/watchlist');
    setWatch(data);
  };

  const unreal = summary ? summary.positions.reduce((a, p) => a + (p.lastPrice - p.avgPrice) * p.qty, 0) : 0;
  const invested = summary?.invested || 0;
  const movers = [...watch].sort((a, b) => b.changePct - a.changePct);

  // novice missions: the 80% fail on emotion, size and noise — these drills build the opposite habits
  const missions = [
    { t: 'First order', d: 'Execute any BUY or SELL', done: orders.length > 0 },
    { t: 'Limit-setter', d: 'Rest a LIMIT order', done: orders.some(o => o.type === 'LIMIT') },
    { t: 'Thesis-driven', d: 'Write a thesis on a ticket', done: orders.some(o => o.note && o.note.split('|')[0].trim()) },
    { t: 'Downside protected', d: 'Arm a stop-loss or target', done: alerts.some(a => ['STOP_LOSS', 'TARGET'].includes(a.kind)) },
    { t: 'Diversified', d: 'Hold 3+ securities', done: (summary?.allocation?.length || 0) >= 3 },
    { t: 'Profit booked', d: 'Realised P&L above water', done: realized > 0 },
    { t: 'Informed reader', d: 'Analyse 3 desks in Sentiment', done: desks.length >= 3 }
  ];
  const doneCount = missions.filter(m => m.done).length;

  return (
    <>
      <div className="kpis num">
        <div className="kpi hero"><label>Net worth</label><div className="v">{summary ? fmtMoney(summary.equity) : '…'}</div><div className="s">{summary ? `${summary.totalReturnPct >= 0 ? '+' : ''}${fmt(summary.totalReturnPct)}% since inception` : ''}</div></div>
        <div className="kpi"><label>Invested</label><div className="v">{summary ? fmtMoney(invested) : '…'}</div><div className="s">{summary ? `${summary.allocation.length} holdings` : ''}</div></div>
        <div className="kpi"><label>Unrealised P&L</label><div className={`v ${unreal >= 0 ? 'pos' : 'neg'}`}>{summary ? fmtMoney(unreal) : '…'}</div><div className="s">open positions</div></div>
        <div className="kpi"><label>Realised P&L</label><div className={`v ${realized >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(realized)}</div><div className="s">locked in via sells</div></div>
        <div className="kpi"><label>Volatility · 30d σ</label><div className="v">{summary ? `${fmt(summary.volatility)}%` : '…'}</div><div className="s">of lead holding</div></div>
      </div>

      <div className="panel">
        <h3>Novice missions</h3>
        <p className="sub">Most beginners fail on emotion, oversized bets and noise. These seven drills build the opposite habits — {doneCount} of {missions.length} complete.</p>
        <div className="bar" style={{ height: 10, marginBottom: 12 }}><i style={{ width: `${(doneCount / missions.length) * 100}%` }} /></div>
        <div className="kpis num" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 0 }}>
          {missions.map(m => (
            <div className="kpi" key={m.t} style={m.done ? { borderColor: '#0C6B43', background: '#F2F7F3' } : {}}>
              <label>{m.done ? '✓ Complete' : '○ Pending'}</label>
              <div style={{ fontWeight: 700, marginTop: 4, fontSize: 14 }}>{m.t}</div>
              <div className="s">{m.d}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Fund performance</h3>
          <p className="sub">Net-worth trajectory, last 30 sessions.</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={curve}>
              <defs>
                <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0C6B43" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0C6B43" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={28} /><YAxis tick={tick} domain={['auto', 'auto']} width={70} />
              <Tooltip contentStyle={tip} formatter={(v) => [`₹${fmt(v)}`, 'Net worth']} />
              <Area type="monotone" dataKey="equity" stroke="#0C6B43" strokeWidth={2.2} fill="url(#eqfill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Allocation</h3>
          <p className="sub">Capital at work by holding.</p>
          {summary?.allocation?.length ? (
            <>
              <ResponsiveContainer width="100%" height={168}>
                <PieChart>
                  <Pie data={summary.allocation} dataKey="value" nameKey="symbol" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0}>
                    {summary.allocation.map((_, i) => <Cell key={i} fill={SLICE[i % SLICE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} formatter={(v, n, p) => [`₹${fmt(v)} (${p.payload.pct}%)`, p.payload.symbol]} />
                </PieChart>
              </ResponsiveContainer>
              {summary.allocation.map((a, i) => (
                <div key={a.symbol} className="row num" style={{ margin: '7px 0', fontSize: 13 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: SLICE[i % SLICE.length] }} />
                  <b className="sym" style={{ width: 110 }}>{a.symbol}</b>
                  <div className="bar" style={{ flex: 1 }}><i style={{ width: `${a.pct}%` }} /></div>
                  <span style={{ width: 46, textAlign: 'right' }}>{a.pct}%</span>
                </div>
              ))}
            </>
          ) : <p className="note">No holdings yet — visit the dealing desk to put capital to work.</p>}
        </div>
      </div>

      <div className="panel">
        <h3>Holdings ledger</h3>
        <p className="sub">Every open position, marked to the latest print · rows in native currency, fund totals in paper ₹.</p>
        {!summary?.positions?.length ? <p className="note">Flat book. Your positions will appear here with live profit and loss.</p> : (
          <table className="num"><thead><tr><th>Security</th><th>Qty</th><th>Avg cost</th><th>LTP</th><th>Market value</th><th>P&L</th><th>Weight</th></tr></thead>
            <tbody>{summary.positions.map(p => {
              const pnl = (p.lastPrice - p.avgPrice) * p.qty;
              const w = invested ? (p.lastPrice * p.qty) / invested : 0;
              return (
                <tr key={p.symbol}>
                  <td><b className="sym">{p.symbol}</b></td><td>{p.qty}</td><td>{money(p.avgPrice, p.symbol)}</td>
                  <td>{money(p.lastPrice, p.symbol)}</td><td>{money(p.lastPrice * p.qty, p.symbol)}</td>
                  <td className={pnl >= 0 ? 'pos' : 'neg'}><b>{money(pnl, p.symbol)}</b> <span className="muted">({fmtSign(p.avgPrice ? (pnl / (p.avgPrice * p.qty)) * 100 : 0)})</span></td>
                  <td style={{ minWidth: 130 }}><div className="bar"><i style={{ width: `${(w * 100).toFixed(1)}%` }} /></div></td>
                </tr>
              );
            })}</tbody></table>
        )}
      </div>

      <div className="panel">
        <h3>Watchlist</h3>
        <p className="sub">Securities under observation, ranked by today's move.</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Add symbol — e.g. AAPL, TCS.NS" value={sym} onChange={e => setSym(e.target.value.toUpperCase())} />
          <button className="btn" onClick={addWatch}>Add to list</button>
        </div>
        <table className="num"><thead><tr><th>Security</th><th>Last</th><th>Trend · 30d</th><th>Day's move</th><th>Feed</th><th></th></tr></thead>
          <tbody>{movers.map(q => (
            <tr key={q.symbol}><td><b className="sym">{q.symbol}</b></td><td>{money(q.price, q.symbol)}</td>
              <td>{sparks[q.symbol]?.length ? (
                <ResponsiveContainer width={120} height={34}>
                  <AreaChart data={sparks[q.symbol]}>
                    <Area type="monotone" dataKey="close" stroke={q.changePct >= 0 ? '#0E7A3D' : '#AE3A30'} fill={q.changePct >= 0 ? '#E5F2E9' : '#F9E9E6'} strokeWidth={1.6} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <span className="skel" style={{ display: 'block', width: 120, height: 34 }} />}</td>
              <td className={q.changePct >= 0 ? 'pos' : 'neg'}><b>{fmtSign(q.changePct)}</b></td>
              <td className="muted">{q.source === 'stooq-live' ? 'Live' : 'Model'}</td>
              <td style={{ textAlign: 'right' }}><button className="btn ghost sm" onClick={async () => { await api.delete('/portfolio/watchlist/' + q.symbol); setWatch(watch.filter(x => x.symbol !== q.symbol)); }}>Remove</button></td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}

const fmtSign = (n) => `${n >= 0 ? '+' : ''}${fmt(n)}%`;
