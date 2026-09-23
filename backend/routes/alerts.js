const express = require('express');
const { isMongo } = require('../config/db');
const M = require('../models/models');
const { store, nid } = require('../models/store');
const { getQuote } = require('../services/market');

const r = express.Router();
const UID = 'demo-user';

async function listAlerts() {
  if (isMongo()) return M.Alert.find({ userId: UID }).sort({ createdAt: -1 }).lean();
  return [...store.alerts].filter(a => a.userId === UID).reverse();
}

// GET /api/alerts
r.get('/', async (req, res) => res.json(await listAlerts()));

// POST /api/alerts {symbol, kind: STOP_LOSS|TARGET|PRICE_ABOVE|PRICE_BELOW, price}
r.post('/', async (req, res) => {
  const { symbol, kind, price } = req.body;
  if (!symbol || !kind || !price) return res.status(400).json({ error: 'symbol, kind, price required' });
  const rec = { userId: UID, symbol: symbol.toUpperCase(), kind, price: +price, active: true, triggered: false, createdAt: new Date().toISOString(), _id: nid('al') };
  if (isMongo()) { const d = await M.Alert.create(rec); return res.json(d); }
  store.alerts.push(rec); res.json(rec);
});

r.delete('/:id', async (req, res) => {
  if (isMongo()) await M.Alert.findByIdAndDelete(req.params.id);
  else store.alerts = store.alerts.filter(a => a._id !== req.params.id);
  res.json({ ok: true });
});

// POST /api/alerts/check — evaluate all active alerts against live prices
r.post('/check', async (req, res) => {
  const alerts = (await listAlerts()).filter(a => a.active && !a.triggered);
  const bySym = [...new Set(alerts.map(a => a.symbol))];
  const quotes = Object.fromEntries(await Promise.all(bySym.map(async s => [s, await getQuote(s)])));
  const fired = [];
  for (const a of alerts) {
    const px = quotes[a.symbol]?.price;
    if (px == null) continue;
    const hit = (a.kind === 'STOP_LOSS' || a.kind === 'PRICE_BELOW') ? px <= a.price : px >= a.price;
    if (hit) {
      fired.push({ ...a, atPrice: px });
      if (isMongo()) await M.Alert.findByIdAndUpdate(a._id, { triggered: true, active: false, triggeredAt: new Date() });
      else { const s = store.alerts.find(x => x._id === a._id); if (s) { s.triggered = true; s.active = false; s.triggeredAt = new Date().toISOString(); } }
    }
  }
  res.json({ checked: alerts.length, fired });
});

module.exports = r;
