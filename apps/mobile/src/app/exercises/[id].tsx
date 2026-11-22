import type { ExerciseDetailDto, ExerciseHistoryDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MapPin, PlayCircle, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BarChart } from '@/components/training/BarChart';
import { Button, Card, ErrorNote, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useMe } from '@/lib/queries';
import { formatDuration, useLibrary } from '@/lib/training';
import { useWorkout } from '@/lib/workout-store';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, type } from '@/theme';

/** How to do the exercise, where in the club, and my own history on it. */
export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const me = useMe();
  const lib = useLibrary();
  const active = useWorkout((s) => s.active);
  const q = useQuery({
    queryKey: ['exercise', id, i18n.language],
    queryFn: () => api.get<ExerciseDetailDto>(`/public/exercises/${id}`, { locale: i18n.language }),
  });
  const history = useQuery({
    queryKey: ['me', 'exercise-history', id],
    queryFn: () => api.get<ExerciseHistoryDto>(`/me/exercises/${id}/history`),
    enabled: Boolean(me.data?.member),
  });
  // Offline: fall back to the cached library entry (no machines/history then).
  const e = q.data ?? (lib.byId.get(id) ? { ...lib.byId.get(id)!, machines: [] } : undefined);
  const timeBased = e?.tracking === 'time' || e?.tracking === 'distance_time';
  const points = (history.data?.points ?? []).map((p) => ({
    label: f.date(p.date, { day: 'numeric', month: 'numeric' }),
    value: (timeBased ? p.totalDurationS : (p.estimated1rmKg ?? p.bestWeightKg ?? p.bestReps)) ?? 0,
  }));

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
      {q.isPending && !e ? (
        <Skeleton height={300} />
      ) : !e ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : (
        <>
          <Text style={type.label}>{t(`app.exercises.categories.${e.category}`)}</Text>
          <Text style={type.h1}>{e.name}</Text>
          <View style={styles.chips}>
            {e.muscles.map((m) => (
              <View key={m.key} style={[styles.muscle, m.primary && styles.primary]}>
                <Text style={[styles.muscleText, m.primary && { color: color.text.primary }]}>
                  {m.name}
                </Text>
              </View>
            ))}
          </View>
          {active && !active.exerciseIds.includes(e.id) && (
            <Button
              label={t('app.exercises.add_to_workout')}
              icon={Plus}
              onPress={() => {
                useWorkout.getState().addExercise(e.id);
                router.back();
              }}
            />
          )}
          {e.instructions && (
            <>
              <SectionTitle>{t('app.exercises.how_to')}</SectionTitle>
              <Card>
                <Text style={type.body}>{e.instructions}</Text>
              </Card>
            </>
          )}
          {e.videoUrl && (
            <Button
              label={t('app.equipment.video')}
              icon={PlayCircle}
              variant="secondary"
              onPress={() => void Linking.openURL(e.videoUrl!)}
            />
          )}
          {e.machines.length > 0 && (
            <>
              <SectionTitle>{t('app.exercises.machines')}</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {e.machines.map((m, i) => (
                  <Pressable
                    key={m.id}
                    style={[styles.row, i > 0 && styles.divider]}
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({ pathname: '/equipment/[id]', params: { id: m.id } })
                    }
                  >
                    <Text style={[type.body, { flex: 1 }]}>{m.name}</Text>
                    {m.roomName && (
                      <>
                        <MapPin size={14} color={color.text.muted} />
                        <Text style={type.bodySm}>{m.roomName}</Text>
                      </>
                    )}
                  </Pressable>
                ))}
              </Card>
            </>
          )}
          {points.length > 0 && (
            <>
              <SectionTitle>
                {timeBased ? t('app.exercises.history_time') : t('app.exercises.history_strength')}
              </SectionTitle>
              <Card style={{ gap: 8 }}>
                <BarChart
                  data={points.slice(-12)}
                  format={(v) => (timeBased ? formatDuration(v) : `${v}`)}
                  label={
                    timeBased
                      ? t('app.exercises.history_time')
                      : t('app.exercises.history_strength')
                  }
                />
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muscle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: color.bg.surface2,
  },
  primary: { backgroundColor: color.accent.tint, borderWidth: 1, borderColor: color.accent[500] },
  muscleText: { fontFamily: fonts.medium, fontSize: 13, color: color.text.secondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
