import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  radii,
  shadow,
  spacing,
} from '../constants/colors';
import { subscribeReport } from '../services/firebase';
import { api } from '../services/api';
import { formatRelativeTime } from '../services/format';
import EmptyState from '../components/EmptyState';

// Each document `kind` is grouped under a section and rendered with a kind-
// specific icon. New kinds are auto-bucketed into "Other" so the screen
// degrades gracefully if the backend invents a new kind tomorrow.
const KIND_META = {
  CBAM_FORM:           { group: 'Compliance Forms',   emoji: '📄', icon: 'document-text', color: colors.compliant },
  CBAM_DECLARATION:    { group: 'Compliance Forms',   emoji: '📄', icon: 'document-text', color: colors.compliant },
  CERTIFICATION_APP:   { group: 'Compliance Forms',   emoji: '📜', icon: 'ribbon',        color: colors.primary },
  MSA_STATEMENT:       { group: 'Compliance Forms',   emoji: '📑', icon: 'document',      color: colors.primary },
  EMISSIONS_REPORT:    { group: 'Compliance Forms',   emoji: '🌱', icon: 'leaf',          color: colors.compliant },
  BUYER_EMAIL:         { group: 'Buyer Emails',       emoji: '📧', icon: 'mail',          color: colors.primary },
  AUDIT_CHECKLIST:     { group: 'Remediation Checklists', emoji: '✅', icon: 'list-circle', color: colors.warning },
  REMEDIATION_PLAN:    { group: 'Remediation Checklists', emoji: '🛠️', icon: 'construct',  color: colors.warning },
  BOOKING_TEMPLATE:    { group: 'Remediation Checklists', emoji: '🗓️', icon: 'calendar',   color: colors.warning },
};

const GROUP_ORDER = ['Compliance Forms', 'Buyer Emails', 'Remediation Checklists', 'Other'];

function metaFor(kind) {
  return KIND_META[kind] || { group: 'Other', emoji: '📄', icon: 'document', color: colors.textDim };
}

function approxSize(body) {
  if (!body) return '—';
  const bytes = new TextEncoder().encode(body).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function DocumentVaultScreen({ route }) {
  const { factoryId } = route.params;
  const [report, setReport] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const u = subscribeReport(factoryId, setReport);
    return () => u && u();
  }, [factoryId]);

  const docs = report?.documents || [];

  const grouped = useMemo(() => {
    const out = {};
    for (const d of docs) {
      const m = metaFor(d.kind);
      out[m.group] = out[m.group] || [];
      out[m.group].push({ ...d, _meta: m });
    }
    return out;
  }, [docs]);

  const totalSize = useMemo(
    () => docs.reduce((acc, d) => acc + (d.body ? new TextEncoder().encode(d.body).length : 0), 0),
    [docs],
  );

  if (docs.length === 0) {
    return (
      <View style={styles.bg}>
        <EmptyState
          emoji="📁"
          title="No documents yet"
          message="When you run a full analysis, the Execution Simulator generates buyer emails, CBAM declarations, and remediation checklists — all listed here."
          cta={{
            label: 'Run Analysis',
            icon: 'play',
            onPress: async () => {
              try {
                const r = await api.analyze(factoryId);
                Alert.alert('Analysis started', `Job ${r.job_id}`);
              } catch (e) {
                Alert.alert('Could not start', String(e.message));
              }
            },
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Document Vault</Text>
          <Text style={styles.h2}>
            {docs.length} artifact{docs.length === 1 ? '' : 's'} · {(totalSize / 1024).toFixed(1)} KB total
          </Text>
        </View>
        <View style={styles.counter}>
          <Ionicons name="folder-open" size={20} color={colors.primary} />
          <Text style={styles.counterValue}>{docs.length}</Text>
        </View>
      </View>

      {GROUP_ORDER.filter((g) => grouped[g]?.length).map((groupName) => (
        <View key={groupName} style={{ marginBottom: spacing.lg }}>
          <Text style={styles.section}>
            {groupName} <Text style={styles.sectionCount}>({grouped[groupName].length})</Text>
          </Text>
          {grouped[groupName].map((d, i) => {
            const isOpen = open === (d.document_id || `${groupName}-${i}`);
            const m = d._meta;
            return (
              <TouchableOpacity
                key={d.document_id || i}
                style={styles.card}
                onPress={() => setOpen(isOpen ? null : (d.document_id || `${groupName}-${i}`))}
                activeOpacity={0.85}
              >
                <View style={styles.cardHead}>
                  <View style={[styles.iconCircle, { backgroundColor: m.color + '22' }]}>
                    <Text style={styles.iconEmoji}>{m.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{d.title || d.kind}</Text>
                    <View style={styles.cardMetaRow}>
                      <Text style={[styles.cardKind, { color: m.color }]}>{d.kind}</Text>
                      <Text style={styles.cardMetaDot}>·</Text>
                      <Text style={styles.cardMeta}>{approxSize(d.body)}</Text>
                      {d.generated_at && (
                        <>
                          <Text style={styles.cardMetaDot}>·</Text>
                          <Text style={styles.cardMeta}>{formatRelativeTime(d.generated_at)}</Text>
                        </>
                      )}
                    </View>
                  </View>
                  <View style={[styles.viewBtn, isOpen && styles.viewBtnActive]}>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'eye'}
                      size={14}
                      color={isOpen ? colors.bg : colors.primary}
                    />
                    <Text style={[styles.viewBtnText, isOpen && { color: colors.bg }]}>
                      {isOpen ? 'Close' : 'View'}
                    </Text>
                  </View>
                </View>
                {isOpen && d.body && (
                  <View style={styles.body}>
                    <Text style={styles.bodyText}>{d.body}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 80 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  counterValue: { color: colors.primary, fontWeight: '800', fontSize: 14, marginLeft: 6 },

  section: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  sectionCount: { color: colors.textMuted, fontWeight: '700' },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconEmoji: { fontSize: 20 },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  cardKind: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  cardMetaDot: { color: colors.textMuted, marginHorizontal: 6 },
  cardMeta: { color: colors.textDim, fontSize: 11 },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    marginLeft: 8,
  },
  viewBtnActive: { backgroundColor: colors.primary },
  viewBtnText: { color: colors.primary, fontWeight: '800', fontSize: 11, marginLeft: 4 },

  body: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  bodyText: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
  },
});
