import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';

import {
  colors,
  radii,
  shadow,
  spacing,
} from '../constants/colors';
import { subscribeReport, markDocumentSent } from '../services/firebase';
import { api } from '../services/api';
import { buyerFlag, formatRelativeTime } from '../services/format';
import EmptyState from '../components/EmptyState';
import InteractiveChecklist from '../components/InteractiveChecklist';
import { markdownStyles } from '../components/MarkdownStyles';
import { transformMarkdownTables } from '../utils/markdownTransform';

// Documents split into two friendly buckets:
//   - "Ready to Send"   = anything addressed to a buyer / external party
//   - "Forms to File"   = CBAM declarations, checklists, internal forms
const READY_TO_SEND_KINDS = new Set(['BUYER_EMAIL']);

function plainDocTitle(d) {
  if (d.title) return d.title;
  switch (d.kind) {
    case 'CBAM_FORM':
    case 'CBAM_DECLARATION':
      return 'EU Carbon Tax Filing';
    case 'CERTIFICATION_APP':
      return 'Certification Application';
    case 'MSA_STATEMENT':
      return 'Modern Slavery Statement';
    case 'EMISSIONS_REPORT':
      return 'Emissions Report';
    case 'AUDIT_CHECKLIST':
      return 'Audit Checklist';
    case 'REMEDIATION_PLAN':
      return 'Remediation Plan';
    case 'BOOKING_TEMPLATE':
      return 'Booking Template';
    default:
      return 'Document';
  }
}

function extractEmailSubject(d) {
  // Try to pull a subject line out of a markdown email body. Falls back
  // to the document title.
  const body = d.body || '';
  const m = body.match(/^\s*(?:\*\*)?Subject(?:\*\*)?\s*:?\s*(.+)$/im);
  if (m && m[1]) return m[1].trim().replace(/\*\*/g, '');
  return d.title || 'Update on your order';
}

