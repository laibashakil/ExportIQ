import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import CircularScore from '../components/CircularScore.jsx';
import AgentPipeline from '../components/AgentPipeline.jsx';
import AgentTraceTimeline from '../components/AgentTraceTimeline.jsx';
import { Icon } from '../components/Icon.jsx';
import { DEMO_FACTORIES } from '../constants/config';
import {
  subscribeFactory,
  subscribeReport,
  subscribeJob,
} from '../services/firebase';
import { api } from '../services/api';
import { pkrFormat } from '../utils/traceFormatter';
import { deriveScore, deriveRiskPkr } from '../utils/scoring';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

const TABS = [
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Action Plan' },
  { key: 'documents', label: 'Documents' },
  { key: 'trace', label: 'Agent Trace' },
];

export default function FactoryDetail() {
  const { factoryId } = useParams();
  const nav = useNavigate();
  const initial = useMemo(
    () => DEMO_FACTORIES.find((f) => f.factory_id === factoryId) || { factory_id: factoryId, factory_name: factoryId, city: '—' },
    [factoryId],
  );

  const [factory, setFactory] = useState(initial);
  const [report, setReport] = useState(null);
  const [tab, setTab] = useState('status');
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [openDoc, setOpenDoc] = useState(null);
  const unsubJob = useRef(null);

  useEffect(() => {
    const u1 = subscribeFactory(factoryId, (doc) => {
      if (doc) setFactory((prev) => ({ ...prev, ...doc }));
    });
    const u2 = subscribeReport(factoryId, (doc) => {
      if (doc) setReport(doc);
    });
    return () => { u1 && u1(); u2 && u2(); };
  }, [factoryId]);

  useEffect(() => {
    if (!jobId) return undefined;
    unsubJob.current = subscribeJob(jobId, (data) => {
      setJob(data);
      if (data?.status === 'complete' || data?.status === 'failed') setRunning(false);
    });
    return () => { if (unsubJob.current) unsubJob.current(); };
  }, [jobId]);

  async function runAnalysis() {
    setError(null);
    setRunning(true);
    setTab('trace');
    try {
      const res = await api.analyze(factoryId);
      if (res?.job_id) setJobId(res.job_id);
      else { setRunning(false); setError('No job ID returned'); }
    } catch (err) {
      setRunning(false);
      setError(err.message || 'Failed to start analysis');
    }
  }

  const {
    originalScore,
    afterScore,
    revealed,
    effectiveScore: score,
    riskLevel,
    resolvedView,
  } = deriveScore(factory, report);
  const ordersAtRisk = deriveRiskPkr(factory, report);
  const rawGaps = report?.gaps || [];
  const rawContradictions = report?.contradictions || [];
  const gaps = resolvedView ? [] : rawGaps;
  const contradictions = resolvedView ? [] : rawContradictions;
  const actions = report?.action_chain || [];
  const documents = report?.documents || [];
  const lastAnalyzed = report?.created_at ? new Date(report.created_at).toLocaleString() : null;

  const targetScore = afterScore !== originalScore ? afterScore : null;

  async function toggleReveal() {
    try {
      const ref = doc(db(), 'factories', factoryId, 'reports', 'latest');
      await updateDoc(ref, {
        simulation_revealed: !revealed,
        simulation_revealed_at: !revealed ? new Date().toISOString() : null,
      });
    } catch (err) {
      console.warn('toggle reveal failed', err);
    }
  }

  return (
    <div className="app-shell">
      <Header />
      <button className="back-btn" onClick={() => nav('/')}>
        <Icon name="chevron-left" size={14} /> Back to Dashboard
      </button>

      <div className="detail-grid">
        <aside className="detail-sidebar">
          <div className="gauge-wrap">
            <div className="gauge-label">
              {revealed ? 'Post-Fix Score' : 'Compliance Score'}
            </div>
            <CircularScore score={score} size={200} stroke={14} />
            <span className={`badge ${riskLevel.toLowerCase()}`} style={{ marginTop: 12 }}>{riskLevel}</span>
            {originalScore !== afterScore && (
              <div className="view-toggle">
                <button
                  className={!revealed ? 'on' : ''}
                  onClick={() => { if (revealed) toggleReveal(); }}
                >
                  Current ({originalScore})
                </button>
                <button
                  className={revealed ? 'on' : ''}
                  onClick={() => { if (!revealed) toggleReveal(); }}
                >
                  After Fixes ({afterScore})
                </button>
              </div>
            )}
          </div>

          <div className="detail-meta">
            <div className="detail-row">
              <span className="k">Factory</span>
              <span className="v">{factory.factory_name}</span>
            </div>
            <div className="detail-row">
              <span className="k">City</span>
              <span className="v">{factory.city || '—'}</span>
            </div>
            <div className="detail-row">
              <span className="k">PKR at Risk</span>
              <span className="v">{pkrFormat(ordersAtRisk)}</span>
            </div>
            <div className="detail-row">
              <span className="k">Gaps</span>
              <span className="v">{gaps.length}</span>
            </div>
            <div className="detail-row">
              <span className="k">Contradictions</span>
              <span className="v">{contradictions.length}</span>
            </div>
            <div className="detail-row">
              <span className="k">Last Analyzed</span>
              <span className="v" style={{ fontSize: 11 }}>{lastAnalyzed || 'Never'}</span>
            </div>
          </div>

          <button className="btn primary" style={{ width: '100%', marginTop: 16 }} onClick={runAnalysis} disabled={running}>
            {running ? 'Running…' : (
              <>
                <Icon name="play" size={12} /> Run Analysis
              </>
            )}
          </button>
          {error && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{error}</div>}

          {(running || (job?.agent_trace?.length || 0) > 0) && (
            <div style={{ marginTop: 16 }}>
              <AgentPipeline trace={job?.agent_trace} running={running} />
            </div>
          )}
        </aside>

        <div className="tabs">
          <div className="tab-bar">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="tab-panel">
            {tab === 'status' && (
              <StatusTab gaps={gaps} contradictions={contradictions} />
            )}
            {tab === 'actions' && (
              <ActionsTab actions={actions} currentScore={score} targetScore={targetScore} totalRisk={ordersAtRisk} />
            )}
            {tab === 'documents' && (
              <DocumentsTab documents={documents} openDoc={openDoc} setOpenDoc={setOpenDoc} />
            )}
            {tab === 'trace' && (
              <AgentTraceTimeline trace={job?.agent_trace || report?.agent_trace} running={running} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusTab({ gaps, contradictions }) {
  if (!gaps.length && !contradictions.length) {
    return (
      <div className="empty-state">
        <Icon name="check" size={28} color="#00D4AA" />
        <div style={{ marginTop: 8 }}>No issues detected. Run an analysis to refresh.</div>
      </div>
    );
  }
  return (
    <div>
      {contradictions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ margin: '0 0 12px' }}>Contradictions</div>
          {contradictions.map((c, i) => (
            <div className="contradiction" key={i}>
              <div className="contradiction-head">
                <Icon name="alert" size={16} color="#EF4444" />
                Conflict detected · confidence {Math.round((c.confidence || 0) * 100)}%
              </div>
              <div className="contradiction-grid">
                <div className="contradiction-col">
                  <div className="cc-label">Factory Claims</div>
                  <div className="cc-text">{c.claim}</div>
                  {c.source_a && <div className="cc-source">— {c.source_a}</div>}
                </div>
                <div className="contradiction-col">
                  <div className="cc-label">Evidence Shows</div>
                  <div className="cc-text">{c.evidence}</div>
                  {c.source_b && <div className="cc-source">— {c.source_b}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <div>
          <div className="section-label" style={{ margin: '0 0 12px' }}>Issues Found ({gaps.length})</div>
          {gaps.map((g, i) => {
            const severity = (g.severity || 'WARNING').toLowerCase();
            const days = typeof g.days_remaining === 'number' ? g.days_remaining : null;
            const dateStr = g.deadline ? new Date(g.deadline).toLocaleDateString() : null;
            return (
              <div className={`list-card ${severity}`} key={i}>
                <div className="lc-head">
                  <div>
                    <div className="lc-sub">{g.regulation}</div>
                    <div className="lc-title">{g.title || g.requirement || 'Compliance gap'}</div>
                  </div>
                  <span className={`badge ${severity}`}>{(g.severity || 'WARNING').toUpperCase()}</span>
                </div>
                {g.description && <div className="lc-body">{g.description}</div>}
                <div className="lc-row">
                  {g.status && <span className="lc-tag">Status: {g.status}</span>}
                  {dateStr && <span className="lc-tag">Deadline: {dateStr}</span>}
                  {days !== null && (
                    <span className="lc-tag" style={{ color: days < 30 ? '#EF4444' : '#F59E0B' }}>
                      <Icon name="clock" size={11} /> {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionsTab({ actions, currentScore, targetScore, totalRisk }) {
  if (!actions.length) {
    return <div className="empty-state">No actions yet. Run an analysis to generate a remediation plan.</div>;
  }
  const totalImpact = actions.reduce((acc, a) => acc + (a.impact_pkr || 0), 0);
  return (
    <div>
      <div className="score-summary">
        {targetScore != null ? (
          <>
            Score will go from <span className="big">{currentScore}</span> to{' '}
            <span className="big">{targetScore}</span> if all {actions.length} actions are completed.{' '}
            {pkrFormat(totalImpact || totalRisk)} in risk can be protected.
          </>
        ) : (
          <>
            {actions.length} prioritised actions ready. Estimated risk reduction:{' '}
            <span className="big">{pkrFormat(totalImpact)}</span>.
          </>
        )}
      </div>
      {actions.map((a) => {
        const effortLevel = (a.effort || 'MEDIUM').toLowerCase();
        const dateStr = a.deadline ? new Date(a.deadline).toLocaleDateString() : null;
        return (
          <div className="list-card primary" key={a.action_id || a.priority}>
            <div className="lc-head">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--primary-soft)', color: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14, flexShrink: 0,
                  }}
                >
                  {a.priority || '–'}
                </div>
                <div>
                  <div className="lc-title">{a.title}</div>
                  {a.description && <div className="lc-body" style={{ marginTop: 4 }}>{a.description}</div>}
                </div>
              </div>
            </div>
            <div className="lc-row">
              <span className="lc-tag">Effort: {effortLevel}</span>
              {dateStr && <span className="lc-tag"><Icon name="clock" size={11} /> {dateStr}</span>}
              {a.impact_pkr > 0 && (
                <span className="lc-tag" style={{ color: '#00D4AA' }}>
                  <Icon name="trend-up" size={11} /> Protects {pkrFormat(a.impact_pkr)}
                </span>
              )}
              {a.simulation_output?.compliance_score_delta > 0 && (
                <span className="lc-tag" style={{ color: '#00D4AA' }}>
                  +{a.simulation_output.compliance_score_delta} pts
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocumentsTab({ documents, openDoc, setOpenDoc }) {
  if (!documents.length) {
    return <div className="empty-state">No documents generated yet. Run an analysis to produce buyer emails, CBAM forms, and audit checklists.</div>;
  }
  return (
    <div>
      {documents.map((d) => {
        const id = d.document_id || d.id;
        const isOpen = openDoc === id;
        const isEmail = (d.kind || '').toLowerCase().includes('email');
        return (
          <div className="doc-card" key={id}>
            <div className="doc-head" onClick={() => setOpenDoc(isOpen ? null : id)}>
              <div>
                <div className="doc-title">
                  <Icon name={isEmail ? 'mail' : 'doc'} size={14} color="#00D4AA" />{' '}
                  {d.title || d.subject || id}
                </div>
                <div className="doc-meta">{d.kind || 'Document'}{d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString()}` : ''}</div>
              </div>
              <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} color="#9BA3AF" />
            </div>
            {isOpen && (
              <div className="doc-body">{d.body || d.content || JSON.stringify(d, null, 2)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
