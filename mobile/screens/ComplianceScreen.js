import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

import ComplianceScoreCard from '../components/ComplianceScoreCard';
import ContradictionAlert from '../components/ContradictionAlert';
import RiskBadge from '../components/RiskBadge';
import { colors, riskColor } from '../constants/colors';
import { subscribeFactory, subscribeReport } from '../services/firebase';

export default function ComplianceScreen({ route }) {
  const { factoryId } = route.params;
  const [factory, setFactory] = useState(null);
  const [report, setReport] = useState(null);

  useEffect(() => {
    const u1 = subscribeFactory(factoryId, setFactory);
    const u2 = subscribeReport(factoryId, setReport);
    return () => { u1 && u1(); u2 && u2(); };
  }, [factoryId]);

  const score = factory?.compliance_score ?? report?.compliance_score ?? 0;
  const risk = factory?.risk_level ?? 'CRITICAL';
  const pkr = factory?.orders_at_risk_pkr ?? report?.orders_at_risk_pkr ?? 0;
  const gaps = report?.gaps || [];
  const contradictions = report?.contradictions || [];

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <ComplianceScoreCard score={score} riskLevel={risk} riskPkr={pkr} />

      {contradictions.length > 0 && (
        <>
          <Text style={styles.section}>Contradictions ({contradictions.length})</Text>
          {contradictions.map((c, i) => (
            <ContradictionAlert key={i} contradiction={c} />
          ))}
        </>
      )}

      <Text style={styles.section}>Gaps ({gaps.length})</Text>
      {gaps.length === 0 ? (
        <Text style={styles.empty}>No gaps yet — run a Full Analysis from the Home screen.</Text>
      ) : (
        gaps.map((g, i) => <GapCard key={i} gap={g} />)
      )}
    </ScrollView>
  );
}

function GapCard({ gap }) {
  const c = riskColor(gap.severity === 'CRITICAL' ? 'CRITICAL'
    : gap.severity === 'HIGH' ? 'WARNING' : 'COMPLIANT');
  return (
    <View style={[styles.gap, { borderLeftColor: c }]}>
      <View style={styles.gapHead}>
        <Text style={styles.gapReg}>{gap.regulation}</Text>
        <RiskBadge level={gap.severity === 'CRITICAL' ? 'CRITICAL' : gap.severity === 'HIGH' ? 'WARNING' : 'COMPLIANT'} />
      </View>
      <Text style={styles.gapReq}>{gap.requirement}</Text>
      <View style={styles.gapMeta}>
        <Text style={styles.gapStatus}>{gap.status}</Text>
        <Text style={styles.gapDeadline}>
          {gap.deadline ? `Deadline ${gap.deadline}` : 'Continuous'}
          {gap.days_remaining != null && ` · ${gap.days_remaining}d left`}
        </Text>
      </View>
      {gap.evidence?.length > 0 && (
        <View style={styles.evidenceBlock}>
          {gap.evidence.map((e, i) => (
            <Text key={i} style={styles.evidence}>• {e}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 80 },
  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  empty: { color: colors.textDim, fontStyle: 'italic' },
  gap: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  gapHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' },
  gapReg: { color: colors.primary, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  gapReq: { color: colors.text, marginBottom: 8 },
  gapMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  gapStatus: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  gapDeadline: { color: colors.textDim, fontSize: 12 },
  evidenceBlock: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  evidence: { color: colors.textDim, fontSize: 12, fontFamily: 'monospace', marginBottom: 2 },
});
