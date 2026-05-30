import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CircularScore from './CircularScore.jsx';
import AgentPipeline from './AgentPipeline.jsx';
import { Icon } from './Icon.jsx';
import { riskColor } from '../constants/colors';
import { pkrFormat } from '../utils/traceFormatter';
import { deriveScore, deriveRiskPkr, riskLabel } from '../utils/scoring';
import { api } from '../services/api';
import { subscribeJob } from '../services/firebase';

export default function FactoryCard({ factory, report }) {
  const nav = useNavigate();
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const unsubRef = useRef(null);

  // Score, risk level, and PKR at risk all come from the same Firestore
  // source the mobile app uses. If the user has tapped "Show me the full
  // fix plan" anywhere (web or mobile), `simulation_revealed` flips to
  // true and everything renders the post-simulation values — so the
  // numbers a judge sees on the web URL always match the APK.
  const { effectiveScore: score, riskLevel, revealed, resolvedView } = deriveScore(factory, report);
  const sideColor = riskColor(riskLevel);
  const ordersAtRisk = deriveRiskPkr(factory, report);

  // After a sim reveal, the resolved gaps shouldn't count as outstanding.
  const rawGaps = report?.gaps?.length ?? 0;
  const rawContradictions = report?.contradictions?.length ?? 0;
  const gapCount = resolvedView ? 0 : rawGaps;
  const contradictionCount = resolvedView ? 0 : rawContradictions;

  useEffect(() => {
    if (!jobId) return undefined;
    unsubRef.current = subscribeJob(jobId, (data) => {
      setJob(data);
      if (data?.status === 'complete' || data?.status === 'failed') {
        setRunning(false);
      }
    });
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, [jobId]);

  async function handleRunAnalysis(e) {
    e.stopPropagation();
    setError(null);
    setRunning(true);
    try {
      const res = await api.analyze(factory.factory_id);
      if (res?.job_id) {
        setJobId(res.job_id);
      } else {
        setRunning(false);
        setError('No job ID returned');
      }
    } catch (err) {
      setRunning(false);
      setError(err.message || 'Failed to start analysis');
    }
  }

  function handleViewDetails() {
    nav(`/factory/${factory.factory_id}`);
  }

  return (
    <div className="factory-card" style={{ borderLeftColor: sideColor }}>
      <div className="fc-top">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fc-name">{factory.factory_name}</div>
          <div className="fc-loc">
            <Icon name="location" size={13} />
            {factory.city}
          </div>
        </div>
        <CircularScore score={score} size={84} stroke={7} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={`badge ${riskLevel.toLowerCase()}`}>{riskLabel(riskLevel)}</span>
        <span style={{ fontSize: 12, color: '#9BA3AF' }}>
          {ordersAtRisk > 0 ? `${pkrFormat(ordersAtRisk)} at risk` : 'No risk'}
        </span>
      </div>
      {revealed && (
        <div style={{
          fontSize: 11,
          color: '#00D4AA',
          background: 'rgba(0, 212, 170, 0.10)',
          border: '1px solid rgba(0, 212, 170, 0.4)',
          padding: '4px 8px',
          borderRadius: 999,
          alignSelf: 'flex-start',
          fontWeight: 700,
          letterSpacing: 0.5,
        }}>
          POST-FIX VIEW
        </div>
      )}

      <div className="fc-stats">
        <div className="fc-stat">
          <span className="lbl">Gaps</span>
          <span className="val">{gapCount}</span>
        </div>
        <div className="fc-stat">
          <span className="lbl">Mismatches</span>
          <span className="val">{contradictionCount}</span>
        </div>
        <div className="fc-stat">
          <span className="lbl">Actions</span>
          <span className="val">{report?.action_chain?.length ?? 0}</span>
        </div>
      </div>

      {(running || job?.agent_trace?.length > 0) && (
        <AgentPipeline trace={job?.agent_trace} running={running} />
      )}
      {error && (
        <div style={{ fontSize: 12, color: '#EF4444', padding: '6px 0' }}>{error}</div>
      )}

      <div className="fc-actions">
        <button className="btn" onClick={handleViewDetails}>
          View Details
          <Icon name="chevron-right" size={14} />
        </button>
        <button className="btn primary" onClick={handleRunAnalysis} disabled={running}>
          {running ? (
            <>
              <span className="spinner" style={{ width: 12, height: 12, border: '2px solid rgba(13,17,23,0.3)', borderTopColor: '#0D1117', margin: 0 }} />
              Running
            </>
          ) : (
            <>
              <Icon name="play" size={12} />
              Run Analysis
            </>
          )}
        </button>
      </div>
    </div>
  );
}
