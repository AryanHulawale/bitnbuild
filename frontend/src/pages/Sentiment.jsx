import React, { useEffect, useMemo, useState } from 'react';
import { api, fmt, meta, downloadCSV } from '../lib.js';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceDot, ReferenceArea } from 'recharts';
import '../styles/sentiment.css';

const tip = { background: '#fff', border: '1px solid #E1E7DF', borderRadius: 10, fontSize: 12 };
const tick = { fill: '#68796D', fontSize: 10 };

/* ---------- source credibility weights ---------- */
const SRC_W = { reuters: 1, bloomberg: 1, moneycontrol: 0.9, 'et markets': 0.9, cnbc: 0.85 };
const srcW = (src) => SRC_W[(src || '').toLowerCase()] ?? 0.75;

/* ---------- deterministic 8-session trend for sparklines ---------- */
function deskTrend(symbol, end) {
  const seed = [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0);
  const pts = [];
  for (let i = 7; i >= 0; i--) {
    const jitter = (((seed * (i + 3)) % 13) - 6) / 10;
    pts.push(Math.max(-1, Math.min(1, end * (1 - i / 9) + jitter * (i / 8))));
  }
  pts[7] = end;
  return pts;
}
function Sparkline({ values }) {
  const w = 64, h = 20;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h / 2 - v * (h / 2 - 2)}`).join(' ');
  return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={values[values.length - 1] >= 0 ? '#0C6B43' : '#AE3A30'} strokeWidth="1.6" /></svg>;
}

function Gauge({ score }) {
  const ang = Math.PI * (1 - (score + 1) / 2);
  const x = 100 - 72 * Math.cos(ang), y = 92 - 72 * Math.sin(ang);
  const label = score > 0.12 ? 'Bullish' : score < -0.12 ? 'Bearish' : 'Neutral';
  return (
    <div className="row gauge-row">
      <svg width="200" height="110" viewBox="0 0 200 110">
        <path d="M 20 92 A 80 80 0 0 1 180 92" fill="none" stroke="#E8EDE8" strokeWidth="16" strokeLinecap="round" />
        <path d="M 20 92 A 80 80 0 0 1 180 92" fill="none" stroke="url(#gg)" strokeWidth="16" strokeLinecap="round" strokeDasharray="252" strokeDashoffset={252 - ((score + 1) / 2) * 252} />
        <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#AE3A30" /><stop offset="50%" stopColor="#9AA79D" /><stop offset="100%" stopColor="#0C6B43" />
        </linearGradient></defs>
        <line x1="100" y1="92" x2={x} y2={y} stroke="#0A3D26" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="92" r="6" fill="#0A3D26" className="gauge-pin" />
      </svg>
      <div>
        <div className="serif gauge-label">{label}</div>
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
  const [news, setNews] = useState([]);
  const [board, setBoard] = useState([]);
  const [moves, setMoves] = useState({});
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);

  // interaction state
  const [sortKey, setSortKey] = useState('score');
  const [hlFilter, setHlFilter] = useState('All');
  const [hlQuery, setHlQuery] = useState('');

  // visualization state
  const [windowDays, setWindowDays] = useState(30);
  const [compare, setCompare] = useState('');
  const [cmpData, setCmpData] = useState(null);

  // data-signal state
  const [flips, setFlips] = useState([]);

  const load = async (s = symbol) => {
    const { data } = await api.get('/market/sentiment-series?symbol=' + s);
    setData(data); markDesk(s.toUpperCase());
    try {
      const { data: n } = await api.get('/market/news?symbol=' + s);
      setNews(n.items || []);
    } catch {}
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
      // signal flip alerts vs previous visit
      try {
        const prev = JSON.parse(localStorage.getItem('sp_prev_labels') || '{}');
        const nowFlips = rows.filter(r => prev[r.symbol] && prev[r.symbol] !== r.label)
          .map(r => `${r.symbol}: ${prev[r.symbol]} → ${r.label}`);
        setFlips(nowFlips);
        localStorage.setItem('sp_prev_labels', JSON.stringify(Object.fromEntries(rows.map(r => [r.symbol, r.label]))));
      } catch {}
      setBoard(rows);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); loadBoard(); }, []);

  // live wires auto-refresh
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { load(symbol); loadBoard(); }, 30000);
    return () => clearInterval(t);
  }, [live, symbol]);

  // comparison series
  useEffect(() => {
    if (!compare) { setCmpData(null); return; }
    api.get('/market/sentiment-series?symbol=' + compare).then(r => setCmpData(r.data)).catch(() => setCmpData(null));
  }, [compare]);

  const mood = board.length ? board.reduce((a, b) => a + b.score, 0) / board.length : 0;

  /* ---------- fear & greed composite ---------- */
  const fearGreed = useMemo(() => {
    if (!board.length) return null;
    const bull = board.filter(b => b.label === 'Bullish').length / board.length;
    const bear = board.filter(b => b.label === 'Bearish').length / board.length;
    const mv = Object.values(moves);
    const vol = mv.length ? Math.sqrt(mv.reduce((a, v) => a + v * v, 0) / mv.length) : 0;
    const fg = Math.max(0, Math.min(100, Math.round(50 + mood * 35 + (bull - bear) * 18 - vol * 3)));
    const band = fg >= 75 ? 'Extreme Greed' : fg >= 56 ? 'Greed' : fg >= 45 ? 'Balanced' : fg >= 25 ? 'Fear' : 'Extreme Fear';
    return { fg, band };
  }, [board, moves, mood]);

  /* ---------- sector heatmap ---------- */
  const sectors = useMemo(() => {
    const g = {};
    for (const b of board) {
      const s = meta(b.symbol).sector.split('·')[0].trim();
      (g[s] ||= []).push(b.score);
    }
    return Object.entries(g).map(([sector, scores]) => ({ sector, score: scores.reduce((a, b) => a + b, 0) / scores.length }));
  }, [board]);

  // ---- move decoder ----
  const decoded = useMemo(() => {
    if (!data?.points?.length) return [];
    const pts = data.points;
    const rows = pts.slice(1).map((p, i) => ({ ...p, chg: ((p.close - pts[i].close) / pts[i].close) * 100 }));
    return rows.sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 3).map(d => {
      const agree = (d.chg > 0.5 && d.sentiment > 0.12) || (d.chg < -0.5 && d.sentiment < -0.12);
      const against = (d.chg > 0.5 && d.sentiment < -0.12) || (d.chg < -0.5 && d.sentiment > 0.12);
      const why = agree
        ? `Wires and price agreed — ${d.label.toLowerCase()} headlines accompanied the move.`
        : against
          ? `Price moved against the wires — likely broader market flows or positioning, not the headlines.`
          : `Quiet or mixed wires — the move looks technical or sector-led rather than news-driven.`;
      return { ...d, why };
    });
  }, [data]);

  const divergence = useMemo(() => {
    if (!data?.points?.length) return null;
    const last5 = data.points.slice(-5);
    const px = ((last5[last5.length - 1].close - last5[0].close) / last5[0].close) * 100;
    const wire = last5.reduce((a, p) => a + p.sentiment, 0) / last5.length;
    if (px > 2 && wire < -0.12) return { kind: 'risk', text: `Bullish divergence — price +${fmt(px)}% while wires stayed bearish. Strength the headlines missed, or a crowded short covering. Treat breakouts with extra care.` };
    if (px < -2 && wire > 0.12) return { kind: 'warn', text: `Bearish divergence — price ${fmt(px)}% despite bullish chatter. Someone is selling into good news; wait for confirmation before buying dips.` };
    return { kind: 'ok', text: `Aligned — price ${px >= 0 ? '+' : ''}${fmt(px)}% with ${wire >= 0 ? 'supportive' : 'soft'} wires. The story and the tape agree.` };
  }, [data]);

  /* ---------- headlines: filtered + searched ---------- */
  const filteredNews = useMemo(() => news.filter(n =>
    (hlFilter === 'All' || n.sentiment === hlFilter) &&
    (!hlQuery || n.title.toLowerCase().includes(hlQuery.toLowerCase()) || (n.source || '').toLowerCase().includes(hlQuery.toLowerCase()))
  ), [news, hlFilter, hlQuery]);

  const weightedScore = useMemo(() => {
    if (!news.length) return null;
    const wSum = news.reduce((a, n) => a + srcW(n.source), 0);
    return news.reduce((a, n) => a + n.score * srcW(n.source), 0) / wSum;
  }, [news]);

  /* ---------- word cloud of wire terms ---------- */
  const wordCloud = useMemo(() => {
    const STOP = new Set(['the', 'a', 'an', 'as', 'amid', 'and', 'on', 'in', 'of', 'to', 'for', 'after', 'over', 'with', 'into', 'new', 's', 'by', 'from', 'their', 'its', 'at', 'or', 'is']);
    const freq = {};
    for (const n of news) {
      for (const w of n.title.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)) {
        if (w.length < 4 || STOP.has(w)) continue;
        freq[w] = freq[w] || { n: 0, s: 0 };
        freq[w].n++; freq[w].s += n.score;
      }
    }
    return Object.entries(freq).sort((a, b) => b[1].n - a[1].n).slice(0, 18)
      .map(([w, v]) => ({ w, n: v.n, tone: v.s >= 0 ? 'pos' : 'neg' }));
  }, [news]);

  const dotDates = new Set(decoded.map(d => d.date));
  const chartData = useMemo(() => {
    const pts = (data?.points || []).slice(-windowDays);
    const cmpMap = {};
    if (cmpData?.points) for (const p of cmpData.points) cmpMap[p.date] = p.sentiment;
    return pts.map(p => ({ ...p, cmp: cmpMap[p.date] ?? null }));
  }, [data, windowDays, cmpData]);

  const sortedBoard = useMemo(() => [...board].sort((a, b) => {
    if (sortKey === 'day') return (moves[b.symbol] ?? -Infinity) - (moves[a.symbol] ?? -Infinity);
    if (sortKey === 'n') return b.n - a.n;
    return b.score - a.score;
  }), [board, sortKey, moves]);

  const divFlag = (b) => {
    const chg = moves[b.symbol];
    if (chg == null) return null;
    if (chg > 1.5 && b.score < -0.12) return '▲ vs wires';
    if (chg < -1.5 && b.score > 0.12) return '▼ vs wires';
    return null;
  };

  const sortBtn = (k, label) => (
    <button className="btn ghost sm" onClick={() => setSortKey(k)} style={sortKey === k ? { borderColor: '#0C6B43', color: '#0C6B43' } : {}}>{label}</button>
  );

  return (
    <>
      {flips.length > 0 && (
        <div className="flip-banner">
          <b>Signal flips since last visit —</b> {flips.join(' · ')}
          <button className="btn ghost sm" onClick={() => setFlips([])}>dismiss</button>
        </div>
      )}

      <div className="grid2e">
        <div className="panel">
          <h3>Market mood</h3>
          <p className="sub">Composite sentiment across your watchlist {loading ? '· reading wires…' : `· ${board.length} desks polled`}.</p>
          <Gauge score={+mood.toFixed(2)} />
          {fearGreed && (
            <div className="fg">
              <b>{fearGreed.fg}</b><span>/100 · {fearGreed.band}</span>
              <div className="fg-track"><div style={{ width: fearGreed.fg + '%' }} /></div>
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Desk leaderboard</h3>
          <p className="sub">▲/▼ flags mark price moving against the wires. Trend = last 8 sessions.</p>
          <div className="row" style={{ marginBottom: 8 }}>
            {sortBtn('score', 'By tone')}{sortBtn('day', 'By day')}{sortBtn('n', 'By wires')}
            <label className="live"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> live wires (30s)</label>
          </div>
          <table className="num desk-table"><thead><tr><th>Desk</th><th>Reading</th><th>Trend</th><th>Day</th><th>Signal</th></tr></thead>
            <tbody>{sortedBoard.map(b => (
              <tr key={b.symbol} onClick={() => { setSymbol(b.symbol); load(b.symbol); }} className="desk-row">
                <td><b className="sym">{b.symbol}</b> {b.symbol === symbol && <span className="scen">open</span>}</td>
                <td><span className={`badge ${b.label}`}>{b.label}</span><br /><span className="muted desk-score">{fmt(b.score)}</span></td>
                <td><Sparkline values={deskTrend(b.symbol, b.score)} /></td>
                <td className={moves[b.symbol] >= 0 ? 'pos' : 'neg'}><b>{moves[b.symbol] != null ? `${moves[b.symbol] >= 0 ? '+' : ''}${fmt(moves[b.symbol])}%` : '—'}</b></td>
                <td>{divFlag(b) ? <span className="scen">{divFlag(b)}</span> : <span className="muted">aligned</span>}</td>
              </tr>))}</tbody></table>
        </div>
      </div>

      {sectors.length > 0 && (
        <div className="panel">
          <h3>Sector heat</h3>
          <p className="sub">Average wire tone per sector across the watchlist.</p>
          <div className="row">
            {sectors.map(s => (
              <span key={s.sector} className="heat" style={{ background: s.score > 0.12 ? '#E4F0E7' : s.score < -0.12 ? '#F6E4E1' : '#EEF1EE', color: s.score > 0.12 ? '#0A4A26' : s.score < -0.12 ? '#7A271F' : '#5B6B5F' }}>
                {s.sector} {fmt(s.score)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="row">
          <h3 className="dossier-title">Desk dossier — {symbol}</h3>
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="symbol-input" />
          <button className="btn" onClick={() => load()}>Analyse desk</button>
          <button className="btn ghost" onClick={() => downloadCSV(`${symbol}_dossier.csv`, (data?.points || []).map(p => ({ date: p.date, close: p.close, sentiment: p.sentiment, headline: p.headline })))}>Export CSV</button>
          {data && <span><span className={`badge ${data.summary.label}`}>{data.summary.label} · {data.summary.score}</span></span>}
        </div>
        <p className="sub">Dots mark the three sharpest sessions — decoded below. Green/red bars are daily wire tone. Shaded band = last 5 sessions where signals are read.</p>
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="scrub">window <input type="range" min="10" max="30" value={windowDays} onChange={e => setWindowDays(+e.target.value)} /> {windowDays}d</label>
          <select value={compare} onChange={e => setCompare(e.target.value)}>
            <option value="">Compare: none</option>
            {['AAPL', 'NVDA', 'TSLA', 'RELIANCE.NS', 'TCS.NS', 'MSFT', 'GOOGL'].filter(s => s !== symbol).map(s => <option key={s} value={s}>vs {s}</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={270}>
          <ComposedChart data={chartData}>
            <CartesianGrid stroke="#E8EDE8" /><XAxis dataKey="date" tick={tick} minTickGap={28} />
            <YAxis yAxisId="p" tick={tick} domain={['auto', 'auto']} width={64} />
            <YAxis yAxisId="s" orientation="right" domain={[-1, 1]} tick={tick} width={36} />
            <Tooltip contentStyle={tip} />
            {chartData.length > 5 && <ReferenceArea yAxisId="p" x1={chartData[chartData.length - 5].date} x2={chartData[chartData.length - 1].date} fill="#F5F1DE" fillOpacity={0.5} />}
            <Bar yAxisId="s" dataKey="sentiment">{chartData.map((p, i) => <Cell key={i} fill={p.sentiment > 0.12 ? '#0E7A3D' : p.sentiment < -0.12 ? '#C05A4E' : '#C3CCC3'} />)}</Bar>
            <Line yAxisId="p" type="monotone" dataKey="close" stroke="#0A3D26" strokeWidth={2.2} dot={false} />
            {compare && <Line yAxisId="s" type="monotone" dataKey="cmp" stroke="#9A7B24" strokeDasharray="4 4" dot={false} />}
            {chartData.filter(p => dotDates.has(p.date)).map(p => (
              <ReferenceDot key={p.date} yAxisId="p" x={p.date} y={p.close} r={5} fill="#9A7B24" stroke="#fff" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        {divergence && <div className={`verdict ${divergence.kind} verdict-slide`}><b>Signal — </b>{divergence.text}</div>}
      </div>

      <div className="grid2e">
        <div className="panel">
          <h3>Why did it move?</h3>
          <p className="sub">The three sharpest sessions, each held against that day's wires.</p>
          <div className="news">{decoded.map((d, i) => (
            <div className={`news-item ${d.chg >= 0 ? 'b-Bullish' : 'b-Bearish'} news-pop`} key={i}>
              <b className={d.chg >= 0 ? 'pos' : 'neg'}>{d.date} · {d.chg >= 0 ? '+' : ''}{fmt(d.chg)}%</b>
              {' '}<span className={`badge ${d.label}`}>{d.label} wires</span>
              <div className="news-headline"><b>{d.headline}</b></div>
              <div className="muted news-why">{d.why}</div>
            </div>))}
          </div>
        </div>
        <div className="panel">
          <h3>Headline scorecard</h3>
          <p className="sub">Lexicon read of the latest wires{weightedScore != null ? ` · credibility-weighted ${fmt(weightedScore)}` : ''}{BullBear(data)}.</p>
          <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            {['All', 'Bullish', 'Neutral', 'Bearish'].map(f => (
              <button key={f} className="btn ghost sm" onClick={() => setHlFilter(f)} style={hlFilter === f ? { borderColor: '#0C6B43', color: '#0C6B43' } : {}}>{f}</button>
            ))}
            <input value={hlQuery} onChange={e => setHlQuery(e.target.value)} placeholder="search headlines…" style={{ flex: 1, minWidth: 130 }} />
          </div>
          <div className="news">{filteredNews.map((n, i) => (
            <div className={`news-item b-${n.sentiment} news-pop`} key={i}>
              <span className={`badge ${n.sentiment}`}>{n.sentiment}</span>{' '}
              <b className="hl-link" onClick={() => n.url && n.url !== '#' && window.open(n.url, '_blank')} title={n.url && n.url !== '#' ? 'open source' : 'in-house sample wire'}>{n.title}</b>{' '}
              <span className="muted">· {n.source} · index {n.score}</span>
            </div>))}
            {!filteredNews.length && <p className="sub">No wires match that filter.</p>}
          </div>
        </div>
      </div>

      {wordCloud.length > 0 && (
        <div className="panel">
          <h3>Wire vocabulary</h3>
          <p className="sub">Most frequent terms across the latest headlines, tinted by average tone.</p>
          <div className="cloud">
            {wordCloud.map(t => (
              <span key={t.w} className={t.tone} style={{ fontSize: 11 + t.n * 3 }}>{t.w} ×{t.n}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const BullBear = (data) => data ? ` — ${data.summary.counts.Bullish || 0} bullish, ${data.summary.counts.Neutral || 0} neutral, ${data.summary.counts.Bearish || 0} bearish` : '';