function extractBuyerName(d) {
  // Try a few common patterns: "To: BuyerName", "Dear BuyerName,", or
  // the document title contains the buyer name.
  const body = d.body || '';
  const to = body.match(/^\s*(?:\*\*)?To(?:\*\*)?\s*:?\s*(.+)$/im);
  if (to && to[1]) return to[1].trim().replace(/\*\*/g, '');
  const dear = body.match(/Dear\s+([A-Z][A-Za-z0-9 .&'-]+)\s*[,:]/);
  if (dear && dear[1]) return dear[1].trim();
  return d.title || 'Buyer';
}

function splitSubjectFromBody(rawBody, fallbackTitle) {
  // Same logic EditEmailScreen uses so the "Send" mailto: gets the same
  // subject/body the user would see in the editor.
  const body = String(rawBody || '');
  const lines = body.split('\n');
  for (let i = 0; i < Math.min(3, lines.length); i += 1) {
    const m = lines[i].match(/^\s*#?\s*(?:\*\*)?Subject(?:\*\*)?\s*:?\s*(.+)$/i);
    if (m && m[1]) {
      const subject = m[1].replace(/\*\*/g, '').trim();
      const remainder = lines.slice(i + 1).join('\n').trim();
      return { subject, body: remainder };
    }
  }
  return { subject: fallbackTitle || 'Compliance Status Update', body: body.trim() };
}

export default function DocumentVaultScreen({ route, navigation }) {
  const { factoryId } = route.params;
  const [report, setReport] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [optimisticSent, setOptimisticSent] = useState({});

  useEffect(() => {
    const u = subscribeReport(factoryId, setReport);
    return () => u && u();
  }, [factoryId]);

  const docs = report?.documents || [];

  const { readyToSend, formsToFile } = useMemo(() => {
    const r = [];
    const f = [];
    for (const d of docs) {
      if (READY_TO_SEND_KINDS.has(d.kind)) r.push(d);
      else f.push(d);
    }
    return { readyToSend: r, formsToFile: f };
  }, [docs]);

  if (docs.length === 0) {
    return (
      <View style={styles.bg}>
        <EmptyState
          useLogo
          title="No documents yet"
          message="Once we check your factory, we'll prepare buyer emails and the forms you need to file. They'll show up here, ready to send."
          cta={{
            label: 'Check My Factory',
            icon: 'play-circle',
            onPress: async () => {
              try {
                const r = await api.analyze(factoryId);
                Alert.alert('Analysis started', `Job ${r.job_id}`);
              } catch (e) {
                Alert.alert('Could not start', String(e.message));
              }
            },
          }}
        />
      </View>
    );
  }

  const sendEmail = async (id, buyer, d) => {
    // Open the user's default email app with the draft pre-filled (same
    // mailto: scheme the EditEmail screen uses). Only mark the document
    // as sent if the email app actually launches.
    const split = splitSubjectFromBody(d?.body, d?.title);
    const recipient = d?.buyer || buyer || '';
    const to = encodeURIComponent(recipient);
    const subj = encodeURIComponent(split.subject);
    const bd = encodeURIComponent(split.body);
    const url = `mailto:${to}?subject=${subj}&body=${bd}`;

    const canOpen = await Linking.canOpenURL(url).catch(() => true);
    if (!canOpen) {
      Alert.alert(
        'No email app',
        'Could not find an email app on this device to open the draft.',
      );
      return;
    }

    setOptimisticSent((s) => ({ ...s, [id]: true }));
    try {
      await Linking.openURL(url);
      await markDocumentSent(factoryId, id);
    } catch (e) {
      setOptimisticSent((s) => {
        const { [id]: _, ...rest } = s;
        return rest;
      });
      Alert.alert('Could not open email app', String(e.message));
    }
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>
        Emails ready to send and forms ready to file
      </Text>

      {readyToSend.length > 0 && (
        <View style={{ marginBottom: spacing.xl }}>
          <View style={styles.sectionHead}>
            <Ionicons name="mail" size={18} color={colors.primary} />
            <Text style={styles.section}>Ready to Send</Text>
            <Text style={styles.sectionCount}>{readyToSend.length}</Text>
          </View>

          {readyToSend.map((d, i) => {
            const id = d.document_id || `email-${i}`;
            const buyer = extractBuyerName(d);
            const subject = extractEmailSubject(d);
            const flag = buyerFlag(buyer);
            const isOpen = openId === id;
            const isSent = !!d.sent || !!optimisticSent[id];
            return (
              <View key={id} style={styles.emailCard}>
                <TouchableOpacity
                  style={styles.emailHead}
                  onPress={() => setOpenId(isOpen ? null : id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.buyerIcon}>
                    {flag ? (
                      <Text style={styles.flagText}>{flag}</Text>
                    ) : (
                      <Ionicons name="briefcase" size={22} color={colors.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.buyerName} numberOfLines={1}>
                      To: {buyer}
                    </Text>
                    <Text style={styles.subjectLine} numberOfLines={2}>
                      {subject}
                    </Text>
                  </View>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textDim}
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>

                {isOpen && d.body && (
                  <View style={styles.body}>
                    <Markdown style={markdownStyles}>
                      {transformMarkdownTables(String(d.body))}
                    </Markdown>
                  </View>
                )}

                {d.stage === 'AUDIT_READY' && (
                  <View style={styles.stagePill}>
                    <Ionicons name="ribbon" size={12} color={colors.primary} />
                    <Text style={styles.stagePillText}>Audit Ready</Text>
                  </View>
                )}

                <View style={styles.emailBtnRow}>
                  <TouchableOpacity
                    style={[styles.editBtn]}
                    onPress={() => navigation.navigate('EditEmail', {
                      factoryId,
                      documentId: d.document_id || id,
                      buyer,
                    })}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.sendBtn,
                      isSent && { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    ]}
                    onPress={() => !isSent && sendEmail(id, buyer, d)}
                    activeOpacity={0.85}
                    disabled={isSent}
                  >
                    <Ionicons
                      name={isSent ? 'checkmark-circle' : 'send'}
                      size={18}
                      color={isSent ? colors.compliant : colors.bg}
                    />
                    <Text
                      style={[
                        styles.sendBtnText,
                        isSent && { color: colors.compliant },
                      ]}
                    >
                      {isSent ? 'Sent' : 'Send'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {formsToFile.length > 0 && (
        <View>
          <View style={styles.sectionHead}>
            <Ionicons name="document-text" size={18} color={colors.warning} />
            <Text style={styles.section}>Forms to File</Text>
            <Text style={styles.sectionCount}>{formsToFile.length}</Text>
          </View>

          {formsToFile.map((d, i) => {
            const id = d.document_id || `form-${i}`;
            const isOpen = openId === id;
            const title = plainDocTitle(d);
            const isChecklist = d.kind === 'AUDIT_CHECKLIST';
            return (
              <View key={id} style={styles.formCard}>
                <TouchableOpacity
                  style={styles.formHead}
                  onPress={() => setOpenId(isOpen ? null : id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.formIcon}>
                    <Ionicons
                      name={isChecklist ? 'checkmark-done' : 'document-text'}
                      size={22}
                      color={isChecklist ? colors.primary : colors.warning}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.formTitle} numberOfLines={2}>
                      {title}
                    </Text>
                    {d.generated_at && (
                      <Text style={styles.formMeta}>
                        Prepared {formatRelativeTime(d.generated_at)}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.viewBtn, isOpen && styles.viewBtnActive]}>
                    <Text
                      style={[
                        styles.viewBtnText,
                        isOpen && { color: colors.bg },
                      ]}
                    >
                      {isOpen ? 'Close' : 'Open'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {isOpen && isChecklist && (
                  <View style={styles.body}>
                    <InteractiveChecklist
                      factoryId={factoryId}
                      checklistId={id}
                      body={d.body}
                      documents={docs}
                      onAllComplete={async () => {
                        try {
                          await api.generateAuditReady(factoryId);
                        } catch (e) {
                          // Non-fatal — the checklist still flips to "all done"
                          console.warn('audit-ready generation failed', e);
                        }
                      }}
                    />
                  </View>
                )}

                {isOpen && !isChecklist && d.body && (
                  <View style={styles.body}>
                    <Markdown style={markdownStyles}>
                      {transformMarkdownTables(String(d.body))}
                    </Markdown>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },

  subtitle: {
    color: '#C9D1D9',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 8,
    flex: 1,
  },
  sectionCount: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '700',
  },

  // Email card (Ready to Send)
  emailCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  emailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buyerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  flagText: { fontSize: 26 },
  buyerName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  subjectLine: { color: '#C9D1D9', fontSize: 14, marginTop: 4, lineHeight: 20 },

  emailBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  editBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 15,
    marginLeft: 6,
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  sendBtnText: {
    color: colors.bg,
    fontWeight: '800',
    fontSize: 15,
    marginLeft: 8,
  },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  stagePillText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.4,
    marginLeft: 4,
  },

  // Form card (Forms to File)
  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  formHead: { flexDirection: 'row', alignItems: 'center' },
  formIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  formTitle: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 22 },
  formMeta: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  viewBtn: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    marginLeft: 8,
  },
  viewBtnActive: { backgroundColor: colors.primary },
  viewBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },

  // Expanded body (shared by both card types)
  body: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
});
