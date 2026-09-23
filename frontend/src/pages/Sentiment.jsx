import React, { useEffect, useMemo, useState } from 'react';
import { api, fmt } from '../lib.js';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceDot } from 'recharts';

const tip = { background: '#fff', border: '1px solid #E1E7DF', borderRadius: 10, fontSize: 12 };
const tick = { fill: '#68796D', fontSize: 10 };

function Gauge({ score }) {
  const ang = Math.PI * (1 - (score + 1) / 2);
  const x = 100 - 72 * Math.cos(ang), y = 92 - 72 * Math.sin(ang);
  const label = score > 0.12 ? 'Bullish' : score < -0.12 ? 'Bearish' : 'Neutral';
  return (
    <div className="row" style={{ gap: 16 }}>
      <svg width="200" height="110" viewBox="0 0 200 110">
        <path d="M 20 92 A 80 80 0 0 1 180 92" fill="none" stroke="#E8EDE8" strokeWidth="16" strokeLinecap="round" />
        <path d="M 20 92 A 80 80 0 0 1 180 92" fill="none" stroke="url(#gg)" strokeWidth="16" strokeLinecap="round" strokeDasharray="252" strokeDashoffset={252 - ((score + 1) / 2) * 252} />
        <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#AE3A30" /><stop offset="50%" stopColor="#9AA79D" /><stop offset="100%" stopColor="#0C6B43" />
        </linearGradient></defs>
        <line x1="100" y1="92" x2={x} y2={y} stroke="#0A3D26" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="92" r="6" fill="#0A3D26" />
      </svg>
      <div>
        <div className="serif" style={{ fontSize: 30, color: '#0A3D26' }}>{label}</div>
        <div className="note num">mood index {fmt(score)} · −1 bearish to +1 bullish</div>
      </div>
    </div>
  );
}

const markDesk = (s) => {
  try {
    const set = new Set(JSON.parse(localStorage.getItem('sp_desks') || '[]'));
    set.add(s); localStorage.setItem('sp_desks', JSON.stringify([...set]));
  } catch {}
};

