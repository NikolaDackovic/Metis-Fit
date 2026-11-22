import type { WeekSummaryDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { Footprints, Moon } from 'lucide-react-native';
import { Activity, ChevronRight, Droplets } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, SectionTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, radius, type } from '@/theme';

/** "My week": everything the member tracks, Monday to Sunday, plus shortcuts to log more. */
/** `shortcuts`: links to Today and Activities (off where those have their own entries, e.g. Health). */
export function WeekCard({ shortcuts = true }: { shortcuts?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['me', 'week'],
    queryFn: () => api.get<WeekSummaryDto>('/me/week'),
  });
  const w = q.data;
  if (!w) return null;
  const days = t('app.week.days').split(',');
  const stats: Array<[string, string]> = [
    [t('app.week.workouts'), String(w.workouts + w.classesAttended)],
    [t('app.week.activities'), w.activityMinutes ? `${w.activityMinutes} min` : '0'],
    [t('app.week.visits'), String(w.visits)],
    [t('app.week.sleep'), w.avgSleepH != null ? `${w.avgSleepH} h` : '-'],
    [t('app.week.steps'), w.avgSteps != null ? f.number(w.avgSteps) : '-'],
    [t('app.week.water'), t('app.week.days_count', { n: w.waterGoalDays })],
    [
      t('app.week.food'),
      w.avgKcalIn != null ? `${w.avgKcalIn}${w.kcalTarget ? ` / ${w.kcalTarget}` : ''}` : '-',
    ],
    [
      t('app.week.weight'),
      w.weightChangeKg != null ? `${w.weightChangeKg > 0 ? '+' : ''}${w.weightChangeKg} kg` : '-',
    ],
  ];
  return (
    <>
      <SectionTitle>{t('app.week.title')}</SectionTitle>
      <Card style={{ gap: 14 }}>
        <View
          style={styles.days}
          accessibilityLabel={t('app.week.active_days', { n: w.activeDays.length })}
        >
          {days.map((d, i) => {
            const on = w.activeDays.includes(i);
            return (
              <View key={d} style={styles.day}>
                <View style={[styles.dot, on && styles.dotOn]} />
                <Text style={styles.dayText}>{d}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.grid}>
          {stats.map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.value} numberOfLines={1}>
                {value}
              </Text>
              <Text style={type.bodySm} numberOfLines={2}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      {shortcuts && (
        <View style={styles.links}>
          <Shortcut
            icon={Droplets}
            title={t('app.today.title')}
            text={t('app.today.entry_text')}
            to="/today"
          />
          <Shortcut
            icon={Activity}
            title={t('app.activities.title')}
            text={t('app.activities.entry_text')}
            to="/activities"
          />
        </View>
      )}
    </>
  );
}

function Shortcut({
  icon: Icon,
  title,
  text,
  to,
}: {
  icon: typeof Moon | typeof Footprints;
  title: string;
  text: string;
  to: string;
}) {
  return (
    <Pressable
      onPress={() => router.push(to as never)}
      accessibilityRole="link"
      style={styles.link}
    >
      <Icon size={22} color={color.accent[400]} />
      <View style={{ flex: 1 }}>
        <Text style={type.h3}>{title}</Text>
        <Text style={type.bodySm}>{text}</Text>
      </View>
      <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 6, flex: 1 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: color.border.subtle,
  },
  dotOn: { backgroundColor: color.accent[500], borderColor: color.accent[500] },
  dayText: { fontFamily: fonts.semibold, fontSize: 11, color: color.text.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  // Three per row so labels like 'Steps (average)' fit on a phone in every language.
  stat: { width: '33.33%', gap: 2, paddingEnd: 8, marginBottom: 8 },
  value: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  links: { gap: 10 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
});
