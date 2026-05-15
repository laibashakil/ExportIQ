import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  radii,
  shadow,
  spacing,
} from '../constants/colors';
import { db, subscribeJob } from '../services/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { api } from '../services/api';
import { formatRelativeTime } from '../services/format';
import EmptyState from '../components/EmptyState';

// Canonical pipeline order. The execution trace contains arbitrary entries
// for each agent; we use this list to render a clean fixed-step timeline.
const PIPELINE = [
  { key: 'orchestrator',        label: 'Orchestrator',     icon: 'flash' },
  { key: 'regulation_ingestion', label: 'Regulation Parser', icon: 'document-text' },
  { key: 'factory_profile',     label: 'Factory Profile',  icon: 'business' },
  { key: 'gap_detection',       label: 'Gap Detection',    icon: 'search' },
  { key: 'financial_impact',    label: 'Financial Impact', icon: 'cash' },
  { key: 'action_chain',        label: 'Action Chain',     icon: 'list' },
  { key: 'execution_simulation', label: 'Execution Sim',   icon: 'play-circle' },
];

export default function AgentTraceScreen({ route }) {
  const { factoryId } = route.params;
  const [latestJobId, setLatestJobId] = useState(null);
  const [job, setJob] = useState(null);

  // Find the most recent job for this factory (single-field where + JS sort,
  // so no composite index is required).
  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db(), 'jobs'),
          where('factory_id', '==', factoryId),
        );
        const snap = await getDocs(q);
        const jobs = [];
        snap.forEach((d) => jobs.push({ id: d.id, ...d.data() }));
        jobs.sort((a, b) =>
          (b.started_at || '').localeCompare(a.started_at || ''),
        );
        if (jobs[0]) setLatestJobId(jobs[0].id);
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
  const status = job?.status || 'idle';

  // For each pipeline step, find its latest trace entry. Status is derived:
  //   - if step matches `current` and pipeline is running -> 'active'
  //   - else if step has a 'complete' entry -> 'done'
  //   - else if step has an 'exception' entry -> 'failed'
  //   - else if step has 'activated' from recovery agent -> 'recovering'
  //   - else if pipeline is past this step -> 'done'
  //   - else 'pending'
  const stepState = useMemo(() => {
    const byAgent = {};
    for (const t of trace) {
      if (!t.agent) continue;
      byAgent[t.agent] = byAgent[t.agent] || [];
      byAgent[t.agent].push(t);
    }
    return PIPELINE.map((p) => {
      const entries = byAgent[p.key] || [];
      const hasException = entries.some((e) => e.step === 'exception');
      const hasComplete = entries.some((e) => e.step === 'complete');
      const isActive = status === 'running' && current === p.key;
      let state = 'pending';
      if (hasException) state = 'failed';
      else if (isActive) state = 'active';
      else if (hasComplete) state = 'done';
      else if (entries.length > 0) state = 'active';
      const recoveryActive = byAgent['recovery']?.some((e) => e.step === 'activated')
        && entries.some((e) => e.step === 'exception');
      if (recoveryActive && state === 'failed') state = 'recovering';
      return { ...p, entries, state };
    });
  }, [trace, status, current]);

  const injectFailure = async () => {
    if (!latestJobId) return Alert.alert('No active job to inject into');
    try {
      const res = await api.failureTest(latestJobId, 'execution_simulation', 'api_timeout');
      Alert.alert(
        'Failure injection started',
        `Recovery pipeline: ${res.recovery_job_id}`,
      );
      setLatestJobId(res.recovery_job_id);
    } catch (e) {
      Alert.alert('Could not inject failure', String(e.message));
    }
  };

  if (!latestJobId) {
    return (
      <View style={styles.bg}>
        <EmptyState
          emoji="🤖"
          title="No analysis run yet"
          message="Run a compliance analysis from the Home screen to see the 6-agent pipeline trace stream live here."
          cta={{
            label: 'Run Analysis',
            icon: 'play',
            onPress: async () => {
              try {
                const r = await api.analyze(factoryId);
                Alert.alert('Analysis started', `Job ${r.job_id}`);
                setLatestJobId(r.job_id);
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
    <View style={styles.bg}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Job header */}
        <View style={styles.jobCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.jobLabel}>JOB</Text>
            <Text style={styles.jobId}>{latestJobId}</Text>
            <Text style={styles.jobSub}>
              Started {formatRelativeTime(job?.started_at)} · {trace.length} reasoning steps
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor:
                  status === 'complete'
                    ? colors.primarySoft
                    : status === 'failed'
                    ? colors.criticalSoft
                    : colors.warningSoft,
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    status === 'complete'
                      ? colors.primary
                      : status === 'failed'
                      ? colors.critical
                      : colors.warning,
                },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    status === 'complete'
                      ? colors.primary
                      : status === 'failed'
                      ? colors.critical
                      : colors.warning,
                },
              ]}
            >
              {status === 'running' ? `${progress}%` : status.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Pipeline vertical timeline */}
        <Text style={styles.section}>Agent Pipeline</Text>
        <View style={styles.timeline}>
          {stepState.map((step, i) => (
            <TimelineStep
              key={step.key}
              step={step}
              isLast={i === stepState.length - 1}
            />
          ))}
        </View>

        {/* Inject failure tool */}
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={injectFailure}
          activeOpacity={0.85}
        >
          <View style={styles.toolBtnLeft}>
            <Ionicons name="bug" size={18} color={colors.warning} />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.toolBtnTitle}>Demo: Inject Failure</Text>
              <Text style={styles.toolBtnSub}>
                Force execution_simulation to fail · watch recovery activate
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function TimelineStep({ step, isLast }) {
  const { state, label, icon, entries } = step;
  const [expanded, setExpanded] = React.useState(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'active') {
      pulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.in(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state]);

  const cfg = STATE_CONFIG[state];
  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  const lastEntry = entries[entries.length - 1];
  const lastTs = lastEntry?.ts ? lastEntry.ts.split('T')[1]?.slice(0, 8) : null;

  return (
    <View style={styles.stepRow}>
      {/* Left rail: node + connector */}
      <View style={styles.rail}>
        <View style={[styles.node, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
          {state === 'active' && (
            <Animated.View
              style={[
                styles.pulse,
                {
                  backgroundColor: cfg.color,
                  transform: [{ scale: pulseScale }],
                  opacity: pulseOpacity,
                },
              ]}
            />
          )}
          <Ionicons name={cfg.icon} size={14} color={cfg.color} />
        </View>
        {!isLast && (
          <View
            style={[
              styles.connector,
              {
                backgroundColor:
                  state === 'done' || state === 'recovering' ? colors.primary : colors.border,
              },
            ]}
          />
        )}
      </View>

      {/* Right side: card */}
      <TouchableOpacity
        onPress={() => entries.length && setExpanded((v) => !v)}
        style={[styles.stepCard, state === 'active' && styles.stepCardActive]}
        activeOpacity={entries.length ? 0.8 : 1}
      >
        <View style={styles.stepHead}>
          <Ionicons name={icon} size={14} color={colors.textDim} />
          <Text style={styles.stepLabel}>{label}</Text>
          <Text style={[styles.stepState, { color: cfg.color }]}>{cfg.text}</Text>
        </View>
        {lastTs && (
          <Text style={styles.stepTs}>
            <Ionicons name="time" size={10} color={colors.textMuted} /> {lastTs} · {entries.length} step{entries.length === 1 ? '' : 's'}
          </Text>
        )}
        {expanded && entries.length > 0 && (
          <View style={styles.expand}>
            {entries.slice(-6).map((e, i) => (
              <View key={i} style={styles.traceLine}>
                <Text style={styles.traceLineStep}>{e.step}</Text>
                {e.detail && (
                  <Text style={styles.traceLineDetail} numberOfLines={3}>
                    {typeof e.detail === 'string'
                      ? e.detail
                      : JSON.stringify(e.detail).slice(0, 200)}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const STATE_CONFIG = {
  pending:    { color: colors.textMuted,  bg: colors.surface,      icon: 'ellipse-outline', text: 'PENDING' },
  active:     { color: colors.warning,    bg: colors.warningSoft,  icon: 'sync',            text: 'RUNNING' },
  done:       { color: colors.primary,    bg: colors.primarySoft,  icon: 'checkmark',       text: 'DONE' },
  failed:     { color: colors.critical,   bg: colors.criticalSoft, icon: 'close',           text: 'FAILED' },
  recovering: { color: colors.warning,    bg: colors.warningSoft,  icon: 'refresh',         text: 'RECOVERING' },
};

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 80 },

  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow,
  },
  jobLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  jobId: {
    color: colors.primary,
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  jobSub: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  statusText: { fontWeight: '800', fontSize: 11, letterSpacing: 0.8 },

  section: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing.md,
    letterSpacing: 0.3,
  },

  timeline: { marginBottom: spacing.lg },
  stepRow: { flexDirection: 'row' },
  rail: { width: 36, alignItems: 'center' },
  node: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  pulse: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  connector: { width: 2, flex: 1, marginTop: 2, marginBottom: 2 },

  stepCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginLeft: 6,
    marginBottom: 10,
  },
  stepCardActive: { borderColor: colors.warning },
  stepHead: { flexDirection: 'row', alignItems: 'center' },
  stepLabel: { color: colors.text, fontWeight: '700', fontSize: 13, marginLeft: 8, flex: 1 },
  stepState: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  stepTs: { color: colors.textDim, fontSize: 11, marginTop: 6 },
  expand: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  traceLine: { marginBottom: 8 },
  traceLineStep: { color: colors.primary, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  traceLineDetail: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 15,
  },

  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  toolBtnLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  toolBtnTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
  toolBtnSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
});
