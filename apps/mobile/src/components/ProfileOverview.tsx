import type {
  MembershipDto,
  MyAppointmentDto,
  MyBookingsDto,
  ProgressDto,
  WeekSummaryDto,
} from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import {
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  Droplets,
  Dumbbell,
  Hourglass,
  Ruler,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, SectionTitle, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { clubShortName, currentMembership, useClub, useMyMemberships } from '@/lib/queries';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, radius, type } from '@/theme';

type Next = { title: string; startsAt: string; who: string | null; waitlist: number | null };
type Reminder = { key: string; icon: LucideIcon; text: string; to: Href; tone?: 'warning' };

/**
 * Profile overview: where my membership stands ("in GRIT, valid until..."), my next training,
 * and a short "for you today" list that nudges towards training, food, sleep and water.
 */
export function ProfileOverview({
  linked,
  showMembership = true,
}: {
  linked: boolean;
  /** Home already shows the membership card; there only the "for you today" part is shown. */
  showMembership?: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const club = useClub();
  const memberships = useMyMemberships();
  const bookings = useQuery({
    queryKey: ['me', 'bookings'],
    queryFn: () => api.get<MyBookingsDto>('/me/bookings'),
    enabled: linked,
  });
  const appointments = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: () => api.get<MyAppointmentDto[]>('/me/appointments'),
    enabled: linked,
  });
  const week = useQuery({
    queryKey: ['me', 'week'],
    queryFn: () => api.get<WeekSummaryDto>('/me/week'),
  });
  const progress = useQuery({
    queryKey: ['me', 'progress'],
    queryFn: () => api.get<ProgressDto>('/me/progress'),
  });

  const current: MembershipDto | null = linked ? currentMembership(memberships.data) : null;
  const clubName = clubShortName(club.data);
  const now = Date.now();

  const next = nextTraining(bookings.data, appointments.data, now, (k) =>
    t(`app.appointments.kinds.${k}`),
  );
  const reminders = buildReminders({
    t,
    current,
    bookings: bookings.data,
    week: week.data,
    progress: progress.data,
    now,
  });

  return (
    <>
      {linked && showMembership && (
        <Card style={{ gap: 10 }}>
          <View style={styles.head}>
            <Text style={[type.label, { flex: 1 }]}>{t('app.profile.membership_title')}</Text>
            <StatusBadge status={current?.displayStatus ?? 'none'} />
          </View>
          {current ? (
            <>
              <Text style={type.h3}>
                {t('app.profile.in_club', { club: clubName })}
                <Text style={styles.muted}> · {current.planName}</Text>
              </Text>
              {current.endDate && (
                <Text style={type.body}>
                  {t('app.membership.valid_until')}{' '}
                  {f.date(current.endDate, { day: 'numeric', month: 'long', year: 'numeric' })}
                  {current.daysLeft !== null && current.daysLeft >= 0 && (
                    <Text style={styles.muted}>
                      {' · '}
                      {t('app.profile.days_left', { count: current.daysLeft })}
                    </Text>
                  )}
                </Text>
              )}
              {current.visitsRemaining !== null && (
                <Text style={type.bodySm}>
                  {t('app.membership.visits_left', { count: current.visitsRemaining })}
                </Text>
              )}
              {(current.displayStatus === 'expiring_soon' ||
                current.displayStatus === 'expired') && (
                <Button
                  label={t('app.profile.renew')}
                  icon={CalendarPlus}
                  onPress={() => router.push('/renew')}
                />
              )}
            </>
          ) : (
            <>
              <Text style={type.body}>{t('app.membership.none_title')}</Text>
              <Button
                label={t('app.profile.renew')}
                icon={CalendarPlus}
                onPress={() => router.push('/renew')}
              />
            </>
          )}
        </Card>
      )}

      {linked && (
        <Card style={{ gap: 8 }}>
          <Text style={type.label}>{t('app.profile.next_training')}</Text>
          {next ? (
            <Pressable
              style={styles.row}
              accessibilityRole="link"
              onPress={() => router.push('/(tabs)/classes')}
            >
              <CalendarClock size={22} color={color.accent[400]} />
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>{next.title}</Text>
                <Text style={type.bodySm}>
                  {f.dateTime(next.startsAt)}
                  {next.who ? ` · ${next.who}` : ''}
                </Text>
                {next.waitlist !== null && (
                  <Text style={styles.warning}>
                    {t('app.classes.on_waitlist', { position: next.waitlist })}
                  </Text>
                )}
              </View>
              <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
            </Pressable>
          ) : (
            <View style={styles.row}>
              <Text style={[type.bodySm, { flex: 1 }]}>{t('app.profile.no_next')}</Text>
              <Pressable
                onPress={() => router.push('/(tabs)/classes')}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.link}>{t('app.profile.book_now')}</Text>
              </Pressable>
            </View>
          )}
        </Card>
      )}

      <SectionTitle>{t('app.profile.for_you')}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {reminders.length === 0 ? (
          <View style={[styles.row, { paddingVertical: 12 }]}>
            <Sparkles size={20} color={color.accent[400]} />
            <Text style={[type.body, { flex: 1 }]}>{t('app.profile.all_good')}</Text>
          </View>
        ) : (
          reminders.map((r, i) => (
            <Pressable
              key={r.key}
              style={[styles.row, styles.reminder, i > 0 && styles.divider]}
              accessibilityRole="link"
              onPress={() => router.push(r.to)}
            >
              <View style={[styles.icon, r.tone === 'warning' && styles.iconWarning]}>
                <r.icon
                  size={18}
                  color={r.tone === 'warning' ? color.status.warning : color.accent[400]}
                />
              </View>
              <Text style={[type.body, { flex: 1 }]}>{r.text}</Text>
              <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
            </Pressable>
          ))
        )}
      </Card>
    </>
  );
}

