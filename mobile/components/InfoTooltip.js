import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing } from '../constants/colors';

/**
 * Small ⓘ icon that opens a centered tooltip modal explaining a metric.
 *
 *   text   the explanation shown inside the bubble
 *   size   icon size in px (default 14)
 *   color  icon color (default textDim)
 */
export default function InfoTooltip({ text, size = 14, color = colors.textDim }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="More info"
        activeOpacity={0.6}
      >
        <Ionicons name="information-circle-outline" size={size} color={color} />
      </TouchableOpacity>
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{text}</Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setOpen(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.closeBtnText}>Got it</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    maxWidth: 340,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  closeBtn: {
    marginTop: spacing.md,
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  closeBtnText: {
    color: colors.bg,
    fontWeight: '800',
    fontSize: 13,
  },
});
