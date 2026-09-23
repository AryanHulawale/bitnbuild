// Simple lexicon sentiment scorer -> Bullish / Neutral / Bearish + score in [-1,1]
const BULL = ['surge', 'soar', 'rally', 'jump', 'gain', 'profit', 'record', 'beat', 'beats', 'upgrade', 'bull', 'bullish', 'growth', 'boom', 'breakthrough', 'optimism', 'strong', 'rise', 'rises', 'high', 'reward', 'buy', 'outperform'];
const BEAR = ['plunge', 'crash', 'slump', 'drop', 'fall', 'loss', 'miss', 'downgrade', 'bear', 'bearish', 'fear', 'risk', 'warning', 'lawsuit', 'fraud', 'layoff', 'weak', 'decline', 'cut', 'sell', 'underperform', 'volatile'];

function scoreText(text = '') {
  const t = text.toLowerCase();
  let s = 0;
  for (const w of BULL) if (t.includes(w)) s += 1;
  for (const w of BEAR) if (t.includes(w)) s -= 1;
  const norm = Math.max(-1, Math.min(1, s / 4));
  const label = norm > 0.15 ? 'Bullish' : norm < -0.15 ? 'Bearish' : 'Neutral';
  return { score: +norm.toFixed(2), label };
}

function aggregate(items) {
  if (!items.length) return { score: 0, label: 'Neutral', counts: { Bullish: 0, Neutral: 0, Bearish: 0 } };
  const counts = { Bullish: 0, Neutral: 0, Bearish: 0 };
  let sum = 0;
  for (const n of items) { counts[n.sentiment] = (counts[n.sentiment] || 0) + 1; sum += n.score; }
  const avg = sum / items.length;
  return { score: +avg.toFixed(2), label: avg > 0.12 ? 'Bullish' : avg < -0.12 ? 'Bearish' : 'Neutral', counts };
}

// Mock headline generator (deterministic per symbol) so demo works without NEWS_API_KEY
const TEMPLATES = [
  ['{S} shares {M} after strong quarterly results beat estimates', 0.7],
  ['Analysts upgrade {S} on {M} growth outlook', 0.6],
  ['{S} announces {M} expansion and upbeat guidance', 0.5],
  ['Market holds {S} steady as investors await Fed cues', 0.0],
  ['{S} trades mixed amid {M} sector rotation', -0.05],
  ['Concerns over {M} valuations drag {S} lower', -0.55],
  ['{S} slides as {M} downgrade sparks profit-booking', -0.65]
];

function mockNews(symbol, n = 8) {
  const seed = [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: n }, (_, i) => {
    const [tpl, bias] = TEMPLATES[(seed + i * 3) % TEMPLATES.length];
    const title = tpl.replaceAll('{S}', symbol.toUpperCase()).replaceAll('{M}', ['AI', 'banking', 'EV', 'IT', 'energy'][(seed + i) % 5]);
    const jitter = ((seed * (i + 7)) % 11 - 5) / 50;
    const score = Math.max(-1, Math.min(1, bias + jitter));
    return {
      title,
      source: ['Reuters', 'Moneycontrol', 'Bloomberg', 'ET Markets', 'CNBC'][(seed + i * 2) % 5],
      url: '#',
      publishedAt: new Date(Date.now() - i * 36e5 * 5).toISOString(),
      score: +score.toFixed(2),
      sentiment: score > 0.12 ? 'Bullish' : score < -0.12 ? 'Bearish' : 'Neutral'
    };
  });
}

async function fetchNews(symbol = 'MARKET') {
  const key = process.env.NEWS_API_KEY;
  if (!key) return mockNews(symbol);
  try {
    const q = symbol === 'MARKET' ? 'stock market' : symbol;
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&pageSize=12&sortBy=publishedAt&language=en&apiKey=${key}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.articles) return mockNews(symbol);
    return j.articles.map(a => {
      const s = scoreText((a.title || '') + ' ' + (a.description || ''));
      return { title: a.title, source: a.source?.name || 'News', url: a.url, publishedAt: a.publishedAt, score: s.score, sentiment: s.label };
    });
  } catch { return mockNews(symbol); }
}

module.exports = { scoreText, aggregate, fetchNews, mockNews };
