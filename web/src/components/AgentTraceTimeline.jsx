import { useState, useMemo } from 'react';
import { Icon } from './Icon.jsx';
import { formatTraceEntry, AGENT_LABELS } from '../utils/traceFormatter';

// Groups trace entries by agent and renders each as an expandable card.
export default function AgentTraceTimeline({ trace, running }) {
  const grouped = useMemo(() => {
    const byAgent = new Map();
    if (Array.isArray(trace)) {
      for (const entry of trace) {
        const key = entry.agent || 'unknown';
        if (!byAgent.has(key)) byAgent.set(key, []);
        byAgent.get(key).push(entry);
      }
    }
    return Array.from(byAgent.entries());
  }, [trace]);

  const [open, setOpen] = useState(() => new Set(['orchestrator']));

  function toggle(agent) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(agent)) next.delete(agent);
      else next.add(agent);
      return next;
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(trace || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-trace.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!grouped.length) {
    return (
      <div className="empty-state">
        No agent trace yet. Tap <strong>Run Analysis</strong> on the dashboard to start the pipeline.
      </div>
    );
  }

  return (
    <>
      <div className="trace-list">
        {grouped.map(([agent, entries]) => {
          const lastStep = entries[entries.length - 1]?.step;
          let status = 'running';
          if (lastStep === 'complete' || lastStep === 'pipeline_complete') status = 'done';
          else if (entries.some((e) => e.step === 'exception')) status = 'failed';
          else if (!running && lastStep !== 'complete') status = 'done';
          const isOpen = open.has(agent);
          const firstTs = entries[0]?.ts;
          const lastTs = entries[entries.length - 1]?.ts;
          return (
            <div className="trace-card" key={agent}>
              <div className="trace-head" onClick={() => toggle(agent)}>
                <div className="trace-title-row">
                  <span className={`trace-status ${status}`} />
                  <span className="trace-agent">{AGENT_LABELS[agent] || agent}</span>
                  <span className="trace-meta">{entries.length} step{entries.length === 1 ? '' : 's'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {firstTs && <span className="trace-meta">{new Date(firstTs).toLocaleTimeString()}</span>}
                  <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} color="#9BA3AF" />
                </div>
              </div>
              {isOpen && (
                <div className="trace-steps">
                  {entries.map((entry, i) => (
                    <div className="trace-step" key={`${entry.step}-${i}`}>
                      {entry.ts && (
                        <span className="ts">
                          {new Date(entry.ts).toLocaleTimeString()} · {entry.step.replace(/_/g, ' ')}
                        </span>
                      )}
                      {formatTraceEntry(entry)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button className="btn small" onClick={exportJson}>
          <Icon name="download" size={12} />
          Export Trace as JSON
        </button>
      </div>
    </>
  );
}
