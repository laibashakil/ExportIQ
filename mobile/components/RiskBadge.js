import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { riskColor } from '../constants/colors';

export default function RiskBadge({ level }) {
  const c = riskColor(level);
  return (
    <View style={[styles.badge, { backgroundColor: c + '22', borderColor: c }]}>
      <Text style={[styles.text, { color: c }]}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
});
