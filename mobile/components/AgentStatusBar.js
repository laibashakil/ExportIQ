import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors } from '../constants/colors';

const AGENTS = [
  { key: 'regulation_ingestion', label: 'Reg' },
  { key: 'factory_profile', label: 'Factory' },
  { key: 'gap_detection', label: 'Gaps' },
  { key: 'financial_impact', label: 'PKR' },
  { key: 'action_chain', label: 'Actions' },
  { key: 'execution_simulation', label: 'Sim' },
];

export default function AgentStatusBar({ currentAgent, progress = 0 }) {
  const currentIdx = AGENTS.findIndex((a) => a.key === currentAgent);
  return (
    <View style={styles.wrap}>
      <View style={styles.barOuter}>
        <View style={[styles.barInner, { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
      </View>
      <View style={styles.row}>
        {AGENTS.map((a, i) => {
          const done = currentIdx > i || progress >= 100;
          const active = i === currentIdx;
          const color = done ? colors.compliant : active ? colors.primary : colors.textDim;
          return (
            <View key={a.key} style={styles.cell}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={[styles.label, { color }]}>{a.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  barOuter: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barInner: { height: 4, backgroundColor: colors.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 4 },
  label: { fontSize: 10, fontWeight: '700' },
});
