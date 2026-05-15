import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';

import {
  colors,
  radii,
  shadow,
  spacing,
} from '../constants/colors';
import { subscribeReport } from '../services/firebase';
import { api } from '../services/api';
import { formatPkr, buyerFlag } from '../services/format';
import EmptyState from '../components/EmptyState';
import { markdownStyles } from '../components/MarkdownStyles';

export default function BuyerCommsScreen({ route }) {
  const { factoryId } = route.params;
  const [report, setReport] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const u = subscribeReport(factoryId, setReport);
    return () => u && u();
  }, [factoryId]);

  const documents = report?.documents || [];
  const emails = documents.filter((d) => d.kind === 'BUYER_EMAIL');
  const buyersAffected = report?.financial_impact?.buyers_affected || [];
  const totalAtRisk = Number(report?.financial_impact?.orders_at_risk_pkr) || 0;

  // Group emails by buyer, count gaps each buyer is exposed to via the
  // gap_id <- impact_pkr distribution from the action chain.
  const buyersMap = useMemo(() => {
    const m = {};
    for (const b of buyersAffected) {
      // Try to find an email targeted at this buyer (title contains buyer name)
      const email = emails.find(
        (e) => (e.title || '').toLowerCase().includes(b.toLowerCase()),
      );
      // Equal-share split of total at-risk PKR across affected buyers as a
      // first approximation when per-buyer breakdown is not in the report.
      const share = buyersAffected.length
        ? Math.round(totalAtRisk / buyersAffected.length)
        : 0;
      m[b] = { buyer: b, email, share };
    }
    return m;
  }, [buyersAffected, emails, totalAtRisk]);

  if (buyersAffected.length === 0 && emails.length === 0) {
    return (
      <View style={styles.bg}>
        <EmptyState
          icon="briefcase"
          iconColor={colors.primary}
          title="No buyer comms yet"
          message="Once you run an analysis, ExportIQ auto-drafts a buyer email per affected buyer, citing the specific gap and remediation timeline."
          cta={{
            label: 'Run Analysis',
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
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Buyer Comms</Text>
          <Text style={styles.h2}>
            {buyersAffected.length} buyer{buyersAffected.length === 1 ? '' : 's'} affected · {emails.length} email{emails.length === 1 ? '' : 's'} drafted
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="briefcase" size={18} color={colors.primary} />
          <Text style={styles.headerBadgeValue}>{buyersAffected.length}</Text>
        </View>
      </View>

      {/* Total-exposure banner */}
      <View style={styles.banner}>
        <View style={styles.bannerLeft}>
          <Ionicons name="warning" size={18} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerLabel}>TOTAL BUYER EXPOSURE</Text>
          <Text style={styles.bannerValue}>{formatPkr(totalAtRisk)}</Text>
        </View>
      </View>

      <Text style={styles.section}>Affected Buyers</Text>

      {Object.values(buyersMap).map(({ buyer, email, share }) => {
        const isOpen = expanded === buyer;
        const flag = buyerFlag(buyer);
        return (
          <View key={buyer} style={styles.card}>
            <TouchableOpacity
              style={styles.cardHead}
              onPress={() => email && setExpanded(isOpen ? null : buyer)}
              activeOpacity={email ? 0.8 : 1}
            >
              {flag ? (
                <Text style={styles.flag}>{flag}</Text>
              ) : (
                <Ionicons name="globe" size={24} color={colors.textDim} />
              )}
              <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                <Text style={styles.buyerName}>{buyer}</Text>
                <Text style={styles.buyerSub}>
                  Approx. {formatPkr(share)} exposure
                </Text>
              </View>
              {email ? (
                <View style={[styles.statusPill, styles.statusOk]}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
                  <Text style={styles.statusOkText}>Email drafted</Text>
                </View>
              ) : (
                <View style={[styles.statusPill, styles.statusWarn]}>
                  <Ionicons name="alert" size={12} color={colors.warning} />
                  <Text style={styles.statusWarnText}>Action required</Text>
                </View>
              )}
            </TouchableOpacity>

            {email && (
              <Text style={styles.cardEmailMeta}>
                <Ionicons name="mail" size={11} color={colors.textDim} />{' '}
                {email.title}
              </Text>
            )}

            {email && (
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => setExpanded(isOpen ? null : buyer)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'reader'}
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.viewBtnText}>
                  {isOpen ? 'Hide email body' : 'View email draft'}
                </Text>
              </TouchableOpacity>
            )}

            {isOpen && email && (
              <View style={styles.emailBody}>
                <Markdown style={markdownStyles}>{String(email.body || '')}</Markdown>
              </View>
            )}
          </View>
        );
      })}

      {/* Any extra emails not matched to a known buyer */}
      {emails.filter((e) => !Object.values(buyersMap).some((b) => b.email === e)).length > 0 && (
        <>
          <Text style={[styles.section, { marginTop: spacing.xl }]}>Other Drafts</Text>
          {emails
            .filter((e) => !Object.values(buyersMap).some((b) => b.email === e))
            .map((e, i) => (
              <View key={e.document_id || i} style={styles.card}>
                <Text style={styles.buyerName}>{e.title}</Text>
                <Markdown style={markdownStyles}>{String(e.body || '')}</Markdown>
              </View>
            ))}
        </>
      )}
    </ScrollView>
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
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  headerBadgeValue: { color: colors.primary, fontWeight: '800', fontSize: 14, marginLeft: 6 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerLeft: { marginRight: spacing.md },
  bannerLabel: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bannerValue: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },

  section: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: spacing.md,
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
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  flag: { fontSize: 26 },
  buyerName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  buyerSub: { color: colors.textDim, fontSize: 12, marginTop: 3 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  statusOk: { backgroundColor: colors.primarySoft },
  statusOkText: { color: colors.primary, fontSize: 10, fontWeight: '800', marginLeft: 4, letterSpacing: 0.5 },
  statusWarn: { backgroundColor: colors.warningSoft },
  statusWarnText: { color: colors.warning, fontSize: 10, fontWeight: '800', marginLeft: 4, letterSpacing: 0.5 },

  cardEmailMeta: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: spacing.md,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  viewBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12, marginLeft: 6 },

  emailBody: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  emailBodyText: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
  },
});
