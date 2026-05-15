import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';

import { colors } from '../constants/colors';
import { subscribeReport, subscribeActions } from '../services/firebase';
import { api } from '../services/api';
import ActionItem from '../components/ActionItem';

export default function ActionCenterScreen({ route }) {
  const { factoryId } = route.params;
  const [report, setReport] = useState(null);
  const [liveActions, setLiveActions] = useState([]);
  const [busy, setBusy] = useState({});
  const [busyAll, setBusyAll] = useState(false);

  useEffect(() => {
    const u1 = subscribeReport(factoryId, setReport);
    const u2 = subscribeActions(factoryId, setLiveActions);
    return () => { u1 && u1(); u2 && u2(); };
  }, [factoryId]);

  // Merge: prefer per-action subcollection (real-time during simulation)
  const reportActions = report?.action_chain || [];
  const merged = reportActions.length ? reportActions.map((a) => {
    const live = liveActions.find((la) => la.action_id === a.action_id);
    return live ? { ...a, ...live } : a;
  }) : liveActions;

  const runSimulate = async (actionIds) => {
    try {
      const res = await api.simulate(factoryId, actionIds);
      Alert.alert(
        'Simulation complete',
        `Score: ${res.before_score} → ${res.after_score}\nRisk reduction: PKR ${Number(res.risk_reduction_pkr).toLocaleString()}`,
      );
    } catch (e) {
      Alert.alert('Simulation failed', String(e.message));
    }
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Action Center</Text>
      <Text style={styles.h2}>
        {merged.length} prioritised actions · agent-generated
      </Text>

      <TouchableOpacity
        style={[styles.allBtn, busyAll && { opacity: 0.5 }]}
        disabled={busyAll || merged.length === 0}
        onPress={async () => {
          setBusyAll(true);
          await runSimulate(merged.map((a) => a.action_id));
          setBusyAll(false);
        }}
      >
        <Text style={styles.allBtnText}>
          {busyAll ? 'Simulating all…' : `Simulate all ${merged.length} actions`}
        </Text>
      </TouchableOpacity>

      {merged.length === 0 && (
        <Text style={styles.empty}>
          No actions yet — run a Full Analysis from the Home screen and the Action Chain agent will populate this list.
        </Text>
      )}

      {merged.map((a) => (
        <ActionItem
          key={a.action_id}
          action={a}
          busy={!!busy[a.action_id]}
          onSimulate={async () => {
            setBusy((b) => ({ ...b, [a.action_id]: true }));
            await runSimulate([a.action_id]);
            setBusy((b) => ({ ...b, [a.action_id]: false }));
          }}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 80 },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
  h2: { color: colors.textDim, marginBottom: 14 },
  allBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 18,
  },
  allBtnText: { color: colors.bg, fontWeight: '700' },
  empty: { color: colors.textDim, fontStyle: 'italic', marginTop: 12 },
});
