import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
// SDK 54: downloadAsync moved to the /legacy entry. The new File/Directory
// API is more verbose for a one-shot download to cacheDirectory, so we stay
// on the legacy helper here.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { colors, radii, shadow, spacing } from '../constants/colors';
import { api } from '../services/api';
import LogoSpinner from '../components/LogoSpinner';

const STORAGE_KEY = 'exportiq.settings.v1';

const DEFAULTS = {
  ownerName: 'Muhammad Tariq Malik',
  contactEmail: '',
  notifyDeadlines: true,
  notifyAuditReminders: true,
  notifyNews: false,
};

const SUPPORT_EMAIL = 'support@exportiq.app';
const APP_VERSION =
  Constants?.expoConfig?.version
  || Constants?.manifest?.version
  || '0.1.0';

export default function SettingsScreen() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
        }
      } catch {
        // ignore — defaults are fine
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const save = useCallback(async (next) => {
    setSettings(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      Alert.alert('Could not save settings', String(e.message));
    }
  }, []);

  const onExportPdf = useCallback(async () => {
    try {
      setExporting(true);
      const url = api.exportSummaryUrl();
      const target = `${FileSystem.cacheDirectory}exportiq_summary.pdf`;
      const dl = await FileSystem.downloadAsync(url, target);
      if (dl.status !== 200) {
        throw new Error(`Server returned ${dl.status}`);
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dl.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'ExportIQ Compliance Summary',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          'PDF ready',
          `Saved to ${dl.uri}. Sharing is not available on this device.`,
        );
      }
    } catch (e) {
      Alert.alert('Could not generate PDF', String(e.message || e));
    } finally {
      setExporting(false);
    }
  }, []);

  const onContactSupport = useCallback(() => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=ExportIQ support`);
  }, []);

  if (!loaded) {
    return (
      <View style={[styles.bg, { alignItems: 'center', justifyContent: 'center' }]}>
        <LogoSpinner size={48} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.section}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Factory owner name</Text>
        <TextInput
          value={settings.ownerName}
          onChangeText={(v) => save({ ...settings, ownerName: v })}
          style={styles.input}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Contact email</Text>
        <TextInput
          value={settings.contactEmail}
          onChangeText={(v) => save({ ...settings, contactEmail: v })}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <Text style={styles.section}>Notifications</Text>
      <View style={styles.card}>
        <SettingsRow
          label="Deadline reminders"
          value={settings.notifyDeadlines}
          onChange={(v) => save({ ...settings, notifyDeadlines: v })}
        />
        <SettingsRow
          label="Audit reminders"
          value={settings.notifyAuditReminders}
          onChange={(v) => save({ ...settings, notifyAuditReminders: v })}
        />
        <SettingsRow
          label="News updates"
          value={settings.notifyNews}
          onChange={(v) => save({ ...settings, notifyNews: v })}
          last
        />
      </View>

      <Text style={styles.section}>Reports</Text>
      <TouchableOpacity
        style={[styles.actionCard, exporting && { opacity: 0.6 }]}
        activeOpacity={0.85}
        onPress={onExportPdf}
        disabled={exporting}
      >
        <View style={styles.actionIcon}>
          {exporting ? (
            <LogoSpinner size={26} />
          ) : (
            <Ionicons name="download" size={22} color={colors.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>
            {exporting ? 'Generating PDF…' : 'Export Compliance Report as PDF'}
          </Text>
          <Text style={styles.actionSub}>
            Summary of all 3 factories' status, ready to share with stakeholders.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
      </TouchableOpacity>

      <Text style={styles.section}>About</Text>
      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>App version</Text>
          <Text style={styles.aboutValue}>{APP_VERSION}</Text>
        </View>
        <View style={[styles.aboutRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.aboutLabel}>Platform</Text>
          <Text style={styles.aboutValue}>
            {Platform.OS === 'ios' ? 'iOS' : 'Android'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.supportBtn}
        onPress={onContactSupport}
        activeOpacity={0.85}
      >
        <Ionicons name="mail-outline" size={16} color={colors.primary} />
        <Text style={styles.supportBtnText}>Contact support · {SUPPORT_EMAIL}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SettingsRow({ label, value, onChange, last }) {
  return (
    <View style={[styles.toggleRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
        thumbColor={colors.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  section: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: 8,
  },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadow,
  },

  fieldLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  toggleLabel: { color: colors.text, fontSize: 14 },

  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadow,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  actionSub: { color: colors.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 },

  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  aboutLabel: { color: colors.textDim, fontSize: 13 },
  aboutValue: { color: colors.text, fontSize: 13, fontWeight: '700' },

  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  supportBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6,
  },
});
