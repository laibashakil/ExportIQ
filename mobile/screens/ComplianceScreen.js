import React, { useEffect, useState, useCallback } from 'react';
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
import { subscribeFactory, subscribeReport } from '../services/firebase';
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

function plainStatusLine(risk, gaps, contradictions) {
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

  const score = factory?.compliance_score ?? report?.compliance_score ?? 0;
  const risk = factory?.risk_level ?? 'CRITICAL';
  const gaps = report?.gaps || [];
  const contradictions = report?.contradictions || [];

  const runAnalysis = useCallback(async () => {
    try {
      setAnalyzing(true);
      const res = await api.analyze(factoryId);
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

  const hasData = gaps.length > 0 || contradictions.length > 0 || report;

  return (
    <View style={styles.bg}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Score card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreCenter}>
            <CircularScore
              size={170}
              stroke={13}
              score={Math.max(0, Math.min(100, Math.round(score)))}
              risk={risk}
            />
          </View>
          <Text
            style={[styles.statusLine, { color: riskColor(risk) }]}
          >
            {plainStatusLine(risk, gaps.length, contradictions.length)}
          </Text>
        </View>

        {/* Contradictions */}
        {contradictions.length > 0 && (
          <>
            <Text style={styles.section}>Conflicting Information Found</Text>
            <Text style={styles.sectionSub}>
              Our AI found information in your documents that does not match.
              This could cause problems during a buyer audit.
            </Text>
            {contradictions.map((c, i) => (
              <ContradictionCard key={i} contradiction={c} />
            ))}
          </>
        )}

        {/* Gaps */}
        {hasData && (
          <Text style={styles.section}>
            Issues Found{gaps.length > 0 ? ` (${gaps.length})` : ''}
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
                onFix={() => navigation.navigate('Fix It')}
              />
            ))
          )
        ) : (
          <EmptyState
            icon="bar-chart"
            iconColor={colors.primary}
            title="No analysis run yet"
            message="Run a check to see what EU and UK rules apply to your factory and what needs attention."
            cta={{
              label: analyzing ? 'Starting…' : 'Check My Factory',
              icon: 'play-circle',
              onPress: analyzing ? () => {} : runAnalysis,
            }}
          />
        )}

        {/* Bottom text link replaces the floating button */}
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

function GapCard({ gap, onFix }) {
  const sev = gap.severity || 'MEDIUM';
  const riskBucket = SEV_TO_RISK[sev] || 'WARNING';
  const c = riskColor(riskBucket);
  const reg = plainRegulation(gap.regulation);
  // Backend now attaches a plain-English `display_title` to every gap.
  // Prefer it; fall back to the mobile-side humaniser for older data.
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
      <Text style={styles.gapTitle}>{plainTitle}</Text>
      {reg.ref && (
        <Text style={styles.gapRef}>Reference: {reg.ref}</Text>
      )}
      <View style={styles.gapMetaRow}>
        <View style={styles.gapMetaCell}>
          <Ionicons name="time" size={14} color={c} />
          <Text style={[styles.gapMetaText, { color: c }]}>{dueText}</Text>
        </View>
      </View>
      <TouchableOpacity style={[styles.fixBtn, { borderColor: c }]} onPress={onFix} activeOpacity={0.85}>
        <Ionicons name="flash" size={15} color={c} />
        <Text style={[styles.fixBtnText, { color: c }]}>See how to fix</Text>
      </TouchableOpacity>
    </View>
  );
}

function ContradictionCard({ contradiction }) {
  const claim = contradiction.claim || 'Information in your documents';
  // Backend now emits plain-English evidence_text. Fall back to the legacy
  // evidence field for older reports.
  const evidence =
    contradiction.evidence_text || contradiction.evidence || 'Audit evidence';
  return (
    <View style={styles.contra}>
      <View style={styles.contraHead}>
        <Ionicons name="warning" size={18} color={colors.critical} />
        <Text style={styles.contraTitle}>Mismatch between your documents</Text>
      </View>
      <Text style={styles.contraBody}>
        Your documents say <Text style={styles.contraStrong}>{claim}</Text>
        {' '}but audit evidence shows{' '}
        <Text style={styles.contraStrong}>{evidence}</Text>.
      </Text>
      <Text style={styles.contraFooter}>
        This needs to be resolved before your next buyer audit.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },

  // Score card
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

  // Section header
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

  // Gap card
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

  // Contradiction card
  contra: {
    backgroundColor: colors.criticalSoft,
    borderWidth: 1,
    borderColor: colors.critical,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
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

  // Bottom run-new link (replaces the floating button)
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
