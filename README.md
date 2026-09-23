# StockPulse — Paper Trading & Market Intelligence (MERN)

A virtual trading house: live quotes, market/limit orders on ₹1,00,000 of paper capital,
news-sentiment analytics, risk lab with stress tests and backtesting, and rule-based alerts —
dressed in a classic white, deep-green and gold desk aesthetic (Fraunces + Inter).

## Quick start (demo needs NO MongoDB, NO API keys)

```bash
# terminal 1 — backend
cd backend
npm install
npm run dev            # http://localhost:5000

# terminal 2 — frontend
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Optional in `backend/.env`: `MONGODB_URI` for persistence (else in-memory demo store),
`NEWS_API_KEY` (newsapi.org) for live headlines (else deterministic desk feed).
Quotes use the free Stooq API with a model fallback, so it works offline.

## How it attacks the problem statement
- **Emotional decisions → discipline system.** Every ticket asks for a written thesis + conviction
  score (persisted on the order); the journal scores thesis coverage, the circuit breaker blocks
  revenge-buying past your max-loss setting, and 7 novice missions drill calm habits.
- **No risk management → guardrails.** Position-size calculator (fixed-fractional risk), one-click
  stop/target arming on every BUY, portfolio heat (worst case if all stops trigger), naked-holding
  detection, VaR / drawdown / Sharpe, and scenario stress tests.
- **Can't read sentiment / why moves happen → explainability.** Lexicon sentiment (Bullish /
  Neutral / Bearish), market-mood gauge, desk leaderboard with divergence flags, price-vs-wire
  chart, and a "Why did it move?" decoder pairing the 3 sharpest sessions with that day's wires.

## Desks (frontend tabs)
- **Portfolio** — net-worth hero card, invested / unrealised / realised P&L, 30-day volatility,
  novice-missions board, equity curve, allocation bars + donut, holdings ledger in native
  currencies, watchlist with 30-day sparklines, live ticker tape in the header.
- **Trade** — candlestick + volume charts (or line + SMA), rebased benchmark comparison
  (S&P 500 / Nasdaq 100 / Gold), sector + exchange detail, native $/₹ pricing, thesis + conviction
  + stop/target ticket with auto-alert arming, position-size calculator, circuit breaker,
  live positions, order book with theses.
- **Sentiment** — market-mood gauge, desk leaderboard with divergence flags, dossier chart with
  key-move markers, alignment/divergence signal, "Why did it move?" decoder, headline scorecard.
- **Risk Lab** — VaR 95%, max drawdown, Sharpe, diversification, cash buffer, heat gauge, house
  verdict, holdings correlation matrix, 5-scenario stress test + crash drill, SMA backtester,
  journal with discipline score + journal/orders CSV export.
- **Alerts** — stop-loss / target / price-above / price-below rules with live distance-to-trigger,
  20s sweep, fired-alert notification centre, optional desktop notifications.

## API
- `GET /api/market/quote?symbol=AAPL` · `symbols=AAPL,TSLA`
- `GET /api/market/history?symbol=AAPL&days=120`
- `GET /api/market/news?symbol=AAPL` · `GET /api/market/sentiment-series?symbol=AAPL`
- `POST /api/trade/order {symbol,side,type,qty,limitPrice,note}` · `GET /api/trade/positions|orders`
  · `POST /api/trade/cancel/:id` · `POST /api/trade/process-pending|reset`
- `GET /api/portfolio/summary|curve|watchlist` (+ POST/DELETE watchlist)
- `GET|POST /api/alerts` · `POST /api/alerts/check`
