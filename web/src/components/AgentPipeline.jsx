// Visualizes the 6-agent pipeline as a horizontal step list.
// Each step lights up teal as the corresponding agent emits its 'complete' step.

const STEPS = [
  { key: 'regulation_ingestion', name: 'Reg Parser' },
  { key: 'factory_profile', name: 'Factory Profile' },
  { key: 'gap_detection', name: 'Gap Detection' },
  { key: 'financial_impact', name: 'Fin. Impact' },
  { key: 'action_chain', name: 'Action Chain' },
  { key: 'execution_simulation', name: 'Execution Sim' },
];

// Convert trace entries into per-agent state + a one-line summary.
function computeAgentState(trace) {
  const state = {};
  for (const step of STEPS) state[step.key] = { status: 'pending', detail: null };
  if (!Array.isArray(trace)) return state;
  for (const entry of trace) {
    const a = entry?.agent;
    if (!state[a]) continue;
    if (state[a].status !== 'completed') state[a].status = 'running';
    if (entry.step === 'complete') {
      state[a].status = 'completed';
      state[a].detail = entry.detail || null;
    }
    if (entry.step === 'parsed_regulation' || entry.step === 'parsed_profile' || entry.step === 'loaded_profile') {
      if (!state[a].detail) state[a].detail = entry.detail || null;
    }
  }
  return state;
}

function summary(agentKey, detail) {
  if (!detail) return '';
  const n = (v) => Number(v) || 0;
  if (agentKey === 'regulation_ingestion') return `${n(detail.total_rules || detail.rule_count)} rules`;
  if (agentKey === 'factory_profile') return `${n(detail.certificate_count || detail.certifications)} certs`;
  if (agentKey === 'gap_detection') return `${n(detail.gap_count)} gaps · ${n(detail.contradiction_count)} mismatch`;
  if (agentKey === 'financial_impact') {
    const v = Number(detail.orders_at_risk_pkr || detail.total_pkr) || 0;
    if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)} Cr at risk`;
    return 'risk computed';
  }
  if (agentKey === 'action_chain') return `${n(detail.action_count)} actions`;
  if (agentKey === 'execution_simulation') return `+${n(detail.score_delta)} pts`;
  return '';
}

export default function AgentPipeline({ trace, running }) {
  const state = computeAgentState(trace);

  // Determine the first non-completed step as 'active' when pipeline is running.
  const firstNotDone = STEPS.find((s) => state[s.key].status !== 'completed');
  const activeKey = running && firstNotDone ? firstNotDone.key : null;

  return (
    <div className="pipeline">
      <div className="pipeline-title">
        {running ? <><span className="pulse" /> Agents Running</> : 'Agent Pipeline'}
      </div>
      <div className="pipeline-steps">
        {STEPS.map((s) => {
          const st = state[s.key];
          const klass =
            st.status === 'completed' ? 'done' :
            s.key === activeKey ? 'active' : '';
          return (
            <div key={s.key} className={`pipe-step ${klass}`} title={s.key}>
              <div className="pipe-name">{s.name}</div>
              <div className="pipe-detail">{summary(s.key, st.detail) || (st.status === 'completed' ? 'done' : klass === 'active' ? '…' : '–')}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
