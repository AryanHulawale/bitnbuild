import React, { useEffect, useState } from 'react';
import { api, fmtMoney, fmt, money, realizedFIFO } from '../lib.js';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

const SLICE = ['#0C6B43', '#2E9E63', '#9A7B24', '#3E5C4B', '#8FB89F', '#C9B37E', '#5B7A68', '#B0BFAE'];
const tip = { background: '#fff', border: '1px solid #E1E7DF', borderRadius: 8, fontSize: 12, boxShadow: '0 6px 18px rgba(12,60,38,.12)' };
const tick = { fill: '#68796D', fontSize: 10 };
const heroTick = { fill: 'rgba(255,255,255,.55)', fontSize: 10 };

// All visual styling for this screen lives here, scoped under .dx so it can't leak.
const CSS = `
.dx { display: flex; flex-direction: column; gap: 18px; font-variant-numeric: tabular-nums; }
.dx .panel { border-radius: 14px; border: 1px solid #E1E7DF; background: #fff; padding: 22px 24px; box-shadow: none; margin: 0; }
.dx .panel h3 { margin: 0 0 2px; font-size: 17px; letter-spacing: -.01em; }
.dx .panel .sub { margin: 0 0 16px; color: #68796D; font-size: 13px; max-width: 62ch; }
.dx table { width: 100%; border-collapse: collapse; }
.dx th { text-align: left; font-weight: 600; font-size: 12px; color: #68796D; padding: 0 12px 10px 0; border-bottom: 1px solid #E1E7DF; white-space: nowrap; }
.dx td { padding: 12px 12px 12px 0; border-bottom: 1px solid #EEF2EC; font-size: 14px; vertical-align: middle; }
.dx tbody tr:last-child td { border-bottom: 0; }
.dx .scroll { overflow-x: auto; }

/* hero: the one loud element */
.dx-hero { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(0, 1.7fr); gap: 8px 28px; align-items: center; padding: 26px 28px 18px; border-radius: 18px; color: #fff;
  background: radial-gradient(120% 140% at 0% 0%, #0F7C4F 0%, #0A5A39 48%, #073D27 100%); }
.dx-hero-label { font-size: 14px; color: rgba(255,255,255,.72); }
.dx-hero-v { font-size: clamp(34px, 5vw, 52px); font-weight: 800; letter-spacing: -.03em; line-height: 1.05; margin: 6px 0 12px; }
.dx-hero-sub { margin-top: 10px; font-size: 13px; color: rgba(255,255,255,.7); }
.dx-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 999px; font-size: 13px; font-weight: 700; }
.dx-pill.up { background: rgba(143,224,176,.2); color: #A7F0C4; }
.dx-pill.down { background: rgba(255,170,160,.2); color: #FFC2BA; }
.dx-hero-chart { min-width: 0; }

/* stat tiles */
.dx-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
.dx-stat { background: #fff; border: 1px solid #E1E7DF; border-left: 4px solid #B0BFAE; border-radius: 12px; padding: 14px 18px; }
.dx-stat.pos { border-left-color: #0E7A3D; }
.dx-stat.neg { border-left-color: #AE3A30; }
.dx-stat .l { font-size: 13px; color: #68796D; }
.dx-stat .v { font-size: 24px; font-weight: 750; letter-spacing: -.02em; margin: 3px 0 1px; }
.dx-stat .s { font-size: 12px; color: #68796D; }

.dx-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 18px; }

/* allocation */
.dx-donut { position: relative; }
.dx-donut-mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.dx-donut-mid b { font-size: 24px; letter-spacing: -.02em; }
.dx-donut-mid span { font-size: 12px; color: #68796D; }
.dx-leg { display: grid; grid-template-columns: 12px 1fr 44px; align-items: center; gap: 10px; margin-top: 9px; font-size: 13px; }
.dx-sw { width: 12px; height: 12px; border-radius: 4px; }
.dx-bar { height: 7px; border-radius: 99px; background: #EEF2EC; overflow: hidden; }
.dx-bar i { display: block; height: 100%; border-radius: 99px; }

/* missions */
.dx-mhead { display: flex; align-items: center; gap: 18px; margin-bottom: 14px; }
.dx-mhead .sub { margin: 0; }
.dx-mlist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
.dx-m { display: flex; gap: 11px; align-items: flex-start; padding: 9px 4px; border-bottom: 1px solid #EEF2EC; }
.dx-m .ck { flex: none; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #C9D3C8; display: grid; place-items: center; color: #fff; font-size: 12px; font-weight: 800; margin-top: 1px; }
.dx-m.done .ck { background: #0C6B43; border-color: #0C6B43; }
.dx-m .t { font-weight: 700; font-size: 14px; }
.dx-m.done .t { color: #0C6B43; }
.dx-m .d { font-size: 12.5px; color: #68796D; }

/* table bits */
.dx-chip { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 700; }
.dx-chip.pos { background: #E5F2E9; color: #0E7A3D; }
.dx-chip.neg { background: #F9E9E6; color: #AE3A30; }
.dx-add { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.dx-add input { flex: 1 1 220px; min-width: 0; padding: 10px 14px; border-radius: 10px; border: 1px solid #D5DDD3; background: #FAFBF9; font: inherit; }
.dx-add input:focus-visible, .dx .btn:focus-visible { outline: 2px solid #0C6B43; outline-offset: 2px; }
.dx-empty { padding: 26px; text-align: center; border: 1px dashed #C9D3C8; border-radius: 12px; color: #68796D; font-size: 14px; }

@media (max-width: 900px) {
  .dx-hero { grid-template-columns: 1fr; padding: 22px 20px 12px; }
  .dx-split { grid-template-columns: 1fr; }
  .dx-mlist { grid-template-columns: 1fr; }
  .dx .panel { padding: 18px 16px; }
}
`;

