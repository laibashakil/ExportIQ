// Plain-English explainer reached by tapping the ℹ️ icon on the HomeScreen
// header. Four steps with icons; no jargon. Aimed at a judge who's never
// seen the app before.
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadow, spacing } from '../constants/colors';
import { getRegulationUrl } from '../services/firebase';

// The regulations the agents read, with their Firebase Storage PDF paths.
// Rendered as tappable rows under step 2 so users can open the real text.
const REGULATIONS = [
  {
    name: 'EU Corporate Sustainability Due Diligence Directive (CSDDD) — 2024/1760',
    note: 'Applies to all suppliers of EU companies above €450M revenue from 2027',
    path: 'regulations/eu_csddd.pdf',
  },
  {
    name: 'UK Modern Slavery Act 2015 — Section 54',
    note: 'Annual transparency statement required for all UK supply chain partners',
    path: 'regulations/uk_modern_slavery.pdf',
  },
  {
    name: 'SA8000 Social Accountability Standard — SAI 2014',
    note: 'Buyer-mandated social audit: labour rights, working hours, safety',
    path: 'regulations/sa8000.pdf',
  },
  {
    name: 'EU REACH — Restricted Substances in Textiles',
    note: 'Bans azo dyes, limits lead, formaldehyde, and other hazardous chemicals',
    path: 'regulations/eu_reach.pdf',
  },
  {
    name: 'GSP+ — EU Zero-Tariff Access (expires Dec 2027)',
    note: "Pakistan's duty-free EU access. Non-compliance triggers 12% tariffs overnight.",
    path: 'regulations/gsplus.pdf',
  },
];

const STEPS = [
  {
    icon: 'cloud-upload',
    title: 'You upload your factory documents',
    body:
      'Just your factory\'s audit report PDF. We use it to understand your current compliance.',
  },
  {
    icon: 'book',
    key: 'rules',
    title: 'Our AI reads EU and UK export rules',
    body:
      'We keep the latest EU CSDDD, UK Modern Slavery Act, SA8000, EU REACH and GSP+ rules in our system — you don\'t have to. Tap any rule to read it:',
  },
  {
    icon: 'search',
    title: 'We compare and find any gaps',
    body:
      'Our agents cross-check your factory against every rule and flag anything missing, expired, or in conflict.',
  },
  {
    icon: 'paper-plane',
    title: 'We tell you what to fix and draft your emails',
    body:
      'You get a clear plain-English action plan, and we draft the emails to your European buyers for you.',
  },
];

// Mirrors web/src/pages/HowItWorks.jsx + utils/scoring.js exactly.
const SCORE_BANDS = [
  { range: '100', label: 'Compliant', color: '#00C48C', desc: 'Meets all EU/UK requirements' },
  { range: '90–99', label: 'Almost Compliant', color: '#F5A623', desc: 'Minor gaps — action needed soon' },
  { range: '60–89', label: 'Needs Attention', color: '#F97316', desc: 'Significant gaps — orders at risk' },
  { range: '0–59', label: 'At Risk', color: '#EF4444', desc: 'High risk of losing export orders' },
];

// Weights verbatim from backend/tools/compliance_scorer.py.
const DEDUCTIONS = [
  { type: 'Critical gap', weight: '−12 pts', example: 'Missing CSDDD due diligence policy (mandatory)' },
  { type: 'High severity gap', weight: '−10 pts', example: 'SA8000 certification expired' },
  { type: 'Medium severity gap', weight: '−5 pts', example: 'Supply chain mapping incomplete' },
  { type: 'Low severity gap', weight: '−2 pts', example: 'Advisory recommendation not addressed' },
  { type: 'Document contradiction', weight: '−4 pts', example: 'ISO claim contradicted by audit data' },
];

const RAISES = [
  'Each gap you fix restores its full deducted points',
  'Resolving a contradiction restores 4 points',
  'Completing the full action plan brings your score back to 100',
];

