import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadow, spacing } from '../constants/colors';
import { formatPkr } from '../services/format';
import InfoTooltip from './InfoTooltip';

const SCORE_TOOLTIP =
  'Score weighted by gap severity (CRITICAL = 10pts, HIGH = 7pts, MEDIUM = 4pts) minus contradiction confidence penalty.';

const ORDERS_TOOLTIP =
  "Calculated from your factory's annual order value to buyers affected by this specific compliance gap. Sourced from your audit report Section 2: Export Profile.";

/**
 * Storytelling reveal for a "What happens if I fix this?" simulation result.
 * Three cards fade in 300ms apart:
 *   1. Score Impact      — animated counter from before → after
 *   2. Orders Protected  — animated PKR counter from 0 → risk_reduction_pkr
 *   3. Why this matters  — plain-English buyer list
 *
 * Props:
 *   visible       boolean — when true, animations play from scratch
 *   before        number  — pre-sim score
 *   after         number  — post-sim score
 *   risk          number  — PKR risk_reduction
 *   buyers        string[] — affected buyer names
 *   compact       optional — slightly smaller layout for inline-in-card use
 */
export default function SimulationReveal({
  visible,
  before = 0,
  after = 0,
  risk = 0,
  buyers = [],
  compact = false,
}) {
  // Three opacity values, one per card
  const cardOpacities = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    if (!visible) {
      cardOpacities.forEach((v) => v.setValue(0));
      return;
    }
    cardOpacities.forEach((v) => v.setValue(0));
    Animated.stagger(
      300,
      cardOpacities.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [visible, before, after, risk]);

  if (!visible) return null;

  const buyerText =
    !buyers || buyers.length === 0
      ? 'Helps keep your existing EU and UK buyer relationships in good standing through the next audit cycle.'
      : `Protects orders from ${buyers.slice(0, 3).join(', ')}${buyers.length > 3 ? ` and ${buyers.length - 3} more` : ''} ahead of their upcoming audits.`;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {/* Card 1 — Score Impact */}
      <Animated.View style={[styles.card, { opacity: cardOpacities[0] }]}>
        <View style={styles.cardHead}>
          <View style={styles.iconBubble}>
            <Ionicons name="trending-up" size={16} color={colors.primary} />
          </View>
          <Text style={styles.cardLabel}>Score Impact</Text>
          <View style={{ flex: 1 }} />
          <InfoTooltip text={SCORE_TOOLTIP} size={16} color={colors.textDim} />
        </View>
        <View style={styles.scoreRow}>
          <AnimatedNumber
            from={0}
            to={before}
            duration={600}
            style={[styles.scoreNum, { color: colors.critical }]}
          />
          <Ionicons
            name="arrow-forward"
            size={18}
            color={colors.textDim}
            style={{ marginHorizontal: 10 }}
          />
          <AnimatedNumber
            from={before}
            to={after}
            duration={900}
            style={[styles.scoreNum, { color: colors.primary }]}
          />
        </View>
      </Animated.View>

      {/* Card 2 — Orders Protected */}
      <Animated.View style={[styles.card, { opacity: cardOpacities[1] }]}>
        <View style={styles.cardHead}>
          <View style={styles.iconBubble}>
            <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
          </View>
          <Text style={styles.cardLabel}>Orders Protected</Text>
          <View style={{ flex: 1 }} />
          <InfoTooltip text={ORDERS_TOOLTIP} size={16} color={colors.textDim} />
        </View>
        <AnimatedPkr
          from={0}
          to={Number(risk) || 0}
          duration={900}
          style={styles.pkrValue}
        />
      </Animated.View>

      {/* Card 3 — Why this matters */}
      <Animated.View style={[styles.card, { opacity: cardOpacities[2] }]}>
        <View style={styles.cardHead}>
          <View style={styles.iconBubble}>
            <Ionicons name="bulb" size={16} color={colors.primary} />
          </View>
          <Text style={styles.cardLabel}>Why this matters</Text>
        </View>
        <Text style={styles.whyText}>{buyerText}</Text>
      </Animated.View>
    </View>
  );
}

function AnimatedNumber({ from, to, duration = 600, style }) {
  const [value, setValue] = useState(from);
  const startRef = useRef(0);
  useEffect(() => {
    let frame;
    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    startRef.current = 0;
    frame = requestAnimationFrame(step);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [from, to, duration]);
  return <Text style={style}>{value}</Text>;
}

function AnimatedPkr({ from, to, duration = 900, style }) {
  const [value, setValue] = useState(from);
  const startRef = useRef(0);
  useEffect(() => {
    let frame;
    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    startRef.current = 0;
    frame = requestAnimationFrame(step);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [from, to, duration]);
  return <Text style={style}>{formatPkr(value)}</Text>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, marginBottom: spacing.sm },
  wrapCompact: { marginTop: 4 },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cardLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  scoreNum: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },

  pkrValue: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
    paddingVertical: 6,
  },

  whyText: {
    color: '#C9D1D9',
    fontSize: 14,
    lineHeight: 21,
  },
});
