import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

import { colors } from '../constants/colors';
import { subscribeReport } from '../services/firebase';

export default function BuyerCommsScreen({ route }) {
  const { factoryId } = route.params;
  const [report, setReport] = useState(null);

  useEffect(() => {
    const u = subscribeReport(factoryId, setReport);
    return () => u && u();
  }, [factoryId]);

  const documents = report?.documents || [];
  const emails = documents.filter((d) => d.kind === 'BUYER_EMAIL');
  const buyersAffected = report?.financial_impact?.buyers_affected || [];

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Buyer Communications</Text>
      <Text style={styles.h2}>
        {emails.length} drafted · {buyersAffected.length} buyers affected
      </Text>

      {buyersAffected.length > 0 && (
        <View style={styles.buyerRow}>
          {buyersAffected.map((b) => (
            <View key={b} style={styles.buyerPill}>
              <Text style={styles.buyerText}>{b}</Text>
            </View>
          ))}
        </View>
      )}

      {emails.length === 0 && (
        <Text style={styles.empty}>
          Once an action is simulated, an auto-drafted buyer email appears here per buyer affected.
        </Text>
      )}

      {emails.map((e, i) => (
        <View key={e.document_id || i} style={styles.email}>
          <Text style={styles.emailTitle}>{e.title}</Text>
          <Text style={styles.emailBody}>{e.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 80 },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
  h2: { color: colors.textDim, marginBottom: 14 },
  buyerRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  buyerPill: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  buyerText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  empty: { color: colors.textDim, fontStyle: 'italic', marginTop: 12 },
  email: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  emailTitle: { color: colors.primary, fontWeight: '700', marginBottom: 8 },
  emailBody: { color: colors.text, fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
});
