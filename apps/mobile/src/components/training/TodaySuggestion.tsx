import {
  recentMuscleDays,
  SUGGEST_FOCUSES,
  SUGGEST_LEVELS,
  SUGGEST_MINUTES,
  suggestWorkout,
  type SuggestFocus,
  type SuggestLevel,
  type WorkoutSummaryDto,
} from '@grit/validation';
import { router } from 'expo-router';
import { Play, Shuffle, Sparkles } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, SectionTitle } from '@/components/ui';
import { formatDuration, useLibrary } from '@/lib/training';
import { useWorkout } from '@/lib/workout-store';
import { color, fonts, radius, type } from '@/theme';

function Chips<T extends string | number>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6 }}
    >
      {options.map((o) => (
        <Pressable
          key={String(o)}
          onPress={() => onChange(o)}
          accessibilityRole="button"
          accessibilityState={{ selected: o === value }}
          style={[styles.chip, o === value && styles.chipActive]}
        >
          <Text style={[styles.chipText, o === value && { color: color.text.primary }]}>
            {label(o)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** "What should I train today?" for members who train on their own. Rule-based, works offline. */
export function TodaySuggestion({ history }: { history: WorkoutSummaryDto[] }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [focus, setFocus] = useState<SuggestFocus | 'auto'>('auto');
  const [level, setLevel] = useState<SuggestLevel>('beginner');
  const [minutes, setMinutes] = useState<number>(45);
  const [shuffle, setShuffle] = useState(0);
  // The choices stay folded away: most people just take today's suggestion.
  const [tune, setTune] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const suggestion = useMemo(() => {
    if (!lib.data?.length) return null;
    const recentDays = recentMuscleDays(
      history.map((w) => ({ startedAt: w.startedAt, exerciseIds: w.exercises.map((e) => e.id) })),
      lib.data,
    );
    return suggestWorkout(lib.data, {
      focus,
      level,
      minutes,
      recentDays,
      seed: `${today}#${shuffle}`,
    });
  }, [lib.data, history, focus, level, minutes, today, shuffle]);

  if (!suggestion) return null;
  return (
    <>
      <SectionTitle>{t('app.suggest.title')}</SectionTitle>
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <Sparkles size={20} color={color.accent[400]} />
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>{t(`app.suggest.focus.${suggestion.focus}`)}</Text>
            <Text style={type.bodySm}>
              {focus === 'auto' ? t('app.suggest.auto_hint') : t('app.suggest.hint')}
            </Text>
          </View>
          <Pressable
            onPress={() => setShuffle((n) => n + 1)}
            accessibilityRole="button"
            accessibilityLabel={t('app.suggest.shuffle')}
            hitSlop={8}
            style={styles.icon}
          >
            <Shuffle size={18} color={color.text.secondary} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => setTune((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: tune }}
          hitSlop={6}
        >
          <Text style={styles.tune}>
            {tune ? t('app.suggest.tune_done') : t('app.suggest.tune')}
          </Text>
        </Pressable>
        {tune && (
          <>
            <Chips
              value={focus}
              options={['auto', ...SUGGEST_FOCUSES] as const}
              label={(v) => (v === 'auto' ? t('app.suggest.auto') : t(`app.suggest.focus.${v}`))}
              onChange={setFocus}
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Chips
                  value={level}
                  options={SUGGEST_LEVELS}
                  label={(v) => t(`app.suggest.level.${v}`)}
                  onChange={setLevel}
                />
              </View>
            </View>
            <Chips
              value={minutes}
              options={SUGGEST_MINUTES}
              label={(v) => t('app.suggest.minutes', { count: v })}
              onChange={setMinutes}
            />
          </>
        )}
        {suggestion.items.length ? (
          suggestion.items.map((it) => (
            <View key={it.exerciseId} style={styles.item}>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {it.name}
              </Text>
              <Text style={styles.prescription}>
                {it.sets} × {it.reps} · ⏱ {formatDuration(it.restS)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={type.bodySm}>{t('app.suggest.empty')}</Text>
        )}
        {suggestion.items.length > 0 && (
          <Button
            label={t('app.suggest.start')}
            icon={Play}
            variant="secondary"
            onPress={() => {
              useWorkout
                .getState()
                .startFromPlan(
                  suggestion.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets })),
                );
              router.push('/workout');
            }}
          />
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tune: { color: color.accent[400], fontFamily: fonts.semibold, fontSize: 14 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipActive: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  prescription: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: color.text.secondary,
    fontVariant: ['tabular-nums'],
  },
});