function nextTraining(
  bookings: MyBookingsDto | undefined,
  appointments: MyAppointmentDto[] | undefined,
  now: number,
  kindName: (kind: string) => string,
): Next | null {
  const items: Next[] = [
    ...(bookings?.upcoming ?? [])
      .filter(
        (b) =>
          (b.status === 'confirmed' || b.status === 'waitlisted') && b.class.status !== 'cancelled',
      )
      .map((b) => ({
        title: b.class.typeName,
        startsAt: b.class.startsAt,
        who: b.class.trainer?.name ?? null,
        waitlist: b.status === 'waitlisted' ? b.waitlistPosition : null,
      })),
    ...(appointments ?? [])
      .filter((a) => a.status === 'scheduled')
      .map((a) => ({
        title: a.title || kindName(a.kind),
        startsAt: a.startsAt,
        who: a.trainerName,
        waitlist: null,
      })),
  ].filter((x) => Date.parse(x.startsAt) > now);
  items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return items[0] ?? null;
}

/** Simple, explainable nudges: each one points to the screen where it can be done. */
function buildReminders({
  t,
  current,
  bookings,
  week,
  progress,
  now,
}: {
  t: (k: string, o?: Record<string, unknown>) => string;
  current: MembershipDto | null;
  bookings: MyBookingsDto | undefined;
  week: WeekSummaryDto | undefined;
  progress: ProgressDto | undefined;
  now: number;
}): Reminder[] {
  const out: Reminder[] = [];
  if (current?.displayStatus === 'expiring_soon' && current.daysLeft !== null)
    out.push({
      key: 'expiring',
      icon: Hourglass,
      tone: 'warning',
      text: t('app.profile.rem_expiring', { count: current.daysLeft }),
      to: '/renew',
    });
  if (current?.displayStatus === 'expired')
    out.push({
      key: 'expired',
      icon: Hourglass,
      tone: 'warning',
      text: t('app.profile.rem_expired'),
      to: '/renew',
    });
  if (bookings?.bannedUntil && Date.parse(bookings.bannedUntil) > now)
    out.push({
      key: 'banned',
      icon: CalendarClock,
      tone: 'warning',
      text: t('app.profile.rem_banned'),
      to: '/(tabs)/classes',
    });
  if (week) {
    // Monday = 0 ... Sunday = 6 in the club's week.
    const today = (new Date(now).getDay() + 6) % 7;
    if (week.workouts + week.classesAttended === 0 && today >= 2)
      out.push({
        key: 'train',
        icon: Dumbbell,
        text: t('app.profile.rem_train'),
        to: '/(tabs)/classes',
      });
    if (week.avgSleepH === null || week.waterGoalDays === 0)
      out.push({ key: 'today', icon: Droplets, text: t('app.profile.rem_today'), to: '/today' });
    // Food has its own card on Home (F15-2 calories), so no separate nudge here.
  }
  if (progress) {
    const last = progress.latestMeasurement?.measuredOn;
    if (!last || now - Date.parse(last) > 30 * 86_400_000)
      out.push({
        key: 'measure',
        icon: Ruler,
        text: t('app.profile.rem_measure'),
        to: { pathname: '/(tabs)/classes', params: { view: 'progress' } },
      });
  }
  return out.slice(0, 5);
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: color.text.secondary, fontFamily: fonts.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminder: { minHeight: 56, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWarning: { backgroundColor: `${color.status.warning}1F` },
  link: { color: color.accent[400], fontFamily: fonts.semibold, fontSize: 14 },
  warning: { color: color.status.warning, fontFamily: fonts.semibold, fontSize: 13 },
});
