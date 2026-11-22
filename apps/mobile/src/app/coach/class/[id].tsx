import type { RosterDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Check, UserX, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Card, EmptyState, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

/** F14-1: who is booked on my class, and attendance with one tap (attended / no-show). */
export default function CoachClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['coach', 'roster', id],
    queryFn: () => api.get<RosterDto>(`/admin/classes/${id}/roster`),
  });
  const mark = useMutation({
    mutationFn: ({
      bookingId,
      status,
    }: {
      bookingId: string;
      status: 'attended' | 'no_show' | 'confirmed';
    }) => api.post(`/admin/bookings/${bookingId}/attendance`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coach', 'roster', id] });
      void qc.invalidateQueries({ queryKey: ['coach', 'agenda'] });
    },
  });
  const entries = (q.data?.entries ?? []).filter((e) => e.status !== 'cancelled');
  const booked = entries.filter((e) => e.status !== 'waitlisted');
  const waiting = entries.filter((e) => e.status === 'waitlisted');
  const here = booked.filter((e) => e.status === 'attended').length;

  return (
    <Screen>
      <BackHeader title={q.data?.class.typeName ?? t('app.coach.class')} />
      {q.data && (
        <Text style={type.bodySm}>
          {f.dateTime(q.data.class.startsAt)} ·{' '}
          {t('app.coach.present', { here, total: booked.length })}
        </Text>
      )}
      {q.isPending ? (
        <Skeleton height={240} />
      ) : q.error ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : booked.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title={t('app.coach.nobody')} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {booked.map((e, i) => {
            const attended = e.status === 'attended';
            const noShow = e.status === 'no_show';
            return (
              <View key={e.bookingId} style={[styles.row, i > 0 && styles.divider]}>
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {e.firstName} {e.lastName}
                </Text>
                <Pressable
                  onPress={() =>
                    mark.mutate({
                      bookingId: e.bookingId,
                      status: attended ? 'confirmed' : 'attended',
                    })
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: attended }}
                  accessibilityLabel={`${t('app.coach.came')}: ${e.firstName} ${e.lastName}`}
                  style={[styles.btn, attended && styles.btnOk]}
                >
                  <Check size={18} color={attended ? color.onAccent : color.text.secondary} />
                  <Text style={[styles.btnText, attended && { color: color.onAccent }]}>
                    {t('app.coach.came')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    mark.mutate({
                      bookingId: e.bookingId,
                      status: noShow ? 'confirmed' : 'no_show',
                    })
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: noShow }}
                  accessibilityLabel={`${t('app.coach.no_show')}: ${e.firstName} ${e.lastName}`}
                  style={[styles.btn, noShow && styles.btnNo]}
                >
                  <UserX size={18} color={noShow ? '#fff' : color.text.secondary} />
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}
      {waiting.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Text style={type.label}>{t('app.coach.waitlist', { count: waiting.length })}</Text>
          {waiting.map((e) => (
            <Text key={e.bookingId} style={type.bodySm}>
              {e.waitlistPosition}. {e.firstName} {e.lastName}
            </Text>
          ))}
        </Card>
      )}
      {mark.error ? (
        <ErrorNote
          message={mark.error instanceof ApiError ? mark.error.message : 'errors.internal'}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 6 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.border.strong,
  },
  btnOk: { backgroundColor: color.status.success, borderColor: color.status.success },
  btnNo: { backgroundColor: color.status.danger, borderColor: color.status.danger },
  btnText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
});
