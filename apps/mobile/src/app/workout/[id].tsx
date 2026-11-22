import type { WorkoutDetailDto } from '@grit/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { formatDuration, useLibrary, usesReps, usesTime, usesWeight } from '@/lib/training';
import { useWorkout } from '@/lib/workout-store';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, type } from '@/theme';

/** A finished workout: all sets grouped by exercise. */
export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const lib = useLibrary();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({
    queryKey: ['me', 'workout', id, i18n.language],
    queryFn: () => api.get<WorkoutDetailDto>(`/me/workouts/${id}`, { locale: i18n.language }),
  });
  const w = q.data;

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
      {q.isPending ? (
        <Skeleton height={300} />
      ) : q.isError || !w ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : (
        <>
          <Text style={type.h1}>{f.dateTime(w.startedAt)}</Text>
          <View style={styles.stats}>
            <Stat
              label={t('app.log.duration')}
              value={
                w.endedAt
                  ? formatDuration(
                      Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 1000),
                    )
                  : '-'
              }
            />
            <Stat label={t('app.log.sets_label')} value={String(w.setCount)} />
            <Stat label={t('app.log.volume')} value={`${f.number(w.volumeKg)} kg`} />
          </View>
          {w.note && <Text style={type.body}>{w.note}</Text>}
          {w.exercises.map((e) => {
            const tracking = lib.byId.get(e.id)?.tracking ?? 'weight_reps';
            return (
              <Card key={e.id} style={{ gap: 6 }}>
                <Text style={type.h3}>{e.name}</Text>
                {w.sets
                  .filter((s) => s.exerciseId === e.id)
                  .map((s, i) => (
                    <View key={s.id} style={styles.setRow}>
                      <Text style={styles.idx}>{i + 1}</Text>
                      <Text style={type.body}>
                        {[
                          usesWeight(tracking) && s.weightKg != null ? `${s.weightKg} kg` : null,
                          usesReps(tracking) && s.reps != null ? `× ${s.reps}` : null,
                          usesTime(tracking) && s.durationS != null
                            ? formatDuration(s.durationS)
                            : null,
                          s.distanceM != null ? `${s.distanceM} m` : null,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </Text>
                    </View>
                  ))}
              </Card>
            );
          })}
          {confirm ? (
            <Card style={{ gap: 10 }}>
              <Text style={type.body}>{t('app.log.delete_confirm')}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t('common.cancel')}
                    variant="secondary"
                    onPress={() => setConfirm(false)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t('app.log.delete')}
                    onPress={() => {
                      useWorkout.getState().deleteWorkout(w.id);
                      setTimeout(() => void qc.invalidateQueries({ queryKey: ['me'] }), 1000);
                      router.back();
                    }}
                  />
                </View>
              </View>
            </Card>
          ) : (
            <Button
              label={t('app.log.delete')}
              variant="ghost"
              icon={Trash2}
              onPress={() => setConfirm(true)}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.label}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 4, padding: 12, borderRadius: 10, backgroundColor: color.bg.surface },
  statValue: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  idx: { width: 20, fontFamily: fonts.bold, color: color.text.muted },
});
