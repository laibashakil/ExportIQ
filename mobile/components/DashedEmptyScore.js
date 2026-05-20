import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';

/**
 * Dashed-circle placeholder that replaces CircularScore when a factory has
 * no analysis yet. Visually signals "no data" with a neutral gray dashed ring
 * and a centered "+" icon, matching the upload-card empty state.
 *
 *   size    diameter in px (default 68)
 *   stroke  ring thickness (default 4)
 */
export default function DashedEmptyScore({ size = 68, stroke = 4 }) {
  const radius = (size - stroke) / 2;
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.textDim}
          strokeWidth={stroke}
          strokeDasharray="5,4"
          fill="none"
        />
      </Svg>
      <View style={styles.center}>
        <Ionicons name="add" size={size * 0.45} color={colors.textDim} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
