import type { WorkoutSummaryDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BookOpen, ChevronRight, CloudOff, Dumbbell, Play, RefreshCw } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useMe } from '@/lib/queries';
import { formatDuration, useLibrary } from '@/lib/training';
import { useWorkout } from '@/lib/workout-store';
import { PlanSection } from './PlanSection';
import { TodaySuggestion } from './TodaySuggestion';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, radius, type } from '@/theme';

/** Second segment of the Training tab: start/continue a workout, unsynced and past workouts. */
export function WorkoutLog({ header }: { header: ReactNode }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const me = useMe();
  // F12-2: the workout log belongs to the account, so it works without any gym membership.
  const linked = Boolean(me.data);
  const active = useWorkout((s) => s.active);
  const pending = useWorkout((s) => s.pending);
  const syncing = useWorkout((s) => s.syncing);
  const syncError = useWorkout((s) => s.lastSyncError);
  const lib = useLibrary();
  const history = useQuery({
    queryKey: ['me', 'workouts', i18n.language],
    queryFn: () =>
      api.page<WorkoutSummaryDto[]>('/me/workouts', { locale: i18n.language, pageSize: '30' }),
    enabled: linked,
  });
  const pendingIds = new Set(pending.map((p) => p.id));
  const allSynced = (history.data?.items ?? []).filter((w) => !pendingIds.has(w.id));
  // The last few workouts are enough at a glance; the rest on request.
  const [showAll, setShowAll] = useState(false);
  const synced = showAll ? allSynced : allSynced.slice(0, 5);

  return (
    <Screen
      refreshing={history.isFetching || syncing}
      onRefresh={() => {
        void useWorkout
          .getState()
          .sync()
          .then(() => history.refetch());
      }}
    >
      {header}

      {!linked && me.data ? (
        <Card>
          <EmptyState
            icon={Dumbbell}
            title={t('app.log.link_title')}
            text={t('app.log.link_text')}
          />
        </Card>
      ) : (
        <>
          <Card style={styles.hero}>
            <Text style={type.h2}>{active ? t('app.log.in_progress') : t('app.log.ready')}</Text>
            <Text style={type.bodySm}>
              {active
                ? t('app.log.in_progress_text', {
                    count: active.sets.filter((s) => s.done).length,
                    time: f.time(active.startedAt),
                  })
                : t('app.log.ready_text')}
            </Text>
            <Button
              label={active ? t('app.log.continue') : t('app.log.start')}
              icon={Play}
              onPress={() => {
                useWorkout.getState().start();
                router.push('/workout');
              }}
            />
            <Pressable
              style={styles.libraryRow}
              onPress={() => router.push('/exercises')}
              accessibilityRole="link"
            >
              <BookOpen size={20} color={color.accent[400]} />
              <Text style={[type.body, { flex: 1 }]}>{t('app.log.library')}</Text>
              <Text style={type.bodySm}>{lib.data ? String(lib.data.length) : ''}</Text>
              <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
            </Pressable>
          </Card>

          <PlanSection />

          {!active && <TodaySuggestion history={history.data?.items ?? []} />}

          {pending.length > 0 && (
            <View style={styles.pending}>
              {syncing ? (
                <RefreshCw size={18} color={color.text.secondary} />
              ) : (
                <CloudOff size={18} color={color.status.warning} />
              )}
              <Text style={[type.bodySm, { flex: 1 }]}>
                {t('app.log.pending', { count: pending.length })}
                {syncError ? ` ${t('app.log.pending_offline')}` : ''}
              </Text>
              {!syncing && (
                <Pressable
                  onPress={() => void useWorkout.getState().sync()}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.retry}>{t('app.log.retry')}</Text>
                </Pressable>
              )}
            </View>
          )}

          <SectionTitle>{t('app.log.history')}</SectionTitle>
          {history.isPending && linked ? (
            <Skeleton height={160} />
          ) : synced.length === 0 && pending.length === 0 ? (
            <Card>
              <EmptyState
                icon={Dumbbell}
                title={t('app.log.empty')}
                text={t('app.log.empty_text')}
              />
            </Card>
          ) : (
            <Card style={{ paddingVertical: 4 }}>
              {pending.map((p, i) => (
                <Row
                  key={p.id}
                  first={i === 0}
                  title={f.dateTime(p.startedAt)}
                  subtitle={t('app.log.sets', { count: p.sets.length })}
                  badge={t('app.log.not_synced')}
                />
              ))}
              {synced.map((w, i) => (
                <Row
                  key={w.id}
                  first={i === 0 && pending.length === 0}
                  title={f.dateTime(w.startedAt)}
                  subtitle={[
                    w.exercises
                      .slice(0, 3)
                      .map((e) => e.name)
                      .join(', '),
                    w.endedAt
                      ? formatDuration(
                          Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 1000),
                        )
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  value={
                    w.volumeKg > 0
                      ? `${f.number(w.volumeKg)} kg`
                      : t('app.log.sets', { count: w.setCount })
                  }
                  onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
                />
              ))}
            </Card>
          )}
          {!showAll && allSynced.length > 5 && (
            <Button
              label={t('app.log.show_all', { count: allSynced.length })}
              variant="ghost"
              onPress={() => setShowAll(true)}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function Row({
  title,
  subtitle,
  value,
  badge,
  first,
  onPress,
}: {
  title: string;
  subtitle: string;
  value?: string;
  badge?: string;
  first: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'link' : undefined}
      style={[styles.row, !first && styles.divider]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.body} numberOfLines={1}>
          {title}
        </Text>
        <Text style={type.bodySm} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {badge ? (
        <Text style={styles.badge}>{badge}</Text>
      ) : value ? (
        <Text style={styles.value}>{value}</Text>
      ) : null}
      {onPress && <ChevronRight style={dirIcon} size={18} color={color.text.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 10 },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${color.status.warning}55`,
  },
  retry: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  value: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  badge: { fontFamily: fonts.semibold, fontSize: 12, color: color.status.warning },
});
