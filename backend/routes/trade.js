const express = require('express');
const { isMongo } = require('../config/db');
const M = require('../models/models');
const { store, nid } = require('../models/store');
const { getQuote } = require('../services/market');

const r = express.Router();
const UID = 'demo-user';
const START = () => parseFloat(process.env.STARTING_CASH) || 100000;

async function getUser() {
  if (isMongo()) {
    let u = await M.User.findOne({ userId: UID });
    if (!u) u = await M.User.create({ userId: UID, cash: START(), startingCash: START() });
    return u.toObject();
  }
  return store.users.get(UID);
}

// ---- helpers for both stores ----
async function listPositions() {
  if (isMongo()) return M.Position.find({ userId: UID, qty: { $ne: 0 } }).lean();
  return [...store.positions.values()].filter(p => p.userId === UID && p.qty !== 0);
}
async function listOrders(limit = 50) {
  if (isMongo()) return M.Order.find({ userId: UID }).sort({ createdAt: -1 }).limit(limit).lean();
  return [...store.orders].filter(o => o.userId === UID).reverse().slice(0, limit);
}

async function saveOrder(o) {
  if (isMongo()) { const d = await M.Order.create(o); return d.toObject(); }
  const rec = { _id: nid('ord'), createdAt: new Date().toISOString(), status: 'PENDING', ...o };
  store.orders.push(rec); return rec;
}
async function updateOrder(id, patch) {
  if (isMongo()) return M.Order.findByIdAndUpdate(id, patch, { new: true }).lean();
  const o = store.orders.find(x => x._id === id); Object.assign(o, patch); return o;
}
async function adjustCash(delta) {
  if (isMongo()) { const u = await M.User.findOneAndUpdate({ userId: UID }, { $inc: { cash: delta } }, { new: true }).lean(); return u; }
  const u = store.users.get(UID); u.cash = +(u.cash + delta).toFixed(2); return u;
}
async function applyFill(order, price) {
  const key = UID + ':' + order.symbol;
  let pos;
  if (isMongo()) {
    pos = await M.Position.findOne({ userId: UID, symbol: order.symbol });
    if (!pos) pos = await M.Position.create({ userId: UID, symbol: order.symbol, qty: 0, avgPrice: 0 });
  } else {
    pos = store.positions.get(key) || { userId: UID, symbol: order.symbol, qty: 0, avgPrice: 0 };
  }
  if (order.side === 'BUY') {
    const total = pos.avgPrice * pos.qty + price * order.qty;
    pos.qty += order.qty;
    pos.avgPrice = +(total / pos.qty).toFixed(2);
    await adjustCash(-price * order.qty);
  } else {
    if (pos.qty < order.qty) {
      await updateOrder(order._id, { status: 'REJECTED', note: 'Insufficient quantity' });
      return { rejected: true };
    }
    pos.qty -= order.qty;
    await adjustCash(+price * order.qty);
  }
  pos.updatedAt = new Date();
  if (isMongo()) await pos.save();
  else store.positions.set(key, pos);
  await updateOrder(order._id, { status: 'FILLED', execPrice: price, filledAt: new Date() });
  return { pos };
}

// Try to fill a single order at current price
async function tryFill(order) {
  const q = await getQuote(order.symbol);
  const px = q.price;
  if (order.type === 'MARKET') return applyFill(order, px);
  if (order.side === 'BUY' && px <= order.limitPrice) return applyFill(order, px);
  if (order.side === 'SELL' && px >= order.limitPrice) return applyFill(order, px);
  return { pending: true, price: px };
}

// POST /api/trade/order {symbol, side, type, qty, limitPrice}
r.post('/order', async (req, res) => {
  try {
    let { symbol, side, type = 'MARKET', qty, limitPrice, note } = req.body;
    symbol = (symbol || '').toUpperCase();
    qty = parseInt(qty);
    if (!symbol || !['BUY', 'SELL'].includes(side) || !qty || qty <= 0)
      return res.status(400).json({ error: 'symbol, side BUY/SELL and qty>0 required' });
    const q = await getQuote(symbol);
    if (side === 'BUY' && type === 'MARKET') {
      const u = await getUser();
      if (u.cash < q.price * qty) return res.status(400).json({ error: 'Insufficient virtual cash' });
    }
    const order = await saveOrder({ userId: UID, symbol, side, type, qty, limitPrice, note: String(note || '').slice(0, 300) });
    const result = await tryFill(order);
    const fresh = isMongo() ? await M.Order.findById(order._id).lean() : store.orders.find(x => x._id === order._id);
    res.json({ order: fresh, quote: q, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/orders', async (req, res) => res.json(await listOrders()));
r.get('/positions', async (req, res) => {
  try {
    const pos = await listPositions();
    const enriched = await Promise.all(pos.map(async p => {
      const q = await getQuote(p.symbol);
      const mv = +(q.price * p.qty).toFixed(2);
      const pnl = +((q.price - p.avgPrice) * p.qty).toFixed(2);
      const pnlPct = p.avgPrice ? +((pnl / (p.avgPrice * p.qty)) * 100).toFixed(2) : 0;
      return { ...p, lastPrice: q.price, marketValue: mv, pnl, pnlPct, changePct: q.changePct };
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/cancel/:id', async (req, res) => {
  const o = await updateOrder(req.params.id, { status: 'CANCELLED' });
  res.json(o);
});

// refresh pending limit orders
r.post('/process-pending', async (req, res) => {
  const pending = isMongo()
    ? await M.Order.find({ userId: UID, status: 'PENDING', type: 'LIMIT' }).lean()
    : store.orders.filter(o => o.status === 'PENDING' && o.type === 'LIMIT');
  const out = [];
  for (const o of pending) out.push({ id: o._id, ...(await tryFill(o)) });
  res.json({ processed: out.length, results: out });
});

r.post('/reset', async (req, res) => {
  if (isMongo()) {
    await Promise.all([M.Order.deleteMany({ userId: UID }), M.Position.deleteMany({ userId: UID }), M.Alert.deleteMany({ userId: UID }), M.Snapshot.deleteMany({ userId: UID })]);
    await M.User.findOneAndUpdate({ userId: UID }, { cash: START(), startingCash: START() }, { upsert: true });
  } else {
    store.orders = []; store.positions.clear(); store.alerts = []; store.snapshots = [];
    const u = store.users.get(UID); u.cash = START(); u.startingCash = START();
  }
  res.json({ ok: true, cash: START() });
});

module.exports = { tradeRouter: r, tryFillPending: async () => {
  const pending = isMongo()
    ? await M.Order.find({ status: 'PENDING', type: 'LIMIT' }).lean().catch(() => [])
    : store.orders.filter(o => o.status === 'PENDING' && o.type === 'LIMIT');
  for (const o of pending) { try { await tryFill(o); } catch {} }
}};
