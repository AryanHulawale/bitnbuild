import axios from 'axios';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });

export const fmt = (n) => (n == null || Number.isNaN(+n) ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
export const fmtMoney = (n) => (n < 0 ? '-₹' : '₹') + fmt(Math.abs(n));
export const fmtSign = (n, suffix = '%') => `${n >= 0 ? '+' : ''}${fmt(n)}${suffix}`;

/** Simple moving average aligned to input (null until enough points). */
export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = +(sum / n).toFixed(2);
  }
  return out;
}

/** Risk stats from an equity curve [{date, equity}]. */
export function curveStats(curve = []) {
  if (curve.length < 3) return null;
  const eq = curve.map(c => c.equity);
  const rets = [];
  for (let i = 1; i < eq.length; i++) rets.push((eq[i] - eq[i - 1]) / eq[i - 1]);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
  const sharpe = sd > 0 ? +((mean / sd) * Math.sqrt(252)).toFixed(2) : 0;
  let peak = eq[0], maxDD = 0;
  for (const v of eq) { peak = Math.max(peak, v); maxDD = Math.min(maxDD, (v - peak) / peak); }
  const total = (eq[eq.length - 1] - eq[0]) / eq[0];
  return {
    sharpe,
    maxDDPct: +(maxDD * 100).toFixed(2),
    totalPct: +(total * 100).toFixed(2),
    dailyVolPct: +(sd * 100).toFixed(2),
    var95: rets.length ? +(1.65 * sd * eq[eq.length - 1]).toFixed(0) : 0
  };
}

/**
 * FIFO realized P&L from filled orders (chronological replay).
 * Returns { total, trades: [{symbol, qty, buy, sell, pnl, pnlPct, opened, closed}] }
 */
export function realizedFIFO(orders = []) {
  const fills = orders.filter(o => o.status === 'FILLED').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const lots = {}; // symbol -> [{qty, price, date}]
  const trades = [];
  for (const o of fills) {
    const px = o.execPrice ?? o.limitPrice;
    if (px == null) continue;
    if (o.side === 'BUY') {
      (lots[o.symbol] ||= []).push({ qty: o.qty, price: px, date: o.filledAt || o.createdAt });
    } else {
      let need = o.qty, cost = 0, bought = 0, opened = null;
      const q = lots[o.symbol] || [];
      while (need > 0 && q.length) {
        const lot = q[0];
        const take = Math.min(need, lot.qty);
        cost += take * lot.price; bought += take; need -= take; lot.qty -= take;
        opened = opened || lot.date;
        if (lot.qty <= 0) q.shift();
      }
      if (!bought) continue;
      const proceeds = bought * px;
      trades.push({
        symbol: o.symbol, qty: bought,
        buy: +(cost / bought).toFixed(2), sell: +px,
        pnl: +(proceeds - cost).toFixed(2),
        pnlPct: +(((proceeds - cost) / cost) * 100).toFixed(2),
        opened, closed: o.filledAt || o.createdAt
      });
    }
  }
  return { total: +trades.reduce((a, t) => a + t.pnl, 0).toFixed(2), trades: trades.reverse() };
}

export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** SMA-crossover backtest. Capital starts at 100. Returns stats + normalized curves. */
export function backtestSMA(hist = [], fast = 20, slow = 50) {
  const closes = hist.map(h => h.close);
  const f = sma(closes, fast), s = sma(closes, slow);
  let cash = 100, pos = 0, entry = 0, entryDate = '';
  const trades = [];
  const curve = [];
  const first = hist.findIndex((_, i) => f[i] != null && s[i] != null);
  const base = first >= 0 ? closes[first] : closes[0];
  for (let i = 0; i < hist.length; i++) {
    const sig = f[i] != null && s[i] != null ? (f[i] > s[i] ? 1 : 0) : 0;
    if (sig === 1 && pos === 0 && i >= first) { pos = cash / closes[i]; entry = closes[i]; entryDate = hist[i].date; cash = 0; }
    if (sig === 0 && pos > 0) {
      cash = pos * closes[i];
      trades.push({ entry: +entry.toFixed(2), exit: +closes[i], pnlPct: +(((closes[i] - entry) / entry) * 100).toFixed(2), entryDate, exitDate: hist[i].date });
      pos = 0;
    }
    const eq = i < first ? 100 : cash + pos * closes[i];
    curve.push({ date: hist[i].date, strat: +eq.toFixed(2), hold: +(100 * closes[i] / base).toFixed(2) });
  }
  const stratRet = +((curve[curve.length - 1].strat - 100)).toFixed(2);
  const holdRet = +((curve[curve.length - 1].hold - 100)).toFixed(2);
  const wins = trades.filter(t => t.pnlPct > 0).length;
  return { stratRet, holdRet, trades: trades.length, winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0, curve, tradeList: trades.reverse() };
}

/* ---------- market detail helpers ---------- */
export const ccy = (s) => (s && s.endsWith('.NS') ? '₹' : '$');
export const money = (n, s) => (n < 0 ? '-' : '') + ccy(s) + fmt(Math.abs(n));

const SECTORS = {
  'AAPL': ['Technology · Devices', 'NASDAQ'], 'MSFT': ['Technology · Cloud', 'NASDAQ'],
  'NVDA': ['Semiconductors · AI', 'NASDAQ'], 'TSLA': ['Automotive · EV', 'NASDAQ'],
  'AMZN': ['E-commerce · Cloud', 'NASDAQ'], 'GOOGL': ['Technology · Search', 'NASDAQ'],
  'META': ['Technology · Social', 'NASDAQ'], 'AMD': ['Semiconductors', 'NASDAQ'],
  'NFLX': ['Media · Streaming', 'NASDAQ'], 'JPM': ['Banking', 'NYSE'],
  'RELIANCE.NS': ['Energy · Retail · Telecom', 'NSE'], 'TCS.NS': ['Information Technology', 'NSE'],
  'INFY.NS': ['Information Technology', 'NSE'], 'HDFCBANK.NS': ['Banking', 'NSE'],
  'SBIN.NS': ['Banking · PSU', 'NSE'], 'TATAMOTORS.NS': ['Automotive', 'NSE']
};
export const meta = (s) => {
  const hit = SECTORS[(s || '').toUpperCase()];
  if (hit) return { sector: hit[0], exch: hit[1] };
  return { sector: 'Listed equity', exch: (s || '').endsWith('.NS') ? 'NSE' : '—' };
};

export const BENCHES = [
  { id: 'NONE', label: 'No benchmark' },
  { id: '^SPX', label: 'S&P 500' },
  { id: '^NDQ', label: 'Nasdaq 100' },
  { id: 'XAUUSD', label: 'Gold' }
];

/** Pearson correlation of two equal-length return series. */
export function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const x = a.slice(-n), y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? +(num / Math.sqrt(dx * dy)).toFixed(2) : 0;
}
