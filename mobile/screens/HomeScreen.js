import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, riskColor, radii, spacing, shadow } from '../constants/colors';
import { DEMO_FACTORIES } from '../constants/config';
import { subscribeFactory } from '../services/firebase';
import { formatPkr } from '../services/format';
import RiskBadge from '../components/RiskBadge';
import CircularScore from '../components/CircularScore';

export default function HomeScreen({ navigation }) {
  const [factories, setFactories] = useState(DEMO_FACTORIES);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState(Date.now());

  // Live-subscribe to each factory doc; reflect server-side compliance state.
  useEffect(() => {
    const unsubs = DEMO_FACTORIES.map((f) =>
      subscribeFactory(f.factory_id, (doc) => {
        if (!doc) return;
        setFactories((prev) =>
          prev.map((p) => (p.factory_id === f.factory_id ? { ...p, ...doc } : p))
        );
        setLastSync(Date.now());
      })
    );
    return () => unsubs.forEach((u) => u && u());
  }, []);

  // Roll-ups for the summary bar at the top.
  const summary = useMemo(() => {
    const total = factories.length;
    const totalRisk = factories.reduce(
      (acc, f) => acc + (Number(f.orders_at_risk_pkr) || 0),
      0,
    );
    const worstLevel = factories.some((f) => f.risk_level === 'CRITICAL')
      ? 'CRITICAL'
      : factories.some((f) => f.risk_level === 'WARNING')
      ? 'WARNING'
      : 'COMPLIANT';
    return { total, totalRisk, worstLevel };
  }, [factories]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={onRefresh}
          />
        }
      >
        {/* Brand header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>
              ExportIQ <Text style={styles.flag}>🇵🇰</Text>
            </Text>
            <Text style={styles.tagline}>Pakistan Textile Compliance · Live</Text>
          </View>
          <View style={styles.liveDot}>
            <View style={styles.liveDotInner} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {/* Summary bar */}
        <View style={styles.summary}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{summary.total}</Text>
            <Text style={styles.summaryLabel}>FACTORIES</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{formatPkr(summary.totalRisk)}</Text>
            <Text style={styles.summaryLabel}>TOTAL AT RISK</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryCell}>
            <RiskBadge level={summary.worstLevel} />
            <Text style={styles.summaryLabel}>WORST</Text>
          </View>
        </View>

        {/* Section label */}
        <Text style={styles.sectionLabel}>YOUR FACTORIES</Text>

        {factories.map((item) => (
          <FactoryCard
            key={item.factory_id}
            item={item}
            onPress={() =>
              navigation.navigate('Factory', {
                factoryId: item.factory_id,
                factoryName: item.factory_name,
              })
            }
          />
        ))}

        <Text style={styles.footerNote}>
          Pull to refresh · Tap a factory for full compliance detail
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function FactoryCard({ item, onPress }) {
  const c = riskColor(item.risk_level);
  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: c }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardLeft}>
        <View style={styles.factoryIconCircle}>
          <Ionicons name="business" size={24} color={c} />
        </View>
      </View>

      <View style={styles.cardMid}>
        <Text style={styles.factoryName} numberOfLines={1}>
          {item.factory_name}
        </Text>
        <View style={styles.locationRow}>
          <Ionicons name="location" size={12} color={colors.textDim} />
          <Text style={styles.factoryCity}>{item.city}</Text>
        </View>
        <View style={styles.metaRow}>
          <RiskBadge level={item.risk_level} />
          <Text style={styles.pkrText}>
            {formatPkr(item.orders_at_risk_pkr)} at risk
          </Text>
        </View>
      </View>

      <View style={styles.cardRight}>
        <CircularScore
          size={68}
          stroke={6}
          score={Number(item.compliance_score) || 0}
          risk={item.risk_level}
          label="/ 100"
        />
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.textDim}
          style={{ marginTop: 6 }}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 60 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.lg,
  },
  brand: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  flag: { fontSize: 20 },
  tagline: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  liveDot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  liveDotInner: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  liveText: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    ...shadow,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryValue: { color: colors.text, fontSize: 17, fontWeight: '800' },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 6,
    fontWeight: '700',
  },
  divider: { width: 1, height: 32, backgroundColor: colors.border },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginLeft: 4,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  cardLeft: { marginRight: spacing.md },
  factoryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardMid: { flex: 1, minWidth: 0 },
  cardRight: { alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md },

  factoryName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  factoryCity: { color: colors.textDim, fontSize: 12, marginLeft: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  pkrText: { color: colors.text, fontSize: 12, marginLeft: 10, fontWeight: '600' },

  footerNote: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
