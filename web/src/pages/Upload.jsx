import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import AgentPipeline from '../components/AgentPipeline.jsx';
import { Icon } from '../components/Icon.jsx';
import { API_BASE_URL, DEMO_FACTORIES } from '../constants/config';
import { api } from '../services/api';
import { subscribeJob } from '../services/firebase';

const STAGES = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  ANALYZING: 'analyzing',
  COMPLETE: 'complete',
  ERROR: 'error',
};

const REQUIRED_ITEMS = [
  'Factory name, city, and country of operation',
  'Annual export volume in PKR or USD (broken down by buyer if possible)',
  'List of active EU/UK buyers (e.g. retailer names and order values)',
  'Current certifications with expiry dates: SA8000, ISO 14001, OEKO-TEX or GOTS',
  'Chemical usage data — effluent discharge levels (ppm), dye chemicals used',
  'Working hours per week (including overtime)',
  'Forced/child labour compliance statement',
  'Carbon/emissions data if exporting to EU (for CBAM compliance)',
  'Supply chain mapping — tier-1 and tier-2 suppliers if available',
];

const OPTIONAL_ITEMS = [
  'Previous audit findings or corrective action reports',
  'Buyer-specific compliance questionnaire responses',
  'Water and energy consumption data',
  'Grievance mechanism documentation',
];

// Collapsible "what should your audit report include?" helper. Collapsed by
// default; expands to show required vs optional content as rendered text.
function AuditGuidanceBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="guidance-box">
      <button
        type="button"
        className="guidance-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} color="#00C48C" />
        <span>📋 What should your audit report include?</span>
      </button>
      {open && (
        <div className="guidance-body">
          <div className="guidance-section-title">Required information</div>
          {REQUIRED_ITEMS.map((t) => (
            <div className="guidance-item" key={t}>
              <span className="guidance-tick">✓</span> {t}
            </div>
          ))}
          <div className="guidance-section-title">Helpful but optional</div>
          {OPTIONAL_ITEMS.map((t) => (
            <div className="guidance-item optional" key={t}>
              <span className="guidance-dot">•</span> {t}
            </div>
          ))}
          <div className="guidance-section-title">Supported formats</div>
          <div className="guidance-item optional">
            PDF only · Max 20 MB · Scanned documents are supported
          </div>
        </div>
      )}
    </div>
  );
}

// "Not sure what to include?" sample template download row. Files live in
// web/public and are served from the site root.
function SampleTemplateRow() {
  return (
    <div className="sample-template-row">
      <div className="sample-template-text">
        📄 Not sure what to include? Download our sample audit report template
      </div>
      <div className="sample-template-btns">
        <a className="btn small ghost" href="/sample_audit_template.docx" download>
          <Icon name="doc" size={12} /> Download DOCX
        </a>
        <a className="btn small primary" href="/sample_audit_template.pdf" download>
          <Icon name="doc" size={12} /> Download PDF
        </a>
      </div>
    </div>
  );
}

