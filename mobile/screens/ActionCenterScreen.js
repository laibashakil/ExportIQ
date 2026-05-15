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
  riskColor,
  radii,
  spacing,
  shadow,
} from '../constants/colors';
import { subscribeReport, subscribeActions } from '../services/firebase';
import { api } from '../services/api';
import { formatPkr } from '../services/format';
import EmptyState from '../components/EmptyState';

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

  // Merge report.action_chain (canonical priority order) with live per-action
  // subcollection docs (real-time SIMULATED status during execution).
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

  const totalImpact = merged.reduce(
    (acc, a) => acc + (Number(a.impact_pkr) || 0),
    0,
  );

  const runSimulate = async (actionIds) => {
    try {
      const res = await api.simulate(factoryId, actionIds);
      setLastSim({
        before: res.before_score ?? 0,
        after: res.after_score ?? 0,
        risk: Number(res.risk_reduction_pkr) || 0,
        count: actionIds.length,
      });
    } catch (e) {
      Alert.alert('Simulation failed', String(e.message));
    }
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Action Center</Text>
          <Text style={styles.h2}>
            {merged.length} prioritized · {formatPkr(totalImpact)} recoverable
          </Text>
        </View>
        <View style={styles.priorityCounter}>
          <Text style={styles.priorityCounterValue}>{merged.length}</Text>
        </View>
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
            {busyAll ? 'Simulating all actions…' : `Simulate All ${merged.length} Actions`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Before/after sim banner */}
      {lastSim && (
        <View style={styles.simBanner}>
          <View style={styles.simBannerHead}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={styles.simBannerTitle}>
              Last simulation · {lastSim.count} action{lastSim.count === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.simRow}>
            <View style={styles.simCell}>
              <Text style={styles.simCellLabel}>SCORE</Text>
              <Text style={styles.simCellValue}>
                <Text style={{ color: colors.critical }}>{lastSim.before}</Text>
                {'  '}
                <Ionicons name="arrow-forward" size={14} color={colors.textDim} />
                {'  '}
                <Text style={{ color: colors.primary }}>{lastSim.after}</Text>
              </Text>
            </View>
            <View style={styles.simCell}>
              <Text style={styles.simCellLabel}>RISK RECOVERED</Text>
              <Text style={[styles.simCellValue, { color: colors.primary }]}>
                {formatPkr(lastSim.risk)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {merged.length === 0 && (
        <EmptyState
          emoji="⚡"
          title="No actions yet"
          message="Run a full compliance analysis to generate a prioritized 3-5 action plan ranked by PKR impact and deadline urgency."
          cta={{
            label: 'Run Analysis',
            icon: 'play',
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
  const status = (action.status || 'PENDING').toUpperCase();
  const isSimulated = status === 'SIMULATED' || status === 'EXECUTED';
  const sim = action.simulation_output || {};

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityBadgeText}>#{priority}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {action.title || 'Remediation action'}
        </Text>
      </View>

      <View style={styles.chipRow}>
        <View style={[styles.chip, { backgroundColor: effortColor + '22', borderColor: effortColor }]}>
          <Ionicons name="fitness" size={11} color={effortColor} />
          <Text style={[styles.chipText, { color: effortColor }]}>{effort} EFFORT</Text>
        </View>
        {action.deadline && (
          <View style={styles.chip}>
            <Ionicons name="calendar" size={11} color={colors.textDim} />
            <Text style={styles.chipText}>{action.deadline}</Text>
          </View>
        )}
        {isSimulated && (
          <View style={[styles.chip, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
            <Ionicons name="checkmark" size={11} color={colors.primary} />
            <Text style={[styles.chipText, { color: colors.primary }]}>SIMULATED</Text>
          </View>
        )}
      </View>

      {action.description && (
        <Text style={styles.cardDesc} numberOfLines={3}>
          {action.description}
        </Text>
      )}

      {/* Impact + sim result */}
      <View style={styles.impactRow}>
        <View style={styles.impactCell}>
          <Text style={styles.impactLabel}>RISK SAVED</Text>
          <Text style={styles.impactValue}>{formatPkr(action.impact_pkr)}</Text>
        </View>
        {isSimulated && (
          <View style={styles.impactCell}>
            <Text style={styles.impactLabel}>SCORE</Text>
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
          <Ionicons
            name={isSimulated ? 'refresh' : 'play'}
            size={14}
            color={colors.primary}
          />
        )}
        <Text style={styles.simBtnText}>
          {busy ? 'Simulating…' : isSimulated ? 'Re-simulate' : 'Simulate'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 80 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  priorityCounter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityCounterValue: { color: colors.primary, fontSize: 18, fontWeight: '800' },

  heroBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: spacing.md,
    ...shadow,
  },
  heroBtnText: { color: colors.bg, fontWeight: '800', fontSize: 14, marginLeft: 8 },

  simBanner: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  simBannerHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  simBannerTitle: { color: colors.primary, fontWeight: '800', marginLeft: 8, fontSize: 12 },
  simRow: { flexDirection: 'row' },
  simCell: { flex: 1 },
  simCellLabel: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 4,
  },
  simCellValue: { color: colors.text, fontSize: 16, fontWeight: '800' },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  priorityBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  priorityBadgeText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: 4,
  },

  cardDesc: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
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
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 4,
  },
  impactValue: { color: colors.text, fontWeight: '800', fontSize: 13 },

  simBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 10,
  },
  simBtnText: { color: colors.primary, fontWeight: '800', marginLeft: 6, fontSize: 13 },
});
