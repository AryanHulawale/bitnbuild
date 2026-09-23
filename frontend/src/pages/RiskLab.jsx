import React, { useEffect, useMemo, useState } from 'react';
import { api, fmt, fmtMoney, money, curveStats, realizedFIFO, backtestSMA, downloadCSV, pearson } from '../lib.js';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const tip = { background: '#fff', border: '1px solid #E1E7DF', borderRadius: 10, fontSize: 12 };
const tick = { fill: '#68796D', fontSize: 10 };

const SCENARIOS = [
  { name: 'Market crash', shock: -15, note: 'Broad panic, 2008-style week' },
  { name: 'Sharp correction', shock: -7, note: 'Risk-off rotation' },
  { name: 'Mild dip', shock: -3, note: 'Ordinary pullback' },
  { name: 'Relief rally', shock: 8, note: 'Short-covering bounce' },
  { name: 'Bull run', shock: 15, note: 'Sustained risk appetite' }
];

export default function RiskLab({ summary }) {
  const [curve, setCurve] = useState([]);
  const [orders, setOrders] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [btSym, setBtSym] = useState('AAPL');
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(50);
  const [bt, setBt] = useState(null);
  const [btLoading, setBtLoading] = useState(false);
  const [corr, setCorr] = useState(null);

  useEffect(() => {
    api.get('/portfolio/curve?days=60').then(r => setCurve(r.data)).catch(() => {});
    api.get('/trade/orders').then(r => setOrders(r.data)).catch(() => {});
    api.get('/alerts').then(r => setAlerts(r.data)).catch(() => {});
  }, [summary]);

  const stats = useMemo(() => curveStats(curve), [curve]);
  const journal = useMemo(() => realizedFIFO(orders), [orders]);

  // portfolio heat: worst-case loss if every armed stop-loss is hit
  const liveStops = alerts.filter(a => a.active && !a.triggered && a.kind === 'STOP_LOSS');
  const stopOf = (sym) => liveStops.find(s => s.symbol === sym);
  const naked = (summary?.positions || []).filter(p => !stopOf(p.symbol));
  const heat = (summary?.positions || []).reduce((a, p) => {
    const s = stopOf(p.symbol);
    return s && s.price < p.lastPrice ? a + (p.lastPrice - s.price) * p.qty : a;
  }, 0);

  // discipline: share of executions carrying a written thesis
  const filled = orders.filter(o => o.status === 'FILLED');
  const withThesis = filled.filter(o => o.note && o.note.split('|')[0].trim());
  const confs = withThesis.map(o => parseInt(o.note.split('|')[1] || '3')).filter(n => !Number.isNaN(n));
  const discipline = filled.length ? Math.round((withThesis.length / filled.length) * 100) : null;
  const avgConf = confs.length ? (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(1) : null;

  const invested = summary?.invested || 0;
  const equity = summary?.equity || 0;
  const heatPct = equity ? (heat / equity) * 100 : 0;
  const cashPct = equity ? (summary.cash / equity) * 100 : 100;
  const topW = summary?.allocation?.[0];
  const hhi = summary?.allocation?.length ? summary.allocation.reduce((a, x) => a + (x.pct / 100) ** 2, 0) : 0;
  const diversification = summary?.allocation?.length ? Math.max(0, Math.round((1 - (hhi - 1 / summary.allocation.length) / (1 - 1 / Math.max(summary.allocation.length, 2))) * 100)) : 100;

  const verdict = !summary?.positions?.length
    ? { cls: 'ok', text: 'All in cash — no market risk. Put a small position to work from the dealing desk to begin learning.' }
    : naked.length === summary.positions.length
      ? { cls: 'risk', text: `No stop-loss armed on any holding — a gap down hits the full ${fmtMoney(invested)}. Set stops on the ticket or the Alerts desk; professionals never trade naked.` }
      : topW && topW.pct > 60
        ? { cls: 'risk', text: `Concentrated book — ${topW.symbol} is ${topW.pct}% of invested capital. A single-name shock flows straight to net worth.` }
        : heatPct > 8
          ? { cls: 'warn', text: `Stops are armed, but a sweep of all of them still costs ${fmtMoney(heat)} (${fmt(heatPct)}% of net worth). Trim size or tighten stops.` }
          : cashPct < 15
            ? { cls: 'warn', text: 'Fully deployed with a thin cash buffer. Keep 15–25% aside so drawdowns become buying opportunities, not margin calls.' }
            : { cls: 'ok', text: `Defended book — armed stops cap worst-case pain near ${fmtMoney(heat)}, with a sensible buffer. This is how funds survive first years.` };

  const runBacktest = async () => {
    setBtLoading(true);
    try {
      const { data: hist } = await api.get(`/market/history?symbol=${btSym}&days=140`);
      setBt({ symbol: btSym.toUpperCase(), ...backtestSMA(hist, +fast || 20, +slow || 50) });
    } finally { setBtLoading(false); }
  };
  useEffect(() => { runBacktest(); }, []);

  // diversification matrix: pairwise correlation of daily returns across holdings
  useEffect(() => {
    const syms = (summary?.positions || []).map(p => p.symbol);
    if (syms.length < 2) { setCorr(null); return; }
    Promise.all(syms.map(s => api.get(`/market/history?symbol=${s}&days=60`).then(r => ({ s, h: r.data })).catch(() => null)))
      .then(rows => {
        const valid = rows.filter(Boolean);
        if (valid.length < 2) { setCorr(null); return; }
        const dates = valid[0].h.map(x => x.date);
        const series = valid.map(v => {
          const m = Object.fromEntries(v.h.map(x => [x.date, x.close]));
          const r = [];
          for (let i = 1; i < dates.length; i++) {
            if (m[dates[i]] && m[dates[i - 1]]) r.push((m[dates[i]] - m[dates[i - 1]]) / m[dates[i - 1]]);
          }
          return { s: v.s, r };
        });
        const n = Math.min(...series.map(x => x.r.length));
        setCorr(series.map(a => ({ s: a.s, row: series.map(b => pearson(a.r.slice(-n), b.r.slice(-n))) })));
      });
  }, [summary]);

  return (
    <>
      <div className="kpis num">
        <div className="kpi"><label>Value at risk · 95%</label><div className="v">{stats ? fmtMoney(stats.var95) : '…'}</div><div className="s">daily loss rarely exceeded</div></div>
        <div className="kpi"><label>Max drawdown</label><div className={`v ${stats && stats.maxDDPct < -5 ? 'neg' : ''}`}>{stats ? `${fmt(stats.maxDDPct)}%` : '…'}</div><div className="s">peak-to-trough, 60 sessions</div></div>
        <div className="kpi"><label>Sharpe · ann.</label><div className="v">{stats ? fmt(stats.sharpe) : '…'}</div><div className="s">{stats ? (stats.sharpe > 1 ? 'strong risk-adjusted return' : stats.sharpe > 0 ? 'modest, room to improve' : 'negative — review sizing') : ''}</div></div>
        <div className="kpi"><label>Diversification</label><div className="v">{summary ? `${diversification}/100` : '…'}</div><div className="s">{summary?.allocation?.length || 0} holdings</div></div>
        <div className="kpi"><label>Cash buffer</label><div className="v">{summary ? `${fmt(cashPct)}%` : '…'}</div><div className="s">of net worth in cash</div></div>
        <div className="kpi"><label>Heat · all stops hit</label><div className={`v ${heatPct > 8 ? 'neg' : ''}`}>{summary ? fmtMoney(heat) : '…'}</div><div className="s">{summary ? `${fmt(heatPct)}% of net worth · ${naked.length} naked holding(s)` : 'worst case under stops'}</div></div>
      </div>

      <div className={`verdict ${verdict.cls}`}><b>House view — </b>{verdict.text}</div>

      <div className="grid2e">
        <div className="panel">
          <h3>Stress test</h3>
          <p className="sub">What each market weather would do to today's book of {fmtMoney(invested)} invested.</p>
          <table className="num"><thead><tr><th>Scenario</th><th>Shock</th><th>Est. impact</th><th>Net worth after</th></tr></thead>
            <tbody>{SCENARIOS.map(s => {
              const impact = invested * (s.shock / 100);
              return (
                <tr key={s.name}>
                  <td><span className="scen">{s.name}</span><br /><span className="muted" style={{ fontSize: 11 }}>{s.note}</span></td>
                  <td className={s.shock >= 0 ? 'pos' : 'neg'}><b>{s.shock >= 0 ? '+' : ''}{s.shock}%</b></td>
                  <td className={impact >= 0 ? 'pos' : 'neg'}><b>{fmtMoney(impact)}</b></td>
                  <td><b>₹{fmt(equity + impact)}</b></td>
                </tr>
              );
            })}</tbody></table>
          {summary?.positions?.length > 0 && (
            <>
              <hr className="rule" />
              <p className="sub">Crash drill — every holding under a −15% shock.</p>
              <table className="num"><thead><tr><th>Holding</th><th>Value now</th><th>After shock</th><th>Loss</th></tr></thead>
                <tbody>{summary.positions.map(p => {
                  const v = p.lastPrice * p.qty, after = v * 0.85;
                  return <tr key={p.symbol}><td><b className="sym">{p.symbol}</b></td><td>{money(v, p.symbol)}</td><td>{money(after, p.symbol)}</td><td className="neg"><b>{money(after - v, p.symbol)}</b></td></tr>;
                })}</tbody></table>
            </>
          )}
        </div>

        <div className="panel">
          <h3>Strategy backtester</h3>
          <p className="sub">Trend-following rule: hold when the fast average sits above the slow one, else stand in cash. ₹100 model capital.</p>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="field"><label>Symbol</label><input value={btSym} onChange={e => setBtSym(e.target.value.toUpperCase())} style={{ width: 110 }} /></div>
            <div className="field"><label>Fast SMA</label><input type="number" value={fast} onChange={e => setFast(e.target.value)} style={{ width: 80 }} /></div>
            <div className="field"><label>Slow SMA</label><input type="number" value={slow} onChange={e => setSlow(e.target.value)} style={{ width: 80 }} /></div>
            <button className="btn" onClick={runBacktest} disabled={btLoading}>{btLoading ? 'Running…' : 'Run test'}</button>
          </div>
          {bt && (
            <>
              <div className="kpis num" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
                <div className="kpi"><label>Strategy</label><div className="v" style={{ fontSize: 20 }}><span className={bt.stratRet >= 0 ? 'pos' : 'neg'}>{bt.stratRet >= 0 ? '+' : ''}{bt.stratRet}%</span></div></div>
                <div className="kpi"><label>Buy & hold</label><div className="v" style={{ fontSize: 20 }}><span className={bt.holdRet >= 0 ? 'pos' : 'neg'}>{bt.holdRet >= 0 ? '+' : ''}{bt.holdRet}%</span></div></div>
                <div className="kpi"><label>Trades</label><div className="v" style={{ fontSize: 20 }}>{bt.trades}</div></div>
                <div className="kpi"><label>Win rate</label><div className="v" style={{ fontSize: 20 }}>{bt.winRate}%</div></div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={bt.curve}>
                  <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={50} /><YAxis tick={tick} domain={['auto', 'auto']} width={56} />
                  <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="strat" name={`${bt.symbol} SMA ${fast}/${slow}`} stroke="#0C6B43" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="hold" name="Buy & hold" stroke="#9A7B24" strokeDasharray="5 4" strokeWidth={1.8} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className="note">Verdict: {bt.stratRet > bt.holdRet ? 'the rule beat buy-and-hold on this window — trends were clean.' : 'buy-and-hold won here — choppy, whipsaw market punished the rule.'} Past paper performance implies nothing about tomorrow.</p>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Diversification matrix</h3>
        <p className="sub">Pairwise correlation of daily returns, 60 sessions. Deep green = move together (no shelter); pale = genuine diversification. Anything above 0.8 is basically one bet.</p>
        {!corr ? <p className="note">Hold two or more securities to map how they move together.</p> : (
          <table className="num matrix"><thead><tr><th className="sym">Holding</th>{corr.map(c => <th key={c.s}>{c.s}</th>)}</tr></thead>
            <tbody>{corr.map((r, i) => (
              <tr key={r.s}><td className="sym"><b className="sym">{r.s}</b></td>
                {r.row.map((v, j) => {
                  const diag = i === j;
                  const bg = diag ? '#0A3D26' : v >= 0 ? `rgba(12,107,67,${(0.07 + v * 0.55).toFixed(2)})` : `rgba(174,58,48,${(0.07 + Math.abs(v) * 0.55).toFixed(2)})`;
                  return <td key={j} style={{ background: bg, color: diag ? '#fff' : '#17241C', fontWeight: 700 }}>{diag ? '1.00' : fmt(v)}</td>;
                })}
              </tr>))}
            </tbody></table>
        )}
      </div>

      <div className="panel">
        <div className="row">
          <div style={{ marginRight: 'auto' }}>
            <h3>Trade journal — realised P&L</h3>
            <p className="sub">Profits locked in via sells, FIFO-matched. Total <b className={journal.total >= 0 ? 'pos' : 'neg'}>{fmtMoney(journal.total)}</b> across {journal.trades.length} round trips.
              {discipline == null ? ' No executions yet — discipline starts with your first ticketed thesis.' : <> Discipline <b>{discipline}%</b> of executions carried a written thesis{avgConf ? <> · average conviction {avgConf}/5</> : ''}.</>}</p>
          </div>
          <div className="row">
            <button className="btn ghost" disabled={!journal.trades.length} onClick={() => downloadCSV('stockpulse-journal.csv', journal.trades)}>Export journal</button>
            <button className="btn ghost" disabled={!orders.length} onClick={() => downloadCSV('stockpulse-orders.csv', orders.map(o => ({ time: o.createdAt, symbol: o.symbol, side: o.side, type: o.type, qty: o.qty, limit: o.limitPrice || '', exec: o.execPrice || '', status: o.status, thesis: (o.note || '').split('|')[0] })))}>Export orders</button>
          </div>
        </div>
        {!journal.trades.length ? <p className="note">No completed round trips yet — sell a position to book your first entry here.</p> : (
          <table className="num"><thead><tr><th>Closed</th><th>Security</th><th>Qty</th><th>Bought</th><th>Sold</th><th>P&L</th></tr></thead>
            <tbody>{journal.trades.map((t, i) => (
              <tr key={i}><td className="muted">{new Date(t.closed).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                <td><b className="sym">{t.symbol}</b></td><td>{t.qty}</td><td>₹{fmt(t.buy)}</td><td>₹{fmt(t.sell)}</td>
                <td className={t.pnl >= 0 ? 'pos' : 'neg'}><b>{fmtMoney(t.pnl)}</b> <span className="muted">({t.pnlPct}%)</span></td></tr>))}
            </tbody></table>
        )}
      </div>
    </>
  );
}
