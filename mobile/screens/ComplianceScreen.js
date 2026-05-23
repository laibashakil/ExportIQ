import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  riskColor,
  radii,
  spacing,
  shadow,
} from '../constants/colors';
import {
  subscribeFactory,
  subscribeReport,
  setSimulationRevealed,
} from '../services/firebase';
import { plainRegulation, plainRequirement } from '../services/format';
import { api } from '../services/api';
import CircularScore from '../components/CircularScore';
import EmptyState from '../components/EmptyState';

const SEV_TO_RISK = {
  CRITICAL: 'CRITICAL',
  HIGH: 'WARNING',
  MEDIUM: 'WARNING',
  LOW: 'COMPLIANT',
};

// The "everything is resolved" threshold. Once the effective displayed
// score crosses this, contradictions and gaps stop being flagged as
// active red alerts and instead show as resolved-by-simulation.
const RESOLVED_SCORE = 95;

function plainStatusLine(risk, gaps, contradictions, resolved) {
  if (resolved) {
    return 'All audit risks resolved by simulation';
  }
  if (risk === 'COMPLIANT' && gaps === 0) {
    return 'Your factory meets EU export requirements';
  }
  if (risk === 'CRITICAL') {
    return 'Your factory is at HIGH RISK of losing EU export orders';
  }
  if (risk === 'WARNING' || gaps > 0) {
    return 'Your factory has some issues that need to be fixed before your next buyer audit';
  }
  return 'Run a new analysis to check your factory status';
}

