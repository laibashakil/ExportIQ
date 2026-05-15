import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

import { colors } from '../constants/colors';
import { subscribeReport } from '../services/firebase';

const KIND_COLOR = {
  CBAM_FORM: colors.compliant,
  BUYER_EMAIL: colors.primary,
  AUDIT_CHECKLIST: colors.warning,
  REMEDIATION_PLAN: colors.critical,
  CERTIFICATION_APP: colors.primary,
};

export default function DocumentVaultScreen({ route }) {
  const { factoryId } = route.params;
  const [report, setReport] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const u = subscribeReport(factoryId, setReport);
    return () => u && u();
  }, [factoryId]);

  const docs = report?.documents || [];
  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Document Vault</Text>
      <Text style={styles.h2}>{docs.length} agent-generated artifacts</Text>
      {docs.length === 0 && (
        <Text style={styles.empty}>
          No documents yet — once the Execution Simulator runs, buyer emails, CBAM forms, and remediation checklists land here.
        </Text>
      )}
      {docs.map((d, i) => {
        const isOpen = open === d.document_id;
        const c = KIND_COLOR[d.kind] || colors.textDim;
        return (
          <TouchableOpacity
            key={d.document_id || i}
            style={[styles.card, { borderLeftColor: c }]}
            onPress={() => setOpen(isOpen ? null : d.document_id)}
            activeOpacity={0.7}
          >
            <View style={styles.head}>
              <Text style={[styles.kind, { color: c }]}>{d.kind}</Text>
              <Text style={styles.title}>{d.title}</Text>
            </View>
            {isOpen && (
              <Text style={styles.body}>{d.body}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 80 },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
  h2: { color: colors.textDim, marginBottom: 14 },
  empty: { color: colors.textDim, fontStyle: 'italic', marginTop: 12 },
  card: {
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  kind: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginRight: 10,
    minWidth: 110,
  },
  title: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '600' },
  body: {
    color: colors.textDim,
    marginTop: 10,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
