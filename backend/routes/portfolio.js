const express = require('express');
const { isMongo } = require('../config/db');
const M = require('../models/models');
const { store, nid } = require('../models/store');
const { getQuote, getHistory } = require('../services/market');

const r = express.Router();
const UID = 'demo-user';

async function userCash() {
  if (isMongo()) { const u = await M.User.findOne({ userId: UID }).lean(); return u ?? { cash: 100000, startingCash: 100000 }; }
  return store.users.get(UID);
}
async function positions() {
  if (isMongo()) return M.Position.find({ userId: UID, qty: { $ne: 0 } }).lean();
  return [...store.positions.values()].filter(p => p.userId === UID && p.qty !== 0);
}

// GET /api/portfolio/summary — equity, allocation, returns, volatility
r.get('/summary', async (req, res) => {
  try {
    const u = await userCash();
    const pos = await positions();
    const enriched = await Promise.all(pos.map(async p => {
      const q = await getQuote(p.symbol);
      const mv = q.price * p.qty;
      return { symbol: p.symbol, qty: p.qty, avgPrice: p.avgPrice, lastPrice: q.price, marketValue: +mv.toFixed(2), pnl: +((q.price - p.avgPrice) * p.qty).toFixed(2) };
    }));
    const invested = +enriched.reduce((a, p) => a + p.marketValue, 0).toFixed(2);
    const equity = +(u.cash + invested).toFixed(2);
    const totalReturn = +(equity - u.startingCash).toFixed(2);
    const totalReturnPct = +((totalReturn / u.startingCash) * 100).toFixed(2);

    // allocation %
    const allocation = enriched.map(p => ({ symbol: p.symbol, value: p.marketValue, pct: invested ? +((p.marketValue / invested) * 100).toFixed(1) : 0 }));

    // volatility: std-dev of daily returns of largest holding (or simulated equity curve)
    let volatility = 0;
    if (enriched.length) {
      const hist = await getHistory(enriched[0].symbol, 30);
      const rets = hist.slice(1).map((h, i) => (h.close - hist[i].close) / hist[i].close);
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      volatility = +(Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * 100).toFixed(2);
    }

    // record snapshot (throttled: keep last 200)
    if (isMongo()) { await M.Snapshot.create({ userId: UID, equity, cash: u.cash }); }
    else { store.snapshots.push({ equity, cash: u.cash, createdAt: new Date().toISOString() }); if (store.snapshots.length > 200) store.snapshots.shift(); }

    res.json({ cash: +u.cash.toFixed(2), invested, equity, startingCash: u.startingCash, totalReturn, totalReturnPct, positions: enriched, allocation, volatility, dayChangePct: totalReturnPct });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// equity curve (synthetic from snapshots + history walk)
r.get('/curve', async (req, res) => {
  try {
    const u = await userCash();
    const days = Math.min(parseInt(req.query.days) || 30, 120);
    let snaps = isMongo() ? await M.Snapshot.find({ userId: UID }).sort({ createdAt: 1 }).limit(200).lean() : store.snapshots;
    let curve;
    if (snaps.length >= 5) {
      curve = snaps.slice(-days).map(s => ({ date: new Date(s.createdAt).toISOString().slice(0, 10), equity: s.equity }));
    } else {
      const hist = await getHistory('AAPL', days);
      const pos = await positions();
      const investedNow = 100000 - u.cash;
      curve = hist.map((h, i) => ({ date: h.date, equity: +((u.startingCash - investedNow) + investedNow * (h.close / hist[0].close)).toFixed(2) }));
      void pos;
    }
    res.json(curve);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// watchlist
r.get('/watchlist', async (req, res) => {
  const syms = isMongo() ? (await M.Watch.find({ userId: UID }).lean()).map(w => w.symbol) : [...store.watchlist].filter(k => k.startsWith(UID + ':')).map(k => k.split(':')[1]);
  const quotes = await Promise.all(syms.map(getQuote));
  res.json(quotes);
});
r.post('/watchlist', async (req, res) => {
  const symbol = (req.body.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    if (isMongo()) await M.Watch.updateOne({ userId: UID, symbol }, { $set: { userId: UID, symbol } }, { upsert: true });
    else store.watchlist.add(UID + ':' + symbol);
    res.json({ ok: true, symbol });
  } catch (e) { res.status(400).json({ error: 'already watched' }); }
});
r.delete('/watchlist/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (isMongo()) await M.Watch.deleteOne({ userId: UID, symbol });
  else store.watchlist.delete(UID + ':' + symbol);
  res.json({ ok: true });
});

module.exports = r;
