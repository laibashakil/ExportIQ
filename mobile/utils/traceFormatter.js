// Converts a raw agent_trace entry coming from Firestore into a plain-English
// sentence suitable for the AgentTraceScreen timeline. No raw JSON ever leaks
// into the UI — every unknown event falls back to a humanised string.
//
// Entry shape (per backend/agents/base.py:log_step):
//   { agent: string, step: string, detail: object|string|null, ts: string }

const REGULATION_LABELS = {
  eu_csddd: 'EU CSDDD',
  uk_modern_slavery: 'UK Modern Slavery Act',
  sa8000: 'SA8000',
  eu_reach: 'EU REACH',
  gsplus: 'GSP+',
};

function prettyReg(id) {
  if (!id) return 'regulation';
  const key = String(id).toLowerCase();
  if (REGULATION_LABELS[key]) return REGULATION_LABELS[key];
  return String(id).toUpperCase().replace(/_/g, ' ');
}

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

// Gemini-rationale extraction. The model often answers with a fenced
// ```json {"rationale": "...", "recommended_actions": [...]}``` block.
// This helper returns the prose `rationale` value, falling back to any
// stripped fence content, falling back to the raw text — never raw JSON.
function extractRationaleProse(raw) {
  if (!raw) return '';
  let text = String(raw).trim();

  // 1. Strip ```json … ``` (or ``` … ```) code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) text = fenced[1].trim();

  // 2. If what remains is JSON-shaped, parse and lift the rationale string
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed.rationale || parsed.summary || parsed.reason || '';
        if (typeof candidate === 'string' && candidate.length > 0) return candidate.trim();
      }
    } catch {
      // not parseable — fall through and strip JSON visually
    }
    // 3. Final defence: regex out the rationale value even if JSON parsing
    //    failed due to a trailing comma or stray markdown.
    const re = text.match(/"rationale"\s*:\s*"([^"]+)"/i);
    if (re && re[1]) return re[1].trim();
    // Last resort: drop all braces/quotes so the UI never shows JSON.
    return text.replace(/[\{\}\[\]"]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return text;
}

function pkrShort(value) {
  const v = n(value);
  if (Math.abs(v) >= 10_000_000) return `PKR ${(v / 10_000_000).toFixed(1).replace(/\.0$/, '')} Cr`;
  if (Math.abs(v) >= 100_000) return `PKR ${(v / 100_000).toFixed(1).replace(/\.0$/, '')} Lakh`;
  return `PKR ${v.toLocaleString()}`;
}

// Per-agent step formatters. Each receives the raw `detail` object and
// returns the rendered string. Wrap each in try/catch at the dispatch site.
const FORMATTERS = {
  orchestrator: {
    pipeline_start: (d) =>
      `Starting compliance analysis for ${d.factory_id || 'factory'} against ${
        d.regulation_ids?.length || 0
      } regulations`,
    pipeline_complete: (d) =>
      d.simulated_after != null
        ? `Pipeline complete — current score ${d.compliance_score}, simulated post-remediation ${d.simulated_after}`
        : `Pipeline complete — current compliance score: ${d.compliance_score}`,
  },

  regulation_ingestion: {
    started: (d) =>
      `Reading ${d.regulation_ids?.length || 0} EU/UK regulation documents`,
    parsed_regulation: (d) =>
      `Parsed ${prettyReg(d.regulation_id)} — found ${n(d.rule_count)} compliance rules`,
    extracting_with_gemini: (d) =>
      `Extracting rules from ${prettyReg(d.regulation_id)} with Gemini 2.5 Pro`,
    complete: (d) =>
      `Regulation analysis complete — ${n(d.total_rules)} rules extracted across all frameworks`,
  },

  factory_profile: {
    started: () => 'Reading factory audit report and export data',
    loaded_profile: (d) => {
      const parts = [];
      if (d.factory_name) parts.push(d.factory_name);
      if (d.certifications != null) parts.push(`${n(d.certifications)} certificates`);
      if (d.claims != null) parts.push(`${n(d.claims)} self-reported claims`);
      if (d.evidence_items != null) parts.push(`${n(d.evidence_items)} audit-evidence items`);
      return `Factory profile loaded — ${parts.join(' · ')}`;
    },
    parsed_profile: (d) =>
      `Factory profile loaded — ${n(d.certificate_count)} certificates, ${pkrShort(
        d.export_value_pkr,
      )} in active export orders`,
    extracting_pdf_with_gemini: (d) =>
      `Reading factory audit PDF with Gemini (${n(d.chars)} chars)`,
    complete: () => 'Factory profile complete',
  },

  gap_detection: {
    started: () => 'Cross-referencing factory status against compliance rules',
    deterministic_pass: (d) =>
      `Deterministic rule sweep — ${n(d.gaps_found)} gap${n(d.gaps_found) === 1 ? '' : 's'} flagged`,
    llm_pass: (d) =>
      `Gemini gap sweep — ${n(d.gaps_found)} additional gap${
        n(d.gaps_found) === 1 ? '' : 's'
      } flagged`,
    contradictions_detected: (d) => {
      const first = d.first;
      if (first?.claim && first?.source_a) {
        const claim = String(first.claim).slice(0, 60);
        return `${n(d.count)} contradiction${n(d.count) === 1 ? '' : 's'} detected — top: claim "${claim}…" vs ${first.source_b || 'evidence'}`;
      }
      return `${n(d.count)} contradiction${n(d.count) === 1 ? '' : 's'} detected`;
    },
    gap_found: (d) =>
      `Gap detected: ${d.regulation || 'regulation'} — ${d.requirement || 'requirement'} is ${
        d.status || 'unresolved'
      }`,
    contradiction_found: (d) =>
      `Contradiction: Factory claims "${String(d.claim || '').slice(0, 80)}" but ${
        d.evidence_source || 'audit evidence'
      } shows otherwise`,
    complete: (d) =>
      `${n(d.gap_count)} gap${n(d.gap_count) === 1 ? '' : 's'} and ${n(d.contradiction_count)} contradiction${
        n(d.contradiction_count) === 1 ? '' : 's'
      } identified`,
  },

  financial_impact: {
    started: () => 'Calculating PKR value of orders at risk',
    buyer_risk: (d) =>
      `${d.buyer_name || 'Buyer'} orders: ${pkrShort(d.amount_pkr)} at risk across ${n(
        d.gap_count,
      )} gap${n(d.gap_count) === 1 ? '' : 's'}`,
    complete: (d) =>
      `${pkrShort(d.orders_at_risk_pkr ?? d.total_pkr)} at risk across ${
        Array.isArray(d.buyers_affected) ? d.buyers_affected.length : n(d.buyer_count)
      } buyer${
        (Array.isArray(d.buyers_affected) ? d.buyers_affected.length : n(d.buyer_count)) === 1
          ? ''
          : 's'
      }`,
  },

  action_chain: {
    started: () => 'Generating prioritized remediation plan',
    action_created: (d) =>
      `Action ${n(d.priority)}: ${d.title || 'action'} — could protect ${pkrShort(d.impact_pkr)}`,
    rationale: (d) => {
      // Gemini sometimes returns rationale wrapped in a ```json fenced block
      // containing {"rationale": "...", "recommended_actions": [...]} — peel
      // that off so the UI shows the prose, not the JSON.
      const text = typeof d === 'string' ? d : '';
      if (!text) return 'Rationale generated';
      const prose = extractRationaleProse(text);
      const trimmed = prose.length > 220 ? `${prose.slice(0, 220).trim()}…` : prose;
      return `Rationale: ${trimmed}`;
    },
    complete: (d) =>
      `${n(d.action_count)} action${n(d.action_count) === 1 ? '' : 's'} generated — estimated risk reduction ${pkrShort(
        d.total_impact_pkr,
      )}`,
  },

  execution_simulation: {
    started: (d) => `Simulating execution of all ${n(d.action_count)} actions`,
    initial_score: (d) =>
      `Initial state captured — score ${n(d.score)}, ${pkrShort(d.risk_pkr)} at risk`,
    simulated_action: (d) =>
      `Simulated: ${(d.title || 'action').slice(0, 60)} — compliance score +${n(
        d.score_delta,
      )}, risk recovered ${pkrShort(d.risk_reduction_pkr)}`,
    action_simulated: (d) =>
      `Simulated: ${d.action_title || d.title || 'action'} — compliance score +${n(d.score_delta)} points`,
    score_update: (d) =>
      `Compliance score updated: ${n(d.old_score)} → ${n(d.new_score)}`,
    complete: (d) =>
      `Simulation complete — score moved by +${n(d.score_delta ?? (d.final_score - d.initial_score))} points; ${pkrShort(
        d.risk_reduction_pkr ?? d.risk_saved,
      )} risk eliminated`,
  },

  recovery: {
    activated: (d) =>
      `Agent failure detected in ${d.failed_agent || 'unknown agent'} (${
        d.failure_type || 'unknown failure'
      }) — activating recovery`,
    recovery_triggered: (d) =>
      `Agent failure detected in ${d.agent_name || d.failed_agent || 'unknown agent'} — activating recovery`,
    fallback_artifact_generated: (d) =>
      `Recovery: produced fallback artifact ${d.document_id || ''}`.trim(),
    fallback_used: (d) =>
      `Recovery: using fallback method for ${d.action_title || 'action'}`,
    recovery_complete: (d) =>
      `Pipeline recovered — continuing with ${n(d.remaining_actions)} remaining action${
        n(d.remaining_actions) === 1 ? '' : 's'
      }`,
  },

  demo_controller: {
    failure_injection_requested: (d) =>
      `Demo: failure injection requested in ${d.target_agent || 'an agent'} (${
        d.failure_type || 'unknown failure'
      })`,
  },

  // Every agent may emit a synthetic `exception` step when wrap_with_recovery
  // catches a raised error. Format it without leaking the stack trace.
  __any__: {
    exception: (d, agent) => {
      const err = (d && d.error) ? String(d.error).split('\n')[0] : 'unknown error';
      return `${agent || 'Agent'} threw: ${err}`;
    },
    injected_failure: (d, agent) =>
      `${agent || 'Agent'} hit injected failure (${d.kind || 'unknown'})`,
  },
};

/**
 * Render a trace entry as a human-readable sentence.
 *
 * Behaviour contract: this function NEVER returns raw JSON. If an entry's
 * (agent, step) combo isn't in the formatter table, it falls back to a
 * humanised "Agent: <step>" string. Detail objects are interpolated into
 * pre-written templates only — they are never serialised whole.
 */
export function formatTraceEntry(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const { agent, step, detail } = entry;
  const agentTable = FORMATTERS[agent];
  if (agentTable && typeof agentTable[step] === 'function') {
    try {
      return agentTable[step](detail || {});
    } catch {
      /* fall through to defaults */
    }
  }
  // Cross-agent (exception, injected_failure) fallback.
  if (typeof FORMATTERS.__any__[step] === 'function') {
    try {
      return FORMATTERS.__any__[step](detail || {}, agent);
    } catch {
      /* fall through */
    }
  }
  // Last-resort: humanise the step name. Never expose JSON.
  const pretty = String(step || 'event').replace(/_/g, ' ');
  return `Agent: ${pretty}`;
}

/**
 * Title (label) for the agent that emitted this step. Used by the timeline
 * card heading when the formatter doesn't already include the agent name.
 */
export const AGENT_LABELS = {
  orchestrator: 'Orchestrator',
  regulation_ingestion: 'Regulation Parser',
  factory_profile: 'Factory Profile',
  gap_detection: 'Gap Detection',
  financial_impact: 'Financial Impact',
  action_chain: 'Action Chain',
  execution_simulation: 'Execution Simulator',
  recovery: 'Recovery Agent',
  demo_controller: 'Demo Controller',
};
