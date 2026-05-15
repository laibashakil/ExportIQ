import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadow, spacing } from '../constants/colors';

/**
 * Centred "no data yet" placeholder used by every screen.
 *
 *   icon       Ionicons name (preferred)
 *   iconColor  optional override for the centred icon colour
 *   title      headline string
 *   message    paragraph below the title
 *   cta        { label, onPress, icon? } | null  — primary action
 */
export default function EmptyState({ icon = 'analytics', iconColor, title, message, cta }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={36} color={iconColor || colors.textDim} />
      </View>
      {title && <Text style={styles.title}>{title}</Text>}
      {message && <Text style={styles.message}>{message}</Text>}
      {cta && (
        <TouchableOpacity style={styles.cta} onPress={cta.onPress} activeOpacity={0.85}>
          {cta.icon && (
            <Ionicons
              name={cta.icon}
              size={16}
              color={colors.bg}
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={styles.ctaText}>{cta.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow,
  },
  ctaText: { color: colors.bg, fontWeight: '700', fontSize: 14 },
});
