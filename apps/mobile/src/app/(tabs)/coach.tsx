import type { AgendaItemDto, TrainerClientDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarDays, ChevronRight, Clock, Lock, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CoachSummary } from '@/components/coach/CoachSummary';
import { ModeSwitch } from '@/components/ModeSwitch';
import { ConversationList } from '@/components/ConversationList';
import { Button, Card, EmptyState, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

type Segment = 'schedule' | 'clients' | 'messages';
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Club day (Belgrade) of an instant. */
const dayOf = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date(iso));

/**
 * F14-1 "Work" (trainers only): my classes and personal sessions day by day, with one-tap
 * attendance, and my clients with their progress. A trainer still uses the rest of the app
 * like any member.
 */
export default function CoachScreen() {
  const { t, i18n } = useTranslation();
  const [segment, setSegment] = useState<Segment>('schedule');
  return (
    <Screen>
      <View style={styles.head}>
        <Text
          style={[type.display, styles.title, { flex: 1, fontFamily: displayFont(i18n.language) }]}
        >
          {t('app.coach.title')}
        </Text>
        <ModeSwitch />
      </View>
      <CoachSummary />
      <View style={styles.segments} accessibilityRole="tablist">
        {(['schedule', 'clients', 'messages'] as const).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: s === segment }}
            onPress={() => setSegment(s)}
            style={[styles.segment, s === segment && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, s === segment && { color: color.text.primary }]}>
              {t(`app.coach.segments.${s}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      {segment === 'schedule' ? (
        <Schedule />
      ) : segment === 'clients' ? (
        <Clients />
      ) : (
        <ConversationList
          path="/admin/my-conversations"
          emptyTitle={t('app.chat.no_clients')}
          onOpen={(c) =>
            router.push({
              pathname: '/coach/chat/[id]',
              params: { id: c.id, name: c.name, open: c.open ? '1' : '0' },
            })
          }
        />
      )}
    </Screen>
  );
}

function Schedule() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const today = clubToday();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const [day, setDay] = useState(today);
  const q = useQuery({
    queryKey: ['coach', 'agenda', today, i18n.language],
    queryFn: () =>
      api.get<AgendaItemDto[]>('/admin/my-schedule', {
        from: today,
        to: addDays(today, 6),
        locale: i18n.language,
      }),
    refetchInterval: 60_000,
  });
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: 'done' | 'no_show' }) =>
      api.post(`/admin/appointments/${id}/status`, { status: value }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['coach', 'agenda'] }),
  });
  const items = (q.data ?? [])
    .filter((x) => dayOf(x.startsAt) === day && x.status !== 'cancelled')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const count = (d: string) => (q.data ?? []).filter((x) => dayOf(x.startsAt) === d).length;

  return (
    <>
      <Pressable
        onPress={() => router.push('/coach/availability')}
        accessibilityRole="button"
        style={styles.hours}
      >
        <Clock size={18} color={color.accent[400]} />
        <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]}>
          {t('app.availability.open')}
        </Text>
        <ChevronRight style={dirIcon} size={20} color={color.text.muted} />
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={styles.days}>
          {days.map((d) => {
            const on = d === day;
            return (
              <Pressable
                key={d}
                onPress={() => setDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.day, on && styles.dayOn]}
              >
                <Text style={[styles.dayName, on && { color: color.onAccent }]}>
                  {d === today ? t('app.classes.today') : f.date(d, { weekday: 'short' })}
                </Text>
                <Text style={[styles.dayNum, on && { color: color.onAccent }]}>
                  {f.date(d, { day: 'numeric' })}
                </Text>
                <View style={[styles.dot, { opacity: count(d) ? 1 : 0 }, on && styles.dotOn]} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {q.isPending ? (
        <Skeleton height={200} />
      ) : q.error ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title={t('app.coach.free_day')} />
        </Card>
      ) : (
        items.map((x) => (
          <Card key={x.id} style={{ gap: 10 }}>
            <Pressable
              disabled={x.type !== 'class'}
              onPress={() => router.push({ pathname: '/coach/class/[id]', params: { id: x.id } })}
              accessibilityRole={x.type === 'class' ? 'button' : undefined}
              style={styles.itemHead}
            >
              <View style={styles.time}>
                <Text style={styles.timeText}>{f.time(x.startsAt)}</Text>
                <Text style={type.bodySm}>{f.time(x.endsAt)}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.h3} numberOfLines={1}>
                  {x.type === 'class' ? x.title : (x.memberName ?? x.title)}
                </Text>
                <Text style={type.bodySm} numberOfLines={1}>
                  {x.type === 'class'
                    ? t('app.coach.booked', { booked: x.booked ?? 0, capacity: x.capacity ?? 0 })
                    : [t(`app.appointments.kinds.${x.kind}`), x.location]
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
              </View>
              {x.type === 'class' && (
                <ChevronRight style={dirIcon} size={20} color={color.text.muted} />
              )}
            </Pressable>
            {x.type === 'appointment' &&
              (x.status === 'scheduled' ? (
                <View style={styles.actions}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t('app.coach.done')}
                      onPress={() => status.mutate({ id: x.id, value: 'done' })}
                      loading={status.isPending && status.variables?.id === x.id}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t('app.coach.no_show')}
                      variant="secondary"
                      onPress={() => status.mutate({ id: x.id, value: 'no_show' })}
                    />
                  </View>
                </View>
              ) : (
                <Text style={styles.state}>
                  {t(`app.coach.status.${x.status}`, { defaultValue: x.status })}
                </Text>
              ))}
          </Card>
        ))
      )}
    </>
  );
}

function Clients() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['coach', 'clients'],
    queryFn: () => api.get<TrainerClientDto[]>('/admin/my-clients'),
  });
  if (q.isPending) return <Skeleton height={200} />;
  if (q.error)
    return (
      <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
    );
  if (!q.data.length)
    return (
      <Card>
        <EmptyState
          icon={Users}
          title={t('app.coach.no_clients')}
          text={t('app.coach.no_clients_text')}
        />
      </Card>
    );
  return (
    <Card style={{ paddingVertical: 4 }}>
      {q.data.map((c, i) => (
        <Pressable
          key={c.id}
          onPress={() =>
            router.push({ pathname: '/coach/client/[id]', params: { id: c.memberId } })
          }
          accessibilityRole="button"
          style={[styles.client, i > 0 && styles.divider]}
        >
          <View style={styles.initials}>
            <Text style={styles.initialsText}>
              {c.firstName.charAt(0)}
              {c.lastName.charAt(0)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.body} numberOfLines={1}>
              {c.firstName} {c.lastName}
            </Text>
            <Text style={type.bodySm}>
              {t('app.coach.since', { date: f.date(c.since, { day: 'numeric', month: 'short' }) })}
            </Text>
          </View>
          {!c.sharesProgress && <Lock size={16} color={color.text.muted} />}
          <ChevronRight style={dirIcon} size={20} color={color.text.muted} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, lineHeight: 30, paddingTop: 12 },
  segments: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm - 2,
  },
  segmentActive: { backgroundColor: color.bg.surface2 },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
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
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent[400] },
  dotOn: { backgroundColor: color.onAccent },
  hours: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  time: { width: 52, alignItems: 'center' },
  timeText: { fontFamily: fonts.bold, fontSize: 16, color: color.text.primary },
  actions: { flexDirection: 'row', gap: 10 },
  state: { color: color.text.secondary, fontFamily: fonts.semibold, fontSize: 13 },
  client: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 8,
  },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  initials: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: { color: color.accent[400], fontFamily: fonts.bold, fontSize: 14 },
});
