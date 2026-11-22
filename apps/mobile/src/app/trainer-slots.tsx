import type { FreeSlotsDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarCheck, CalendarX } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Button, Card, EmptyState, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

/** Club day (Belgrade) of an instant. */
const dayOf = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date(iso));

/**
 * F14-4: a trainer's free personal-training slots for the next two weeks. Pick a day, tap a
 * time, confirm: the session lands in the trainer's schedule and in "My sessions".
 */
export default function TrainerSlotsScreen() {
  const { trainerId, name } = useLocalSearchParams<{ trainerId: string; name?: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['trainer-slots', trainerId],
    queryFn: () => api.get<FreeSlotsDto>(`/me/trainers/${trainerId}/slots`),
  });
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of q.data?.slots ?? []) {
      const d = dayOf(s);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [q.data]);
  const days = [...byDay.keys()];
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    if (!day || !byDay.has(day)) setDay(days[0] ?? null);
  }, [byDay, day, days]);

  const book = useMutation({
    mutationFn: (startsAt: string) => api.post(`/me/trainers/${trainerId}/book`, { startsAt }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'appointments'] });
      void qc.invalidateQueries({ queryKey: ['trainer-slots', trainerId] });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['trainer-slots', trainerId] }),
  });

  if (book.isSuccess && pick)
    return (
      <Screen>
        <BackHeader title={t('app.slots.title')} />
        <Card>
          <EmptyState
            icon={CalendarCheck}
            title={t('app.slots.booked_title')}
            text={t('app.slots.booked_text', {
              name: name ?? '',
              when: `${f.date(dayOf(pick), { weekday: 'long', day: 'numeric', month: 'long' })} ${f.time(pick)}`,
            })}
            action={<Button label={t('app.slots.done')} onPress={() => router.back()} />}
          />
        </Card>
      </Screen>
    );

  const times = day ? (byDay.get(day) ?? []) : [];
  return (
    <Screen>
      <BackHeader title={t('app.slots.title')} />
      {name ? <Text style={type.bodySm}>{name}</Text> : null}
      {q.isPending ? (
        <Skeleton height={260} />
      ) : q.error ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : days.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarX}
            title={t('app.slots.none')}
            text={t('app.slots.none_text')}
            action={
              <Button
                label={t('app.trainers.request_pt')}
                variant="secondary"
                onPress={() => router.replace({ pathname: '/pt-request', params: { trainerId } })}
              />
            }
          />
        </Card>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={styles.days}>
              {days.map((d) => {
                const on = d === day;
                return (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setDay(d);
                      setPick(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.day, on && styles.dayOn]}
                  >
                    <Text style={[styles.dayName, on && { color: color.onAccent }]}>
                      {f.date(d, { weekday: 'short' })}
                    </Text>
                    <Text style={[styles.dayNum, on && { color: color.onAccent }]}>
                      {f.date(d, { day: 'numeric' })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Card style={{ gap: 12 }}>
            <Text style={type.label}>{t('app.slots.length', { n: q.data.slotMinutes })}</Text>
            <View style={styles.times}>
              {times.map((s) => {
                const on = s === pick;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setPick(on ? null : s)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.time, on && styles.timeOn]}
                  >
                    <Text style={[styles.timeText, on && { color: color.onAccent }]}>
                      {f.time(s)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
          <Text style={type.bodySm}>{t('app.slots.cancel_rule')}</Text>
          {book.error && (
            <ErrorNote
              message={book.error instanceof ApiError ? book.error.message : 'errors.internal'}
            />
          )}
          <Button
            label={
              pick
                ? t('app.slots.book_at', {
                    when: `${f.date(dayOf(pick), { weekday: 'short', day: 'numeric' })} ${f.time(pick)}`,
                  })
                : t('app.slots.pick')
            }
            disabled={!pick}
            loading={book.isPending}
            onPress={() => pick && book.mutate(pick)}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 8 },
  day: {
    width: 56,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  dayOn: { backgroundColor: color.accent[500], borderColor: color.accent[500] },
  dayName: { fontFamily: fonts.medium, fontSize: 12, color: color.text.secondary },
  dayNum: { fontFamily: fonts.bold, fontSize: 18, color: color.text.primary },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  time: {
    width: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface2,
  },
  timeOn: { backgroundColor: color.accent[500], borderColor: color.accent[500] },
  timeText: { fontFamily: fonts.semibold, fontSize: 15, color: color.text.primary },
});