export default function ComplianceScreen({ route, navigation }) {
  const { factoryId } = route.params;
  const [factory, setFactory] = useState(null);
  const [report, setReport] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const u1 = subscribeFactory(factoryId, setFactory);
    const u2 = subscribeReport(factoryId, setReport);
    return () => {
      u1 && u1();
      u2 && u2();
    };
  }, [factoryId]);

  // Pre-sim is the default. The "Showing post-fix view" toggle only appears
  // once the user has explicitly tapped "Show me the full fix plan" in the
  // Fix It tab (which flips `report.simulation_revealed` to true on Firestore).
  const revealed = !!report?.simulation_revealed;

  // The circular score gauge reads ONLY the real compliance_score field.
  // It must never fall through to simulated_compliance_score, after_score,
  // or simulation_result.after_score — those are what-if previews and
  // changing the gauge based on them would mislead the user into thinking
  // the factory is actually compliant when nothing has been remediated yet.
  const realComplianceScore =
    (typeof report?.compliance_score === 'number' ? report.compliance_score : undefined)
    ?? (typeof factory?.compliance_score === 'number' ? factory.compliance_score : undefined)
    ?? 0;

  // afterScore is retained ONLY to drive the "all gaps resolved by simulation"
  // styling on the gap and contradiction cards once the user has opted into
  // the post-fix view. It is never read by the gauge.
  const afterScore = report?.after_score
    ?? report?.simulation_result?.after_score
    ?? realComplianceScore;

  const showPostSim = revealed;
  const resolvedView = afterScore >= RESOLVED_SCORE && showPostSim;

  const riskForGauge = useMemo(() => {
    if (realComplianceScore >= 85) return 'COMPLIANT';
    if (realComplianceScore >= 60) return 'WARNING';
    return 'CRITICAL';
  }, [realComplianceScore]);

  const gaps = report?.gaps || [];
  const contradictions = report?.contradictions || [];

  const runAnalysis = useCallback(async () => {
    try {
      setAnalyzing(true);
      await api.analyze(factoryId);
      Alert.alert(
        'New analysis started',
        `We'll check your factory against the latest EU and UK rules. This takes a few minutes — your status will update automatically.`,
      );
    } catch (e) {
      Alert.alert('Could not start analysis', String(e.message));
    } finally {
      setAnalyzing(false);
    }
  }, [factoryId]);

  const togglePreSimView = useCallback(async () => {
    try {
      await setSimulationRevealed(factoryId, !showPostSim);
    } catch (e) {
      Alert.alert('Could not switch view', String(e.message));
    }
  }, [factoryId, showPostSim]);

  const hasData = gaps.length > 0 || contradictions.length > 0 || report;

  // Section titles flip to "resolved" tone when the post-sim view crosses
  // the RESOLVED_SCORE threshold.
  const contradictionsTitle = resolvedView
    ? 'Conflicts Resolved ✓'
    : 'Conflicting Information Found';
  const gapsTitle = resolvedView
    ? 'All Issues Addressed ✓'
    : `Issues Found${gaps.length > 0 ? ` (${gaps.length})` : ''}`;
  const sectionTitleColor = resolvedView ? colors.primary : colors.text;

  // Navigate to a specific action card in the Fix It tab and ask it to
  // glow briefly.
  const onFixGap = (gap) => {
    navigation.navigate('Fix It', {
      highlightActionId: gap?.linked_action_id || null,
    });
  };

  return (
    <View style={styles.bg}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Post-fix preview toggle (only after user revealed the full plan).
            This now only flips gap/contradiction cards between "active" and
            "resolved by simulation" styling — the score gauge above always
            reflects the real, current compliance_score regardless. */}
        {revealed && (
          <TouchableOpacity
            style={styles.viewToggle}
            onPress={togglePreSimView}
            activeOpacity={0.85}
          >
            <Ionicons
              name={showPostSim ? 'eye' : 'eye-off'}
              size={14}
              color={colors.primary}
            />
            <Text style={styles.viewToggleText}>
              {showPostSim
                ? 'Showing post-fix preview on issues · tap to hide'
                : 'Showing real issues · tap to preview post-fix view'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Score card — gauge bound to the real compliance_score only. */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreCenter}>
            <CircularScore
              size={170}
              stroke={13}
              score={Math.max(0, Math.min(100, Math.round(realComplianceScore)))}
              risk={riskForGauge}
            />
          </View>
          <Text
            style={[styles.statusLine, { color: riskColor(riskForGauge) }]}
          >
            {plainStatusLine(riskForGauge, gaps.length, contradictions.length, resolvedView)}
          </Text>
        </View>

        {/* Contradictions */}
        {contradictions.length > 0 && (
          <>
            <Text style={[styles.section, { color: sectionTitleColor }]}>
              {contradictionsTitle}
            </Text>
            <Text style={styles.sectionSub}>
              {resolvedView
                ? 'These document mismatches have been resolved by the full fix plan.'
                : 'Our AI found information in your documents that does not match. This could cause problems during a buyer audit.'}
            </Text>
            {contradictions.map((c, i) => (
              <ContradictionCard key={i} contradiction={c} resolved={resolvedView} />
            ))}
          </>
        )}

        {/* Gaps */}
        {hasData && (
          <Text style={[styles.section, { color: sectionTitleColor }]}>
            {gapsTitle}
          </Text>
        )}

        {hasData ? (
          gaps.length === 0 ? (
            <EmptyState
              icon="checkmark-circle"
              iconColor={colors.compliant}
              title="No issues right now"
              message="This factory currently meets every EU and UK rule we check."
            />
          ) : (
            gaps.map((g, i) => (
              <GapCard
                key={i}
                gap={g}
                resolved={resolvedView}
                onFix={() => onFixGap(g)}
              />
            ))
          )
        ) : (
          <EmptyState
            useLogo
            title="No analysis run yet"
            message="Run a check to see what EU and UK rules apply to your factory and what needs attention."
            cta={{
              label: analyzing ? 'Starting…' : 'Check My Factory',
              icon: 'play-circle',
              onPress: analyzing ? () => {} : runAnalysis,
            }}
          />
        )}

        {hasData && (
          <TouchableOpacity
            style={styles.bottomLink}
            onPress={runAnalysis}
            disabled={analyzing}
            activeOpacity={0.7}
          >
            <Ionicons
              name={analyzing ? 'time' : 'refresh'}
              size={15}
              color={colors.primary}
            />
            <Text style={styles.bottomLinkText}>
              {analyzing ? 'Starting new analysis…' : 'Run new analysis'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function GapCard({ gap, resolved, onFix }) {
  const sev = gap.severity || 'MEDIUM';
  const riskBucket = SEV_TO_RISK[sev] || 'WARNING';
  const c = resolved ? colors.primary : riskColor(riskBucket);
  const reg = plainRegulation(gap.regulation);
  const plainTitle =
    (gap.display_title && String(gap.display_title).trim())
    || plainRequirement(gap.requirement, gap.regulation, gap.status);
  const days = gap.days_remaining;
  const dueText = (() => {
    if (days == null) return gap.deadline ? `Due ${gap.deadline}` : 'Ongoing';
    if (days < 0) return `Overdue by ${Math.abs(days)} days`;
    if (days < 30) return `${days} days left`;
    if (days < 365) return `${Math.round(days / 30)} months left`;
    return `${Math.round(days / 365)} year${Math.round(days / 365) === 1 ? '' : 's'} left`;
  })();
  return (
    <View style={[styles.gap, { borderLeftColor: c }]}>
      <Text
        style={[
          styles.gapTitle,
          resolved && styles.strikethrough,
        ]}
      >
        {plainTitle}
      </Text>
      {reg.ref && (
        <Text style={styles.gapRef}>Reference: {reg.ref}</Text>
      )}
      {resolved ? (
        <View style={styles.resolvedPill}>
          <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
          <Text style={styles.resolvedPillText}>Resolved by simulation</Text>
        </View>
      ) : (
        <View style={styles.gapMetaRow}>
          <View style={styles.gapMetaCell}>
            <Ionicons name="time" size={14} color={c} />
            <Text style={[styles.gapMetaText, { color: c }]}>{dueText}</Text>
          </View>
        </View>
      )}
      {!resolved && (
        <TouchableOpacity
          style={[styles.fixBtn, { borderColor: c }]}
          onPress={onFix}
          activeOpacity={0.85}
        >
          <Ionicons name="flash" size={15} color={c} />
          <Text style={[styles.fixBtnText, { color: c }]}>See how to fix</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ContradictionCard({ contradiction, resolved }) {
  const claim = contradiction.claim || 'Information in your documents';
  const evidence =
    contradiction.evidence_text || contradiction.evidence || 'Audit evidence';
  return (
    <View
      style={[
        styles.contra,
        resolved && styles.contraResolved,
      ]}
    >
      <View style={styles.contraHead}>
        <Ionicons
          name={resolved ? 'checkmark-circle' : 'warning'}
          size={18}
          color={resolved ? colors.primary : colors.critical}
        />
        <Text
          style={[
            styles.contraTitle,
            resolved && { color: colors.primary },
          ]}
        >
          {resolved ? 'Document mismatch resolved' : 'Mismatch between your documents'}
        </Text>
      </View>
      <Text style={styles.contraBody}>
        Your documents say{' '}
        <Text style={[styles.contraStrong, resolved && styles.strikethrough]}>
          {claim}
        </Text>{' '}
        but audit evidence shows{' '}
        <Text style={[styles.contraStrong, resolved && styles.strikethrough]}>
          {evidence}
        </Text>
        .
      </Text>
      {resolved ? (
        <View style={styles.resolvedPill}>
          <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
          <Text style={styles.resolvedPillText}>Resolved by simulation</Text>
        </View>
      ) : (
        <Text style={styles.contraFooter}>
          This needs to be resolved before your next buyer audit.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },

  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
  },
  viewToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },

  scoreCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
    ...shadow,
  },
  scoreCenter: { alignItems: 'center' },
  statusLine: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },

  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionSub: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: spacing.md,
  },

  gap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  gapTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 4,
  },
  gapRef: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  gapMetaRow: { flexDirection: 'row', marginBottom: spacing.md },
  gapMetaCell: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.lg },
  gapMetaText: { fontSize: 14, marginLeft: 6, fontWeight: '600' },
  fixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  fixBtnText: { marginLeft: 6, fontWeight: '700', fontSize: 14 },

  contra: {
    backgroundColor: colors.criticalSoft,
    borderWidth: 1,
    borderColor: colors.critical,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  contraResolved: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  contraHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  contraTitle: {
    color: colors.critical,
    fontWeight: '800',
    fontSize: 15,
    marginLeft: 8,
  },
  contraBody: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  contraStrong: { color: colors.text, fontWeight: '700' },
  contraFooter: {
    color: colors.critical,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },

  strikethrough: {
    textDecorationLine: 'line-through',
    color: colors.textDim,
  },
  resolvedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  resolvedPillText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 6,
  },

  bottomLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  bottomLinkText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 8,
    textDecorationLine: 'underline',
  },
});
