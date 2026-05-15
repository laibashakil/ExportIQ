import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  riskSoftColor,
  radii,
  spacing,
  shadow,
} from '../constants/colors';
import { subscribeFactory, subscribeReport } from '../services/firebase';
import { formatPkr, formatRelativeTime } from '../services/format';
import { api } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import CircularScore from '../components/CircularScore';
import EmptyState from '../components/EmptyState';

const SEV_TO_RISK = {
  CRITICAL: 'CRITICAL',
  HIGH: 'WARNING',
  MEDIUM: 'WARNING',
  LOW: 'COMPLIANT',
};

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
  const pkr = factory?.orders_at_risk_pkr ?? report?.orders_at_risk_pkr ?? 0;
  const gaps = report?.gaps || [];
  const contradictions = report?.contradictions || [];

  const lastAnalyzedAt = useMemo(() => {
    return (
      factory?.updated_at ||
      report?.simulation_result?.updated_at ||
      report?.financial_impact?.updated_at ||
      null
    );
  }, [factory, report]);

  const runAnalysis = useCallback(async () => {
    try {
      setAnalyzing(true);
      const res = await api.analyze(factoryId);
      Alert.alert(
        'Analysis started',
        `Job ${res.job_id}\nTake ~6 minutes on Gemini 2.5 Pro. Score will update live.`,
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
              size={160}
              stroke={12}
              score={Math.max(0, Math.min(100, Math.round(score)))}
              risk={risk}
            />
          </View>
          <View style={styles.scoreMeta}>
            <RiskBadge level={risk} />
            <Text style={styles.lastAnalyzed}>
              Last analyzed {formatRelativeTime(lastAnalyzedAt)}
            </Text>
          </View>
          <View style={styles.scoreFooter}>
            <View style={styles.scoreFooterCell}>
              <Text style={styles.scoreFooterValue}>{formatPkr(pkr)}</Text>
              <Text style={styles.scoreFooterLabel}>AT RISK</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.scoreFooterCell}>
              <Text style={styles.scoreFooterValue}>{gaps.length}</Text>
              <Text style={styles.scoreFooterLabel}>GAPS</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.scoreFooterCell}>
              <Text
                style={[
                  styles.scoreFooterValue,
                  contradictions.length > 0 && { color: colors.critical },
                ]}
              >
                {contradictions.length}
              </Text>
              <Text style={styles.scoreFooterLabel}>CONFLICTS</Text>
            </View>
          </View>
        </View>

        {/* Contradictions */}
        {contradictions.length > 0 && (
          <>
            <Text style={styles.section}>
              <Ionicons name="warning" size={14} color={colors.critical} />
              {'  '}Contradictions ({contradictions.length})
            </Text>
            {contradictions.map((c, i) => (
              <ContradictionCard key={i} contradiction={c} />
            ))}
          </>
        )}

        {/* Gaps */}
        {hasData && (
          <Text style={styles.section}>
            <Ionicons name="alert-circle" size={14} color={colors.warning} />
            {'  '}Compliance Gaps ({gaps.length})
          </Text>
        )}

        {hasData ? (
          gaps.length === 0 ? (
            <EmptyState
              emoji="✅"
              title="No open gaps"
              message="This factory currently meets every applicable EU and UK requirement."
            />
          ) : (
            gaps.map((g, i) => (
              <GapCard
                key={i}
                gap={g}
                onFix={() => navigation.navigate('Actions')}
              />
            ))
          )
        ) : (
          <EmptyState
            emoji="📊"
            title="No analysis run yet"
            message="Run a full compliance analysis to see gaps, contradictions, and PKR risk for this factory."
            cta={{
              label: analyzing ? 'Starting…' : 'Run Analysis',
              icon: 'play',
              onPress: analyzing ? () => {} : runAnalysis,
            }}
          />
        )}
      </ScrollView>

      {/* Floating action button */}
      {hasData && (
        <TouchableOpacity
          style={styles.fab}
          onPress={runAnalysis}
          disabled={analyzing}
          activeOpacity={0.85}
        >
          <Ionicons
            name={analyzing ? 'time' : 'refresh'}
            size={20}
            color={colors.bg}
          />
          <Text style={styles.fabText}>
            {analyzing ? 'Starting…' : 'Re-run Analysis'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function GapCard({ gap, onFix }) {
  const sev = gap.severity || 'MEDIUM';
  const riskBucket = SEV_TO_RISK[sev] || 'WARNING';
  const c = riskColor(riskBucket);
  const days = gap.days_remaining;
  const dueText = (() => {
    if (days == null) return gap.deadline ? `Due ${gap.deadline}` : 'Continuous obligation';
    if (days < 0) return `Overdue by ${Math.abs(days)}d`;
    if (days < 30) return `${days}d left`;
    if (days < 365) return `${Math.round(days / 30)} months left`;
    return `${Math.round(days / 365)}y left`;
  })();
  return (
    <View style={[styles.gap, { borderLeftColor: c }]}>
      <View style={styles.gapHead}>
        <View style={styles.gapBadge}>
          <Text style={styles.gapBadgeText}>{gap.regulation || 'REGULATION'}</Text>
        </View>
        <RiskBadge level={riskBucket} />
      </View>
      <Text style={styles.gapReq} numberOfLines={3}>
        {gap.requirement || 'Compliance requirement'}
      </Text>
      <View style={styles.gapMetaRow}>
        <View style={styles.gapMetaCell}>
          <Ionicons name="alert" size={12} color={colors.textDim} />
          <Text style={styles.gapMetaText}>{gap.status || 'OPEN'}</Text>
        </View>
        <View style={styles.gapMetaCell}>
          <Ionicons name="time" size={12} color={colors.textDim} />
          <Text
            style={[
              styles.gapMetaText,
              days != null && days < 30 && { color: colors.critical },
            ]}
          >
            {dueText}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={[styles.fixBtn, { borderColor: c }]} onPress={onFix} activeOpacity={0.85}>
        <Ionicons name="construct" size={14} color={c} />
        <Text style={[styles.fixBtnText, { color: c }]}>Fix This</Text>
      </TouchableOpacity>
    </View>
  );
}

function ContradictionCard({ contradiction }) {
  const conf = Math.round((Number(contradiction.confidence) || 0) * 100);
  return (
    <View style={styles.contra}>
      <View style={styles.contraHead}>
        <View style={styles.contraIcon}>
          <Ionicons name="warning" size={16} color={colors.critical} />
        </View>
        <Text style={styles.contraTitle}>Conflicting source signals</Text>
        <Text style={styles.contraConf}>{conf}% conf</Text>
      </View>

      <View style={styles.contraSplit}>
        <View style={styles.contraSide}>
          <Text style={styles.contraLabel}>FACTORY CLAIMS</Text>
          <Text style={styles.contraBody} numberOfLines={3}>
            {contradiction.claim || '—'}
          </Text>
          <Text style={styles.contraSrc} numberOfLines={1}>
            📄 {contradiction.source_a || '(unknown source)'}
          </Text>
        </View>
        <View style={styles.contraVsCol}>
          <Text style={styles.contraVs}>VS</Text>
        </View>
        <View style={styles.contraSide}>
          <Text style={styles.contraLabel}>AUDIT EVIDENCE</Text>
          <Text style={styles.contraBody} numberOfLines={3}>
            {contradiction.evidence || '—'}
          </Text>
          <Text style={styles.contraSrc} numberOfLines={1}>
            📄 {contradiction.source_b || '(unknown source)'}
          </Text>
        </View>
      </View>

      {contradiction.impact && (
        <Text style={styles.contraImpact}>{contradiction.impact}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 110 },

  // Score card
  scoreCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadow,
  },
  scoreCenter: { alignItems: 'center' },
  scoreMeta: { alignItems: 'center', marginTop: spacing.md },
  lastAnalyzed: { color: colors.textDim, fontSize: 12, marginTop: 8 },
  scoreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    width: '100%',
  },
  scoreFooterCell: { flex: 1, alignItems: 'center' },
  scoreFooterValue: { color: colors.text, fontSize: 17, fontWeight: '800' },
  scoreFooterLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
  },
  divider: { width: 1, height: 28, backgroundColor: colors.border },

  // Section header
  section: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    letterSpacing: 0.3,
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
  gapHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  gapBadge: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  gapBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  gapReq: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  gapMetaRow: { flexDirection: 'row', marginBottom: spacing.md },
  gapMetaCell: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.lg },
  gapMetaText: { color: colors.textDim, fontSize: 12, marginLeft: 6, fontWeight: '600' },
  fixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  fixBtnText: { marginLeft: 6, fontWeight: '700', fontSize: 13 },

  // Contradiction card
  contra: {
    backgroundColor: colors.criticalSoft,
    borderWidth: 1,
    borderColor: colors.critical,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  contraHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  contraIcon: { marginRight: 8 },
  contraTitle: { color: colors.critical, fontWeight: '800', fontSize: 13, flex: 1 },
  contraConf: {
    color: colors.critical,
    backgroundColor: colors.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    fontSize: 10,
    fontWeight: '800',
  },
  contraSplit: { flexDirection: 'row', alignItems: 'stretch' },
  contraSide: { flex: 1 },
  contraVsCol: { paddingHorizontal: 6, justifyContent: 'center' },
  contraVs: {
    color: colors.critical,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  contraLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  contraBody: { color: colors.text, fontSize: 12, lineHeight: 17, marginBottom: 6 },
  contraSrc: { color: colors.textDim, fontSize: 10, fontFamily: 'monospace' },
  contraImpact: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239,68,68,0.3)',
    fontStyle: 'italic',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow,
  },
  fabText: { color: colors.bg, fontWeight: '800', fontSize: 13, marginLeft: 8 },
});
