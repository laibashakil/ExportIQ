import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import CircularScore from '../components/CircularScore.jsx';
import AgentPipeline from '../components/AgentPipeline.jsx';
import AgentTraceTimeline from '../components/AgentTraceTimeline.jsx';
import { Icon } from '../components/Icon.jsx';
import Markdown from '../components/Markdown.jsx';
import InteractiveChecklist from '../components/InteractiveChecklist.jsx';
import { DEMO_FACTORIES } from '../constants/config';
import {
  subscribeFactory,
  subscribeReport,
  subscribeJob,
  updateDocument,
} from '../services/firebase';
import { api } from '../services/api';
import { pkrFormat } from '../utils/traceFormatter';
import { deriveScore, deriveRiskPkr, riskLabel } from '../utils/scoring';
import { openGmailCompose } from '../utils/mail';
import { transformMarkdownTables } from '../utils/markdownTransform';
import { formatAnalyzedAt, toDateSafe } from '../utils/format';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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
  // Set the instant an analysis completes so the "Last analyzed" label updates
  // immediately, before the Firestore serverTimestamp round-trips back.
  const [optimisticAnalyzedAt, setOptimisticAnalyzedAt] = useState(null);
  // Which gap's inline impact box is expanded (keyed by gap_id or index), and
  // which action card should glow when the Action Plan tab is shown.
  const [expandedGapId, setExpandedGapId] = useState(null);
  const [flashActionId, setFlashActionId] = useState(null);
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
    let handled = false; // guard: the callback fires repeatedly per job
    unsubJob.current = subscribeJob(jobId, (data) => {
      setJob(data);
      if (data?.status === 'complete' || data?.status === 'failed') {
        setRunning(false);
        if (data?.status === 'complete' && !handled) {
          handled = true;
          setOptimisticAnalyzedAt(new Date());
          markAnalyzed();
        }
      }
    });
    return () => { if (unsubJob.current) unsubJob.current(); };
  }, [jobId]);

  // Persist the last-analyzed time on the factory doc so it survives reloads
  // and propagates to any other client watching this factory in real time.
  async function markAnalyzed() {
    try {
      const ref = doc(db(), 'factories', factoryId);
      await setDoc(ref, { last_analyzed_at: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.warn('markAnalyzed failed', err);
    }
  }

  async function runAnalysis() {
    setError(null);
    setRunning(true);
    setTab('trace');
    // Optimistically stamp the analysis time the instant the user clicks, and
    // persist it to Firestore on start so any other client watching this
    // factory sees "Last analyzed" update immediately (not just on complete).
    setOptimisticAnalyzedAt(new Date());
    markAnalyzed();
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
  // Resolve the most recent analysis time from any available source: the
  // report's created_at, the factory's last_analyzed_at, or our optimistic
  // value set the moment a run completes. Whichever is newest wins.
  const analyzedDate = useMemo(() => {
    let best = toDateSafe(report?.created_at);
    const fromFactory = toDateSafe(factory?.last_analyzed_at);
    if (fromFactory && (!best || fromFactory > best)) best = fromFactory;
    if (optimisticAnalyzedAt && (!best || optimisticAnalyzedAt > best)) best = optimisticAnalyzedAt;
    return best;
  }, [report, factory, optimisticAnalyzedAt]);
  const lastAnalyzedLabel = analyzedDate ? formatAnalyzedAt(analyzedDate) : 'Not yet analyzed';

  const targetScore = afterScore !== originalScore ? afterScore : null;

  // Map a gap to the action that fixes it. The orchestrator pre-links most
  // gaps via `linked_action_id`; we fall back to matching the gap_id against
  // each action's `addresses_gap_ids`.
  function findActionForGap(gap) {
    if (!gap) return null;
    if (gap.linked_action_id) {
      const byLink = actions.find((a) => a.action_id === gap.linked_action_id);
      if (byLink) return byLink;
    }
    if (gap.gap_id) {
      const byGap = actions.find((a) => (a.addresses_gap_ids || []).includes(gap.gap_id));
      if (byGap) return byGap;
    }
    return null;
  }

  // Clicking a gap toggles its inline impact box and arms the matching action
  // card to glow. The scroll + glow fires from the effect below once the
  // Action Plan tab is on screen (gaps and actions live in separate tabs).
  function handleGapClick(gap, key) {
    if (expandedGapId === key) {
      setExpandedGapId(null);
      setFlashActionId(null);
      return;
    }
    setExpandedGapId(key);
    const action = findActionForGap(gap);
    setFlashActionId(action?.action_id || null);
  }

  // When the Action Plan tab is visible and an action is armed, smooth-scroll
  // it into view and let the .action-flash class run its glow, then disarm
  // after the animation so it can be re-triggered later.
  useEffect(() => {
    if (tab !== 'actions' || !flashActionId) return undefined;
    const id = flashActionId;
    const raf = requestAnimationFrame(() => {
      const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
      const el = document.querySelector(`[data-action-id="${safe}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const t = setTimeout(() => setFlashActionId(null), 2600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [tab, flashActionId]);

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
            <span className={`badge ${riskLevel.toLowerCase()}`} style={{ marginTop: 12 }}>{riskLabel(riskLevel)}</span>
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
              <span className="v" style={{ fontSize: 11 }}>{lastAnalyzedLabel}</span>
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
              <StatusTab
                gaps={gaps}
                contradictions={contradictions}
                expandedGapId={expandedGapId}
                onGapClick={handleGapClick}
                findActionForGap={findActionForGap}
                currentScore={score}
              />
            )}
            {tab === 'actions' && (
              <ActionsTab
                actions={actions}
                currentScore={score}
                targetScore={targetScore}
                totalRisk={ordersAtRisk}
                flashActionId={flashActionId}
              />
            )}
            {tab === 'documents' && (
              <DocumentsTab
                factoryId={factoryId}
                documents={documents}
                openDoc={openDoc}
                setOpenDoc={setOpenDoc}
              />
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

// Inline "if you fix this" preview rendered directly under a clicked gap.
// Pulls the score delta and PKR impact from the gap's linked action; falls
// back gracefully to whatever the gap itself carries when no action exists.
function GapImpactBox({ gap, action, currentScore }) {
  const so = (action && action.simulation_output) || {};
  let delta = 0;
  if (so.score_delta != null) delta = Number(so.score_delta);
  else if (action && action.estimated_score_delta != null) delta = Number(action.estimated_score_delta);
  else if (so.compliance_score_delta != null) delta = Number(so.compliance_score_delta);
  if (!Number.isFinite(delta)) delta = 0;

  const fromScore = Number.isFinite(Number(currentScore)) ? Number(currentScore) : 0;
  const toScore = Math.min(100, fromScore + delta);

  let impact = Number(action?.impact_pkr);
  if (!Number.isFinite(impact) || impact <= 0) impact = Number(so.risk_reduction_pkr) || 0;

  const dlRaw = (action && action.deadline) || gap.deadline || null;
  const dateStr = dlRaw ? new Date(dlRaw).toLocaleDateString() : null;

  return (
    <div className="gap-impact">
      {delta > 0 && (
        <div className="gap-impact-line">
          <Icon name="check" size={13} color="#00C48C" />
          <span>If you fix this: <strong>Score goes from {fromScore} → {toScore}</strong></span>
        </div>
      )}
      {impact > 0 && (
        <div className="gap-impact-line">
          <Icon name="check" size={13} color="#00C48C" />
          <span><strong>{pkrFormat(impact)}</strong> recovered</span>
        </div>
      )}
      {dateStr && (
        <div className="gap-impact-line">
          <Icon name="check" size={13} color="#00C48C" />
          <span>Deadline: <strong>{dateStr}</strong></span>
        </div>
      )}
      {!action && delta === 0 && impact === 0 && !dateStr && (
        <div className="gap-impact-line muted">
          <Icon name="alert" size={13} color="#9BA3AF" />
          <span>No linked action yet — run an analysis to generate a fix.</span>
        </div>
      )}
      {action && (
        <div className="gap-impact-hint">Open the Action Plan tab to see the full fix →</div>
      )}
    </div>
  );
}

function StatusTab({ gaps, contradictions, expandedGapId, onGapClick, findActionForGap, currentScore }) {
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
            const key = g.gap_id || `gap-${i}`;
            const expanded = expandedGapId === key;
            const action = findActionForGap ? findActionForGap(g) : null;
            return (
              <div
                className={`list-card clickable ${severity} ${expanded ? 'expanded' : ''}`}
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => onGapClick && onGapClick(g, key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onGapClick && onGapClick(g, key);
                  }
                }}
              >
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
                {expanded && <GapImpactBox gap={g} action={action} currentScore={currentScore} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionsTab({ actions, currentScore, targetScore, totalRisk, flashActionId }) {
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
        const flashing = flashActionId && a.action_id === flashActionId;
        return (
          <div
            className={`list-card primary ${flashing ? 'action-flash' : ''}`}
            key={a.action_id || a.priority}
            data-action-id={a.action_id || ''}
          >
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

const READY_TO_SEND_KINDS = new Set(['BUYER_EMAIL']);

function plainDocTitle(d) {
  if (d.title) return d.title;
  switch (d.kind) {
    case 'CBAM_FORM':
    case 'CBAM_DECLARATION':
      return 'EU Carbon Tax Filing';
    case 'CERTIFICATION_APP':
      return 'Certification Application';
    case 'MSA_STATEMENT':
      return 'Modern Slavery Statement';
    case 'EMISSIONS_REPORT':
      return 'Emissions Report';
    case 'AUDIT_CHECKLIST':
      return 'Audit Checklist';
    case 'REMEDIATION_PLAN':
      return 'Remediation Plan';
    case 'BOOKING_TEMPLATE':
      return 'Booking Template';
    default:
      return 'Document';
  }
}

function extractEmailSubject(d) {
  const body = d.body || '';
  const m = body.match(/^\s*#?\s*(?:\*\*)?Subject(?:\*\*)?\s*:?\s*(.+)$/im);
  if (m && m[1]) return m[1].trim().replace(/\*\*/g, '');
  return d.title || 'Update on your order';
}

function extractBuyerName(d) {
  const body = d.body || '';
  const to = body.match(/^\s*(?:\*\*)?To(?:\*\*)?\s*:?\s*(.+)$/im);
  if (to && to[1]) return to[1].trim().replace(/\*\*/g, '');
  const dear = body.match(/Dear\s+([A-Z][A-Za-z0-9 .&'-]+)\s*[,:]/);
  if (dear && dear[1]) return dear[1].trim();
  return d.buyer || d.title || 'Buyer';
}

function splitSubjectFromBody(rawBody, fallbackTitle) {
  const body = String(rawBody || '');
  const lines = body.split('\n');
  for (let i = 0; i < Math.min(3, lines.length); i += 1) {
    const m = lines[i].match(/^\s*#?\s*(?:\*\*)?Subject(?:\*\*)?\s*:?\s*(.+)$/i);
    if (m && m[1]) {
      const subject = m[1].replace(/\*\*/g, '').trim();
      const remainder = lines.slice(i + 1).join('\n').trim();
      return { subject, body: remainder };
    }
  }
  return { subject: fallbackTitle || 'Compliance Status Update', body: body.trim() };
}

function EditEmailPanel({ factoryId, document: docItem, buyer, onClose }) {
  const initial = useMemo(
    () => splitSubjectFromBody(docItem.body, docItem.title),
    [docItem],
  );
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [recipient, setRecipient] = useState(docItem.buyer || buyer || '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const docId = docItem.document_id || docItem.id;

  async function onSaveDraft() {
    try {
      setSaving(true);
      const composedBody = `# Subject: ${subject}\n\n${body}`;
      await updateDocument(factoryId, docId, {
        title: subject,
        body: composedBody,
        buyer: recipient || docItem.buyer,
      });
      setSavedAt(new Date());
    } catch (e) {
      console.warn('save draft failed', e);
      alert(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function onOpenInGmail() {
    // Open Gmail's web compose in a new tab with the draft pre-filled. We
    // never send — the user reviews and sends from their Gmail account.
    openGmailCompose({ to: recipient || '', subject, body });
  }

  return (
    <div className="edit-panel">
      <div className="edit-panel-head">
        <div className="edit-panel-title">
          <Icon name="edit" size={14} color="#00D4AA" /> Edit email
        </div>
        <button type="button" className="edit-panel-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={14} color="#9BA3AF" />
        </button>
      </div>

      <label className="edit-field">
        <span className="edit-field-label">To</span>
        <input
          className="edit-input"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="buyer@example.com"
        />
      </label>

      <label className="edit-field">
        <span className="edit-field-label">Subject</span>
        <input
          className="edit-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject line"
        />
      </label>

      <label className="edit-field">
        <span className="edit-field-label">Body</span>
        <textarea
          className="edit-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          placeholder="Body of your email"
        />
      </label>

      <div className="edit-actions">
        <button
          type="button"
          className="btn small ghost"
          onClick={onSaveDraft}
          disabled={saving}
        >
          <Icon name="save" size={12} />{' '}
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button type="button" className="btn small primary" onClick={onOpenInGmail}>
          <Icon name="external" size={12} /> Open in Gmail
        </button>
      </div>

      {savedAt && (
        <div className="edit-saved-note">
          Draft saved {savedAt.toLocaleTimeString()}.
        </div>
      )}
      <div className="edit-help">
        "Open in Gmail" launches your default email app with this draft
        pre-filled. You can send from any signed-in account.
      </div>
    </div>
  );
}

function EmailCard({ factoryId, document: docItem, documents, isOpen, onToggle }) {
  const id = docItem.document_id || docItem.id;
  const buyer = extractBuyerName(docItem);
  const subject = extractEmailSubject(docItem);
  const [editing, setEditing] = useState(false);

  function onOpenInGmail() {
    // Open Gmail's web compose in a new tab with the draft pre-filled.
    // Opening Gmail is NOT sending — the user may or may not actually send —
    // so we deliberately persist NO "sent" state. The button always renders
    // in its default ready state on every mount.
    const split = splitSubjectFromBody(docItem.body, docItem.title);
    const recipient = docItem.buyer || buyer || '';
    openGmailCompose({ to: recipient, subject: split.subject, body: split.body });
  }

  return (
    <div className="email-card">
      <div className="email-head" onClick={onToggle} role="button" tabIndex={0}>
        <div className="email-icon">
          <Icon name="mail" size={16} color="#00D4AA" />
        </div>
        <div className="email-info">
          <div className="email-to">To: {buyer}</div>
          <div className="email-subject">{subject}</div>
        </div>
        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} color="#9BA3AF" />
      </div>

      {isOpen && docItem.body && !editing && (
        <div className="doc-body md-wrap">
          <Markdown>{transformMarkdownTables(String(docItem.body))}</Markdown>
        </div>
      )}

      {docItem.stage === 'AUDIT_READY' && (
        <div className="stage-pill">
          <Icon name="ribbon" size={11} color="#00D4AA" /> Audit Ready
        </div>
      )}

      {!editing && (
        <div className="email-actions">
          <button
            type="button"
            className="btn small ghost"
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={12} /> Edit
          </button>
          <button
            type="button"
            className="btn small primary"
            onClick={onOpenInGmail}
          >
            <Icon name="external" size={12} /> Open in Gmail
          </button>
        </div>
      )}

      {editing && (
        <EditEmailPanel
          factoryId={factoryId}
          document={docItem}
          buyer={buyer}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function FormCard({ factoryId, document: docItem, documents, isOpen, onToggle }) {
  const id = docItem.document_id || docItem.id;
  const title = plainDocTitle(docItem);
  const isChecklist = docItem.kind === 'AUDIT_CHECKLIST';

  async function onAllComplete() {
    try {
      await api.generateAuditReady(factoryId);
    } catch (e) {
      // Non-fatal — the checklist still flips to "all done" without the
      // Stage 2 email being regenerated.
      console.warn('audit-ready trigger failed', e);
    }
  }

  return (
    <div className="form-card">
      <div className="form-head" onClick={onToggle} role="button" tabIndex={0}>
        <div className="form-icon">
          <Icon
            name={isChecklist ? 'check' : 'doc'}
            size={16}
            color={isChecklist ? '#00D4AA' : '#F59E0B'}
          />
        </div>
        <div className="form-info">
          <div className="form-title">{title}</div>
          {docItem.generated_at && (
            <div className="form-meta">
              Prepared {new Date(docItem.generated_at).toLocaleDateString()}
            </div>
          )}
        </div>
        <div className={`form-open-pill ${isOpen ? 'on' : ''}`}>{isOpen ? 'Close' : 'Open'}</div>
      </div>

      {isOpen && isChecklist && (
        <div className="doc-body md-wrap">
          <InteractiveChecklist
            factoryId={factoryId}
            checklistId={id}
            body={docItem.body}
            documents={documents}
            onAllComplete={onAllComplete}
          />
        </div>
      )}

      {isOpen && !isChecklist && docItem.body && (
        <div className="doc-body md-wrap">
          <Markdown>{transformMarkdownTables(String(docItem.body))}</Markdown>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ factoryId, documents, openDoc, setOpenDoc }) {
  if (!documents.length) {
    return (
      <div className="empty-state">
        No documents generated yet. Run an analysis to produce buyer emails,
        CBAM forms, and audit checklists.
      </div>
    );
  }

  const readyToSend = documents.filter((d) => READY_TO_SEND_KINDS.has(d.kind));
  const formsToFile = documents.filter((d) => !READY_TO_SEND_KINDS.has(d.kind));

  return (
    <div>
      {readyToSend.length > 0 && (
        <div className="doc-section">
          <div className="doc-section-head">
            <Icon name="mail" size={14} color="#00D4AA" />
            <span className="doc-section-title">Ready to Send</span>
            <span className="doc-section-count">{readyToSend.length}</span>
          </div>
          {readyToSend.map((d, i) => {
            const id = d.document_id || `email-${i}`;
            return (
              <EmailCard
                key={id}
                factoryId={factoryId}
                document={d}
                documents={documents}
                isOpen={openDoc === id}
                onToggle={() => setOpenDoc(openDoc === id ? null : id)}
              />
            );
          })}
        </div>
      )}

      {formsToFile.length > 0 && (
        <div className="doc-section">
          <div className="doc-section-head">
            <Icon name="doc" size={14} color="#F59E0B" />
            <span className="doc-section-title">Forms to File</span>
            <span className="doc-section-count">{formsToFile.length}</span>
          </div>
          {formsToFile.map((d, i) => {
            const id = d.document_id || `form-${i}`;
            return (
              <FormCard
                key={id}
                factoryId={factoryId}
                document={d}
                documents={documents}
                isOpen={openDoc === id}
                onToggle={() => setOpenDoc(openDoc === id ? null : id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
