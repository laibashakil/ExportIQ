import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { Icon } from '../components/Icon.jsx';
import { DEMO_FACTORIES } from '../constants/config';
import { subscribeFactory, subscribeReport } from '../services/firebase';
import {
  loadReadSet,
  subscribeReadSet,
  markRead,
  deadlineId,
} from '../utils/notificationsRead';
import { deriveScore } from '../utils/scoring';

const DEADLINE_WINDOW_DAYS = 30;

function urgencyColor(days) {
  if (days == null) return '#9BA3AF';
  if (days < 0 || days < 7) return '#EF4444';
  if (days < 30) return '#F59E0B';
  if (days < 90) return '#00D4AA';
  return '#9BA3AF';
}

function urgencyText(days, deadline) {
  if (days == null) return deadline ? `Due ${deadline}` : 'Ongoing';
  if (days < 0) return `Overdue by ${Math.abs(days)} days`;
  if (days === 0) return 'Due today';
  if (days < 30) return `${days} days left`;
  if (days < 365) return `${Math.round(days / 30)} months left`;
  return `${Math.round(days / 365)} year${Math.round(days / 365) === 1 ? '' : 's'} left`;
}

export default function Deadlines() {
  const nav = useNavigate();
  const [factories, setFactories] = useState(DEMO_FACTORIES);
  const [reports, setReports] = useState({});
  const readSetRef = useRef(new Set());
  const [unreadOnEntry, setUnreadOnEntry] = useState(new Set());

  useEffect(() => {
    const subs = DEMO_FACTORIES.map((f) =>
      subscribeFactory(f.factory_id, (doc) => {
        if (!doc) return;
        setFactories((prev) =>
          prev.map((p) => (p.factory_id === f.factory_id ? { ...p, ...doc } : p)),
        );
      }),
    );
    const reportSubs = DEMO_FACTORIES.map((f) =>
      subscribeReport(f.factory_id, (doc) => {
        if (!doc) return;
        setReports((prev) => ({ ...prev, [f.factory_id]: doc }));
      }),
    );
    loadReadSet();
    const unsubRead = subscribeReadSet((set) => {
      readSetRef.current = new Set(set);
    });
    return () => {
      subs.forEach((u) => u && u());
      reportSubs.forEach((u) => u && u());
      unsubRead && unsubRead();
    };
  }, []);

  const deadlines = useMemo(() => {
    const list = [];
    for (const f of factories) {
      const r = reports[f.factory_id];
      const { resolvedView } = deriveScore(f, r);
      if (resolvedView) continue; // factory fully simulated as fixed
      const gaps = r?.gaps || [];
      for (const g of gaps) {
        list.push({ factoryId: f.factory_id, factoryName: f.factory_name, gap: g });
      }
    }
    list.sort((a, b) => (a.gap.days_remaining ?? 9999) - (b.gap.days_remaining ?? 9999));
    return list;
  }, [factories, reports]);

  useEffect(() => {
    const prev = readSetRef.current;
    const newOnes = new Set();
    const ids = [];
    for (const { factoryId, gap } of deadlines) {
      const d = gap?.days_remaining;
      if (typeof d !== 'number' || d >= DEADLINE_WINDOW_DAYS) continue;
      const id = deadlineId(factoryId, gap);
      ids.push(id);
      if (!prev.has(id)) newOnes.add(id);
    }
    setUnreadOnEntry(newOnes);
    if (ids.length) markRead(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlines.length]);

  return (
    <div className="app-shell">
      <Header />
      <button className="back-btn" onClick={() => nav(-1)}>
        <Icon name="chevron-left" size={14} /> Back
      </button>

      <div className="section-label">Upcoming Compliance Deadlines</div>

      {deadlines.length === 0 ? (
        <div className="empty-state">
          <Icon name="check" size={28} color="#00D4AA" />
          <div style={{ marginTop: 8 }}>
            No upcoming deadlines. None of your factories have open EU/UK compliance deadlines right
            now. We'll let you know as soon as anything comes up.
          </div>
        </div>
      ) : (
        <>
          <p style={{ color: '#C9D1D9', fontSize: 14, lineHeight: 1.5 }}>
            Showing every open compliance deadline across your factories, sorted by urgency. Tap a
            row to open the factory and see how to fix it.
          </p>
          <div className="deadline-list">
            {deadlines.map(({ factoryId, factoryName, gap }, idx) => {
              const days = gap.days_remaining;
              const c = urgencyColor(days);
              const id = deadlineId(factoryId, gap);
              const isNew = unreadOnEntry.has(id);
              const title = gap.display_title || gap.title || gap.requirement || 'Compliance gap';
              return (
                <div
                  key={`${factoryId}-${idx}`}
                  className={`deadline-row ${isNew ? 'new' : ''}`}
                  style={{ borderLeftColor: c }}
                  onClick={() => nav(`/factory/${factoryId}`)}
                >
                  <div className="dr-head">
                    <div className="dr-title-wrap">
                      {isNew && <span className="new-pill">NEW</span>}
                      <span className="dr-title">{title}</span>
                    </div>
                    <span
                      className="dr-urgency"
                      style={{
                        color: c,
                        background: `${c}22`,
                        borderColor: c,
                      }}
                    >
                      <Icon name="clock" size={11} /> {urgencyText(days, gap.deadline)}
                    </span>
                  </div>
                  <div className="dr-meta">
                    <Icon name="factory" size={12} />
                    {factoryName}
                    {gap.regulation && <><span className="dot-sep" /> {gap.regulation}</>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
