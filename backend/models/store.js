// In-memory fallback so the app runs with zero setup (no MongoDB needed for demo).
const store = {
  users: new Map([['demo-user', { userId: 'demo-user', name: 'Demo Trader', cash: 100000, startingCash: 100000 }]]),
  orders: [],
  positions: new Map(), // key: userId:symbol
  alerts: [],
  watchlist: new Set(['AAPL', 'TSLA', 'NVDA', 'RELIANCE.NS', 'TCS.NS'].map(s => 'demo-user:' + s)),
  snapshots: [],
  id: 1
};
function nid(prefix) { return `${prefix}_${store.id++}_${Date.now()}`; }
module.exports = { store, nid };
