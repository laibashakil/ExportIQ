// Web port of mobile/components/InteractiveChecklist.js. Parses a markdown
// numbered list out of an AUDIT_CHECKLIST document body, seeds it into
// Firestore the first time it's opened, and renders interactive checkboxes
// that update Firestore in real time. When all items are checked it fires
// onAllComplete so the parent can trigger the Stage 2 audit-ready email.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import {
  subscribeChecklistItems,
  seedChecklistItems,
  toggleChecklistItem,
} from '../services/firebase';
import Markdown, { renderInline } from './Markdown.jsx';

function detectTemplateKind(label) {
  const l = label.toLowerCase();
  if (l.includes('csddd') && l.includes('report')) return 'CSDDD_DUE_DILIGENCE_REPORT';
  if (l.includes('modern slavery') || l.includes('msa')) return 'MSA_STATEMENT';
  if (l.includes('csddd') || l.includes('due diligence') || l.includes('supply chain narrative')) {
    return 'CSDDD_NARRATIVE';
  }
  if (l.includes('emission')) return 'EMISSIONS_REPORT';
  if (l.includes('audit checklist')) return 'AUDIT_CHECKLIST';
  if (l.includes('certification application') || (l.includes('sa8000') && l.includes('apply'))) {
    return 'CERTIFICATION_APP';
  }
  return null;
}

function parseChecklistBody(body) {
  const text = String(body || '');
  const lines = text.split('\n');
  const items = [];
  const numbered = /^\s*\d+[.)]\s*(.+)$/;
  const bullet = /^\s*[-*]\s*(.+)$/;
  for (const line of lines) {
    let m = line.match(numbered);
    if (!m) m = line.match(bullet);
    if (!m) continue;
    const label = m[1].trim();
    if (label.length < 4) continue;
    items.push({ label, template_kind: detectTemplateKind(label) });
  }
  return items;
}

const TEMPLATE_LABELS = {
  CSDDD_DUE_DILIGENCE_REPORT: 'CSDDD Report',
  MSA_STATEMENT: 'MSA Statement',
  CSDDD_NARRATIVE: 'CSDDD Narrative',
  EMISSIONS_REPORT: 'Supply Chain Transparency Report',
  AUDIT_CHECKLIST: 'Audit Checklist',
  CERTIFICATION_APP: 'Certification Form',
};

export default function InteractiveChecklist({
  factoryId,
  checklistId,
  body,
  documents = [],
  onAllComplete,
}) {
  const [items, setItems] = useState([]);
  const [seeded, setSeeded] = useState(false);
  const [openTemplate, setOpenTemplate] = useState(null);
  const completeFiredRef = useRef(false);

  useEffect(() => {
    if (!factoryId || !checklistId || seeded) return;
    const parsed = parseChecklistBody(body);
    if (parsed.length === 0) {
      setSeeded(true);
      return;
    }
    seedChecklistItems(factoryId, checklistId, parsed)
      .catch(() => null)
      .finally(() => setSeeded(true));
  }, [factoryId, checklistId, body, seeded]);

  useEffect(() => {
    if (!factoryId || !checklistId) return undefined;
    const unsub = subscribeChecklistItems(factoryId, checklistId, (live) => {
      const sorted = [...live].sort((a, b) => Number(a.id) - Number(b.id));
      setItems(sorted);
    });
    return () => unsub && unsub();
  }, [factoryId, checklistId]);

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const allDone = total > 0 && done === total;
  const progressPct = total ? Math.round((done / total) * 100) : 0;

  useEffect(() => {
    if (allDone && !completeFiredRef.current && onAllComplete) {
      completeFiredRef.current = true;
      onAllComplete();
    }
    if (!allDone) {
      completeFiredRef.current = false;
    }
  }, [allDone, onAllComplete]);

  const findTemplate = useMemo(
    () => (kind) => documents.find((d) => d.kind === kind),
    [documents],
  );

  const onToggle = async (item) => {
    try {
      await toggleChecklistItem(factoryId, checklistId, item.id, !item.done);
    } catch (e) {
      console.warn('toggle checklist item failed', e);
    }
  };

  if (!seeded && items.length === 0) {
    return <div className="checklist-empty">Preparing checklist…</div>;
  }
  if (items.length === 0) {
    return <div className="checklist-empty">This checklist is empty.</div>;
  }

  return (
    <div className="checklist">
      <div className="checklist-progress">
        <div className="checklist-progress-label">
          {done} of {total} items complete
        </div>
        <div className="checklist-track">
          <div className="checklist-bar" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <ul className="checklist-list">
        {items.map((it) => {
          const template = it.template_kind ? findTemplate(it.template_kind) : null;
          const tplLabel = TEMPLATE_LABELS[it.template_kind] || 'Template';
          const isOpen = openTemplate === it.id;
          return (
            <li key={it.id} className="checklist-item">
              <button
                type="button"
                className={`checklist-checkbox ${it.done ? 'done' : ''}`}
                onClick={() => onToggle(it)}
                aria-label={it.done ? 'Mark incomplete' : 'Mark complete'}
              >
                {it.done ? <Icon name="check" size={14} color="#00D4AA" /> : null}
              </button>
              <div className="checklist-item-body">
                <div className={`checklist-label ${it.done ? 'done' : ''}`}>{renderInline(it.label)}</div>
                {template && (
                  <button
                    type="button"
                    className="checklist-template-btn"
                    onClick={() => setOpenTemplate(isOpen ? null : it.id)}
                  >
                    <Icon
                      name={isOpen ? 'chevron-down' : 'download'}
                      size={11}
                      color="#00D4AA"
                    />{' '}
                    {isOpen ? 'Hide template' : `Open ${tplLabel}`}
                  </button>
                )}
                {isOpen && template && (
                  <div className="checklist-template-body">
                    <Markdown>{String(template.body || '').slice(0, 4000)}</Markdown>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <div className="checklist-celebrate">
          <Icon name="check" size={16} color="#00D4AA" />
          <span>
            All audit items complete. A buyer-facing "Audit Ready" email has been
            generated for each affected buyer in the Ready to Send section.
          </span>
        </div>
      )}
    </div>
  );
}
