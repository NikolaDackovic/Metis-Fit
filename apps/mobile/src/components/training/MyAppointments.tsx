import type { BookingDto, MyAppointmentDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, ErrorNote, SectionTitle } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clubDayOf } from '@/lib/classes';
import { useFormat } from '@/lib/format';
import { color, fonts, type } from '@/theme';

type Item =
  | { kind: 'class'; at: string; b: BookingDto }
  | { kind: 'appointment'; at: string; a: MyAppointmentDto };

/**
 * Everything the member has coming up in one list, by time: booked group classes and sessions
 * with a trainer (personal training, consultations). Tapping a class jumps to its day; a personal
 * session can be cancelled here up to 6 hours before (F14-4).
 */
export function MyUpcoming({
  bookings,
  onClass,
}: {
  bookings: BookingDto[];
  onClass: (day: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: () => api.get<MyAppointmentDto[]>('/me/appointments'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/me/appointments/${id}/cancel`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'appointments'] }),
  });
  const items: Item[] = [
    ...bookings.map((b) => ({ kind: 'class' as const, at: b.class.startsAt, b })),
    ...(q.data ?? []).map((a) => ({ kind: 'appointment' as const, at: a.startsAt, a })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  if (!items.length) return null;
  const cancellable = (iso: string) => Date.parse(iso) - Date.now() >= 6 * 3600_000;

  return (
    <>
      <SectionTitle>{t('app.classes.upcoming')}</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {items.map((it, i) =>
          it.kind === 'class' ? (
            <Pressable
              key={it.b.id}
              onPress={() => onClass(clubDayOf(it.at))}
              accessibilityRole="button"
              style={[styles.row, i > 0 && styles.divider]}
            >
              <View style={[styles.dot, { backgroundColor: it.b.class.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={type.body} numberOfLines={1}>
                  {it.b.class.typeName}
                </Text>
                <Text style={type.bodySm}>{f.dateTime(it.at)}</Text>
              </View>
              <Text
                style={[
                  styles.state,
                  {
                    color:
                      it.b.status === 'confirmed' ? color.status.success : color.status.warning,
                  },
                ]}
              >
                {it.b.status === 'confirmed'
                  ? t('app.classes.booked_short')
                  : t('app.classes.waitlist_short', { position: it.b.waitlistPosition })}
              </Text>
            </Pressable>
          ) : (
            <View key={it.a.id} style={[styles.row, i > 0 && styles.divider]}>
              <CalendarClock size={16} color={color.accent[400]} />
              <View style={{ flex: 1 }}>
                <Text style={type.body} numberOfLines={1}>
                  {it.a.title || t(`app.appointments.kinds.${it.a.kind}`)}
                </Text>
                <Text style={type.bodySm} numberOfLines={1}>
                  {[f.dateTime(it.at), it.a.trainerName, it.a.location].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {cancellable(it.at) && (
                <Pressable
                  onPress={() => cancel.mutate(it.a.id)}
                  disabled={cancel.isPending}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.cancel}>{t('app.slots.cancel')}</Text>
                </Pressable>
              )}
            </View>
          ),
        )}
      </Card>
      {cancel.error && (
        <ErrorNote
          message={cancel.error instanceof ApiError ? cancel.error.message : 'errors.internal'}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 3 },
  state: { fontFamily: fonts.semibold, fontSize: 14 },
  cancel: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
});
