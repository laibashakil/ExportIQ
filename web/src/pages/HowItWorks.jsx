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
      "We keep the latest EU CBAM, UK Modern Slavery Act and Supply Chain rules in our system — you don't have to.",
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

      <div className="hiw-section-head">How We Calculate Your Score</div>
      <div className="hiw-info">
        Your compliance score reflects how well your factory's documentation aligns with EU and UK
        export rules. Critical missing requirements weigh more heavily than minor gaps.
        Contradictions between your own documents reduce your score because they signal audit risk.
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
