import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadow, spacing } from '../constants/colors';
import LogoSpinner from './LogoSpinner';

/**
 * Centred "no data yet" placeholder used by every screen.
 *
 *   icon       Ionicons name (used when `useLogo` is false; default 'analytics')
 *   iconColor  optional override for the centred icon colour
 *   title      headline string
 *   message    paragraph below the title
 *   cta        { label, onPress, icon? } | null  — primary action
 *   useLogo    when true, render the pulsing ExportIQ logo at 80x80
 *              instead of the Ionicon
 *   pulse      when useLogo is true, animate the logo (default true). Pass
 *              false for a static logo image.
 */
export default function EmptyState({
  icon = 'analytics',
  iconColor,
  title,
  message,
  cta,
  useLogo = false,
  pulse = true,
}) {
  return (
    <View style={styles.wrap}>
      {useLogo ? (
        pulse ? (
          <View style={styles.logoWrap}>
            <LogoSpinner size={80} />
          </View>
        ) : (
          <View style={styles.logoWrap}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logoStatic}
              resizeMode="contain"
            />
          </View>
        )
      ) : (
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={36} color={iconColor || colors.textDim} />
        </View>
      )}
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
  logoWrap: { marginBottom: spacing.lg },
  logoStatic: { width: 80, height: 80, borderRadius: 14 },
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
