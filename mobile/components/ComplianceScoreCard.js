import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

import { colors, riskColor } from '../constants/colors';

// Big score widget. Animates the number when the score changes (driven by
// the Firestore listener on /factories/{id}.compliance_score).
export default function ComplianceScoreCard({ score = 0, riskLevel = 'CRITICAL', riskPkr = 0 }) {
  const animated = useRef(new Animated.Value(score)).current;
  const display = useRef(score);
  const [shown, setShown] = React.useState(score);

  useEffect(() => {
    Animated.timing(animated, {
      toValue: score,
      duration: 800,
      useNativeDriver: false,
    }).start();
    const id = animated.addListener(({ value }) => {
      display.current = value;
      setShown(Math.round(value));
    });
    return () => animated.removeListener(id);
  }, [score]);

  const color = riskColor(riskLevel);
  return (
    <View style={[styles.card, { borderColor: color }]}>
      <Text style={styles.label}>Compliance score</Text>
      <View style={styles.row}>
        <Text style={[styles.score, { color }]}>{shown}</Text>
        <Text style={[styles.outOf, { color: colors.textDim }]}>/100</Text>
      </View>
      <Text style={[styles.risk, { color }]}>{riskLevel}</Text>
      <Text style={styles.pkr}>PKR {Number(riskPkr).toLocaleString()} at risk</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    marginVertical: 12,
  },
  label: { color: colors.textDim, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  score: { fontSize: 72, fontWeight: '800', lineHeight: 80 },
  outOf: { fontSize: 22, marginBottom: 10, marginLeft: 4 },
  risk: { fontSize: 16, fontWeight: '700', marginTop: -4, letterSpacing: 1 },
  pkr: { color: colors.text, marginTop: 8, fontSize: 14 },
});
