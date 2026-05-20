import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_FACTORIES } from '../constants/config';
import { subscribeReport } from '../services/firebase';
import { deadlineId, loadReadSet, subscribeReadSet } from '../utils/notificationsRead';

const DEADLINE_WINDOW_DAYS = 30;

function BellIcon({ filled, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function InfoIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  );
}
function SettingsIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

export default function Header() {
  const nav = useNavigate();
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const [reports, setReports] = useState({});
  const [readSet, setReadSet] = useState(new Set());

  useEffect(() => {
    const subs = DEMO_FACTORIES.map((f) =>
      subscribeReport(f.factory_id, (doc) => {
        if (!doc) return;
        setReports((prev) => ({ ...prev, [f.factory_id]: doc }));
      })
    );
    loadReadSet();
    const unsubRead = subscribeReadSet((set) => setReadSet(new Set(set)));
    return () => {
      subs.forEach((u) => u && u());
      unsubRead && unsubRead();
    };
  }, []);

  // Mirror mobile/HomeScreen.js: bell badge counts gaps with days_remaining
  // < 30 that the user hasn't viewed yet (read-set lives in localStorage).
  const unread = useMemo(() => {
    let n = 0;
    for (const f of DEMO_FACTORIES) {
      const r = reports[f.factory_id];
      // Don't count gaps from a factory that's already in post-fix view —
      // those are resolved as far as the user is concerned.
      if (r?.simulation_revealed && (r?.simulation_result?.after_score >= 95 || r?.after_score >= 95)) continue;
      const gaps = r?.gaps || [];
      for (const g of gaps) {
        const d = g.days_remaining;
        if (typeof d !== 'number' || d >= DEADLINE_WINDOW_DAYS) continue;
        const id = deadlineId(f.factory_id, g);
        if (!readSet.has(id)) n += 1;
      }
    }
    return n;
  }, [reports, readSet]);

  return (
    <div className="app-header">
      <div className="brand" onClick={() => nav('/')}>
        <img src="/logo.png" alt="ExportIQ" className="brand-logo" />
        <div className="brand-text">
          <div className="brand-name">Export<span className="teal">IQ</span></div>
          <div className="brand-tag">Pakistan Textile Export Compliance</div>
        </div>
      </div>
      <div className="header-meta">
        <span className="pill-status"><span className="dot" /> Live · Firestore</span>
        <span>{today}</span>
        <button
          className="header-icon-btn"
          onClick={() => nav('/deadlines')}
          title={unread > 0 ? `${unread} unread deadline notifications` : 'Upcoming deadlines'}
        >
          <BellIcon filled={unread > 0} />
          {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button className="header-icon-btn" onClick={() => nav('/how-it-works')} title="How ExportIQ works">
          <InfoIcon />
        </button>
        <button className="header-icon-btn" onClick={() => nav('/settings')} title="Settings">
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}
