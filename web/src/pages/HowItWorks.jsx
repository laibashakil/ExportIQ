import { useNavigate } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { Icon } from '../components/Icon.jsx';

const STEPS = [
  {
    icon: 'upload',
    title: 'You upload your factory documents',
    body:
      "Just your factory's audit report PDF. We use it to understand your current compliance.",
  },
  {
    icon: 'doc',
    title: 'Our AI reads EU and UK export rules',
    body:
      "We keep the latest EU CSDDD, UK Modern Slavery Act, SA8000, EU REACH and GSP+ rules in our system — you don't have to.",
  },
  {
    icon: 'cpu',
    title: 'We compare and find any gaps',
    body:
      'Our agents cross-check your factory against every rule and flag anything missing, expired, or in conflict.',
  },
  {
    icon: 'mail',
    title: 'We tell you what to fix and draft your emails',
    body:
      'You get a clear plain-English action plan, and we draft the emails to your European buyers for you.',
  },
];

// Score bands — these match the live banding in utils/scoring.js exactly
// (Compliant only at a perfect 100; 90–99 Almost; 60–89 Needs Attention;
// 0–59 At Risk).
const SCORE_BANDS = [
  { range: '100', label: 'Compliant', color: '#00C48C', desc: 'Meets all EU/UK requirements' },
  { range: '90–99', label: 'Almost Compliant', color: '#F5A623', desc: 'Minor gaps — action needed soon' },
  { range: '60–89', label: 'Needs Attention', color: '#F97316', desc: 'Significant gaps — orders at risk' },
  { range: '0–59', label: 'At Risk', color: '#EF4444', desc: 'High risk of losing export orders' },
];

// Penalty weights — verbatim from backend/tools/compliance_scorer.py
// (SEVERITY_PENALTY + CONTRADICTION_PENALTY). Every factory starts at 100.
const DEDUCTIONS = [
  { type: 'Critical gap', weight: '−12 pts', example: 'Missing CSDDD registration (mandatory)' },
  { type: 'High severity gap', weight: '−10 pts', example: 'SA8000 certification expired' },
  { type: 'Medium severity gap', weight: '−5 pts', example: 'Supply chain mapping incomplete' },
  { type: 'Low severity gap', weight: '−2 pts', example: 'Advisory recommendation not addressed' },
  { type: 'Document contradiction', weight: '−4 pts', example: 'ISO claim contradicted by audit data' },
];

const RAISES = [
  'Each gap you fix restores its full deducted points',
  'Resolving a contradiction restores 4 points',
  'Completing the full action plan brings your score back to 100',
];

export default function HowItWorks() {
  const nav = useNavigate();
  return (
    <div className="app-shell">
      <Header />
      <button className="back-btn" onClick={() => nav(-1)}>
        <Icon name="chevron-left" size={14} /> Back
      </button>

      <div className="hiw-hero">
        <img src="/logo.png" alt="ExportIQ" className="hiw-hero-logo" />
        <div className="hiw-hero-name">Export<span className="teal">IQ</span></div>
        <div className="hiw-hero-tag">Textile Export Compliance</div>
      </div>

      <h1 className="hiw-page-title">How ExportIQ works</h1>
      <p className="hiw-page-sub">Four simple steps to keep your EU and UK export orders safe.</p>

      <div className="hiw-step-list">
        {STEPS.map((s, i) => (
          <div className="hiw-step-card" key={i}>
            <div className="hiw-step-row">
              <div className="hiw-step-num">{i + 1}</div>
              <div className="hiw-step-icon"><Icon name={s.icon} size={22} color="#00D4AA" /></div>
              <div className="hiw-step-title">{s.title}</div>
            </div>
            <div className="hiw-step-body">{s.body}</div>
          </div>
        ))}
      </div>

      <div className="hiw-section-head">How Your Score Is Calculated</div>
      <div className="hiw-info">
        Every factory starts at <strong>100</strong>. We subtract points for each gap and
        contradiction we find, weighted by how serious it is. Here's the full breakdown.
      </div>

      <div className="score-bands">
        {SCORE_BANDS.map((b) => (
          <div className="score-band" style={{ background: b.color }} key={b.label}>
            <span className="score-band-range">{b.range}</span>
            <span className="score-band-label">{b.label}</span>
            <span className="score-band-desc">{b.desc}</span>
          </div>
        ))}
      </div>

      <div className="score-sub-head">How points are deducted</div>
      <div className="deduct-table">
        <div className="deduct-row deduct-head">
          <span>Issue type</span><span>Weight</span><span>Example</span>
        </div>
        {DEDUCTIONS.map((d) => (
          <div className="deduct-row" key={d.type}>
            <span className="deduct-type">{d.type}</span>
            <span className="deduct-weight">{d.weight}</span>
            <span className="deduct-example">{d.example}</span>
          </div>
        ))}
      </div>

      <div className="score-sub-head">What raises your score</div>
      <div className="raise-list">
        {RAISES.map((r) => (
          <div className="raise-item" key={r}>
            <span className="raise-tick">✓</span> {r}
          </div>
        ))}
      </div>

      <div className="contradiction-callout">
        <div className="cc-title"><Icon name="alert" size={16} color="#F5A623" /> Contradiction penalty explained</div>
        <div className="cc-body">
          When your own documents disagree — e.g. your factory claims ISO 14001 certification but your
          water audit shows effluent at <strong>12 ppm</strong>, above the <strong>8 ppm</strong> legal
          limit — EU auditors treat it as misrepresentation, which is more serious than a simple gap.
          Each contradiction deducts <strong>4 points</strong>, and ExportIQ drafts a buyer
          notification email so you can get ahead of it.
        </div>
      </div>

      <div className="score-tip">
        <span className="score-tip-emoji">💡</span>
        <div>
          The <strong>Simulate</strong> feature shows your projected score after each fix is
          completed — so you can see exactly which action has the biggest impact before committing
          resources.
        </div>
      </div>

      <div className="hiw-section-head">Why EU and UK only?</div>
      <div className="hiw-info">
        65% of Pakistan's textile exports go to EU and UK markets. We focus on these regions for the
        highest-impact compliance coverage. Additional jurisdictions (US, Japan, China) can be added
        on request.
      </div>

      <div className="hiw-section-head">Handling messy real-world data</div>
      <div className="hiw-info">
        ExportIQ accepts multiple PDF documents per factory — audit reports, certificates, lab
        results, self-assessments. Our agents use Google Gemini's document understanding to extract
        structured data even from inconsistently formatted files. For demo purposes one consolidated
        audit PDF is used.
      </div>

      <div className="hiw-tip">
        <Icon name="alert" size={20} color="#F59E0B" />
        <div>
          One missed EU compliance deadline can put crores of rupees of export orders at risk.
          ExportIQ catches gaps before your buyers do.
        </div>
      </div>
    </div>
  );
}
