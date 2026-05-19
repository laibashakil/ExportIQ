// AnalysisProgressScreen — shown immediately after /upload + /analyze.
//
// Polls GET /status/{job_id} every 3s. Renders each of the 6 agents as a
// step that lights up green when it completes (driven by the `agent_trace`
// returned from the status endpoint).
//
// When the job's status becomes "complete" or "failed", we route to the
// Factory tabs (Status tab) so the user lands on the result they expect.
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadow, spacing } from '../constants/colors';
import { api } from '../services/api';
import LogoSpinner from '../components/LogoSpinner';

const PIPELINE = [
  { key: 'regulation_ingestion', label: 'Reading EU/UK rules',        icon: 'book' },
  { key: 'factory_profile',      label: 'Reading your factory PDF',   icon: 'document-text' },
  { key: 'gap_detection',        label: 'Finding compliance gaps',    icon: 'search' },
  { key: 'financial_impact',     label: 'Working out financial risk', icon: 'cash' },
  { key: 'action_chain',         label: 'Building your action plan',  icon: 'list' },
  { key: 'execution_simulation', label: 'Drafting documents',         icon: 'mail' },
];

const POLL_MS = 3000;

export default function AnalysisProgressScreen({ route, navigation }) {
  const { jobId, factoryId, factoryName } = route.params || {};
  const [job, setJob] = useState(null);
  const [err, setErr] = useState(null);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    let timer = null;

    async function tick() {
      try {
        const s = await api.status(jobId);
        if (cancelled) return;
        setJob(s);
        if (s?.status === 'complete') {
          // Brief pause so the user sees the last step go green.
          setTimeout(() => {
            if (!cancelled) {
              navigation.replace('Factory', { factoryId, factoryName });
            }
          }, 900);
          return;
        }
        if (s?.status === 'failed') {
          setErr('Analysis failed — please try again or contact support.');
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        // Network blip — retry with backoff up to 5x, then surface error.
        if (cancelled) return;
        if (retries < 5) {
          setRetries((r) => r + 1);
          timer = setTimeout(tick, POLL_MS);
        } else {
          setErr(`Could not check progress: ${e?.message || e}`);
        }
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, factoryId, factoryName, navigation, retries]);

  // Compute which step each agent is in: pending | running | done.
  const stepState = useMemo(() => {
    const trace = job?.agent_trace || [];
    const byAgent = {};
    for (const t of trace) {
      if (!t.agent) continue;
      byAgent[t.agent] = byAgent[t.agent] || [];
      byAgent[t.agent].push(t);
    }
    const current = job?.current_agent;
    const pipelineDone = job?.status === 'complete';
    return PIPELINE.map((p) => {
      const entries = byAgent[p.key] || [];
      const hasComplete = entries.some(
        (e) => e.step === 'complete' || e.step === 'pipeline_complete',
      );
      let state = 'pending';
      if (pipelineDone) state = entries.length > 0 ? 'done' : 'pending';
      else if (hasComplete) state = 'done';
      else if (current === p.key) state = 'running';
      else if (entries.length > 0) state = 'running';
      return { ...p, state };
    });
  }, [job]);

  const progressPct = job?.progress ?? 0;
  const isComplete = job?.status === 'complete';
  const isFailed = !!err || job?.status === 'failed';

  return (
    <SafeAreaView style={styles.bg} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconCircle}>
          {isFailed ? (
            <Ionicons name="alert-circle" size={42} color={colors.critical} />
          ) : isComplete ? (
            <Ionicons name="checkmark-circle" size={42} color={colors.primary} />
          ) : (
            <LogoSpinner size={48} />
          )}
        </View>

        <Text style={styles.title}>
          {isFailed ? 'Analysis failed' : isComplete ? 'Done!' : 'Checking your factory…'}
        </Text>
        <Text style={styles.subtitle}>
          {isFailed
            ? err
            : isComplete
            ? 'Taking you to your results.'
            : `Our 6 agents are reviewing your audit report. ${progressPct}%`}
        </Text>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, Math.max(0, progressPct))}%`,
                backgroundColor: isFailed ? colors.critical : colors.primary,
              },
            ]}
          />
        </View>

        <View style={styles.steps}>
          {stepState.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </View>

        {isFailed && (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={18} color={colors.bg} />
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StepRow({ step }) {
  const cfg =
    step.state === 'done'    ? { color: colors.primary,   bg: colors.primarySoft,   icon: 'checkmark-circle' } :
    step.state === 'running' ? { color: colors.warning,   bg: colors.warningSoft,   icon: 'time' } :
                               { color: colors.textMuted, bg: colors.surfaceAlt,    icon: 'ellipse-outline' };
  return (
    <View style={[styles.step, { borderColor: step.state === 'pending' ? colors.border : cfg.color }]}>
      <View style={[styles.stepIcon, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={18} color={cfg.color} />
      </View>
      <Text style={[styles.stepLabel, step.state === 'pending' && { color: colors.textDim }]} numberOfLines={1}>
        {step.label}
      </Text>
      {step.state === 'running' && <ActivityIndicator size="small" color={colors.warning} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  iconCircle: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  steps: { marginBottom: spacing.xl },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 10,
    ...shadow,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepLabel: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 14,
    marginTop: spacing.md,
  },
  retryBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15, marginLeft: 8 },
});
