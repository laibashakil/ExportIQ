import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, riskColor } from '../constants/colors';
import { DEMO_FACTORIES } from '../constants/config';
import { subscribeFactory } from '../services/firebase';
import { api } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import AgentStatusBar from '../components/AgentStatusBar';

export default function HomeScreen({ navigation }) {
  const [factories, setFactories] = useState(DEMO_FACTORIES);
  const [job, setJob] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState({});

  // Subscribe to each demo factory — compliance_score & risk update live.
  useEffect(() => {
    const unsubs = DEMO_FACTORIES.map((f) =>
      subscribeFactory(f.factory_id, (doc) => {
        if (!doc) return;
        setFactories((prev) =>
          prev.map((p) => (p.factory_id === f.factory_id ? { ...p, ...doc } : p))
        );
      })
    );
    return () => unsubs.forEach((u) => u && u());
  }, []);

  const runAnalysis = useCallback(async (factoryId) => {
    try {
      setRunning((r) => ({ ...r, [factoryId]: true }));
      const res = await api.analyze(factoryId);
      setJob(res);
    } catch (e) {
      Alert.alert('Analyze failed', String(e.message));
    } finally {
      setRunning((r) => ({ ...r, [factoryId]: false }));
    }
  }, []);

  const renderItem = ({ item }) => {
    const c = riskColor(item.risk_level);
    return (
      <TouchableOpacity
        style={[styles.factoryCard, { borderLeftColor: c }]}
        onPress={() =>
          navigation.navigate('Factory', {
            factoryId: item.factory_id,
            factoryName: item.factory_name,
          })
        }
      >
        <View style={styles.factoryHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.factoryName}>{item.factory_name}</Text>
            <Text style={styles.factoryCity}>{item.city}</Text>
          </View>
          <Text style={[styles.scoreBig, { color: c }]}>{item.compliance_score}</Text>
        </View>
        <View style={styles.metaRow}>
          <RiskBadge level={item.risk_level} />
          <Text style={styles.pkrText}>
            PKR {Number(item.orders_at_risk_pkr).toLocaleString()} at risk
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => runAnalysis(item.factory_id)}
          style={styles.analyzeBtn}
          disabled={!!running[item.factory_id]}
        >
          <Text style={styles.analyzeBtnText}>
            {running[item.factory_id] ? 'Starting…' : 'Run Full Analysis'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 800);
            }}
          />
        }
      >
        <Text style={styles.h1}>Pakistan Textile Exports</Text>
        <Text style={styles.h2}>
          {factories.length} factories · live compliance + PKR risk
        </Text>
        {job && (
          <View style={styles.jobCard}>
            <Text style={styles.jobLabel}>ACTIVE JOB</Text>
            <Text style={styles.jobId}>{job.job_id}</Text>
            <AgentStatusBar currentAgent={null} progress={0} />
          </View>
        )}
        <FlatList
          data={factories}
          keyExtractor={(f) => f.factory_id}
          renderItem={renderItem}
          scrollEnabled={false}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 60 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '800', marginBottom: 4 },
  h2: { color: colors.textDim, marginBottom: 16 },
  factoryCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  factoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  factoryName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  factoryCity: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  scoreBig: { fontSize: 40, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pkrText: { color: colors.text, fontSize: 13, marginLeft: 10 },
  analyzeBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  analyzeBtnText: { color: colors.bg, fontWeight: '700' },
  jobCard: {
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  jobLabel: { color: colors.textDim, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  jobId: { color: colors.primary, fontFamily: 'monospace', marginVertical: 4 },
});