function ScoreBreakdown() {
  return (
    <>
      <Text style={styles.sectionHeader}>How Your Score Is Calculated</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoBody}>
          Every factory starts at 100. We subtract points for each gap and
          contradiction we find, weighted by how serious it is.
        </Text>
      </View>

      <View style={styles.bandList}>
        {SCORE_BANDS.map((b) => (
          <View key={b.label} style={[styles.band, { backgroundColor: b.color }]}>
            <Text style={styles.bandRange}>{b.range}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.bandLabel}>{b.label}</Text>
              <Text style={styles.bandDesc}>{b.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.subHead}>How points are deducted</Text>
      <View style={styles.deductCard}>
        {DEDUCTIONS.map((d, i) => (
          <View
            key={d.type}
            style={[styles.deductRow, i < DEDUCTIONS.length - 1 && styles.deductDivider]}
          >
            <View style={styles.deductTopRow}>
              <Text style={styles.deductType}>{d.type}</Text>
              <Text style={styles.deductWeight}>{d.weight}</Text>
            </View>
            <Text style={styles.deductExample}>{d.example}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.subHead}>What raises your score</Text>
      <View style={styles.raiseCard}>
        {RAISES.map((r) => (
          <View key={r} style={styles.raiseRow}>
            <Text style={styles.raiseTick}>✓</Text>
            <Text style={styles.raiseText}>{r}</Text>
          </View>
        ))}
      </View>

      <View style={styles.calloutCard}>
        <View style={styles.calloutTitleRow}>
          <Ionicons name="warning" size={16} color="#F5A623" />
          <Text style={styles.calloutTitle}>Contradiction penalty explained</Text>
        </View>
        <Text style={styles.calloutBody}>
          When your own documents disagree — e.g. your factory claims ISO 14001
          certification but your water audit shows effluent at 12 ppm, above the
          8 ppm legal limit — EU auditors treat it as misrepresentation, which is
          more serious than a simple gap. Each contradiction deducts 4 points, and
          ExportIQ drafts a buyer notification email so you can get ahead of it.
        </Text>
      </View>

      <View style={styles.scoreTip}>
        <Text style={styles.scoreTipEmoji}>💡</Text>
        <Text style={styles.scoreTipText}>
          The Simulate feature shows your projected score after each fix is
          completed — so you can see which action has the biggest impact before
          committing resources.
        </Text>
      </View>
    </>
  );
}

function RegulationLinks() {
  // Tracks which regulation path is currently resolving its download URL.
  const [loadingPath, setLoadingPath] = useState(null);

  const open = async (reg) => {
    if (loadingPath) return;
    setLoadingPath(reg.path);
    try {
      const url = await getRegulationUrl(reg.path);
      await Linking.openURL(url);
    } catch (err) {
      console.warn('Could not open regulation PDF', reg.path, err);
    } finally {
      setLoadingPath(null);
    }
  };

  return (
    <View style={styles.regList}>
      {REGULATIONS.map((reg) => (
        <TouchableOpacity
          key={reg.path}
          style={styles.regRow}
          activeOpacity={0.7}
          onPress={() => open(reg)}
          disabled={!!loadingPath}
        >
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.regName}>{reg.name}</Text>
            {reg.note ? <Text style={styles.regNote}>{reg.note}</Text> : null}
          </View>
          {loadingPath === reg.path ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="document-outline" size={14} color="#00C48C" />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function HowItWorksScreen() {
  return (
    <SafeAreaView style={styles.bg} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.brandHero}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.heroLogo}
            resizeMode="contain"
          />
          <View style={styles.brandNameRow}>
            <Text style={styles.brandWhite}>Export</Text>
            <Text style={styles.brandTeal}>IQ</Text>
          </View>
          <Text style={styles.brandTagline}>Textile Export Compliance</Text>
        </View>

        <Text style={styles.title}>How ExportIQ works</Text>
        <Text style={styles.subtitle}>
          Four simple steps to keep your EU and UK export orders safe.
        </Text>

        {STEPS.map((s, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.numberBadge}>
                <Text style={styles.numberBadgeText}>{i + 1}</Text>
              </View>
              <View style={styles.iconWrap}>
                <Ionicons name={s.icon} size={26} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>{s.title}</Text>
            </View>
            <Text style={styles.cardBody}>{s.body}</Text>
            {s.key === 'rules' && <RegulationLinks />}
          </View>
        ))}

        <ScoreBreakdown />

        <Text style={styles.sectionHeader}>Why EU and UK only?</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoBody}>
            65% of Pakistan's textile exports go to EU and UK markets. We focus
            on these regions for the highest-impact compliance coverage.
            Additional jurisdictions (US, Japan, China) can be added on request.
          </Text>
        </View>

        <Text style={styles.sectionHeader}>Handling messy real-world data</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoBody}>
            ExportIQ accepts multiple PDF documents per factory — audit reports,
            certificates, lab results, self-assessments. Our agents use Google
            Gemini's document understanding to extract structured data even
            from inconsistently formatted files. For demo purposes one
            consolidated audit PDF is used.
          </Text>
        </View>

        <View style={styles.tipCard}>
          <Ionicons name="bulb" size={20} color={colors.warning} />
          <Text style={styles.tipText}>
            One missed EU compliance deadline can put crores of rupees of
            export orders at risk. ExportIQ catches gaps before your buyers do.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  brandHero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroLogo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: spacing.md,
  },
  brandNameRow: { flexDirection: 'row', alignItems: 'baseline' },
  brandWhite: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandTeal: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandTagline: {
    color: '#8B949E',
    fontSize: 12,
    marginTop: 4,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  numberBadgeText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    lineHeight: 22,
  },
  cardBody: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 24,
  },
  regList: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  regRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  regName: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  regNote: {
    color: '#8B949E',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  sectionHeader: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  infoBody: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 24,
  },

  // Score breakdown
  bandList: { marginTop: spacing.md },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 6,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  bandRange: { color: '#0D1117', fontWeight: '800', fontSize: 14, width: 54 },
  bandLabel: { color: '#0D1117', fontWeight: '800', fontSize: 13 },
  bandDesc: { color: '#0D1117', fontSize: 11, fontWeight: '600', opacity: 0.85 },

  subHead: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  deductCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
  },
  deductRow: { paddingVertical: 11 },
  deductDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  deductTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deductType: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  deductWeight: { color: '#EF4444', fontWeight: '800', fontSize: 14, marginLeft: 8 },
  deductExample: { color: '#6B7280', fontSize: 12, marginTop: 3, lineHeight: 17 },

  raiseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  raiseRow: { flexDirection: 'row', marginBottom: 6 },
  raiseTick: { color: '#00C48C', fontWeight: '800', marginRight: 8 },
  raiseText: { color: '#C9D1D9', fontSize: 13, lineHeight: 19, flex: 1 },

  calloutCard: {
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#F5A623',
    borderRadius: 6,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  calloutTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  calloutTitle: { color: '#F5A623', fontWeight: '800', fontSize: 14, marginLeft: 6 },
  calloutBody: { color: '#C9D1D9', fontSize: 13, lineHeight: 19 },

  scoreTip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,196,140,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#00C48C',
    borderRadius: 6,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  scoreTipEmoji: { fontSize: 16, marginRight: 8 },
  scoreTipText: { color: '#C9D1D9', fontSize: 13, lineHeight: 19, flex: 1 },

  tipCard: {
    flexDirection: 'row',
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  tipText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
    marginLeft: 10,
    flex: 1,
  },
});
