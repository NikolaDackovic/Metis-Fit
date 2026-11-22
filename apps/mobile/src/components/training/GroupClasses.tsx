import type { BookingDto, ClassRulesDto, ClassSessionDto, MyBookingsDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  AlertTriangle,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Link2,
  Star,
  UserRound,
} from 'lucide-react-native';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Screen,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { classAction, clubDayOf, nextDays } from '@/lib/classes';
import { useFavoriteClassTypes } from '@/lib/favorites';
import { clubToday, useFormat } from '@/lib/format';
import { useMe } from '@/lib/queries';
import { dirIcon } from '@/lib/rtl';
import { MyUpcoming } from './MyAppointments';
import { color, fonts, radius, type } from '@/theme';

const DAYS = 7;

/** Group class schedule and bookings (first segment of the Training tab). */
export function GroupClasses({ header }: { header: ReactNode }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const me = useMe();
  const linked = Boolean(me.data?.member);
  const today = clubToday();
  const days = useMemo(() => nextDays(today, DAYS), [today]);
  const [day, setDay] = useState(today);
  const favorites = useFavoriteClassTypes(me.data?.id);
  const [onlyFav, setOnlyFav] = useState(false);

  const schedule = useQuery({
    queryKey: ['classes', today, i18n.language],
    queryFn: () =>
      api.get<ClassSessionDto[]>('/public/classes', {
        from: days[0]!,
        to: days[DAYS - 1]!,
        locale: i18n.language,
      }),
    refetchInterval: 60_000,
  });
  const rules = useQuery({
    queryKey: ['class-rules'],
    queryFn: () => api.get<ClassRulesDto>('/public/class-rules'),
    staleTime: 60 * 60_000,
  });
  const mine = useQuery({
    queryKey: ['me', 'bookings', i18n.language],
    queryFn: () => api.get<MyBookingsDto>('/me/bookings', { locale: i18n.language }),
    enabled: linked,
  });

  const byClass = useMemo(
    () => new Map((mine.data?.upcoming ?? []).map((b) => [b.classId, b])),
    [mine.data],
  );
  const showFav = onlyFav && favorites.list.length > 0;
  const sessions = (schedule.data ?? []).filter(
    (s) => clubDayOf(s.startsAt) === day && (!showFav || favorites.has(s.classTypeId)),
  );
  // Next favourite session in the coming days: shown as a shortcut when filtering by favourites.
  const favDays = new Set(
    (schedule.data ?? [])
      .filter((s) => favorites.has(s.classTypeId))
      .map((s) => clubDayOf(s.startsAt)),
  );
  const dayFmt = (d: string, opts: Intl.DateTimeFormatOptions) => f.date(d, opts);

  return (
    <Screen
      refreshing={schedule.isFetching || mine.isFetching}
      onRefresh={() => {
        void schedule.refetch();
        void mine.refetch();
      }}
    >
      {header}

      {!linked && me.data && (
        <Pressable
          style={styles.notice}
          onPress={() => router.push('/link')}
          accessibilityRole="link"
        >
          <Link2 size={18} color={color.accent[400]} />
          <Text style={[type.bodySm, { flex: 1, color: color.text.primary }]}>
            {t('app.classes.link_to_book')}
          </Text>
          <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
        </Pressable>
      )}

      {mine.data?.bannedUntil && (
        <View style={[styles.notice, styles.warn]}>
          <AlertTriangle size={18} color={color.status.warning} />
          <Text style={[type.bodySm, { flex: 1, color: color.status.warning }]}>
            {t('app.classes.banned', { date: f.dateTime(mine.data.bannedUntil) })}
          </Text>
        </View>
      )}

      {linked && <MyUpcoming bookings={mine.data?.upcoming ?? []} onClass={setDay} />}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.days}
        accessibilityRole="tablist"
      >
        {days.map((d) => {
          const active = d === day;
          return (
            <Pressable
              key={d}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={dayFmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}
              onPress={() => setDay(d)}
              style={[styles.day, active && styles.dayActive]}
            >
              <Text style={[styles.dayName, active && { color: color.onAccent }]}>
                {d === today ? t('app.classes.today') : dayFmt(d, { weekday: 'short' })}
              </Text>
              <Text style={[styles.dayNum, active && { color: color.onAccent }]}>
                {dayFmt(d, { day: 'numeric' })}
              </Text>
              {favDays.has(d) && (
                <View style={[styles.favDot, active && { backgroundColor: color.onAccent }]} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {favorites.list.length > 0 && (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: onlyFav }}
          onPress={() => setOnlyFav((v) => !v)}
          style={[styles.favFilter, onlyFav && styles.favFilterOn]}
        >
          <Star
            size={16}
            color={onlyFav ? color.accent[400] : color.text.secondary}
            fill={onlyFav ? color.accent[400] : 'transparent'}
          />
          <Text style={[styles.favFilterText, onlyFav && { color: color.text.primary }]}>
            {t('app.classes.only_favorites')}
          </Text>
        </Pressable>
      )}

      {schedule.isPending ? (
        <Skeleton height={220} />
      ) : schedule.isError ? (
        <ErrorNote
          message={schedule.error instanceof ApiError ? schedule.error.message : 'errors.internal'}
        />
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarX2}
            title={t(showFav ? 'app.classes.no_favorites_day' : 'app.classes.empty_day')}
          />
        </Card>
      ) : (
        sessions.map((s) => (
          <SessionCard
            key={s.id}
            s={s}
            booking={byClass.get(s.id)}
            rules={rules.data}
            favorite={favorites.has(s.classTypeId)}
            onFavorite={linked || me.data ? () => favorites.toggle(s.classTypeId) : undefined}
            // Only after my bookings loaded, so a booked class never flashes "Book".
            canBook={linked && mine.isSuccess && !mine.data.bannedUntil}
          />
        ))
      )}

      <Text style={[type.bodySm, styles.rules]}>
        {t('app.classes.rules', {
          hours: Math.round((rules.data?.cancelCutoffMinutes ?? 120) / 60),
          days: rules.data?.bookingWindowDays ?? 7,
        })}
      </Text>

      <SectionTitle>{t('app.classes.coaching')}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <LinkRow
          icon={UserRound}
          label={t('app.classes.book_pt')}
          hint={t('app.classes.book_pt_hint')}
          onPress={() => router.push('/trainers')}
        />
        {linked && (
          <LinkRow
            icon={CalendarPlus}
            label={t('app.calendar.title')}
            hint={t('app.calendar.row_hint')}
            onPress={() => router.push('/calendar')}
            divider
          />
        )}
      </Card>
    </Screen>
  );
}

function SessionCard({
  s,
  booking,
  rules,
  canBook,
  favorite,
  onFavorite,
}: {
  s: ClassSessionDto;
  booking: BookingDto | undefined;
  rules: ClassRulesDto | undefined;
  canBook: boolean;
  favorite: boolean;
  onFavorite?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [confirmLate, setConfirmLate] = useState(false);
  const action = classAction(s, booking, rules);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['classes'] });
    void qc.invalidateQueries({ queryKey: ['me', 'bookings'] });
  };
  const book = useMutation({
    mutationFn: () =>
      api.post<BookingDto>(`/me/bookings?locale=${i18n.language}`, {
        classId: s.id,
        waitlist: true,
      }),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/me/bookings/${booking!.id}/cancel`),
    onSuccess: () => {
      setConfirmLate(false);
      refresh();
    },
  });
  const error = book.error ?? cancel.error;
  const cancelled = s.status === 'cancelled';

  return (
    <Card style={[styles.session, { borderStartColor: s.color }, cancelled && { opacity: 0.6 }]}>
      <View style={styles.sessionHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.time}>
            {f.time(s.startsAt)} - {f.time(s.endsAt)}
          </Text>
          <Text style={[type.h3, cancelled && { textDecorationLine: 'line-through' }]}>
            {s.typeName}
          </Text>
          <Text style={type.bodySm} numberOfLines={1}>
            {[s.trainer?.name, s.roomName].filter(Boolean).join(' · ') || ' '}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          {onFavorite && (
            <Pressable
              onPress={onFavorite}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ selected: favorite }}
              accessibilityLabel={t(
                favorite ? 'app.classes.favorite_remove' : 'app.classes.favorite_add',
                { name: s.typeName },
              )}
            >
              <Star
                size={20}
                color={favorite ? color.accent[400] : color.text.muted}
                fill={favorite ? color.accent[400] : 'transparent'}
              />
            </Pressable>
          )}
          <Spots s={s} />
        </View>
      </View>
      {s.note && <Text style={type.bodySm}>{s.note}</Text>}

      {booking && (
        <View style={styles.mine}>
          {booking.status === 'confirmed' ? (
            <CheckCircle2 size={16} color={color.status.success} />
          ) : (
            <Clock size={16} color={color.status.warning} />
          )}
          <Text
            style={[
              styles.mineText,
              booking.status === 'waitlisted' && { color: color.status.warning },
            ]}
          >
            {booking.status === 'confirmed'
              ? booking.promotedAt
                ? t('app.classes.promoted')
                : t('app.classes.booked')
              : t('app.classes.on_waitlist', { position: booking.waitlistPosition })}
          </Text>
        </View>
      )}

      {action.kind === 'cancelled' ? (
        <Text style={styles.cancelled}>{t('app.classes.session_cancelled')}</Text>
      ) : action.kind === 'closed' ? (
        <Text style={type.bodySm}>{t('app.classes.closed')}</Text>
      ) : action.kind === 'not_open' ? (
        <Text style={type.bodySm}>
          {t('app.classes.opens_at', { date: f.dateTime(action.opensAt) })}
        </Text>
      ) : !canBook &&
        (action.kind === 'book' || action.kind === 'waitlist') ? null : action.kind === 'book' ||
        action.kind === 'waitlist' ? (
        <Button
          label={action.kind === 'book' ? t('app.classes.book') : t('app.classes.join_waitlist')}
          variant={action.kind === 'book' ? 'primary' : 'secondary'}
          loading={book.isPending}
          onPress={() => book.mutate()}
        />
      ) : confirmLate ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.lateWarn}>{t('app.classes.late_warning')}</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button
                label={t('app.classes.keep')}
                variant="secondary"
                onPress={() => setConfirmLate(false)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t('app.classes.cancel_anyway')}
                variant="ghost"
                loading={cancel.isPending}
                onPress={() => cancel.mutate()}
              />
            </View>
          </View>
        </View>
      ) : (
        <Button
          label={
            action.kind === 'leave_waitlist'
              ? t('app.classes.leave_waitlist')
              : t('app.classes.cancel')
          }
          variant="ghost"
          loading={cancel.isPending}
          onPress={() =>
            action.kind === 'cancel' && action.late ? setConfirmLate(true) : cancel.mutate()
          }
        />
      )}
      {error && (
        <ErrorNote message={error instanceof ApiError ? error.message : 'errors.internal'} />
      )}
    </Card>
  );
}

function Spots({ s }: { s: ClassSessionDto }) {
  const { t } = useTranslation();
  if (s.status === 'cancelled') return null;
  const full = s.spotsLeft === 0;
  return (
    <View style={[styles.spots, full && { borderColor: `${color.status.warning}66` }]}>
      <Text style={[styles.spotsNum, full && { color: color.status.warning }]}>
        {full ? t('app.classes.full') : s.spotsLeft}
      </Text>
      <Text style={styles.spotsLabel}>
        {full
          ? t('app.classes.waitlist_n', { count: s.waitlisted })
          : t('app.classes.spots_left', { count: s.spotsLeft })}
      </Text>
    </View>
  );
}

function LinkRow({
  icon: Icon,
  label,
  hint,
  onPress,
  divider,
}: {
  icon: typeof UserRound;
  label: string;
  hint?: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={[styles.linkRow, divider && styles.divider]}
    >
      <Icon size={20} color={color.accent[400]} />
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{label}</Text>
        {hint ? <Text style={type.bodySm}>{hint}</Text> : null}
      </View>
      <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, paddingTop: 12 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    padding: 12,
  },
  warn: { borderColor: `${color.status.warning}66`, backgroundColor: `${color.status.warning}14` },
  days: { gap: 8, paddingVertical: 2 },
  day: {
    width: 56,
    height: 64,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayActive: { backgroundColor: color.accent[500], borderColor: color.accent[500] },
  favDot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.accent[400],
  },
  favFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  favFilterOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  favFilterText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  dayName: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  dayNum: { fontFamily: fonts.bold, fontSize: 20, color: color.text.primary },
  session: { gap: 12, borderStartWidth: 4 },
  sessionHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  time: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: color.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  spots: {
    minWidth: 72,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  spotsNum: { fontFamily: fonts.bold, fontSize: 18, color: color.text.primary },
  spotsLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: color.text.secondary,
    textAlign: 'center',
  },
  mine: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  mineText: { fontFamily: fonts.semibold, fontSize: 14, color: color.status.success },
  cancelled: { fontFamily: fonts.semibold, fontSize: 14, color: color.status.danger },
  lateWarn: { fontFamily: fonts.medium, fontSize: 14, color: color.status.warning },
  row: { flexDirection: 'row', gap: 10 },
  rules: { textAlign: 'center', paddingHorizontal: 8 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
  },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
