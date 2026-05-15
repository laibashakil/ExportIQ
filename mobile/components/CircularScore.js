import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, riskColor } from '../constants/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Circular score gauge. Used wherever a compliance score (0-100) is shown.
 *
 *   size      diameter in px (default 96)
 *   stroke    ring thickness (default 8)
 *   score     0..100; rendered as % of the ring
 *   risk      'CRITICAL' | 'WARNING' | 'COMPLIANT' — colors the ring
 *   label     small text below the number (e.g. "compliance")
 *   animate   true (default) animates from 0 to score over ~900ms
 */
export default function CircularScore({
  size = 96,
  stroke = 8,
  score = 0,
  risk,
  label,
  animate = true,
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const fillColor = riskColor(risk);

  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [score, animate]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference * (1 - Math.min(Math.max(score, 0), 100) / 100)],
  });

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Animated arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference}, ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          // rotate -90 to start arc at top
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.scoreText, { color: fillColor, fontSize: Math.max(18, size * 0.30) }]}>
          {score}
        </Text>
        {label && <Text style={styles.label}>{label}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontWeight: '800', letterSpacing: -0.5 },
  label: { color: colors.textDim, fontSize: 10, letterSpacing: 1, marginTop: 2 },
});
