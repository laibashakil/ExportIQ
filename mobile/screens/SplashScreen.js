import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  StatusBar,
} from 'react-native';

const BG = '#0D1117';
const TEAL = '#00D4AA';
const SUBTITLE_GRAY = '#8B949E';
const FOOTER_GRAY = '#30363D';

export default function SplashScreen({ navigation }) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(nameOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    const t = setTimeout(() => {
      navigation.replace('Home');
    }, 2500);
    return () => clearTimeout(t);
  }, [navigation, logoOpacity, nameOpacity, subtitleOpacity]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <View style={styles.center}>
        <Animated.Image
          source={require('../assets/logo.png')}
          style={[styles.logo, { opacity: logoOpacity }]}
          resizeMode="contain"
        />

        <Animated.View style={[styles.nameRow, { opacity: nameOpacity }]}>
          <Text style={styles.nameWhite}>Export</Text>
          <Text style={styles.nameTeal}>IQ</Text>
        </Animated.View>

        <Animated.View style={{ opacity: subtitleOpacity, alignItems: 'center' }}>
          <Text style={styles.subtitle}>Pakistan Textile Compliance</Text>
          <View style={styles.divider} />
        </Animated.View>
      </View>

      <Text style={styles.footer}>Powered by Google Antigravity</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  nameWhite: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 2,
  },
  nameTeal: {
    color: TEAL,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 2,
  },
  subtitle: {
    color: SUBTITLE_GRAY,
    fontSize: 14,
    letterSpacing: 1,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: TEAL,
    marginTop: 16,
  },
  footer: {
    color: FOOTER_GRAY,
    fontSize: 11,
    marginBottom: 32,
  },
});
