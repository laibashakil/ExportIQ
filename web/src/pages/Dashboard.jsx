import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header.jsx';
import FactoryCard from '../components/FactoryCard.jsx';
import { Icon } from '../components/Icon.jsx';
import { DEMO_FACTORIES } from '../constants/config';
import { subscribeFactory, subscribeReport } from '../services/firebase';
import { pkrFormat } from '../utils/traceFormatter';
import { deriveScore, deriveRiskPkr } from '../utils/scoring';

export default function Dashboard() {
  const nav = useNavigate();
  const [factories, setFactories] = useState(DEMO_FACTORIES);
  const [reports, setReports] = useState({});

  useEffect(() => {
    const unsubs = DEMO_FACTORIES.map((f) =>
      subscribeFactory(f.factory_id, (doc) => {
        if (!doc) return;
        setFactories((prev) =>
          prev.map((p) => (p.factory_id === f.factory_id ? { ...p, ...doc } : p)),
        );
      }),
    );
    const reportUnsubs = DEMO_FACTORIES.map((f) =>
      subscribeReport(f.factory_id, (doc) => {
        if (!doc) return;
        setReports((prev) => ({ ...prev, [f.factory_id]: doc }));
      }),
    );
    return () => {
      unsubs.forEach((u) => u && u());
      reportUnsubs.forEach((u) => u && u());
    };
  }, []);

  // Recompute the dashboard summary from the same source of truth as each
  // factory card — so the headline numbers respect any simulation_revealed
  // state set on Firestore. Without this, the summary lags the cards.
  const summary = useMemo(() => {
    let totalRisk = 0;
    let critical = 0;
    let warning = 0;
    let compliant = 0;
    for (const f of factories) {
      const r = reports[f.factory_id];
      const { riskLevel } = deriveScore(f, r);
      totalRisk += deriveRiskPkr(f, r);
      if (riskLevel === 'CRITICAL') critical++;
      else if (riskLevel === 'WARNING') warning++;
      else if (riskLevel === 'COMPLIANT') compliant++;
    }
    const worst = critical > 0 ? 'CRITICAL' : warning > 0 ? 'WARNING' : 'COMPLIANT';
    return { totalRisk, critical, warning, compliant, worst };
  }, [factories, reports]);

  return (
    <div className="app-shell">
      <Header />

      <div className="summary-row">
        <div className="summary-card">
          <div className="summary-label">FACTORIES MONITORED</div>
          <div className="summary-value">{factories.length}</div>
          <div className="summary-sub">Live from Firestore</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">TOTAL PKR AT RISK</div>
          <div className={`summary-value ${summary.totalRisk > 100_000_000 ? 'critical' : 'warning'}`}>
            {pkrFormat(summary.totalRisk)}
          </div>
          <div className="summary-sub">Across {factories.length} factories</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">WORST STATUS</div>
          <div className={`summary-value ${summary.worst.toLowerCase()}`}>{summary.worst}</div>
          <div className="summary-sub">
            {summary.critical} critical · {summary.warning} warning · {summary.compliant} ok
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">REGULATIONS TRACKED</div>
          <div className="summary-value">3</div>
          <div className="summary-sub">EU CBAM · UK MSA · EU CSDDD</div>
        </div>
      </div>

      <div className="section-label">Your Factories</div>
      <div className="factory-grid">
        {factories.map((f) => (
          <FactoryCard key={f.factory_id} factory={f} report={reports[f.factory_id]} />
        ))}
        <button
          className="factory-card factory-card-upload"
          onClick={() => nav('/upload')}
        >
          <div className="upload-cta-icon">
            <Icon name="upload" size={28} color="#00D4AA" />
          </div>
          <div className="upload-cta-title">Upload a New Factory Audit</div>
          <div className="upload-cta-sub">
            Drop in any audit PDF — our 6-agent pipeline parses it, scores it, and generates a fix plan.
          </div>
          <span className="btn primary small">
            Start Upload <Icon name="chevron-right" size={12} />
          </span>
        </button>
      </div>

      <div className="how-it-works">
        <div className="hiw-title">How ExportIQ Works</div>
        <div className="hiw-sub">
          Multi-agent compliance analysis powered by Google Antigravity + Gemini 2.5 Pro
        </div>
        <div className="hiw-steps">
          <div className="hiw-step">
            <div className="hiw-num">1</div>
            <div className="hiw-h">Upload Factory Audit PDF</div>
            <div className="hiw-p">
              Drop in your latest factory audit report — SA8000, ISO 14001, water audits, chemical
              discharge logs, export ledgers.
            </div>
          </div>
          <div className="hiw-step">
            <div className="hiw-num">2</div>
            <div className="hiw-h">AI Agents Run a 6-Stage Pipeline</div>
            <div className="hiw-p">
              Six specialised agents parse EU/UK regulations (CBAM, Modern Slavery, CSDDD),
              cross-reference your audit, detect contradictions, and quantify financial risk in PKR.
            </div>
          </div>
          <div className="hiw-step">
            <div className="hiw-num">3</div>
            <div className="hiw-h">Get a Prioritised Action Plan</div>
            <div className="hiw-p">
              See your compliance score, the buyer orders at risk, and a ranked action chain. Each
              action simulates its score delta and generates the buyer email or compliance form for
              you.
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 32, textAlign: 'center', color: '#6B7280', fontSize: 12 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="sparkles" size={14} color="#00D4AA" />
          Built for the AISeekho 2026 · Google Antigravity Hackathon
        </div>
      </div>
    </div>
  );
}
