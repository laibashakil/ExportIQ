import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

/**
 * Pulsing ExportIQ logo used in place of ActivityIndicator.
 *
 * The logo scales 1.0 → 1.08 → 1.0 on a 1000 ms cycle (so a full
 * out-and-back cycle is 2000 ms) and loops forever.
 *
 * Default `size` is 48 to match the spec; pass a different `size`
 * for inline contexts.
 */
export default function LogoSpinner({ size = 48, style }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const cycle = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.08,
        duration: 1000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.0,
        duration: 1000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);
    const loop = Animated.loop(cycle);
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.Image
      source={require('../assets/logo.png')}
      style={[
        styles.base,
        { width: size, height: size, transform: [{ scale }] },
        style,
      ]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
  },
});
