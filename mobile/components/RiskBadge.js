import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, riskColor, riskSoftColor, radii } from '../constants/colors';

/**
 * Small pill that summarises a risk level. Two variants:
 *   <RiskBadge level="CRITICAL" />          solid colored pill, monochrome text
 *   <RiskBadge level="CRITICAL" subtle />   tinted background + matching text color
 */
export default function RiskBadge({ level, subtle = true, style }) {
  const c = riskColor(level);
  const bg = subtle ? riskSoftColor(level) : c;
  const fg = subtle ? c : colors.bg;
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: subtle ? 'transparent' : c }, style]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.text, { color: fg }]}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
});
