import React, { useEffect, useState } from 'react';
import { api, fmt, money } from '../lib.js';

const KINDS = [
  ['STOP_LOSS', 'Stop-loss — fires at or below the trigger'],
  ['TARGET', 'Target — fires at or above the trigger'],
  ['PRICE_ABOVE', 'Price above — fires when crossed upward'],
  ['PRICE_BELOW', 'Price below — fires when crossed downward']
];

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [px, setPx] = useState({});
  const [form, setForm] = useState({ symbol: 'AAPL', kind: 'STOP_LOSS', price: '' });
  const [last, setLast] = useState(null);
  const [notifyOn, setNotifyOn] = useState(localStorage.getItem('sp_notify') === '1');

  const load = async () => {
    try {
      const { data } = await api.get('/alerts');
      setAlerts(data);
      const syms = [...new Set(data.filter(a => a.active && !a.triggered).map(a => a.symbol))];
      if (syms.length) {
        const { data: qs } = await api.get('/market/quote?symbols=' + syms.join(','));
        setPx(Object.fromEntries(qs.map(q => [q.symbol, q.price])));
      }
    } catch {}
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const create = async () => {
    if (!form.symbol || !form.price) return;
    await api.post('/alerts', { ...form, price: +form.price });
    setForm({ ...form, price: '' }); load();
  };
  const check = async () => {
    const { data } = await api.post('/alerts/check');
    setLast(data); load();
  };
  const enableNotify = async () => {
    if (!('Notification' in window)) { alert('This browser does not support desktop notifications.'); return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') { localStorage.setItem('sp_notify', '1'); setNotifyOn(true); }
  };

  const active = alerts.filter(a => a.active && !a.triggered);
  const fired = alerts.filter(a => a.triggered);

  return (
    <>
      <div className="grid2e">
        <div className="panel">
          <h3>Standing instructions</h3>
          <p className="sub">Rule-based triggers, swept against live prices every 20 seconds.</p>
          <div className="ticket">
            <div className="field"><label>Security</label><input value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })} style={{ width: '100%' }} /></div>
            <div className="field"><label>Trigger price (₹)</label><input type="number" placeholder="e.g. 250.00" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={{ width: '100%' }} /></div>
          </div>
          <div className="field" style={{ marginTop: 10 }}><label>Rule</label>
            <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} style={{ width: '100%' }}>
              {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={create}>Place alert</button>
            <button className="btn ghost" onClick={check}>Sweep now</button>
          </div>
          {last && <div className={`msg ${last.fired?.length ? 'ok' : ''}`} style={!last.fired?.length ? { background: '#F2F7F3', border: '1px solid #E1E7DF' } : {}}>{last.fired?.length ? `Fired — ${last.fired.map(f => `${f.symbol} at ₹${fmt(f.atPrice)}`).join(', ')}` : `Swept ${last.checked} standing alert(s) — all quiet.`}</div>}
          <hr className="rule" />
          <div className="row">
            <div>
              <b style={{ fontSize: 13.5 }}>Desktop notifications</b>
              <p className="note" style={{ margin: '2px 0 0' }}>{notifyOn ? 'On — fired alerts will pop up even in another tab.' : 'Off — enable to be tapped on the shoulder.'}</p>
            </div>
            {!notifyOn && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={enableNotify}>Enable</button>}
          </div>
        </div>

        <div className="panel">
          <h3>Notification centre</h3>
          <p className="sub">{active.length} standing · {fired.length} fired all-time.</p>
          {active.length > 0 && (
            <table className="num"><thead><tr><th>Security</th><th>Rule</th><th>Trigger</th><th>Distance</th><th></th></tr></thead>
              <tbody>{active.map(a => (
                <tr key={a._id}><td><b className="sym">{a.symbol}</b></td><td>{a.kind.replaceAll('_', ' ')}</td><td>{money(a.price, a.symbol)}</td>
                  <td>{px[a.symbol] != null ? (() => {
                    const d = ((a.price - px[a.symbol]) / px[a.symbol]) * 100;
                    return <span className={d >= 0 ? 'pos' : 'neg'}>{d >= 0 ? '+' : ''}{fmt(d)}% {Math.abs(d) < 1 && <span className="scen">near</span>}</span>;
                  })() : <span className="muted">—</span>}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn ghost sm" onClick={async () => { await api.delete('/alerts/' + a._id); load(); }}>Withdraw</button></td></tr>))}
              </tbody></table>
          )}
          <div className="news" style={{ marginTop: 10 }}>
            {fired.length === 0 && <p className="note">Nothing fired yet. A stop-loss set just under the last print is the classic first drill.</p>}
            {fired.map(a => (
              <div className="news-item b-Bearish" key={a._id}>
                <span className="badge Bearish">FIRED</span>{' '}
                <b>{a.symbol}</b> <span className="muted">{a.kind.replaceAll('_', ' ')} at {money(a.price, a.symbol)} · {a.triggeredAt ? new Date(a.triggeredAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>))}
          </div>
        </div>
      </div>
    </>
  );
}
