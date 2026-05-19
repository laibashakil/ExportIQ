import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, riskColor, radii, spacing, shadow } from '../constants/colors';
import { DEMO_FACTORIES } from '../constants/config';
import { subscribeFactory, subscribeReport } from '../services/firebase';
import CircularScore from '../components/CircularScore';

function plainRiskLine(factory, report) {
  if (factory.is_empty && !report) {
    return 'Tap to upload your audit report';
  }
  const gaps = report?.gaps?.length ?? 0;
  const contradictions = report?.contradictions?.length ?? 0;
  if (factory.risk_level === 'COMPLIANT') {
    return 'Your factory meets EU export requirements';
  }
  if (gaps > 0) {
    const base = `${gaps} EU rule${gaps === 1 ? '' : 's'} need${gaps === 1 ? 's' : ''} attention`;
    if (contradictions > 0) {
      return `${base} · ${contradictions} mismatch${contradictions === 1 ? '' : 'es'} in documents`;
    }
    return base;
  }
  if (factory.risk_level === 'CRITICAL') return 'Export orders are at risk';
  if (factory.risk_level === 'WARNING') return 'Some issues to review';
  return 'Tap to see status';
}

// "No report yet" is the trigger for the upload flow. A factory has no
// report when its subdoc /reports/latest is missing OR when the demo
// placeholder card was flagged `is_empty`.
function hasReport(factory, report) {
  if (factory.is_empty) return false;
  if (!report) return false;
  // Reports must have at least the basic shape to count.
  return Array.isArray(report.gaps) || Array.isArray(report.action_chain) || !!report.simulation_result;
}

export default function HomeScreen({ navigation }) {
  const [factories, setFactories] = useState(DEMO_FACTORIES);
  const [reports, setReports] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const tapCount = useRef(0);
  const tapTimer = useRef(null);

  useEffect(() => {
    const unsubs = DEMO_FACTORIES.map((f) =>
      subscribeFactory(f.factory_id, (doc) => {
        if (!doc) return;
        setFactories((prev) =>
          prev.map((p) => (p.factory_id === f.factory_id ? { ...p, ...doc } : p))
        );
      })
    );
    // Subscribe to reports for the plain-English line under each factory.
    const reportUnsubs = DEMO_FACTORIES.map((f) =>
      subscribeReport(f.factory_id, (doc) => {
        if (!doc) return;
        setReports((prev) => ({ ...prev, [f.factory_id]: doc }));
      })
    );
    return () => {
      unsubs.forEach((u) => u && u());
      reportUnsubs.forEach((u) => u && u());
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Easter egg: 5 quick taps on the brand opens the hidden agent trace.
  const onBrandTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1500);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      const first = factories[0];
      navigation.navigate('DevTrace', {
        factoryId: first?.factory_id,
        factoryName: first?.factory_name,
      });
    }
  };

  const today = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
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
        {/* Brand header (5-tap easter egg on the brand text) + info icon */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.brandWrap}
            activeOpacity={1}
            onPress={onBrandTap}
          >
            <View style={styles.brandRow}>
              <Image
                source={require('../assets/logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <View style={styles.brandTextWrap}>
                <View style={styles.brandNameRow}>
                  <Text style={styles.brandWhite}>Export</Text>
                  <Text style={styles.brandTeal}>IQ</Text>
                </View>
                <Text style={styles.tagline}>Textile Export Compliance</Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.infoBtn}
            onPress={() => navigation.navigate('HowItWorks')}
            activeOpacity={0.7}
            accessibilityLabel="How ExportIQ works"
          >
            <Ionicons name="information-circle-outline" size={28} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Simple summary line — no money figures up front */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Ionicons name="business" size={18} color={colors.primary} />
            <Text style={styles.summaryText} numberOfLines={1}>
              {factories.length} factories monitored
            </Text>
          </View>
          <Text style={styles.summarySub} numberOfLines={1}>
            Last checked {today}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>YOUR FACTORIES</Text>

        {factories.map((item) => {
          const report = reports[item.factory_id];
          const ready = hasReport(item, report);
          return (
            <FactoryCard
              key={item.factory_id}
              item={item}
              riskLine={plainRiskLine(item, report)}
              empty={!ready}
              onPress={() =>
                ready
                  ? navigation.navigate('Factory', {
                      factoryId: item.factory_id,
                      factoryName: item.factory_name,
                    })
                  : navigation.navigate('Upload', {
                      factoryId: item.factory_id,
                      factoryName: item.factory_name,
                    })
              }
            />
          );
        })}

        <Text style={styles.footerNote}>
          Pull down to refresh · Tap a factory to see details
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function FactoryCard({ item, riskLine, empty, onPress }) {
  const c = empty ? colors.primary : riskColor(item.risk_level);
  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: c }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardLeft}>
        <View style={styles.factoryIconCircle}>
          <Ionicons
            name={empty ? 'cloud-upload-outline' : 'business'}
            size={24}
            color={c}
          />
        </View>
      </View>

      <View style={styles.cardMid}>
        <Text style={styles.factoryName} numberOfLines={2}>
          {item.factory_name}
        </Text>
        <View style={styles.locationRow}>
          <Ionicons name="location" size={13} color={colors.textDim} />
          <Text style={styles.factoryCity}>{item.city}</Text>
        </View>
        <Text style={[styles.riskLine, { color: c }]} numberOfLines={2}>
          {riskLine}
        </Text>
      </View>

      <View style={styles.cardRight}>
        {empty ? (
          <View style={styles.uploadBadge}>
            <Ionicons name="add-circle" size={26} color={colors.primary} />
            <Text style={styles.uploadBadgeText}>Upload</Text>
          </View>
        ) : (
          <CircularScore
            size={68}
            stroke={6}
            score={Number(item.compliance_score) || 0}
            risk={item.risk_level}
            label="/ 100"
          />
        )}
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
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 60 },

  header: {
    marginBottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandWrap: { flex: 1 },
  infoBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 10,
  },
  brandTextWrap: { flex: 1, minWidth: 0 },
  brandNameRow: { flexDirection: 'row', alignItems: 'baseline' },
  brandWhite: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandTeal: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: { color: '#8B949E', fontSize: 12, marginTop: 2 },

  summary: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: spacing.xl,
    ...shadow,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 10,
    flexShrink: 1,
  },
  summarySub: { color: colors.textDim, fontSize: 13, marginTop: 6 },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    letterSpacing: 1,
    fontWeight: '800',
    marginBottom: spacing.md,
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardMid: { flex: 1, minWidth: 0 },
  cardRight: { alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md },

  factoryName: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 21 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  factoryCity: { color: colors.textDim, fontSize: 13, marginLeft: 4 },
  riskLine: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    fontWeight: '600',
  },

  footerNote: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  uploadBadge: { alignItems: 'center' },
  uploadBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
});
