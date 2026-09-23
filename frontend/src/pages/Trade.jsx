import React, { useEffect, useMemo, useState } from 'react';
import { api, fmt, fmtMoney, money, meta, sma, BENCHES } from '../lib.js';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar, Cell, BarChart } from 'recharts';

const tip = { background: '#fff', border: '1px solid #E1E7DF', borderRadius: 10, fontSize: 12 };
const tick = { fill: '#68796D', fontSize: 10 };

function CandleShape(props) {
  const { x, y, width, height, payload } = props;
  if (!payload || payload.high == null || payload.low == null) return <g />;
  const range = (payload.high - payload.low) || 1e-9;
  const yO = y + (height * (payload.high - payload.open)) / range;
  const yC = y + (height * (payload.high - payload.close)) / range;
  const up = payload.close >= payload.open;
  const color = up ? '#0E7A3D' : '#AE3A30';
  const top = Math.min(yO, yC), h = Math.max(2, Math.abs(yC - yO));
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1.4} />
      <rect x={x + width * 0.28} y={top} width={width * 0.44} height={h} fill={color} />
    </g>
  );
}

export default function Trade({ refresh }) {
  const [symbol, setSymbol] = useState('AAPL');
  const [quote, setQuote] = useState(null);
  const [hist, setHist] = useState([]);
  const [view, setView] = useState('candle');
  const [bench, setBench] = useState('NONE');
  const [benchHist, setBenchHist] = useState([]);
  const [side, setSide] = useState('BUY');
  const [type, setType] = useState('MARKET');
  const [qty, setQty] = useState(10);
  const [limitPrice, setLimitPrice] = useState('');
  const [thesis, setThesis] = useState('');
  const [conf, setConf] = useState(3);
  const [stopPx, setStopPx] = useState('');
  const [targetPx, setTargetPx] = useState('');
  const [makeAlerts, setMakeAlerts] = useState(true);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState(null);
  const [guardPct, setGuardPct] = useState(() => +(localStorage.getItem('sp_guard') || 5));
  const [override, setOverride] = useState(false);
  const [riskPct, setRiskPct] = useState(1);

  const load = async (s = symbol) => {
    try {
      const [q, h, p, o, sm] = await Promise.all([
        api.get('/market/quote?symbol=' + s), api.get('/market/history?symbol=' + s + '&days=120'),
        api.get('/trade/positions'), api.get('/trade/orders'), api.get('/portfolio/summary')
      ]);
      setQuote(q.data); setHist(h.data); setPositions(p.data); setOrders(o.data); setSummary(sm.data);
    } catch {}
  };
  useEffect(() => { load(); const t = setInterval(() => load(), 15000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (bench === 'NONE') { setBenchHist([]); return; }
    api.get(`/market/history?symbol=${bench}&days=120`).then(r => setBenchHist(r.data)).catch(() => {});
  }, [bench]);

  const chart = useMemo(() => {
    const closes = hist.map(h => h.close);
    const f20 = sma(closes, 20), f50 = sma(closes, 50);
    return hist.map((h, i) => ({ ...h, sma20: f20[i], sma50: f50[i], up: h.close >= h.open }));
  }, [hist]);

  const relPerf = useMemo(() => {
    if (!benchHist.length || !hist.length) return [];
    const n = Math.min(hist.length, benchHist.length);
    const h = hist.slice(-n), b = benchHist.slice(-n);
    return h.map((x, i) => ({ date: x.date, stock: +(100 * x.close / h[0].close).toFixed(2), bench: +(100 * b[i].close / b[0].close).toFixed(2) }));
  }, [hist, benchHist]);

  const stats = useMemo(() => {
    if (!hist.length) return null;
    const closes = hist.map(h => h.close);
    const vols = hist.map(h => h.volume || 0);
    return {
      hi52: Math.max(...closes), lo52: Math.min(...closes),
      avgVol: Math.round(vols.reduce((a, v) => a + v, 0) / vols.length)
    };
  }, [hist]);

  const m = meta(symbol);
  const breached = summary && summary.totalReturnPct <= -guardPct && !override;
  const execRef = type === 'MARKET' ? quote?.price : (+limitPrice || quote?.price);
  const estCost = execRef ? execRef * (+qty || 0) : 0;

  const entryRef = quote?.price || 0;
  const perShareRisk = entryRef && +stopPx ? Math.abs(entryRef - +stopPx) : 0;
  const suggestQty = perShareRisk > 0 && summary ? Math.floor((summary.equity * (riskPct / 100)) / perShareRisk) : 0;

  const place = async () => {
    setMsg(null);
    if (side === 'BUY' && breached) {
      setMsg({ ok: false, text: `Blocked by your circuit breaker — the fund is down ${fmt(summary.totalReturnPct)}% (limit −${guardPct}%). Step away; override only with a written thesis.` });
      return;
    }
    try {
      const note = thesis.trim() ? `${thesis.trim().slice(0, 160)}|${conf}|${stopPx || ''}|${targetPx || ''}` : '';
      const { data } = await api.post('/trade/order', { symbol, side, type, qty: +qty, limitPrice: limitPrice ? +limitPrice : undefined, note });
      if (data.order.status === 'FILLED' && side === 'BUY' && makeAlerts) {
        if (+stopPx > 0) await api.post('/alerts', { symbol, kind: 'STOP_LOSS', price: +stopPx }).catch(() => {});
        if (+targetPx > 0) await api.post('/alerts', { symbol, kind: 'TARGET', price: +targetPx }).catch(() => {});
      }
      setMsg(data.order.status === 'FILLED'
        ? { ok: true, text: `${side} ${qty} ${symbol} executed at ${money(data.order.execPrice, symbol)}${makeAlerts && side === 'BUY' && (+stopPx || +targetPx) ? ' — protective alerts armed.' : ''}` }
        : { ok: true, text: `Limit order resting — fills at ${money(+limitPrice, symbol)} (last ${money(data.quote.price, symbol)}).` });
      setThesis('');
      load(); refresh();
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.error || e.message }); }
  };

  const dayPos = quote && quote.high !== quote.low ? ((quote.price - quote.low) / (quote.high - quote.low)) * 100 : 50;
  const yrPos = quote && stats ? ((quote.price - stats.lo52) / Math.max(stats.hi52 - stats.lo52, 1e-9)) * 100 : 50;
  const benchName = (BENCHES.find(b => b.id === bench) || {}).label;

  return (
    <>
      {breached && (
        <div className="verdict risk"><b>Circuit breaker engaged — </b>
          the fund is down {fmt(summary.totalReturnPct)}% (your limit −{guardPct}%). New BUYs are blocked to stop revenge trading.
          {' '}<button className="btn ghost sm" onClick={() => setOverride(true)}>Override for this session</button>
        </div>
      )}
      <div className="panel">
        <div className="row">
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" style={{ width: 170 }} />
          <button className="btn" onClick={() => load()}>Load security</button>
          <div className="viewseg">
            <button className={view === 'candle' ? 'on' : ''} onClick={() => setView('candle')}>Candles</button>
            <button className={view === 'line' ? 'on' : ''} onClick={() => setView('line')}>Line + SMA</button>
          </div>
          <select value={bench} onChange={e => setBench(e.target.value)}>
            {BENCHES.map(b => <option key={b.id} value={b.id}>vs {b.label}</option>)}
          </select>
          <span className="note" style={{ marginLeft: 'auto' }}>{quote?.source === 'stooq-live' ? 'Live feed' : 'Model feed'} · 15s refresh</span>
        </div>
        {quote && (
          <>
            <div className="quote-head num">
              <span className="sym">{quote.symbol}</span>
              <span className="px">{money(quote.price, symbol)}</span>
              <b className={quote.changePct >= 0 ? 'pos' : 'neg'}>{quote.changePct >= 0 ? '▲' : '▼'} {money(Math.abs(quote.change), symbol)} ({fmt(Math.abs(quote.changePct))}%)</b>
            </div>
            <p className="sub">{m.sector} · {m.exch} · prices in {meta(symbol) && (symbol.endsWith('.NS') ? 'rupees' : 'dollars')}</p>
            {view === 'candle' ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chart}>
                  <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={50} /><YAxis tick={tick} domain={['auto', 'auto']} width={70} />
                  <Tooltip contentStyle={tip} formatter={(v, n, p) => [`${money(v, symbol)}`, 'Range']} labelFormatter={(l) => { const d = chart.find(c => c.date === l); return d ? `${l} · O ${money(d.open, symbol)} H ${money(d.high, symbol)} L ${money(d.low, symbol)} C ${money(d.close, symbol)}` : l; }} />
                  <Bar dataKey={(d) => [d.low, d.high]} shape={<CandleShape />} />
                  <Line type="monotone" dataKey="sma20" stroke="#9A7B24" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="sma50" stroke="#7A8A7E" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chart}>
                  <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={50} /><YAxis tick={tick} domain={['auto', 'auto']} width={70} />
                  <Tooltip contentStyle={tip} formatter={(v, n) => [`${money(v, symbol)}`, n === 'close' ? 'Close' : n]} />
                  <Line type="monotone" dataKey="close" stroke="#0C6B43" strokeWidth={2.2} dot={false} />
                  <Line type="monotone" dataKey="sma20" stroke="#9A7B24" strokeDasharray="5 4" strokeWidth={1.6} dot={false} />
                  <Line type="monotone" dataKey="sma50" stroke="#7A8A7E" strokeDasharray="5 4" strokeWidth={1.6} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
            <div className="lgnd" style={{ marginTop: 6 }}>
              <span><i style={{ background: '#0E7A3D' }} />Up day</span>
              <span><i style={{ background: '#AE3A30' }} />Down day</span>
              <span><i style={{ background: '#9A7B24' }} />SMA 20</span>
              <span><i style={{ background: '#7A8A7E' }} />SMA 50</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="note" style={{ marginBottom: 4 }}>Volume</div>
              <ResponsiveContainer width="100%" height={64}>
                <BarChart data={chart}>
                  <XAxis dataKey="date" hide /><Tooltip contentStyle={tip} formatter={(v) => [Number(v).toLocaleString('en-IN'), 'Shares']} />
                  <Bar dataKey="volume">{chart.map((c, i) => <Cell key={i} fill={c.up ? '#BFDCC6' : '#E6C2BC'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {bench !== 'NONE' && relPerf.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="note" style={{ marginBottom: 4 }}>Relative performance, rebased to 100 — {symbol} vs {benchName}</div>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={relPerf}>
                    <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={60} /><YAxis tick={tick} domain={['auto', 'auto']} width={52} />
                    <Tooltip contentStyle={tip} />
                    <Line type="monotone" dataKey="stock" name={symbol} stroke="#0C6B43" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="bench" name={benchName} stroke="#9A7B24" strokeDasharray="5 4" strokeWidth={1.8} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="stat-grid num">
              <div className="stat"><label>Open</label><b>{money(quote.open, symbol)}</b></div>
              <div className="stat"><label>Prev. close</label><b>{money(quote.prevClose, symbol)}</b></div>
              <div className="stat"><label>Volume</label><b>{quote.volume ? quote.volume.toLocaleString('en-IN') : '—'}</b></div>
              <div className="stat"><label>Avg vol · 120d</label><b>{stats?.avgVol ? stats.avgVol.toLocaleString('en-IN') : '—'}</b></div>
              <div className="stat"><label>52-week high</label><b>{money(stats?.hi52, symbol)}</b></div>
              <div className="stat"><label>52-week low</label><b>{money(stats?.lo52, symbol)}</b></div>
            </div>
            <div className="range-row num"><span style={{ width: 120 }}>Day's range</span><span>{money(quote.low, symbol)}</span><div className="range-track"><span className="range-pin" style={{ left: `${dayPos}%` }} /></div><span>{money(quote.high, symbol)}</span></div>
            <div className="range-row num"><span style={{ width: 120 }}>52-week range</span><span>{money(stats?.lo52, symbol)}</span><div className="range-track"><span className="range-pin" style={{ left: `${yrPos}%` }} /></div><span>{money(stats?.hi52, symbol)}</span></div>
          </>
        )}
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Order ticket</h3>
          <p className="sub">State your thesis before you commit — the journal will hold you to it. Settled in {symbol.endsWith('.NS') ? '₹' : '$'}.</p>
          <div className="seg" style={{ marginBottom: 12 }}>
            <button className={side === 'BUY' ? 'on-buy' : ''} onClick={() => setSide('BUY')}>BUY</button>
            <button className={side === 'SELL' ? 'on-sell' : ''} onClick={() => setSide('SELL')}>SELL</button>
          </div>
          <div className="ticket">
            <div className="field"><label>Order type</label>
              <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}><option>MARKET</option><option>LIMIT</option></select></div>
            <div className="field"><label>Quantity</label>
              <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '100%' }} /></div>
            {type === 'LIMIT' && <div className="field"><label>Limit price ({symbol.endsWith('.NS') ? '₹' : '$'})</label>
              <input type="number" placeholder="e.g. 230.50" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} style={{ width: '100%' }} /></div>}
            <div className="field"><label>Confidence (1–5)</label>
              <select value={conf} onChange={e => setConf(e.target.value)} style={{ width: '100%' }}><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Thesis — why this trade?</label>
              <input placeholder="e.g. Breakout above SMA-50 on bullish wires; stop under 228" value={thesis} onChange={e => setThesis(e.target.value)} style={{ width: '100%' }} /></div>
            <div className="field"><label>Stop-loss ({symbol.endsWith('.NS') ? '₹' : '$'})</label>
              <input type="number" placeholder="e.g. 228.00" value={stopPx} onChange={e => setStopPx(e.target.value)} style={{ width: '100%' }} /></div>
            <div className="field"><label>Target ({symbol.endsWith('.NS') ? '₹' : '$'})</label>
              <input type="number" placeholder="e.g. 252.00" value={targetPx} onChange={e => setTargetPx(e.target.value)} style={{ width: '100%' }} /></div>
          </div>
          <label className="note row" style={{ marginTop: 10 }}><input type="checkbox" checked={makeAlerts} onChange={e => setMakeAlerts(e.target.checked)} /> Arm stop-loss / target alerts automatically on a filled BUY</label>
          <div className="row num" style={{ marginTop: 12 }}>
            <span className="note">Estimated value <b style={{ fontSize: 16, color: '#0A3D26' }}>{money(estCost, symbol)}</b></span>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={place}>{side} {symbol || '…'}</button>
          </div>
          {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        </div>

        <div>
          <div className="panel">
            <h3>Position sizer</h3>
            <p className="sub">Risk a fixed fraction of equity — the antidote to oversized bets.</p>
            <div className="ticket num">
              <div className="field"><label>Entry</label><input value={entryRef ? money(entryRef, symbol) : '—'} disabled style={{ width: '100%' }} /></div>
              <div className="field"><label>Your stop</label><input type="number" value={stopPx} onChange={e => setStopPx(e.target.value)} placeholder="same as ticket" style={{ width: '100%' }} /></div>
              <div className="field"><label>Risk per trade (%)</label><input type="number" min="0.1" step="0.1" value={riskPct} onChange={e => setRiskPct(+e.target.value || 1)} style={{ width: '100%' }} /></div>
              <div className="field"><label>Suggested qty</label><input value={suggestQty || '—'} disabled style={{ width: '100%' }} /></div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="note">Risking <b>₹{fmt(summary ? summary.equity * (riskPct / 100) : 0)}</b> of equity</span>
              <button className="btn ghost sm" style={{ marginLeft: 'auto' }} disabled={!suggestQty} onClick={() => setQty(suggestQty)}>Use suggested qty</button>
            </div>
          </div>
          <div className="panel">
            <h3>Circuit breaker</h3>
            <p className="sub">Blocks new BUYs past your pain threshold — against revenge trading.</p>
            <div className="row num">
              <div className="field"><label>Max fund loss (%)</label>
                <input type="number" min="1" max="30" value={guardPct} onChange={e => { setGuardPct(+e.target.value || 5); localStorage.setItem('sp_guard', e.target.value); }} style={{ width: 90 }} /></div>
              <span className="note">Fund now <b className={summary && summary.totalReturnPct >= 0 ? 'pos' : 'neg'}>{summary ? `${fmt(summary.totalReturnPct)}%` : '…'}</b></span>
              {override && <button className="btn ghost sm" onClick={() => setOverride(false)}>Re-arm</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Open positions</h3>
        <p className="sub">Marked to market, live · each row in its native currency.</p>
        {!positions.length ? <p className="note">Flat book — your fills will list here.</p> : (
          <table className="num"><thead><tr><th>Security</th><th>Qty</th><th>Avg</th><th>LTP</th><th>P&L</th></tr></thead><tbody>
            {positions.map(p => <tr key={p.symbol}><td><b className="sym">{p.symbol}</b></td><td>{p.qty}</td><td>{money(p.avgPrice, p.symbol)}</td><td>{money(p.lastPrice, p.symbol)}</td>
              <td className={p.pnl >= 0 ? 'pos' : 'neg'}><b>{money(p.pnl, p.symbol)}</b><br /><span className="muted" style={{ fontSize: 11 }}>{p.pnlPct}%</span></td></tr>)}
          </tbody></table>)}
      </div>

      <div className="panel">
        <h3>Order book</h3>
        <p className="sub">Every instruction you have placed, latest first — theses included.</p>
        <table className="num"><thead><tr><th>Time</th><th>Security</th><th>Side</th><th>Qty</th><th>Executed</th><th>Thesis</th><th>Status</th><th></th></tr></thead>
          <tbody>{orders.map(o => (
            <tr key={o._id}>
              <td className="muted">{new Date(o.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td><b className="sym">{o.symbol}</b></td>
              <td className={o.side === 'BUY' ? 'pos' : 'neg'}><b>{o.side}</b></td>
              <td>{o.qty}</td>
              <td>{o.execPrice ? money(o.execPrice, o.symbol) : '—'}</td>
              <td className="muted" style={{ maxWidth: 220 }}>{o.note ? o.note.split('|')[0] : <span>— no thesis</span>}</td>
              <td><span className={`badge ${o.status}`}>{o.status}</span></td>
              <td>{o.status === 'PENDING' && <button className="btn ghost sm" onClick={async () => { await api.post('/trade/cancel/' + o._id); load(); }}>Cancel</button>}</td>
            </tr>))}</tbody></table>
      </div>
    </>
  );
}
