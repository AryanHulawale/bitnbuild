const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  userId: { type: String, index: true, default: 'demo-user' },
  symbol: { type: String, required: true, uppercase: true },
  side: { type: String, enum: ['BUY', 'SELL'], required: true },
  type: { type: String, enum: ['MARKET', 'LIMIT'], default: 'MARKET' },
  qty: { type: Number, required: true, min: 1 },
  limitPrice: Number,
  execPrice: Number,
  status: { type: String, enum: ['PENDING', 'FILLED', 'CANCELLED', 'REJECTED'], default: 'PENDING' },
  note: String,
  createdAt: { type: Date, default: Date.now },
  filledAt: Date
});

const PositionSchema = new mongoose.Schema({
  userId: { type: String, index: true, default: 'demo-user' },
  symbol: { type: String, required: true, uppercase: true },
  qty: { type: Number, default: 0 },
  avgPrice: { type: Number, default: 0 },
  stopLoss: Number,
  target: Number,
  updatedAt: { type: Date, default: Date.now }
});
PositionSchema.index({ userId: 1, symbol: 1 }, { unique: true });

const AlertSchema = new mongoose.Schema({
  userId: { type: String, default: 'demo-user' },
  symbol: { type: String, required: true, uppercase: true },
  kind: { type: String, enum: ['STOP_LOSS', 'TARGET', 'PRICE_ABOVE', 'PRICE_BELOW'], required: true },
  price: { type: Number, required: true },
  active: { type: Boolean, default: true },
  triggered: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  triggeredAt: Date
});

const UserSchema = new mongoose.Schema({
  userId: { type: String, unique: true, default: 'demo-user' },
  name: { type: String, default: 'Demo Trader' },
  cash: { type: Number, default: 100000 },
  startingCash: { type: Number, default: 100000 }
});

const WatchSchema = new mongoose.Schema({
  userId: { type: String, default: 'demo-user' },
  symbol: { type: String, uppercase: true, required: true }
});
WatchSchema.index({ userId: 1, symbol: 1 }, { unique: true });

const SnapshotSchema = new mongoose.Schema({
  userId: { type: String, default: 'demo-user' },
  equity: Number,
  cash: Number,
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  Order: mongoose.model('Order', OrderSchema),
  Position: mongoose.model('Position', PositionSchema),
  Alert: mongoose.model('Alert', AlertSchema),
  User: mongoose.model('User', UserSchema),
  Watch: mongoose.model('Watch', WatchSchema),
  Snapshot: mongoose.model('Snapshot', SnapshotSchema)
};