export default function Upload() {
  const nav = useNavigate();
  const { factoryId: paramFactory } = useParams();
  const fileRef = useRef(null);
  const unsubJob = useRef(null);

  // If the route is /upload without a factory id, default to a demo "New
  // Factory" slot so a judge can drop in any PDF and see the pipeline run.
  const factory = useMemo(() => {
    if (paramFactory) {
      return (
        DEMO_FACTORIES.find((f) => f.factory_id === paramFactory)
        || { factory_id: paramFactory, factory_name: paramFactory, city: '—' }
      );
    }
    return {
      factory_id: 'demo_factory_upload_test',
      factory_name: 'New Factory',
      city: 'Faisalabad',
    };
  }, [paramFactory]);

  // For a brand-new (unknown) factory the user types the name; for an existing
  // factory we show its known name as a read-only chip.
  const isNew = !paramFactory;
  const [factoryName, setFactoryName] = useState(factory.factory_name);
  const [stage, setStage] = useState(STAGES.IDLE);
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);

  useEffect(() => {
    if (!jobId) return undefined;
    unsubJob.current = subscribeJob(jobId, (data) => {
      setJob(data);
      if (data?.status === 'complete') {
        setStage(STAGES.COMPLETE);
      } else if (data?.status === 'failed') {
        setStage(STAGES.ERROR);
        setError('Pipeline reported failure — check the agent trace.');
      }
    });
    return () => { if (unsubJob.current) unsubJob.current(); };
  }, [jobId]);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setPicked(file);
    setStage(STAGES.UPLOADING);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('kind', 'factory_audit');
      form.append('factory_id', factory.factory_id);
      const res = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`);
      setStage(STAGES.ANALYZING);
      const job = await api.analyze(factory.factory_id);
      if (job?.job_id) setJobId(job.job_id);
      else throw new Error('Analyze did not return a job_id');
    } catch (e) {
      setStage(STAGES.ERROR);
      setError(e.message || String(e));
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  const busy = stage === STAGES.UPLOADING || stage === STAGES.ANALYZING;
  const trace = job?.agent_trace;

  return (
    <div className="app-shell">
      <Header />
      <button className="back-btn" onClick={() => nav('/')}>
        <Icon name="chevron-left" size={14} /> Back to Dashboard
      </button>

      <div className="upload-hero">
        <div className="upload-icon-circle">
          <Icon name="upload" size={36} color="#00D4AA" />
        </div>
        <h1 className="upload-title">Let's check your factory</h1>
        <p className="upload-sub">
          Upload your factory's audit report PDF. We already have the latest EU CBAM, UK Modern
          Slavery Act, and EU CSDDD rules in our system — our agents will compare and find any gaps.
        </p>

        {isNew ? (
          <div className="factory-name-field">
            <label htmlFor="fac-name">Factory name</label>
            <input
              id="fac-name"
              className="factory-name-input"
              value={factoryName}
              onChange={(e) => setFactoryName(e.target.value)}
              placeholder="e.g. Faisal Weave Industries"
              disabled={busy}
            />
          </div>
        ) : (
          <div className="upload-chip">
            <Icon name="factory" size={14} color="#00D4AA" /> {factory.factory_name}
          </div>
        )}

        <div
          className={`drop-zone ${busy ? 'busy' : ''}`}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => !busy && fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {busy ? (
            <>
              <div className="spinner" style={{ width: 32, height: 32, margin: 0 }} />
              <div style={{ marginTop: 12, fontWeight: 700 }}>
                {stage === STAGES.UPLOADING ? 'Uploading PDF…' : 'Starting agent pipeline…'}
              </div>
              {picked && <div className="upload-meta">{picked.name} · {Math.round(picked.size / 1024)} KB</div>}
            </>
          ) : stage === STAGES.COMPLETE ? (
            <>
              <Icon name="check" size={32} color="#00D4AA" />
              <div style={{ marginTop: 12, fontWeight: 700 }}>Analysis complete</div>
              <button
                className="btn primary"
                style={{ marginTop: 14, maxWidth: 260 }}
                onClick={() => nav(`/factory/${factory.factory_id}`)}
              >
                View {factoryName}
              </button>
            </>
          ) : (
            <>
              <Icon name="upload" size={32} color="#00D4AA" />
              <div style={{ marginTop: 12, fontWeight: 700, fontSize: 16 }}>
                Drop your audit PDF here, or click to browse
              </div>
              <div className="upload-meta">Accepts a single PDF up to 20 MB</div>
              {picked && <div className="upload-meta" style={{ marginTop: 8 }}>{picked.name}</div>}
            </>
          )}
        </div>

        {error && <div className="upload-error">{error}</div>}

        <AuditGuidanceBox />
        <SampleTemplateRow />

        {(busy || (trace && trace.length > 0)) && (
          <div style={{ marginTop: 24, width: '100%', maxWidth: 720 }}>
            <AgentPipeline trace={trace} running={busy} />
          </div>
        )}

        <div className="upload-tips">
          <div className="tip-head">What we'll do with your file</div>
          <ul>
            <li>Parse the audit with Gemini 2.5 Pro to extract certificates, claims, and audit findings.</li>
            <li>Compare against EU CBAM, UK Modern Slavery Act, and EU CSDDD rules.</li>
            <li>Generate a compliance score, prioritised action plan, and buyer-facing emails.</li>
            <li>No data leaves your Firebase project — uploads go straight to Cloud Storage.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
