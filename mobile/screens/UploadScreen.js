// Upload flow entry point. Reached from HomeScreen when a factory has no
// report yet (or the user chose the permanent "Add New Factory" card). Two
// phases:
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
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { colors, radii, shadow, spacing } from '../constants/colors';
import { API_BASE_URL, NEW_FACTORY_UPLOAD_ID } from '../constants/config';
import { api } from '../services/api';
import LogoSpinner from '../components/LogoSpinner';

// Guidance content for "What should your audit report include?"
const REQUIRED_ITEMS = [
  'Factory name, city, and country of operation',
  'Annual export volume in PKR or USD (broken down by buyer if possible)',
  'List of active EU/UK buyers (e.g. retailer names and order values)',
  'Current certifications with expiry dates: SA8000, ISO 14001, OEKO-TEX or GOTS',
  'Chemical usage data — effluent discharge levels (ppm), dye chemicals used',
  'Working hours per week (including overtime)',
  'Forced/child labour compliance statement',
  'Supplier compliance data if exporting to EU (for CSDDD due diligence)',
  'Supply chain mapping — tier-1 and tier-2 suppliers if available',
];

const OPTIONAL_ITEMS = [
  'Previous audit findings or corrective action reports',
  'Buyer-specific compliance questionnaire responses',
  'Water and energy consumption data',
  'Grievance mechanism documentation',
];

const STAGES = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  ANALYZING_START: 'analyzing_start',
  ERROR: 'error',
};

export default function UploadScreen({ route, navigation }) {
  const { factoryId, factoryName } = route.params || {};
  // New/unknown factory → user types the name; existing factory → read-only.
  const isNew = !factoryId || factoryId === NEW_FACTORY_UPLOAD_ID;
  const [name, setName] = useState(factoryName || 'New Factory');
  const [stage, setStage] = useState(STAGES.IDLE);
  const [pickedFile, setPickedFile] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const openTemplate = (ext) => {
    Linking.openURL(`${API_BASE_URL}/static/sample_audit_template.${ext}`).catch(() =>
      Alert.alert('Unable to open', 'Could not open the template. Please try again.'),
    );
  };

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
        factoryName: name,
      });
    } catch (e) {
      setStage(STAGES.ERROR);
      setErrMsg(String(e?.message || e));
    }
  }, [factoryId, name, navigation]);

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

        {isNew ? (
          <View style={styles.nameField}>
            <Text style={styles.nameLabel}>FACTORY NAME</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Faisal Weave Industries"
              placeholderTextColor={colors.textDim}
              editable={!isBusy}
            />
          </View>
        ) : (
          <View style={styles.factoryChip}>
            <Ionicons name="business" size={16} color={colors.primary} />
            <Text style={styles.factoryChipText} numberOfLines={1}>
              {name || factoryId || 'Your factory'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.uploadBtn, isBusy && styles.uploadBtnBusy]}
          onPress={pickAndUpload}
          disabled={isBusy}
          activeOpacity={0.85}
        >
          {isBusy ? (
            <>
              <LogoSpinner size={22} />
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

        <GuidanceBox />

        <View style={styles.sampleRow}>
          <Text style={styles.sampleText}>
            📄 Not sure what to include? Download our sample audit report template:
          </Text>
          <View style={styles.sampleBtns}>
            <TouchableOpacity
              style={styles.docxBtn}
              onPress={() => openTemplate('docx')}
              activeOpacity={0.85}
            >
              <Ionicons name="document-outline" size={16} color={colors.text} />
              <Text style={styles.docxBtnText}>Download DOCX</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pdfBtn}
              onPress={() => openTemplate('pdf')}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text" size={16} color={colors.bg} />
              <Text style={styles.pdfBtnText}>Download PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

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

// Collapsible "What should your audit report include?" — collapsed by default.
function GuidanceBox() {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.guidanceBox}>
      <TouchableOpacity
        style={styles.guidanceHead}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color="#00C48C"
        />
        <Text style={styles.guidanceHeadText}>
          📋 What should your audit report include?
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.guidanceBody}>
          <Text style={styles.guidanceSectionTitle}>REQUIRED INFORMATION</Text>
          {REQUIRED_ITEMS.map((t) => (
            <View key={t} style={styles.guidanceItemRow}>
              <Text style={styles.guidanceTick}>✓</Text>
              <Text style={styles.guidanceItem}>{t}</Text>
            </View>
          ))}
          <Text style={styles.guidanceSectionTitle}>HELPFUL BUT OPTIONAL</Text>
          {OPTIONAL_ITEMS.map((t) => (
            <View key={t} style={styles.guidanceItemRow}>
              <Text style={styles.guidanceDot}>•</Text>
              <Text style={styles.guidanceItemOptional}>{t}</Text>
            </View>
          ))}
          <Text style={styles.guidanceSectionTitle}>SUPPORTED FORMATS</Text>
          <Text style={styles.guidanceItemOptional}>
            PDF only · Max 20 MB · Scanned documents are supported
          </Text>
        </View>
      )}
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

  // Editable factory-name field
  nameField: { marginBottom: spacing.xl },
  nameLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  nameInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // Guidance box (collapsible)
  guidanceBox: {
    backgroundColor: '#131C2E',
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: '#00C48C',
    borderRadius: 8,
    marginBottom: spacing.md,
  },
  guidanceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  guidanceHeadText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
    flex: 1,
  },
  guidanceBody: { paddingHorizontal: 16, paddingBottom: 16 },
  guidanceSectionTitle: {
    color: '#00C48C',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 8,
  },
  guidanceItemRow: { flexDirection: 'row', marginBottom: 6 },
  guidanceTick: { color: '#00C48C', fontWeight: '800', marginRight: 6 },
  guidanceDot: { color: '#9CA3AF', marginRight: 6 },
  guidanceItem: { color: '#fff', fontSize: 13, lineHeight: 19, flex: 1 },
  guidanceItemOptional: { color: '#9CA3AF', fontSize: 13, lineHeight: 19, flex: 1 },

  // Sample template download row
  sampleRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: spacing.lg,
  },
  sampleText: { color: '#C9D1D9', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  sampleBtns: { flexDirection: 'row', gap: spacing.sm },
  docxBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  docxBtnText: { color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 },
  pdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00C48C',
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  pdfBtnText: { color: colors.bg, fontWeight: '800', fontSize: 14, marginLeft: 6 },
});
