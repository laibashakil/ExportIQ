import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  radii,
  spacing,
  shadow,
} from '../constants/colors';
import {
  subscribeReport,
  subscribeActions,
  setSimulationRevealed,
} from '../services/firebase';
import { api } from '../services/api';
import {
  formatPkr,
  plainActionTitle,
  plainActionDescription,
  plainRegulation,
} from '../services/format';
import EmptyState from '../components/EmptyState';
import LogoSpinner from '../components/LogoSpinner';
import SimulationReveal from '../components/SimulationReveal';

const SIMULATE_TIMEOUT_MS = 5000;
const HIGHLIGHT_DURATION_MS = 1500;

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
  const { factoryId, highlightActionId } = route.params || {};
  const [report, setReport] = useState(null);
  const [liveActions, setLiveActions] = useState([]);
  const [busy, setBusy] = useState({});
  const [busyAll, setBusyAll] = useState(false);
  const [perCardSim, setPerCardSim] = useState({}); // actionId -> sim result
  const [fullPlanSim, setFullPlanSim] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    const u1 = subscribeReport(factoryId, setReport);
    const u2 = subscribeActions(factoryId, setLiveActions);
    return () => {
      u1 && u1();
      u2 && u2();
    };
  }, [factoryId]);

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

  // Scroll to and highlight the action card referenced by route param. Runs
  // once data is ready, then clears params so it doesn't re-fire on focus.
  useEffect(() => {
    if (!highlightActionId || !merged.length) return;
    const idx = merged.findIndex((a) => a.action_id === highlightActionId);
    if (idx < 0) return;

    // Defer to next tick so FlatList has measured rows.
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({
          index: idx,
          viewPosition: 0.3,
          animated: true,
        });
      } catch {
        // scrollToIndex can throw if the row hasn't been measured yet.
      }
      setHighlightedId(highlightActionId);
      setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
      navigation.setParams({ highlightActionId: undefined });
    }, 250);
    return () => clearTimeout(t);
  }, [highlightActionId, merged, navigation]);

  const runSimulate = async (actionIds, { full = false } = {}) => {
    // Executing the entire plan brings the factory to full compliance, so the
    // full-plan reveal must always land on 100 / PKR 0 residual risk — never
    // stranded at 92 by a leftover contradiction penalty. The protected PKR
    // shown is the full at-risk exposure.
    const fullAfter =
      report?.score_after_full_simulation
      ?? report?.simulation_result?.score_after_full_simulation
      ?? 100;
    const fullRiskProtected =
      Number(report?.orders_at_risk_pkr)
      || Number(report?.financial_impact?.orders_at_risk_pkr)
      || 0;
    const fallback = () => {
      const targets = merged.filter((a) => actionIds.includes(a.action_id));
      const before = targets[0]?.simulation_output?.before_score
        ?? report?.original_compliance_score
        ?? report?.compliance_score
        ?? 0;
      if (full) {
        return { before, after: fullAfter, risk: fullRiskProtected };
      }
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
      return { before, after, risk };
    };
    try {
      const res = await simulateWithTimeout(factoryId, actionIds);
      if (full) {
        return {
          before: res.before_score ?? 0,
          after: res.score_after_full_simulation ?? res.after_score ?? fullAfter,
          risk: Number(res.risk_reduction_pkr) || fullRiskProtected,
        };
      }
      return {
        before: res.before_score ?? 0,
        after: res.after_score ?? 0,
        risk: Number(res.risk_reduction_pkr) || 0,
      };
    } catch {
      return fallback();
    }
  };

  const onSimulateOne = useCallback(async (action) => {
    setBusy((b) => ({ ...b, [action.action_id]: true }));
    const result = await runSimulate([action.action_id]);
    setPerCardSim((s) => ({ ...s, [action.action_id]: result }));
    setBusy((b) => ({ ...b, [action.action_id]: false }));
  }, [factoryId, merged, report]);

  const onShowFullPlan = useCallback(async () => {
    setBusyAll(true);
    const result = await runSimulate(merged.map((a) => a.action_id), { full: true });
    setFullPlanSim(result);
    // Flip the report-level reveal flag so the Status screen knows it
    // can offer the post-fix view to the user.
    try {
      await setSimulationRevealed(factoryId, true);
    } catch {
      // non-fatal — the in-screen reveal still shows
    }
    setBusyAll(false);
  }, [merged, factoryId]);

  const buyers =
    report?.financial_impact?.buyers_affected
    || report?.factory_profile?.primary_buyers
    || [];

  const renderItem = ({ item, index }) => (
    <ActionCard
      action={item}
      index={index}
      busy={!!busy[item.action_id]}
      sim={perCardSim[item.action_id]}
      buyers={buyers}
      highlighted={highlightedId === item.action_id}
      onSimulate={() => onSimulateOne(item)}
    />
  );

  const ListHeader = (
    <View>
      <View style={styles.header}>
        <Text style={styles.h1}>Your Action Plan</Text>
        <Text style={styles.h2}>
          Here's what to do to protect your export orders
        </Text>
      </View>

      {merged.length > 0 && (
        <TouchableOpacity
          style={[styles.heroBtn, busyAll && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={busyAll || merged.length === 0}
          onPress={onShowFullPlan}
        >
          {busyAll ? (
            <LogoSpinner size={20} />
          ) : (
            <Ionicons name="rocket" size={18} color={colors.bg} />
          )}
          <Text style={styles.heroBtnText}>
            {busyAll ? 'Working out the full plan…' : 'Show me the full fix plan'}
          </Text>
        </TouchableOpacity>
      )}

      {fullPlanSim && (
        <View style={styles.fullPlanWrap}>
          <View style={styles.fullPlanHead}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={styles.fullPlanTitle}>
              Here's what happens if you fix all {merged.length} actions
            </Text>
          </View>
          {/* Preview only — these scores are projections, the real gauge
              elsewhere in the app stays unchanged. */}
          <View style={styles.scorePairRow}>
            <Text style={styles.scorePairLabel}>
              Current: <Text style={styles.scorePairCurrent}>{fullPlanSim.before}/100</Text>
            </Text>
            <Text style={styles.scorePairLabel}>
              If all fixed: <Text style={styles.scorePairProjected}>{fullPlanSim.after}/100</Text>
            </Text>
          </View>
          <SimulationReveal
            visible
            before={fullPlanSim.before}
            after={fullPlanSim.after}
            risk={fullPlanSim.risk}
            buyers={buyers}
          />
        </View>
      )}
    </View>
  );

  if (merged.length === 0) {
    return (
      <View style={styles.bg}>
        {ListHeader}
        <EmptyState
          useLogo
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
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      style={styles.bg}
      contentContainerStyle={styles.content}
      data={merged}
      keyExtractor={(item, idx) => item.action_id || `act-${idx}`}
      renderItem={renderItem}
      ListHeaderComponent={ListHeader}
      onScrollToIndexFailed={(info) => {
        // Retry once after the list has had time to measure.
        setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({
              index: info.index,
              viewPosition: 0.3,
              animated: true,
            });
          } catch {}
        }, 300);
      }}
    />
  );
}

