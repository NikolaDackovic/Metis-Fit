import type { CoachDashboardDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, radius, type } from '@/theme';
import { AssignTemplate } from './AssignTemplate';

/**
 * F17-2 trainer dashboard on top of "Work": clients, sessions today, active programs, and the
 * clients still waiting for a program (one tap to give them one from a template).
 */
export function CoachSummary() {
  const { t } = useTranslation();
  const [assignFor, setAssignFor] = useState<{ memberId: string; name: string } | null>(null);
  const q = useQuery({
    queryKey: ['coach', 'dashboard'],
    queryFn: () => api.get<CoachDashboardDto>('/admin/my-dashboard'),
    refetchInterval: 60_000,
  });
  if (!q.data) return null;
  const d = q.data;
  const stats: Array<[string, number, boolean?]> = [
    [t('app.coach.stat_clients'), d.clients],
    [t('app.coach.stat_today'), d.today],
    [t('app.coach.stat_programs'), d.activePrograms],
    [t('app.coach.stat_waiting'), d.waiting.length, d.waiting.length > 0],
  ];
  return (
    <>
      <View style={styles.grid}>
        {stats.map(([label, n, warn]) => (
          <View key={label} style={[styles.stat, warn && styles.statWarn]}>
            <Text style={[styles.num, warn && { color: color.accent[400] }]}>{n}</Text>
            <Text style={styles.label} numberOfLines={2}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      {d.waiting.length > 0 && (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <Text style={[type.label, { paddingVertical: 8 }]}>{t('app.coach.waiting_title')}</Text>
          {d.waiting.slice(0, 5).map((w) => (
            <Pressable
              key={w.memberId}
              onPress={() => setAssignFor(w)}
              accessibilityRole="button"
              style={styles.row}
            >
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {w.name}
              </Text>
              <Text style={styles.give}>{t('app.coach.give_program')}</Text>
              <ChevronRight style={dirIcon} size={16} color={color.text.muted} />
            </Pressable>
          ))}
        </Card>
      )}
      {assignFor && (
        <AssignTemplate
          memberId={assignFor.memberId}
          name={assignFor.name}
          onClose={() => setAssignFor(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
    alignItems: 'center',
    gap: 2,
  },
  statWarn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  num: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: color.text.secondary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: color.border.subtle,
  },
  give: { fontFamily: fonts.semibold, fontSize: 13, color: color.accent[400] },
});
