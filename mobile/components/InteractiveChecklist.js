import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, shadow } from '../constants/colors';
import {
  subscribeChecklistItems,
  seedChecklistItems,
  toggleChecklistItem,
} from '../services/firebase';
import { api } from '../services/api';

// Parse a markdown numbered list ("1. ...", "2. ...") into structured items.
// Falls back to dash-prefixed lines if no numbered list is found. Lines
// shorter than 4 chars are ignored.
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

function detectTemplateKind(label) {
  const l = label.toLowerCase();
  if (l.includes('modern slavery') || l.includes('msa')) return 'MSA_STATEMENT';
  if (
    l.includes('csddd') ||
    l.includes('due diligence') ||
    l.includes('supply chain narrative')
  ) {
    return 'CSDDD_NARRATIVE';
  }
  if (l.includes('audit checklist')) return 'AUDIT_CHECKLIST';
  if (l.includes('certification application') || l.includes('sa8000') && l.includes('apply')) {
    return 'CERTIFICATION_APP';
  }
  return null;
}

const TEMPLATE_LABELS = {
  MSA_STATEMENT: 'MSA Statement',
  CSDDD_NARRATIVE: 'CSDDD Narrative',
  AUDIT_CHECKLIST: 'Audit Checklist',
  CERTIFICATION_APP: 'Certification Form',
};

/**
 * Interactive remediation checklist.
 *
 * Props:
 *   factoryId
 *   checklistId   stable id for this checklist (the document_id of the
 *                 generated checklist doc is a good default)
 *   body          raw markdown body — used to seed items on first open
 *   documents     full report.documents array — used to find linked templates
 *   onAllComplete optional — fires once when the last unchecked item flips
 *                 to done (e.g. to trigger Stage 2 audit-ready email)
 */
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
  const allCompleteFiredRef = React.useRef(false);

  // Seed items into Firestore once. If they already exist there, the seed
  // is a no-op and subscribeChecklistItems delivers the persisted state.
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
    if (!factoryId || !checklistId) return;
    const unsub = subscribeChecklistItems(factoryId, checklistId, (live) => {
      // Sort by numeric id ascending so the list order is stable.
      const sorted = [...live].sort((a, b) => Number(a.id) - Number(b.id));
      setItems(sorted);
    });
    return () => unsub && unsub();
  }, [factoryId, checklistId]);

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const allDone = total > 0 && done === total;

  useEffect(() => {
    if (allDone && !allCompleteFiredRef.current && onAllComplete) {
      allCompleteFiredRef.current = true;
      onAllComplete();
    }
    if (!allDone) {
      allCompleteFiredRef.current = false;
    }
  }, [allDone, onAllComplete]);

  const findTemplate = (kind) => documents.find((d) => d.kind === kind);

  const onToggle = async (item) => {
    try {
      await toggleChecklistItem(factoryId, checklistId, item.id, !item.done);
    } catch (e) {
      Alert.alert('Could not save', String(e.message));
    }
  };

  if (!seeded && items.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.dimText}>Preparing checklist…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.dimText}>This checklist is empty.</Text>
      </View>
    );
  }

  const progressPct = total ? Math.round((done / total) * 100) : 0;

  return (
    <View>
      <View style={styles.progressWrap}>
        <Text style={styles.progressLabel}>
          {done} of {total} items complete
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPct}%` }]} />
        </View>
      </View>

      {items.map((it) => {
        const template = it.template_kind ? findTemplate(it.template_kind) : null;
        const tplLabel = TEMPLATE_LABELS[it.template_kind] || 'Template';
        const isOpen = openTemplate === it.id;
        return (
          <View key={it.id} style={styles.row}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => onToggle(it)}
              activeOpacity={0.7}
              accessibilityLabel={it.done ? 'Mark incomplete' : 'Mark complete'}
            >
              <Ionicons
                name={it.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={26}
                color={it.done ? colors.primary : colors.textDim}
              />
            </TouchableOpacity>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[
                  styles.label,
                  it.done && styles.labelDone,
                ]}
              >
                {it.label}
              </Text>
              {template && (
                <TouchableOpacity
                  style={styles.tplBtn}
                  onPress={() => setOpenTemplate(isOpen ? null : it.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'download-outline'}
                    size={13}
                    color={colors.primary}
                  />
                  <Text style={styles.tplBtnText}>
                    {isOpen ? 'Hide template' : `Open ${tplLabel}`}
                  </Text>
                </TouchableOpacity>
              )}
              {isOpen && template && (
                <View style={styles.tplBody}>
                  <Text style={styles.tplBodyText} numberOfLines={20}>
                    {String(template.body || '').slice(0, 1500)}
                    {(template.body || '').length > 1500 ? '…' : ''}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {allDone && (
        <View style={styles.celebrate}>
          <Ionicons name="ribbon" size={20} color={colors.primary} />
          <Text style={styles.celebrateText}>
            All audit items complete. A buyer-facing "Audit Ready" email has been
            generated for each affected buyer in your Documents tab.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { paddingVertical: spacing.lg, alignItems: 'center' },
  dimText: { color: colors.textDim, fontSize: 13 },

  progressWrap: { marginBottom: spacing.md },
  progressLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  checkbox: {
    marginRight: 12,
    paddingTop: 1,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  labelDone: {
    color: colors.textDim,
    textDecorationLine: 'line-through',
  },

  tplBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  tplBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12, marginLeft: 6 },
  tplBody: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: 10,
    marginTop: 8,
  },
  tplBodyText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },

  celebrate: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  celebrateText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 10,
    flex: 1,
  },
});
