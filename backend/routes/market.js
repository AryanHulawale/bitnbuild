const express = require('express');
const { getQuote, getHistory, WATCH_DEFAULT } = require('../services/market');
const { fetchNews, aggregate } = require('../services/sentiment');

const r = express.Router();

// GET /api/market/quote?symbol=AAPL  |  symbols=AAPL,TSLA
r.get('/quote', async (req, res) => {
  try {
    if (req.query.symbols) {
      const syms = req.query.symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 15);
      const out = await Promise.all(syms.map(getQuote));
      return res.json(out);
    }
    const symbol = (req.query.symbol || 'AAPL').toUpperCase();
    res.json(await getQuote(symbol));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/history', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'AAPL').toUpperCase();
    const days = Math.min(parseInt(req.query.days) || 60, 250);
    res.json(await getHistory(symbol, days));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/news', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'MARKET').toUpperCase();
    const items = await fetchNews(symbol);
    res.json({ symbol, items, summary: aggregate(items) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// sentiment mapped against price history (for overlay chart)
r.get('/sentiment-series', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'AAPL').toUpperCase();
    const [hist, news] = await Promise.all([getHistory(symbol, 30), fetchNews(symbol)]);
    const points = hist.map((h, i) => {
      const n = news[i % news.length];
      return { date: h.date, close: h.close, sentiment: n.score, label: n.sentiment, headline: n.title };
    });
    res.json({ symbol, points, summary: aggregate(news) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/search', async (req, res) => {
  const q = (req.query.q || '').toUpperCase();
  const universe = [...new Set([...WATCH_DEFAULT, 'GOOGL', 'META', 'AMD', 'NFLX', 'JPM', 'HDFCBANK.NS', 'SBIN.NS', 'TATAMOTORS.NS'])];
  res.json(universe.filter(s => s.includes(q)).slice(0, 10).map(s => ({ symbol: s })));
});

module.exports = r;