export default function Sentiment() {
  const [symbol, setSymbol] = useState('AAPL');
  const [data, setData] = useState(null);
  const [board, setBoard] = useState([]);
  const [moves, setMoves] = useState({});
  const [loading, setLoading] = useState(false);

  const load = async (s = symbol) => {
    const { data } = await api.get('/market/sentiment-series?symbol=' + s);
    setData(data); markDesk(s.toUpperCase());
  };

  const loadBoard = async () => {
    setLoading(true);
    try {
      const { data: wl } = await api.get('/portfolio/watchlist');
      const syms = (wl.length ? wl.map(w => w.symbol) : ['AAPL', 'NVDA', 'TSLA', 'RELIANCE.NS', 'TCS.NS']).slice(0, 8);
      const rows = await Promise.all(syms.map(async (sym) => {
        try {
          const { data } = await api.get('/market/news?symbol=' + sym);
          return { symbol: sym, ...data.summary, n: data.items.length };
        } catch { return { symbol: sym, score: 0, label: 'Neutral', n: 0 }; }
      }));
      try {
        const { data: qs } = await api.get('/market/quote?symbols=' + syms.join(','));
        setMoves(Object.fromEntries(qs.map(q => [q.symbol, q.changePct])));
      } catch {}
      setBoard(rows.sort((a, b) => b.score - a.score));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); loadBoard(); }, []);

  const mood = board.length ? board.reduce((a, b) => a + b.score, 0) / board.length : 0;

  // ---- move decoder: the 3 sharpest daily moves, each paired with that day's wires ----
  const decoded = useMemo(() => {
    if (!data?.points?.length) return [];
    const pts = data.points;
    const rows = pts.slice(1).map((p, i) => ({ ...p, chg: ((p.close - pts[i].close) / pts[i].close) * 100 }));
    return rows.sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 3).map(d => {
      const dir = d.chg >= 0 ? 'rose' : 'fell';
      const agree = (d.chg > 0.5 && d.sentiment > 0.12) || (d.chg < -0.5 && d.sentiment < -0.12);
      const against = (d.chg > 0.5 && d.sentiment < -0.12) || (d.chg < -0.5 && d.sentiment > 0.12);
      const why = agree
        ? `Wires and price agreed — ${d.label.toLowerCase()} headlines accompanied the move.`
        : against
          ? `Price moved against the wires — likely broader market flows or positioning, not the headlines.`
          : `Quiet or mixed wires — the move looks technical or sector-led rather than news-driven.`;
      return { ...d, dir, why };
    });
  }, [data]);

  // ---- divergence: price trend vs wire tone over the last 5 sessions ----
  const divergence = useMemo(() => {
    if (!data?.points?.length) return null;
    const last5 = data.points.slice(-5);
    const px = ((last5[last5.length - 1].close - last5[0].close) / last5[0].close) * 100;
    const wire = last5.reduce((a, p) => a + p.sentiment, 0) / last5.length;
    if (px > 2 && wire < -0.12) return { kind: 'risk', text: `Bullish divergence — price +${fmt(px)}% while wires stayed bearish. Strength the headlines missed, or a crowded short covering. Treat breakouts with extra care.` };
    if (px < -2 && wire > 0.12) return { kind: 'warn', text: `Bearish divergence — price ${fmt(px)}% despite bullish chatter. Someone is selling into good news; wait for confirmation before buying dips.` };
    return { kind: 'ok', text: `Aligned — price ${px >= 0 ? '+' : ''}${fmt(px)}% with ${wire >= 0 ? 'supportive' : 'soft'} wires. The story and the tape agree.` };
  }, [data]);

  const headlines = data ? [...new Map(data.points.map(p => [p.headline, p])).values()].slice(-8).reverse() : [];
  const dotDates = new Set(decoded.map(d => d.date));

  const divFlag = (b) => {
    const chg = moves[b.symbol];
    if (chg == null) return null;
    if (chg > 1.5 && b.score < -0.12) return '▲ vs wires';
    if (chg < -1.5 && b.score > 0.12) return '▼ vs wires';
    return null;
  };

  return (
    <>
      <div className="grid2e">
        <div className="panel">
          <h3>Market mood</h3>
          <p className="sub">Composite sentiment across your watchlist {loading ? '· reading wires…' : `· ${board.length} desks polled`}.</p>
          <Gauge score={+mood.toFixed(2)} />
        </div>
        <div className="panel">
          <h3>Desk leaderboard</h3>
          <p className="sub">Ranked most bullish to most bearish. ▲/▼ flags mark price moving against the wires.</p>
          <table className="num"><thead><tr><th>Desk</th><th>Reading</th><th>Day</th><th>Signal</th></tr></thead>
            <tbody>{board.map(b => (
              <tr key={b.symbol} onClick={() => { setSymbol(b.symbol); load(b.symbol); }} style={{ cursor: 'pointer' }}>
                <td><b className="sym">{b.symbol}</b> {b.symbol === symbol && <span className="scen">open</span>}</td>
                <td><span className={`badge ${b.label}`}>{b.label}</span><br /><span className="muted" style={{ fontSize: 11 }}>{fmt(b.score)}</span></td>
                <td className={moves[b.symbol] >= 0 ? 'pos' : 'neg'}><b>{moves[b.symbol] != null ? `${moves[b.symbol] >= 0 ? '+' : ''}${fmt(moves[b.symbol])}%` : '—'}</b></td>
                <td>{divFlag(b) ? <span className="scen">{divFlag(b)}</span> : <span className="muted">aligned</span>}</td>
              </tr>))}</tbody></table>
        </div>
      </div>

      <div className="panel">
        <div className="row">
          <h3 style={{ marginRight: 'auto' }}>Desk dossier — {symbol}</h3>
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} style={{ width: 150 }} />
          <button className="btn" onClick={() => load()}>Analyse desk</button>
          {data && <span><span className={`badge ${data.summary.label}`}>{data.summary.label} · {data.summary.score}</span></span>}
        </div>
        <p className="sub">Dots mark the three sharpest sessions — decoded below. Green/red bars are daily wire tone.</p>
        <ResponsiveContainer width="100%" height={270}>
          <ComposedChart data={data?.points || []}>
            <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={28} />
            <YAxis yAxisId="p" tick={tick} domain={['auto', 'auto']} width={64} />
            <YAxis yAxisId="s" orientation="right" domain={[-1, 1]} tick={tick} width={36} />
            <Tooltip contentStyle={tip} />
            <Bar yAxisId="s" dataKey="sentiment">{(data?.points || []).map((p, i) => <Cell key={i} fill={p.sentiment > 0.12 ? '#0E7A3D' : p.sentiment < -0.12 ? '#C05A4E' : '#C3CCC3'} />)}</Bar>
            <Line yAxisId="p" type="monotone" dataKey="close" stroke="#0A3D26" strokeWidth={2.2} dot={false} />
            {(data?.points || []).filter(p => dotDates.has(p.date)).map(p => (
              <ReferenceDot key={p.date} yAxisId="p" x={p.date} y={p.close} r={5} fill={p.close >= 0 ? '#9A7B24' : '#9A7B24'} stroke="#fff" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        {divergence && <div className={`verdict ${divergence.kind}`}><b>Signal — </b>{divergence.text}</div>}
      </div>

      <div className="grid2e">
        <div className="panel">
          <h3>Why did it move?</h3>
          <p className="sub">The three sharpest sessions, each held against that day's wires.</p>
          <div className="news">{decoded.map((d, i) => (
            <div className={`news-item ${d.chg >= 0 ? 'b-Bullish' : 'b-Bearish'}`} key={i}>
              <b className={d.chg >= 0 ? 'pos' : 'neg'}>{d.date} · {d.chg >= 0 ? '+' : ''}{fmt(d.chg)}%</b>
              {' '}<span className={`badge ${d.label}`}>{d.label} wires</span>
              <div style={{ marginTop: 4 }}><b>{d.headline}</b></div>
              <div className="muted" style={{ marginTop: 4 }}>{d.why}</div>
            </div>))}
          </div>
        </div>
        <div className="panel">
          <h3>Headline scorecard</h3>
          <p className="sub">How the in-house lexicon read the latest wires{BullBear(data)}.</p>
          <div className="news">{headlines.map((n, i) => (
            <div className={`news-item b-${n.label}`} key={i}>
              <span className={`badge ${n.label}`}>{n.label}</span>{' '}
              <b>{n.headline}</b> <span className="muted">· {n.date} · index {n.sentiment}</span>
            </div>))}
          </div>
        </div>
      </div>
    </>
  );
}

const BullBear = (data) => data ? ` — ${data.summary.counts.Bullish || 0} bullish, ${data.summary.counts.Neutral || 0} neutral, ${data.summary.counts.Bearish || 0} bearish` : '';
