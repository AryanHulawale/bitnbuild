require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const marketRoutes = require('./routes/market');
const portfolioRoutes = require('./routes/portfolio');
const alertRoutes = require('./routes/alerts');
const { tradeRouter, tryFillPending } = require('./routes/trade');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL?.split(',') || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'StockPulse API', time: new Date().toISOString() }));
app.use('/api/market', marketRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/trade', tradeRouter);

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 StockPulse API on http://localhost:${PORT}`));
});

// background: fill pending limit orders every 20s
setInterval(() => tryFillPending().catch(() => {}), 20000);