function ActionCard({ action, index, busy, sim, buyers, highlighted, onSimulate }) {
  const priority = action.priority ?? index + 1;
  const effort = (action.effort || 'MEDIUM').toUpperCase();
  const effortColor = EFFORT_COLOR[effort] || colors.warning;
  const effortText = EFFORT_LABEL[effort] || `${effort.toLowerCase()} effort`;
  const status = (action.status || 'PENDING').toUpperCase();
  const isSimulated = status === 'SIMULATED' || status === 'EXECUTED';
  const title = plainActionTitle(action);
  const reg = plainRegulation(action.regulation);

  // Glow animation on highlight (1.5s teal border pulse, then fade).
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!highlighted) {
      glow.setValue(0);
      return;
    }
    Animated.sequence([
      Animated.timing(glow, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.delay(900),
      Animated.timing(glow, {
        toValue: 0,
        duration: 400,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [highlighted, glow]);

  const borderColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.primary],
  });
  const borderWidth = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2],
  });

  return (
    <Animated.View style={[styles.card, { borderColor, borderWidth }]}>
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

      <View style={styles.impactRow}>
        <View style={styles.impactCell}>
          <Text style={styles.impactLabel}>Orders saved</Text>
          <Text style={styles.impactValue}>{formatPkr(action.impact_pkr)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.simBtn, busy && { opacity: 0.6 }]}
        onPress={onSimulate}
        activeOpacity={0.85}
        disabled={busy}
      >
        {busy ? (
          <LogoSpinner size={18} />
        ) : (
          <Ionicons name="play" size={15} color={colors.primary} />
        )}
        <Text style={styles.simBtnText}>
          {busy ? 'Working it out…' : sim ? 'See again' : 'See what happens if I fix this'}
        </Text>
      </TouchableOpacity>

      {/* Projected-score label — keeps the inline preview clearly framed
          as a what-if, never as "your score". The real gauge elsewhere in
          the app is not affected by this simulation. */}
      {!!sim && (
        <Text style={styles.projectedLabel}>
          Projected score if fixed: <Text style={styles.projectedValue}>{sim.after}/100</Text>
        </Text>
      )}

      {/* Inline storytelling reveal — 3 cards stagger in 300ms apart */}
      <SimulationReveal
        visible={!!sim}
        before={sim?.before}
        after={sim?.after}
        risk={sim?.risk}
        buyers={buyers}
        compact
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },

  header: { marginBottom: spacing.lg },
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

  fullPlanWrap: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  fullPlanHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  fullPlanTitle: {
    color: colors.primary,
    fontWeight: '800',
    marginLeft: 8,
    fontSize: 14,
  },

  card: {
    backgroundColor: colors.surface,
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

  scorePairRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  scorePairLabel: {
    color: '#C9D1D9',
    fontSize: 13,
    fontWeight: '600',
  },
  scorePairCurrent: {
    color: colors.text,
    fontWeight: '800',
  },
  scorePairProjected: {
    color: colors.primary,
    fontWeight: '800',
  },
  projectedLabel: {
    color: '#C9D1D9',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: -4,
  },
  projectedValue: {
    color: colors.primary,
    fontWeight: '800',
  },
});
