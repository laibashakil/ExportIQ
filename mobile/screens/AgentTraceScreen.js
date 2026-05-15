import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';

import { colors } from '../constants/colors';
import { db, subscribeJob } from '../services/firebase';
import { collection, getDocs, orderBy, query, where, limit } from 'firebase/firestore';
import { api } from '../services/api';
import AgentStatusBar from '../components/AgentStatusBar';

const AGENT_LABEL = {
  orchestrator: 'Orchestrator',
  regulation_ingestion: 'Regulation',
  factory_profile: 'Factory Profile',
  gap_detection: 'Gap Detection',
  financial_impact: 'Financial Impact',
  action_chain: 'Action Chain',
  execution_simulation: 'Execution',
  recovery: 'Recovery',
  demo_controller: 'Demo Control',
};

const AGENT_COLOR = {
  orchestrator: colors.primary,
  regulation_ingestion: '#8AB6FF',
  factory_profile: '#A78BFA',
  gap_detection: colors.warning,
  financial_impact: '#67E8F9',
  action_chain: '#FBCFE8',
  execution_simulation: colors.compliant,
  recovery: colors.critical,
  demo_controller: colors.textDim,
};

export default function AgentTraceScreen({ route }) {
  const { factoryId } = route.params;
  const [latestJobId, setLatestJobId] = useState(null);
  const [job, setJob] = useState(null);

  // Find the most recent job for this factory (best-effort; falls back to any
  // job already streamed via state.params if Firestore query is unavailable).
  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db(), 'jobs'),
          where('factory_id', '==', factoryId),
          orderBy('started_at', 'desc'),
          limit(1),
        );
        const snap = await getDocs(q);
        snap.forEach((d) => setLatestJobId(d.id));
      } catch (e) {
        console.warn('jobs query failed', e);
      }
    })();
  }, [factoryId]);

  useEffect(() => {
    if (!latestJobId) return;
    const u = subscribeJob(latestJobId, setJob);
    return () => u && u();
  }, [latestJobId]);

  const trace = job?.agent_trace || [];
  const progress = job?.progress || 0;
  const current = job?.current_agent;

  const injectFailure = async () => {
    if (!latestJobId) return Alert.alert('No active job to inject into');
    try {
      const res = await api.failureTest(latestJobId, 'execution_simulation', 'api_timeout');
      Alert.alert('Failure injected',
        `Recovery agent pipeline started: ${res.recovery_job_id}`);
      setLatestJobId(res.recovery_job_id);
    } catch (e) {
      Alert.alert('Failure injection failed', String(e.message));
    }
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Agent Trace</Text>
      <Text style={styles.h2}>
        {latestJobId ? `Job: ${latestJobId}` : 'No active job — run Analysis from Home'}
      </Text>

      <AgentStatusBar currentAgent={current} progress={progress} />

      <TouchableOpacity style={styles.failBtn} onPress={injectFailure}>
        <Text style={styles.failBtnText}>⚠ Inject failure (demo)</Text>
      </TouchableOpacity>

      <View style={styles.timeline}>
        {trace.length === 0 && (
          <Text style={styles.empty}>Waiting for the orchestrator to emit reasoning steps…</Text>
        )}
        {trace.map((step, i) => {
          const c = AGENT_COLOR[step.agent] || colors.textDim;
          return (
            <View key={i} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: c }]} />
              <View style={styles.body}>
                <Text style={[styles.agent, { color: c }]}>
                  {AGENT_LABEL[step.agent] || step.agent}
                </Text>
                <Text style={styles.step}>{step.step}</Text>
                {step.detail && (
                  <Text style={styles.detail}>
                    {typeof step.detail === 'string'
                      ? step.detail
                      : JSON.stringify(step.detail, null, 2)}
                  </Text>
                )}
                {step.ts && <Text style={styles.ts}>{step.ts.split('T')[1]?.slice(0, 8)}</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 80 },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
  h2: { color: colors.textDim, marginBottom: 14, fontSize: 12, fontFamily: 'monospace' },
  failBtn: {
    backgroundColor: colors.critical + '22',
    borderColor: colors.critical,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginVertical: 14,
  },
  failBtnText: { color: colors.critical, fontWeight: '700' },
  timeline: { marginTop: 6 },
  empty: { color: colors.textDim, fontStyle: 'italic' },
  row: { flexDirection: 'row', marginBottom: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 12 },
  body: { flex: 1 },
  agent: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  step: { color: colors.text, marginTop: 2, fontWeight: '600' },
  detail: {
    color: colors.textDim,
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  ts: { color: colors.textDim, fontSize: 10, marginTop: 4 },
});
