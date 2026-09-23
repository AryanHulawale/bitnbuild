import React, { useEffect, useState } from 'react';
import { api, fmtMoney } from './lib.js';
import Dashboard from './pages/Dashboard.jsx';
import Trade from './pages/Trade.jsx';
import Sentiment from './pages/Sentiment.jsx';
import RiskLab from './pages/RiskLab.jsx';
import Alerts from './pages/Alerts.jsx';

const TABS = [
  ['dashboard', 'Portfolio'],
  ['trade', 'Trade'],
  ['sentiment', 'Sentiment'],
  ['risk', 'Risk Lab'],
  ['alerts', 'Alerts']
];
const TITLES = {
  dashboard: ['Portfolio Overview', 'Holdings, allocation and performance of your virtual fund.'],
  trade: ['Dealing Desk', 'Live quotes, company detail and market / limit orders on virtual capital.'],
  sentiment: ['Market Intelligence', 'News sentiment mapped against price action.'],
  risk: ['Risk Lab', 'Stress tests, strategy backtesting and your locked-in P&L journal.'],
  alerts: ['Alerts & Notices', 'Stop-loss, target and price triggers with a notification centre.']
};

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [summary, setSummary] = useState(null);
  const [tape, setTape] = useState([]);
  const [toast, setToast] = useState('');

  const refresh = async () => {
    try { const { data } = await api.get('/portfolio/summary'); setSummary(data); } catch {}
    try { const { data } = await api.get('/portfolio/watchlist'); setTape(data); } catch {}
  };

  const notify = (title, body) => {
    if (localStorage.getItem('sp_notify') === '1' && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body }); } catch {}
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    const a = setInterval(async () => {
      try {
        const { data } = await api.post('/alerts/check');
        if (data.fired?.length) {
          const msg = data.fired.map(f => `${f.symbol} at ₹${f.atPrice}`).join(', ');
          setToast(`Alert triggered — ${msg}`);
          notify('StockPulse alert', msg);
          setTimeout(() => setToast(''), 7000);
          refresh();
        }
      } catch {}
    }, 20000);
    return () => { clearInterval(t); clearInterval(a); };
  }, []);

  const [title, sub] = TITLES[tab];

  return (
    <>
      <header className="header">
        <div className="header-in">
          <div className="brand-row">
            <div className="brand">
              <div className="brand-mark">S</div>
              <div>
                <h1>Stock<em>Pulse</em></h1>
                <small>Paper Trading House</small>
              </div>
            </div>
            <div className="header-actions">
              <div className="acct num">
                <div><label>Net worth</label><b>{summary ? fmtMoney(summary.equity) : '…'}</b></div>
                <div><label>Cash</label><b>{summary ? fmtMoney(summary.cash) : '…'}</b></div>
                <div><label>P&L</label><b className={summary && summary.totalReturn >= 0 ? 'pos' : 'neg'}>{summary ? fmtMoney(summary.totalReturn) : '…'}</b></div>
              </div>
              <button className="btn ghost sm" onClick={refresh}>Refresh</button>
              <button className="btn ghost sm" onClick={async () => { if (confirm('Reset the virtual fund to ₹1,00,000?')) { await api.post('/trade/reset'); refresh(); } }}>Reset fund</button>
            </div>
          </div>
          <nav className="tabs">
            {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </nav>
        </div>
        <div className="tape"><div className="tape-in">
          {(tape.length ? [...tape, ...tape] : []).map((q, i) => (
            <span className="tape-item" key={i}><b>{q.symbol}</b>
              <span className="num">{Number(q.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              <span className={q.changePct >= 0 ? 'up' : 'dn'}>{q.changePct >= 0 ? '▲' : '▼'} {Math.abs(q.changePct)}%</span>
            </span>
          ))}
          {!tape.length && <span className="tape-item">warming up the wires…</span>}
        </div></div>
      </header>
      <div className="wrap">
        <div className="page-head">
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
        {tab === 'dashboard' && <Dashboard summary={summary} />}
        {tab === 'trade' && <Trade refresh={refresh} />}
        {tab === 'sentiment' && <Sentiment />}
        {tab === 'risk' && <RiskLab summary={summary} />}
        {tab === 'alerts' && <Alerts />}
        <div className="foot">StockPulse · virtual capital only — no real money moves here · quotes via Stooq, sentiment via in-house lexicon</div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
