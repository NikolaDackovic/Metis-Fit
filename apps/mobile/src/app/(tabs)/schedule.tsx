import type { AgendaItemDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModeSwitch } from '@/components/ModeSwitch';
import { ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

const HOUR = 54; // px per hour
const COL = 104; // px per day column
const TIME_COL = 44;
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Monday of the week that contains `day`. */
const mondayOf = (day: string) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
  return addDays(day, 1 - dow);
};
const belgrade = (iso: string) => {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Belgrade',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, min: +g('hour') * 60 + +g('minute') };
};

/**
 * Trainer mode "Schedule": the week as a table (days across, hours down) with group classes and
 * personal sessions, like the admin calendar. Scrolls sideways on phones; opens on today.
 */
export default function ScheduleTab() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const today = clubToday();
  const [week, setWeek] = useState(() => mondayOf(today));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const q = useQuery({
    queryKey: ['coach', 'week', week, i18n.language],
    queryFn: () =>
      api.get<AgendaItemDto[]>('/admin/my-schedule', {
        from: week,
        to: addDays(week, 6),
        locale: i18n.language,
      }),
    refetchInterval: 60_000,
  });
  const items = (q.data ?? [])
    .filter((x) => x.status !== 'cancelled')
    .map((x) => {
      const s = belgrade(x.startsAt);
      const e = belgrade(x.endsAt);
      return { ...x, day: s.day, start: s.min, end: e.day === s.day ? e.min : 24 * 60 };
    });
  const first = Math.min(7, ...items.map((x) => Math.floor(x.start / 60)));
  const last = Math.max(22, ...items.map((x) => Math.ceil(x.end / 60)));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const todayIndex = days.indexOf(today);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
          {t('app.tabs.schedule')}
        </Text>
        <ModeSwitch />
      </View>

      <View style={styles.weekRow}>
        <Pressable
          onPress={() => setWeek(addDays(week, -7))}
          accessibilityRole="button"
          accessibilityLabel={t('app.schedule.prev_week')}
          style={styles.navBtn}
        >
          <ChevronLeft style={dirIcon} size={20} color={color.text.primary} />
        </Pressable>
        <Pressable onPress={() => setWeek(mondayOf(today))} style={{ flex: 1 }}>
          <Text style={[type.h3, { textAlign: 'center' }]}>
            {f.date(days[0]!, { day: 'numeric', month: 'short' })} -{' '}
            {f.date(days[6]!, { day: 'numeric', month: 'short' })}
          </Text>
          <Text style={[type.bodySm, { textAlign: 'center' }]}>
            {t('app.schedule.count', { n: items.length })}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setWeek(addDays(week, 7))}
          accessibilityRole="button"
          accessibilityLabel={t('app.schedule.next_week')}
          style={styles.navBtn}
        >
          <ChevronRight style={dirIcon} size={20} color={color.text.primary} />
        </Pressable>
      </View>

      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: color.accent[500] }]} />
        <Text style={type.bodySm}>{t('app.schedule.classes')}</Text>
        <View style={[styles.dot, { backgroundColor: APPT, marginStart: 12 }]} />
        <Text style={type.bodySm}>{t('app.schedule.personal')}</Text>
      </View>

      {q.isPending ? (
        <Skeleton height={420} />
      ) : q.isError ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : (
        <View style={styles.table}>
          {/* Hours stay in place while the days scroll sideways. */}
          <View style={{ width: TIME_COL, paddingTop: 44 }}>
            {hours.map((h) => (
              <Text key={h} style={styles.hour}>
                {String(h).padStart(2, '0')}:00
              </Text>
            ))}
          </View>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            onLayout={() => {
              if (todayIndex > 0)
                scroller.current?.scrollTo({
                  x: Math.max(0, todayIndex - 0.3) * COL,
                  animated: false,
                });
            }}
          >
            {days.map((d) => {
              const isToday = d === today;
              return (
                <View key={d} style={[styles.col, isToday && styles.colToday]}>
                  <View style={styles.dayHead}>
                    <Text style={[styles.dayName, isToday && { color: color.accent[400] }]}>
                      {f.date(d, { weekday: 'short' })}
                    </Text>
                    <Text style={[styles.dayNum, isToday && { color: color.accent[400] }]}>
                      {f.date(d, { day: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ height: hours.length * HOUR }}>
                    {hours.map((h, i) => (
                      <View key={h} style={[styles.line, { top: i * HOUR }]} />
                    ))}
                    {items
                      .filter((x) => x.day === d)
                      .map((x) => {
                        const top = ((x.start - first * 60) / 60) * HOUR;
                        const height = Math.max(26, ((x.end - x.start) / 60) * HOUR - 2);
                        const isClass = x.type === 'class';
                        return (
                          <Pressable
                            key={x.id}
                            onPress={() =>
                              isClass
                                ? router.push({
                                    pathname: '/coach/class/[id]',
                                    params: { id: x.id },
                                  })
                                : x.memberId &&
                                  router.push({
                                    pathname: '/coach/client/[id]',
                                    params: { id: x.memberId },
                                  })
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`${f.time(x.startsAt)} ${isClass ? x.title : (x.memberName ?? x.title)}`}
                            style={[
                              styles.event,
                              { top, height },
                              isClass ? styles.eventClass : styles.eventAppt,
                            ]}
                          >
                            <Text style={styles.eventTime} numberOfLines={1}>
                              {f.time(x.startsAt)}
                            </Text>
                            <Text style={styles.eventTitle} numberOfLines={height > 40 ? 2 : 1}>
                              {isClass ? x.title : (x.memberName ?? x.title)}
                            </Text>
                            {isClass && x.capacity != null && height > 52 && (
                              <Text style={styles.eventMeta}>
                                {x.booked ?? 0}/{x.capacity}
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}

const APPT = '#3B82F6';

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 },
  title: { flex: 1, fontSize: 26, lineHeight: 32 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.surface,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  table: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
    overflow: 'hidden',
  },
  hour: {
    height: HOUR,
    fontFamily: fonts.medium,
    fontSize: 10,
    color: color.text.muted,
    textAlign: 'center',
    marginTop: -6,
  },
  col: {
    width: COL,
    borderStartWidth: StyleSheet.hairlineWidth,
    borderStartColor: color.border.subtle,
  },
  colToday: { backgroundColor: color.accent.tint },
  dayHead: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  dayName: { fontFamily: fonts.medium, fontSize: 11, color: color.text.secondary },
  dayNum: { fontFamily: fonts.bold, fontSize: 15, color: color.text.primary },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.subtle,
  },
  event: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderStartWidth: 3,
    overflow: 'hidden',
  },
  eventClass: { backgroundColor: 'rgba(229,78,38,0.22)', borderStartColor: color.accent[500] },
  eventAppt: { backgroundColor: 'rgba(59,130,246,0.22)', borderStartColor: APPT },
  eventTime: { fontFamily: fonts.semibold, fontSize: 10, color: color.text.secondary },
  eventTitle: { fontFamily: fonts.bold, fontSize: 12, color: color.text.primary },
  eventMeta: { fontFamily: fonts.medium, fontSize: 10, color: color.text.secondary },
});
