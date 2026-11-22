import type { LockerMapDto, MyVisitNowDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowLeft, DoorClosed } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMyVisit } from '@/components/VisitCard';
import { Button, Card, EmptyState, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

/** The guest picks a free locker in the changing room of their choice. */
export default function LockerScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const visit = useMyVisit();
  const map = useQuery({
    queryKey: ['me', 'lockers', i18n.language],
    queryFn: () => api.get<LockerMapDto>('/me/lockers', { locale: i18n.language }),
    refetchInterval: 10_000,
  });
  const [roomKey, setRoomKey] = useState<string | null>(null);
  const room =
    map.data?.find((r) => r.key === (roomKey ?? visit.data?.locker?.roomKey)) ?? map.data?.[0];
  const pick = useMutation({
    mutationFn: (lockerId: string) =>
      api.post<MyVisitNowDto>(`/me/visit/locker?locale=${i18n.language}`, { lockerId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'visit'] });
      router.back();
    },
    // Someone was faster: refresh the map so the taken locker shows as taken.
    onError: () => void map.refetch(),
  });
  const release = useMutation({
    mutationFn: () => api.del('/me/visit/locker'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void map.refetch();
    },
  });
  const free = room?.lockers.filter((l) => l.state === 'free').length ?? 0;

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.back()}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel={t('app.common.back')}
        hitSlop={8}
      >
        <ArrowLeft style={dirIcon} size={22} color={color.text.primary} />
      </Pressable>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.visit.title')}
      </Text>

      {visit.isSuccess && !visit.data ? (
        <Card>
          <EmptyState
            icon={DoorClosed}
            title={t('app.visit.not_inside')}
            text={t('app.visit.not_inside_text')}
          />
        </Card>
      ) : map.isPending ? (
        <Skeleton height={300} />
      ) : !map.data || map.data.length === 0 || map.data.every((r) => r.lockers.length === 0) ? (
        <Card>
          <EmptyState icon={DoorClosed} title={t('app.visit.no_lockers')} />
        </Card>
      ) : (
        <>
          <View style={styles.segments} accessibilityRole="tablist">
            {map.data.map((r) => (
              <Pressable
                key={r.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: r.key === room?.key }}
                onPress={() => setRoomKey(r.key)}
                style={[styles.segment, r.key === room?.key && styles.segmentActive]}
              >
                <Text
                  style={[styles.segmentText, r.key === room?.key && { color: color.text.primary }]}
                >
                  {r.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={type.bodySm}>{t('app.visit.free_count', { count: free })}</Text>
          <View style={styles.grid}>
            {room?.lockers.map((l) => {
              const selectable = l.state === 'free';
              return (
                <Pressable
                  key={l.id}
                  disabled={!selectable || pick.isPending}
                  onPress={() => pick.mutate(l.id)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !selectable, selected: l.state === 'mine' }}
                  accessibilityLabel={t(`app.visit.locker_a11y.${l.state}`, { n: l.number })}
                  style={[styles.cell, styles[l.state]]}
                >
                  <Text style={[styles.cellText, l.state === 'mine' && { color: color.onAccent }]}>
                    {l.number}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            <Legend style={styles.free} label={t('app.visit.legend_free')} />
            <Legend style={styles.taken} label={t('app.visit.legend_taken')} />
            <Legend style={styles.mine} label={t('app.visit.legend_mine')} />
          </View>
          {pick.error && (
            <ErrorNote
              message={pick.error instanceof ApiError ? pick.error.message : 'errors.internal'}
            />
          )}
          {visit.data?.locker && (
            <Button
              label={t('app.visit.release')}
              variant="ghost"
              loading={release.isPending}
              onPress={() => release.mutate()}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function Legend({ style, label }: { style: object; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[{ width: 14, height: 14, borderRadius: 3, borderWidth: 1 }, style]} />
      <Text style={type.bodySm}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  free: { borderColor: `${color.status.success}88`, backgroundColor: `${color.status.success}14` },
  taken: { borderColor: color.border.subtle, backgroundColor: color.bg.surface2, opacity: 0.45 },
  out_of_service: {
    borderColor: `${color.status.warning}55`,
    backgroundColor: 'transparent',
    opacity: 0.35,
  },
  mine: { borderColor: color.accent[500], backgroundColor: color.accent[500] },
  legend: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
});
