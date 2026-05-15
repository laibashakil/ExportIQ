import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors } from '../constants/colors';

export default function ContradictionAlert({ contradiction }) {
  if (!contradiction) return null;
  const pct = Math.round((contradiction.confidence || 0) * 100);
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.tag}>CONTRADICTION</Text>
        <Text style={styles.confidence}>{pct}% confidence</Text>
      </View>
      <Text style={styles.claim}>{contradiction.claim}</Text>
      <Text style={styles.versus}>vs</Text>
      <Text style={styles.evidence}>{contradiction.evidence}</Text>
      <View style={styles.sourceRow}>
        <Text style={styles.sourceLabel}>Sources:</Text>
        <Text style={styles.source} numberOfLines={1}>{contradiction.source_a}</Text>
        <Text style={styles.source} numberOfLines={1}>{contradiction.source_b}</Text>
      </View>
      {contradiction.impact ? (
        <Text style={styles.impact}>{contradiction.impact}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAlt,
    borderLeftWidth: 4,
    borderLeftColor: colors.critical,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  tag: { color: colors.critical, fontWeight: '800', letterSpacing: 1, fontSize: 11 },
  confidence: { color: colors.textDim, fontSize: 11 },
  claim: { color: colors.text, fontWeight: '600', marginBottom: 6 },
  versus: { color: colors.textDim, fontSize: 11, fontStyle: 'italic', marginVertical: 2 },
  evidence: { color: colors.text, marginBottom: 8 },
  sourceRow: { marginTop: 4 },
  sourceLabel: { color: colors.textDim, fontSize: 11, marginBottom: 2 },
  source: { color: colors.primary, fontSize: 12, fontFamily: 'monospace' },
  impact: { color: colors.warning, fontSize: 12, marginTop: 8, fontStyle: 'italic' },
});
