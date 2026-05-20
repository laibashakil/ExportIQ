// Plain-English explainer reached by tapping the ℹ️ icon on the HomeScreen
// header. Four steps with icons; no jargon. Aimed at a judge who's never
// seen the app before.
import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadow, spacing } from '../constants/colors';

const STEPS = [
  {
    icon: 'cloud-upload',
    title: 'You upload your factory documents',
    body:
      'Just your factory\'s audit report PDF. We use it to understand your current compliance.',
  },
  {
    icon: 'book',
    title: 'Our AI reads EU and UK export rules',
    body:
      'We keep the latest EU CBAM, UK Modern Slavery Act and Supply Chain rules in our system — you don\'t have to.',
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
          </View>
        ))}

        <Text style={styles.sectionHeader}>How We Calculate Your Score</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoBody}>
            Your compliance score reflects how well your factory's documentation
            aligns with EU and UK export rules. Critical missing requirements
            weigh more heavily than minor gaps. Contradictions between your own
            documents reduce your score because they signal audit risk.
          </Text>
        </View>

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
