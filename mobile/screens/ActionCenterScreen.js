import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  radii,
  spacing,
  shadow,
} from '../constants/colors';
import { subscribeReport, subscribeActions } from '../services/firebase';
import { api } from '../services/api';
import {
  formatPkr,
  plainActionTitle,
  plainActionDescription,
  plainRegulation,
} from '../services/format';
import EmptyState from '../components/EmptyState';

// Hard timeout for /simulate calls so the screen never hangs on a spinner.
// 5s ceiling matches the latest spec; after the deadline we fall back to
// whatever simulation_output is already cached in Firestore.
const SIMULATE_TIMEOUT_MS = 5000;

function simulateWithTimeout(factoryId, actionIds) {
  return Promise.race([
    api.simulate(factoryId, actionIds),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SIMULATE_TIMEOUT')), SIMULATE_TIMEOUT_MS),
    ),
  ]);
}

const EFFORT_LABEL = {
  HIGH: 'High effort',
  MEDIUM: 'Medium effort',
  LOW: 'Low effort',
};
const EFFORT_COLOR = {
  HIGH: colors.critical,
  MEDIUM: colors.warning,
  LOW: colors.compliant,
};

export default function ActionCenterScreen({ route, navigation }) {
  const { factoryId } = route.params;
  const [report, setReport] = useState(null);
  const [liveActions, setLiveActions] = useState([]);
  const [busy, setBusy] = useState({});
  const [busyAll, setBusyAll] = useState(false);
  const [lastSim, setLastSim] = useState(null);

  useEffect(() => {
    const u1 = subscribeReport(factoryId, setReport);
    const u2 = subscribeActions(factoryId, setLiveActions);
    return () => {
      u1 && u1();
      u2 && u2();
    };
  }, [factoryId]);

  // If the backend already saved a full-plan simulation_result on the report,
  // surface it on first paint so the user sees something useful immediately
  // without having to tap the hero button.
  useEffect(() => {
    if (lastSim) return;
    const sim = report?.simulation_result;
    if (!sim) return;
    if (sim.before_score == null && sim.after_score == null) return;
    setLastSim({
      before: sim.before_score ?? 0,
      after: sim.after_score ?? 0,
      risk: Number(sim.risk_reduction_pkr) || 0,
      count: Array.isArray(sim.action_ids) ? sim.action_ids.length : (report?.action_chain?.length || 0),
    });
  }, [report, lastSim]);

  const reportActions = report?.action_chain || [];
  const merged = useMemo(() => {
    if (!reportActions.length) {
      return [...liveActions].sort(
        (a, b) => (a.priority ?? 99) - (b.priority ?? 99),
      );
    }
    return reportActions.map((a) => {
      const live = liveActions.find((la) => la.action_id === a.action_id);
      return live ? { ...a, ...live } : a;
    });
  }, [reportActions, liveActions]);

  const runSimulate = async (actionIds) => {
    // Optimistic fallback: synthesise a result from already-stored simulation
    // outputs so the user sees something within 3s even if the backend is
    // unreachable or slow.
    const fallback = () => {
      const targets = merged.filter((a) => actionIds.includes(a.action_id));
      const before = targets[0]?.simulation_output?.before_score
        ?? report?.compliance_score
        ?? 0;
      const after = targets.reduce(
        (acc, a) => Math.max(acc, a.simulation_output?.after_score ?? before),
        before,
      );
      const risk = targets.reduce(
        (acc, a) =>
          acc + Number(
            a.simulation_output?.risk_reduction_pkr ?? a.impact_pkr ?? 0,
          ),
        0,
      );
      return { before, after, risk, count: actionIds.length };
    };
    try {
      const res = await simulateWithTimeout(factoryId, actionIds);
      setLastSim({
        before: res.before_score ?? 0,
        after: res.after_score ?? 0,
        risk: Number(res.risk_reduction_pkr) || 0,
        count: actionIds.length,
      });
    } catch (e) {
      // Timeout or network — show the precomputed result instead of hanging.
      setLastSim(fallback());
    }
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.h1}>Your Action Plan</Text>
        <Text style={styles.h2}>
          Here's what to do to protect your export orders
        </Text>
      </View>

      {/* Simulate-all hero */}
      {merged.length > 0 && (
        <TouchableOpacity
          style={[styles.heroBtn, busyAll && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={busyAll || merged.length === 0}
          onPress={async () => {
            setBusyAll(true);
            await runSimulate(merged.map((a) => a.action_id));
            setBusyAll(false);
          }}
        >
          {busyAll ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Ionicons name="rocket" size={18} color={colors.bg} />
          )}
          <Text style={styles.heroBtnText}>
            {busyAll ? 'Working out the full plan…' : 'Show me the full fix plan'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Before/after sim banner */}
      {lastSim && (
        <View style={styles.simBanner}>
          <View style={styles.simBannerHead}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
            <Text style={styles.simBannerTitle}>
              {lastSim.count === 1
                ? "Here's what happens if you fix this"
                : `Here's what happens if you fix all ${lastSim.count} actions`}
            </Text>
          </View>
          <View style={styles.simRow}>
            <View style={styles.simCell}>
              <Text style={styles.simCellLabel}>Score</Text>
              <Text style={styles.simCellValue}>
                <Text style={{ color: colors.critical }}>{lastSim.before}</Text>
                {'  '}
                <Ionicons name="arrow-forward" size={14} color={colors.textDim} />
                {'  '}
                <Text style={{ color: colors.primary }}>{lastSim.after}</Text>
              </Text>
            </View>
            <View style={styles.simCell}>
              <Text style={styles.simCellLabel}>Orders protected</Text>
              <Text style={[styles.simCellValue, { color: colors.primary }]}>
                {formatPkr(lastSim.risk)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {merged.length === 0 && (
        <EmptyState
          icon="flash"
          iconColor={colors.primary}
          title="No actions yet"
          message="Run a check on your factory and we'll build a clear step-by-step plan to keep your export orders safe."
          cta={{
            label: 'Check My Factory',
            icon: 'play-circle',
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
      )}

      {merged.map((a, idx) => (
        <ActionCard
          key={a.action_id || idx}
          action={a}
          index={idx}
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

function ActionCard({ action, index, busy, onSimulate }) {
  const priority = action.priority ?? index + 1;
  const effort = (action.effort || 'MEDIUM').toUpperCase();
  const effortColor = EFFORT_COLOR[effort] || colors.warning;
  const effortText = EFFORT_LABEL[effort] || `${effort.toLowerCase()} effort`;
  const status = (action.status || 'PENDING').toUpperCase();
  const isSimulated = status === 'SIMULATED' || status === 'EXECUTED';
  const sim = action.simulation_output || {};
  const title = plainActionTitle(action);
  const reg = plainRegulation(action.regulation);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityBadgeText}>{priority}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={3}>
            {title}
          </Text>
          {reg.ref && (
            <Text style={styles.cardRef}>Reference: {reg.ref}</Text>
          )}
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.effortText, { color: effortColor }]}>{effortText}</Text>
        {action.deadline && (
          <>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>By {action.deadline}</Text>
          </>
        )}
        {isSimulated && (
          <>
            <View style={styles.metaDot} />
            <Text style={[styles.metaText, { color: colors.primary }]}>Simulated</Text>
          </>
        )}
      </View>

      <Text style={styles.cardDesc} numberOfLines={3}>
        {plainActionDescription(action)}
      </Text>

      {/* Impact + sim result */}
      <View style={styles.impactRow}>
        <View style={styles.impactCell}>
          <Text style={styles.impactLabel}>Orders saved</Text>
          <Text style={styles.impactValue}>{formatPkr(action.impact_pkr)}</Text>
        </View>
        {isSimulated && (
          <View style={styles.impactCell}>
            <Text style={styles.impactLabel}>Score change</Text>
            <Text style={styles.impactValue}>
              {sim.before_score}→{sim.after_score}{' '}
              <Text style={{ color: colors.primary }}>
                (+{(sim.after_score || 0) - (sim.before_score || 0)})
              </Text>
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.simBtn, busy && { opacity: 0.6 }]}
        onPress={onSimulate}
        activeOpacity={0.85}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Ionicons name="play" size={15} color={colors.primary} />
        )}
        <Text style={styles.simBtnText}>
          {busy ? 'Working it out…' : 'See what happens if I fix this'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },

  header: {
    marginBottom: spacing.lg,
  },
  h1: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  h2: { color: '#C9D1D9', fontSize: 15, lineHeight: 22, marginTop: 6 },

  heroBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: spacing.md,
    ...shadow,
  },
  heroBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15, marginLeft: 10 },

  simBanner: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  simBannerHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  simBannerTitle: {
    color: colors.primary,
    fontWeight: '800',
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },
  simRow: { flexDirection: 'row' },
  simCell: { flex: 1 },
  simCellLabel: {
    color: '#C9D1D9',
    fontSize: 13,
    marginBottom: 6,
  },
  simCellValue: { color: colors.text, fontSize: 17, fontWeight: '800' },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  priorityBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  priorityBadgeText: { color: colors.bg, fontWeight: '900', fontSize: 15 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  cardRef: { color: colors.textMuted, fontSize: 13, marginTop: 4 },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.md },
  effortText: { fontSize: 13, fontWeight: '700' },
  metaText: { color: '#C9D1D9', fontSize: 13 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textMuted, marginHorizontal: 8 },

  cardDesc: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: spacing.md,
  },

  impactRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  impactCell: { flex: 1 },
  impactLabel: {
    color: '#C9D1D9',
    fontSize: 13,
    marginBottom: 4,
  },
  impactValue: { color: colors.text, fontWeight: '800', fontSize: 15 },

  simBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  simBtnText: { color: colors.primary, fontWeight: '700', marginLeft: 8, fontSize: 14 },
});
