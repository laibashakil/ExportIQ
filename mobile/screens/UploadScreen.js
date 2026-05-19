// Upload flow entry point. Reached from HomeScreen when a factory has no
// report yet (or the user explicitly chose the "New Factory (Demo Upload)"
// card). Two phases:
//
//   1. Pick a PDF via expo-document-picker, POST /upload, show progress.
//   2. POST /analyze, navigate to AnalysisProgressScreen which polls
//      /status every 3s and animates the 6 agent steps as they complete.
//
// Single-screen UX: no navigation history hops, no back-button traps.
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { colors, radii, shadow, spacing } from '../constants/colors';
import { api } from '../services/api';

const STAGES = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  ANALYZING_START: 'analyzing_start',
  ERROR: 'error',
};

export default function UploadScreen({ route, navigation }) {
  const { factoryId, factoryName } = route.params || {};
  const [stage, setStage] = useState(STAGES.IDLE);
  const [pickedFile, setPickedFile] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const pickAndUpload = useCallback(async () => {
    setErrMsg(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0] || res;
      if (!asset?.uri) {
        Alert.alert('No file', 'Please pick a PDF.');
        return;
      }
      setPickedFile(asset);
      setStage(STAGES.UPLOADING);

      await api.upload({
        uri: asset.uri,
        name: asset.name || 'audit.pdf',
        mimeType: asset.mimeType || 'application/pdf',
        factoryId,
      });

      setStage(STAGES.ANALYZING_START);
      const job = await api.analyze(factoryId);

      navigation.replace('AnalysisProgress', {
        jobId: job.job_id,
        factoryId,
        factoryName,
      });
    } catch (e) {
      setStage(STAGES.ERROR);
      setErrMsg(String(e?.message || e));
    }
  }, [factoryId, factoryName, navigation]);

  const isBusy = stage === STAGES.UPLOADING || stage === STAGES.ANALYZING_START;

  return (
    <SafeAreaView style={styles.bg} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconCircle}>
          <Ionicons name="document-text" size={48} color={colors.primary} />
        </View>

        <Text style={styles.title}>Let's check your factory</Text>
        <Text style={styles.subtitle}>
          Upload your factory's audit report. We already have all EU/UK
          regulations in our system.
        </Text>

        <View style={styles.factoryChip}>
          <Ionicons name="business" size={16} color={colors.primary} />
          <Text style={styles.factoryChipText} numberOfLines={1}>
            {factoryName || factoryId || 'Your factory'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.uploadBtn, isBusy && styles.uploadBtnBusy]}
          onPress={pickAndUpload}
          disabled={isBusy}
          activeOpacity={0.85}
        >
          {isBusy ? (
            <>
              <ActivityIndicator color={colors.bg} />
              <Text style={styles.uploadBtnText}>
                {stage === STAGES.UPLOADING ? 'Uploading…' : 'Starting analysis…'}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload" size={22} color={colors.bg} />
              <Text style={styles.uploadBtnText}>
                Upload Factory Audit Report (PDF)
              </Text>
            </>
          )}
        </TouchableOpacity>

        {pickedFile && stage !== STAGES.ERROR && (
          <View style={styles.filePreview}>
            <Ionicons name="document" size={20} color={colors.primary} />
            <Text style={styles.filePreviewText} numberOfLines={1}>
              {pickedFile.name}
            </Text>
          </View>
        )}

        {errMsg && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color={colors.critical} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.errorTitle}>Upload failed</Text>
              <Text style={styles.errorBody}>{errMsg}</Text>
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What happens next?</Text>
          <InfoRow n="1" text="We upload your PDF securely to our system." />
          <InfoRow n="2" text="Our AI reads the audit report and compares it to current EU/UK rules." />
          <InfoRow n="3" text="You see a score, the issues we found, and an action plan." />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ n, text }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoDot}>
        <Text style={styles.infoDotText}>{n}</Text>
      </View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  iconCircle: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  factoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: spacing.xl,
  },
  factoryChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    maxWidth: 240,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 18,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow,
  },
  uploadBtnBusy: { opacity: 0.85 },
  uploadBtnText: {
    color: colors.bg,
    fontWeight: '800',
    fontSize: 16,
    marginLeft: 10,
  },
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: spacing.lg,
  },
  filePreviewText: {
    color: colors.text,
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.criticalSoft,
    borderWidth: 1,
    borderColor: colors.critical,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: spacing.lg,
  },
  errorTitle: { color: colors.critical, fontWeight: '800', fontSize: 14 },
  errorBody: { color: '#C9D1D9', fontSize: 13, marginTop: 4, lineHeight: 18 },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  infoTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  infoDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoDotText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  infoText: {
    color: '#C9D1D9',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});
