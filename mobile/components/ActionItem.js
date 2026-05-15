import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';

import { colors } from '../constants/colors';

const EFFORT_COLOR = {
  LOW: colors.compliant,
  MEDIUM: colors.warning,
  HIGH: colors.critical,
};

export default function ActionItem({ action, onSimulate, busy }) {
  const eff = EFFORT_COLOR[action.effort] || colors.textDim;
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.priority}>#{action.priority}</Text>
        <Text style={styles.title}>{action.title}</Text>
      </View>
      <Text style={styles.desc}>{action.description}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.metaPill, { color: eff, borderColor: eff }]}>{action.effort}</Text>
        <Text style={styles.metaText}>
          Deadline: <Text style={{ color: colors.text }}>{action.deadline || '—'}</Text>
        </Text>
      </View>
      <Text style={styles.impact}>
        Impact: PKR {Number(action.impact_pkr || 0).toLocaleString()}
      </Text>
      {action.status === 'SIMULATED' && action.simulation_output && (
        <Text style={styles.simResult}>
          ▲ score +{action.simulation_output.score_delta} · risk −PKR{' '}
          {Number(action.simulation_output.risk_reduction_pkr).toLocaleString()}
        </Text>
      )}
      <TouchableOpacity
        onPress={onSimulate}
        disabled={busy}
        style={[styles.btn, busy && { opacity: 0.5 }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.btnText}>
            {action.status === 'SIMULATED' ? 'Re-simulate' : 'Simulate'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  priority: { color: colors.primary, fontWeight: '800', marginRight: 8 },
  title: { color: colors.text, fontWeight: '700', flex: 1, fontSize: 16 },
  desc: { color: colors.textDim, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  metaPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
    marginRight: 10,
  },
  metaText: { color: colors.textDim, fontSize: 12 },
  impact: { color: colors.text, fontSize: 13, marginBottom: 10 },
  simResult: { color: colors.compliant, fontSize: 12, marginBottom: 10, fontWeight: '600' },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnText: { color: colors.bg, fontWeight: '700' },
});