function Ring({ done, total }) {
  const r = 26, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`${done} of ${total} missions complete`}>
      <circle cx="34" cy="34" r={r} fill="none" stroke="#E5ECE4" strokeWidth="7" />
      <circle cx="34" cy="34" r={r} fill="none" stroke="#0C6B43" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 34 34)" />
      <text x="34" y="39" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0C6B43">{done}/{total}</text>
    </svg>
  );
}

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
    api.get('/portfolio/curve?days=30').then(r => setCurve(r.data)).catch(() => { });
    api.get('/portfolio/watchlist').then(r => setWatch(r.data)).catch(() => { });
    api.get('/trade/orders').then(r => { setOrders(r.data); setRealized(realizedFIFO(r.data).total); }).catch(() => { });
    api.get('/alerts').then(r => setAlerts(r.data)).catch(() => { });
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

  // 30-session change, derived from the curve already fetched
  const first = curve[0]?.equity, last = curve[curve.length - 1]?.equity;
  const delta30 = curve.length > 1 && first ? ((last - first) / first) * 100 : null;
  const up = (summary?.totalReturnPct ?? 0) >= 0;

  const stats = [
    { l: 'Invested', v: summary ? fmtMoney(invested) : '…', s: summary ? `${summary.allocation.length} holdings` : '', tone: '' },
    { l: 'Unrealised P&L', v: summary ? fmtMoney(unreal) : '…', s: 'open positions', tone: unreal >= 0 ? 'pos' : 'neg' },
    { l: 'Realised P&L', v: fmtMoney(realized), s: 'locked in via sells', tone: realized >= 0 ? 'pos' : 'neg' },
    { l: 'Volatility · 30d σ', v: summary ? `${fmt(summary.volatility)}%` : '…', s: 'of lead holding', tone: '' }
  ];

  return (
    <div className="dx num">
      <style>{CSS}</style>

      <section className="dx-hero">
        <div>
          <div className="dx-hero-label">Net worth</div>
          <div className="dx-hero-v">{summary ? fmtMoney(summary.equity) : '…'}</div>
          {summary && <span className={`dx-pill ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {fmt(Math.abs(summary.totalReturnPct))}% since inception</span>}
          {delta30 != null && <div className="dx-hero-sub">{fmtSign(delta30)} over the last 30 sessions</div>}
        </div>
        <div className="dx-hero-chart">
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={curve} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8FE0B0" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#8FE0B0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,.1)" vertical={false} />
              <XAxis dataKey="date" tick={heroTick} minTickGap={36} axisLine={false} tickLine={false} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip contentStyle={tip} formatter={(v) => [`₹${fmt(v)}`, 'Net worth']} cursor={{ stroke: 'rgba(255,255,255,.35)' }} />
              <Area type="monotone" dataKey="equity" stroke="#A7F0C4" strokeWidth={2.4} fill="url(#eqfill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="dx-stats">
        {stats.map(s => (
          <div key={s.l} className={`dx-stat ${s.tone}`}>
            <div className="l">{s.l}</div>
            <div className={`v ${s.tone}`}>{s.v}</div>
            <div className="s">{s.s}</div>
          </div>
        ))}
      </div>

      <div className="dx-split">
        <div className="panel">
          <h3>Allocation</h3>
          <p className="sub">Capital at work by holding.</p>
          {summary?.allocation?.length ? (
            <>
              <div className="dx-donut">
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={summary.allocation} dataKey="value" nameKey="symbol" innerRadius={62} outerRadius={88} paddingAngle={3} cornerRadius={4} strokeWidth={0}>
                      {summary.allocation.map((_, i) => <Cell key={i} fill={SLICE[i % SLICE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tip} formatter={(v, n, p) => [`₹${fmt(v)} (${p.payload.pct}%)`, p.payload.symbol]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="dx-donut-mid"><b>{summary.allocation.length}</b><span>holdings</span></div>
              </div>
              {summary.allocation.map((a, i) => (
                <div key={a.symbol} className="dx-leg">
                  <span className="dx-sw" style={{ background: SLICE[i % SLICE.length] }} />
                  <div>
                    <b className="sym">{a.symbol}</b>
                    <div className="dx-bar" style={{ marginTop: 5 }}><i style={{ width: `${a.pct}%`, background: SLICE[i % SLICE.length] }} /></div>
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{a.pct}%</span>
                </div>
              ))}
            </>
          ) : <div className="dx-empty">No holdings yet. Place your first order at the dealing desk to put capital to work.</div>}
        </div>

        <div className="panel">
          <div className="dx-mhead">
            <Ring done={doneCount} total={missions.length} />
            <div>
              <h3>Novice missions</h3>
              <p className="sub">Most beginners fail on emotion, oversized bets and noise. These drills build the opposite habits.</p>
            </div>
          </div>
          <div className="dx-mlist">
            {missions.map(m => (
              <div className={`dx-m ${m.done ? 'done' : ''}`} key={m.t}>
                <span className="ck" aria-hidden="true">{m.done ? '✓' : ''}</span>
                <div>
                  <div className="t">{m.t}</div>
                  <div className="d">{m.d}</div>
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{m.done ? 'Complete' : 'Pending'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Holdings ledger</h3>
        <p className="sub">Every open position, marked to the latest print. Rows in native currency, fund totals in paper ₹.</p>
        {!summary?.positions?.length ? <div className="dx-empty">Flat book. Your positions will appear here with live profit and loss.</div> : (
          <div className="scroll">
            <table className="num"><thead><tr><th>Security</th><th>Qty</th><th>Avg cost</th><th>LTP</th><th>Market value</th><th>P&L</th><th>Weight</th></tr></thead>
              <tbody>{summary.positions.map((p, i) => {
                const pnl = (p.lastPrice - p.avgPrice) * p.qty;
                const w = invested ? (p.lastPrice * p.qty) / invested : 0;
                const pct = p.avgPrice ? (pnl / (p.avgPrice * p.qty)) * 100 : 0;
                return (
                  <tr key={p.symbol}>
                    <td><b className="sym">{p.symbol}</b></td><td>{p.qty}</td><td>{money(p.avgPrice, p.symbol)}</td>
                    <td>{money(p.lastPrice, p.symbol)}</td><td>{money(p.lastPrice * p.qty, p.symbol)}</td>
                    <td className={pnl >= 0 ? 'pos' : 'neg'}><b>{money(pnl, p.symbol)}</b> <span className={`dx-chip ${pnl >= 0 ? 'pos' : 'neg'}`}>{fmtSign(pct)}</span></td>
                    <td style={{ minWidth: 130 }}>
                      <div className="dx-bar"><i style={{ width: `${(w * 100).toFixed(1)}%`, background: SLICE[i % SLICE.length] }} /></div>
                    </td>
                  </tr>
                );
              })}</tbody></table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Watchlist</h3>
        <p className="sub">Securities under observation, ranked by today's move.</p>
        <div className="dx-add">
          <input placeholder="Add symbol, e.g. AAPL or TCS.NS" value={sym} onChange={e => setSym(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && addWatch()} />
          <button className="btn" onClick={addWatch}>Add to watchlist</button>
        </div>
        <div className="scroll">
          <table className="num"><thead><tr><th>Security</th><th>Last</th><th>30-day trend</th><th>Day's move</th><th>Feed</th><th></th></tr></thead>
            <tbody>{movers.map(q => (
              <tr key={q.symbol}><td><b className="sym">{q.symbol}</b></td><td>{money(q.price, q.symbol)}</td>
                <td>{sparks[q.symbol]?.length ? (
                  <ResponsiveContainer width={120} height={34}>
                    <AreaChart data={sparks[q.symbol]}>
                      <Area type="monotone" dataKey="close" stroke={q.changePct >= 0 ? '#0E7A3D' : '#AE3A30'} fill={q.changePct >= 0 ? '#E5F2E9' : '#F9E9E6'} strokeWidth={1.6} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <span className="skel" style={{ display: 'block', width: 120, height: 34 }} />}</td>
                <td><span className={`dx-chip ${q.changePct >= 0 ? 'pos' : 'neg'}`}>{fmtSign(q.changePct)}</span></td>
                <td className="muted">{q.source === 'stooq-live' ? 'Live' : 'Model'}</td>
                <td style={{ textAlign: 'right' }}><button className="btn ghost sm" onClick={async () => { await api.delete('/portfolio/watchlist/' + q.symbol); setWatch(watch.filter(x => x.symbol !== q.symbol)); }}>Remove</button></td></tr>
            ))}</tbody></table>
        </div>
      </div>
    </div>
  );
}

const fmtSign = (n) => `${n >= 0 ? '+' : ''}${fmt(n)}%`;