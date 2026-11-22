import type { MuscleGroupDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, CloudOff, Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, Screen, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useLibrary } from '@/lib/training';
import { useWorkout } from '@/lib/workout-store';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

const NO_IDS: string[] = [];

/** Exercise library. With ?pick=1 a tap adds the exercise to the workout in progress. */
export default function ExercisesScreen() {
  const { t, i18n } = useTranslation();
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const picking = pick === '1';
  const lib = useLibrary();
  // Stable empty array: a new [] on every call would make the store re-render forever.
  const inWorkout = useWorkout((s) => s.active?.exerciseIds ?? NO_IDS);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const muscles = useQuery({
    queryKey: ['muscle-groups', i18n.language],
    queryFn: () => api.get<MuscleGroupDto[]>('/public/muscle-groups', { locale: i18n.language }),
    staleTime: 60 * 60_000,
  });
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (lib.data ?? []).filter(
      (e) =>
        (!term || e.name.toLowerCase().includes(term) || e.key.includes(term)) &&
        (!muscle || e.muscles.some((m) => m.key === muscle)),
    );
  }, [lib.data, q, muscle]);

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
        {picking ? t('app.exercises.pick_title') : t('app.exercises.title')}
      </Text>
      {lib.offline && (
        <View style={styles.offline}>
          <CloudOff size={16} color={color.text.secondary} />
          <Text style={type.bodySm}>{t('app.exercises.offline')}</Text>
        </View>
      )}
      <View style={styles.search}>
        <Search size={18} color={color.text.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('app.exercises.search')}
          placeholderTextColor={color.text.muted}
          style={styles.searchInput}
          accessibilityLabel={t('app.exercises.search')}
          autoFocus={picking}
        />
      </View>
      {muscles.data && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {[{ key: null, name: t('app.exercises.all') }, ...muscles.data].map((m) => (
            <Pressable
              key={m.key ?? 'all'}
              onPress={() => setMuscle(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: muscle === m.key }}
              style={[styles.chip, muscle === m.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, muscle === m.key && { color: color.text.primary }]}>
                {m.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {lib.isPending ? (
        <Skeleton height={300} />
      ) : list.length === 0 ? (
        <Text style={type.bodySm}>{t('app.exercises.no_results')}</Text>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((e, i) => {
            const added = inWorkout.includes(e.id);
            return (
              <Pressable
                key={e.id}
                style={[styles.row, i > 0 && styles.divider]}
                accessibilityRole="button"
                onPress={() => {
                  if (picking) {
                    useWorkout.getState().addExercise(e.id);
                    router.back();
                  } else router.push({ pathname: '/exercises/[id]', params: { id: e.id } });
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={type.body} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={type.bodySm} numberOfLines={1}>
                    {e.muscles.map((m) => m.name).join(', ')}
                  </Text>
                </View>
                {picking ? (
                  added ? (
                    <Check size={20} color={color.status.success} />
                  ) : (
                    <Plus size={20} color={color.accent[400]} />
                  )
                ) : (
                  <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
                )}
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
  offline: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    color: color.text.primary,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: color.bg.surface2,
  },
  chipActive: {
    backgroundColor: color.accent.tint,
    borderWidth: 1,
    borderColor: color.accent[500],
  },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: color.text.secondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
