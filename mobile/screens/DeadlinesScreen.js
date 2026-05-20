import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { colors, radii, shadow, spacing } from '../constants/colors';
import { DEMO_FACTORIES } from '../constants/config';
import { subscribeFactory, subscribeReport } from '../services/firebase';
import { plainRegulation, plainRequirement } from '../services/format';
import {
  loadOnce as loadReadSet,
  subscribe as subscribeReadSet,
  markRead,
  deadlineId,
} from '../services/notificationsRead';
import EmptyState from '../components/EmptyState';

// Same window as HomeScreen — keeps the bell badge and this list aligned.
const DEADLINE_WINDOW_DAYS = 30;

// Anything with at least one of these is shown. We sort by urgency ascending
// (smallest days_remaining first; overdue items rank above all).
function sortByUrgency(a, b) {
  const da = a.days_remaining ?? 9999;
  const db = b.days_remaining ?? 9999;
  return da - db;
}

function urgencyColor(days) {
  if (days == null) return colors.textDim;
  if (days < 0) return colors.critical;
  if (days < 7) return colors.critical;
  if (days < 30) return colors.warning;
  if (days < 90) return colors.primary;
  return colors.textDim;
}

function urgencyText(days, deadline) {
  if (days == null) return deadline ? `Due ${deadline}` : 'Ongoing';
  if (days < 0) return `Overdue by ${Math.abs(days)} days`;
  if (days === 0) return 'Due today';
  if (days < 30) return `${days} days left`;
  if (days < 365) return `${Math.round(days / 30)} months left`;
  return `${Math.round(days / 365)} year${Math.round(days / 365) === 1 ? '' : 's'} left`;
}

export default function DeadlinesScreen({ navigation }) {
  const [factories, setFactories] = useState(DEMO_FACTORIES);
  const [reports, setReports] = useState({});
  const readSetRef = React.useRef(new Set());
  // Snapshot of which ids were ALREADY read when this screen got focus.
  // Anything not in this snapshot was new since the user's last visit and
  // gets a small "New" pill — Gmail / Mail-style. Persists for the lifetime
  // of this focus only; clears on next focus.
  const [unreadOnEntry, setUnreadOnEntry] = useState(new Set());

  useEffect(() => {
    const subs = DEMO_FACTORIES.map((f) =>
      subscribeFactory(f.factory_id, (doc) => {
        if (!doc) return;
        setFactories((prev) =>
          prev.map((p) => (p.factory_id === f.factory_id ? { ...p, ...doc } : p)),
        );
      }),
    );
    const reportSubs = DEMO_FACTORIES.map((f) =>
      subscribeReport(f.factory_id, (doc) => {
        if (!doc) return;
        setReports((prev) => ({ ...prev, [f.factory_id]: doc }));
      }),
    );
    loadReadSet();
    // Store the latest read-set in a ref instead of state. We don't want the
    // focus effect below to re-fire every time markRead() updates the set —
    // that would erase the "NEW" pills the moment they are shown.
    const unsubRead = subscribeReadSet((set) => {
      readSetRef.current = new Set(set);
    });
    return () => {
      subs.forEach((u) => u && u());
      reportSubs.forEach((u) => u && u());
      unsubRead && unsubRead();
    };
  }, []);

  const deadlines = useMemo(() => {
    const list = [];
    for (const f of factories) {
      const r = reports[f.factory_id];
      const gaps = r?.gaps || [];
      for (const g of gaps) {
        list.push({
          factoryId: f.factory_id,
          factoryName: f.factory_name,
          gap: g,
        });
      }
    }
    list.sort((a, b) => sortByUrgency(a.gap, b.gap));
    return list;
  }, [factories, reports]);

  // Mark every in-window deadline read on focus. Runs on first paint AND
  // every time the user navigates back to this screen, so re-visiting after
  // a new analysis still clears whatever was outstanding. Captures the
  // pre-mark snapshot once per focus to drive the "New" pill below.
  useFocusEffect(
    React.useCallback(() => {
      // Wait for the read-set to actually be hydrated before deciding what
      // counts as "new this session" — otherwise an empty initial readSet
      // would mark every deadline as new on first launch.
      let cancelled = false;
      (async () => {
        await loadReadSet();
        if (cancelled) return;
        const current = new Set();
        const ids = [];
        const prev = readSetRef.current;
        for (const { factoryId, gap } of deadlines) {
          const d = gap?.days_remaining;
          if (typeof d !== 'number' || d >= DEADLINE_WINDOW_DAYS) continue;
          const id = deadlineId(factoryId, gap);
          ids.push(id);
          if (!prev.has(id)) current.add(id);
        }
        setUnreadOnEntry(current);
        if (ids.length) markRead(ids);
      })();
      return () => {
        cancelled = true;
      };
    }, [deadlines]),
  );

  if (deadlines.length === 0) {
    return (
      <View style={styles.bg}>
        <EmptyState
          icon="calendar"
          iconColor={colors.primary}
          title="No upcoming deadlines"
          message="None of your factories have open EU or UK compliance deadlines right now. We'll let you know as soon as anything comes up."
          useLogo
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Showing every open compliance deadline across your factories, sorted by
        urgency. Tap a row to open the factory and see how to fix it.
      </Text>

      {deadlines.map(({ factoryId, factoryName, gap }, idx) => {
        const days = gap.days_remaining;
        const c = urgencyColor(days);
        const reg = plainRegulation(gap.regulation);
        const title =
          (gap.display_title && String(gap.display_title).trim())
          || plainRequirement(gap.requirement, gap.regulation, gap.status);
        const id = deadlineId(factoryId, gap);
        const isNew = unreadOnEntry.has(id);
        return (
          <TouchableOpacity
            key={`${factoryId}-${idx}`}
            style={[
              styles.row,
              { borderLeftColor: c },
              isNew && styles.rowNew,
            ]}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('Factory', {
                factoryId,
                factoryName,
                screen: 'Status',
              })
            }
          >
            <View style={styles.rowHead}>
              <View style={styles.rowTitleWrap}>
                {isNew && (
                  <View style={styles.newPill}>
                    <Text style={styles.newPillText}>NEW</Text>
                  </View>
                )}
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {title}
                </Text>
              </View>
              <View style={[styles.urgencyPill, { backgroundColor: `${c}33`, borderColor: c }]}>
                <Ionicons name="time" size={12} color={c} />
                <Text style={[styles.urgencyText, { color: c }]}>
                  {urgencyText(days, gap.deadline)}
                </Text>
              </View>
            </View>
            <View style={styles.rowMeta}>
              <Ionicons name="business" size={12} color={colors.textDim} />
              <Text style={styles.rowMetaText}>{factoryName}</Text>
              {reg.ref ? (
                <>
                  <View style={styles.metaDot} />
                  <Text style={styles.rowMetaText}>{reg.ref}</Text>
                </>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  intro: {
    color: '#C9D1D9',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.md,
  },

  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow,
  },
  rowNew: {
    // Subtle teal tint so the eye lands on it. Same surface so it doesn't
    // look like a separate widget class.
    backgroundColor: 'rgba(0, 212, 170, 0.06)',
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
    flexWrap: 'wrap',
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    flexShrink: 1,
  },
  newPill: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  newPillText: {
    color: colors.bg,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  urgencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  urgencyText: { fontSize: 11, fontWeight: '800', marginLeft: 4 },

  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  rowMetaText: { color: colors.textDim, fontSize: 12, marginLeft: 4 },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    marginHorizontal: 8,
  },
});
