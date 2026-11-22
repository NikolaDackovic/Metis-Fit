import type { ExerciseDto } from '@grit/validation';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check, ChevronDown, Plus, Trash2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, EmptyState, Screen } from '@/components/ui';
import {
  estimate1rm,
  formatDuration,
  parseDecimal,
  parseDuration,
  useLibrary,
  usesDistance,
  usesReps,
  usesTime,
  usesWeight,
} from '@/lib/training';
import { type DraftSet, useWorkout } from '@/lib/workout-store';
import { color, fonts, radius, type } from '@/theme';

/** The workout in progress. Everything is saved on the device as you type (works offline). */
export default function ActiveWorkoutScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const active = useWorkout((s) => s.active);
  const lib = useLibrary();
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null);
  const elapsed = useElapsed(active?.startedAt);

  if (!active) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Card>
          <EmptyState icon={Check} title={t('app.workout.none')} />
          <Button label={t('app.common.back')} variant="secondary" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }
  const doneCount = active.sets.filter((s) => s.done).length;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('app.workout.minimize')}
          style={styles.iconBtn}
        >
          <ChevronDown size={24} color={color.text.primary} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={type.label}>{t('app.workout.title')}</Text>
          <Text
            style={styles.timer}
            accessibilityLabel={t('app.workout.elapsed', { time: elapsed })}
          >
            {elapsed}
          </Text>
        </View>
        <Pressable
          onPress={() => setConfirm('finish')}
          style={styles.finish}
          accessibilityRole="button"
        >
          <Text style={styles.finishText}>{t('app.workout.finish')}</Text>
        </Pressable>
      </View>

      {confirm && (
        <Card style={{ gap: 10, borderColor: color.accent[500] }}>
          <Text style={type.h3}>
            {confirm === 'discard' || doneCount === 0
              ? t('app.workout.discard_title')
              : t('app.workout.finish_title')}
          </Text>
          <Text style={type.bodySm}>
            {confirm === 'discard' || doneCount === 0
              ? t('app.workout.discard_text')
              : t('app.workout.finish_text', { count: doneCount })}
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => setConfirm(null)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={
                  confirm === 'discard' || doneCount === 0
                    ? t('app.workout.discard')
                    : t('app.workout.save')
                }
                onPress={() => {
                  if (confirm === 'discard' || doneCount === 0) useWorkout.getState().discard();
                  else {
                    useWorkout.getState().finish();
                    // Refresh history and progress once the upload completes.
                    setTimeout(() => void qc.invalidateQueries({ queryKey: ['me'] }), 1500);
                  }
                  router.back();
                }}
              />
            </View>
          </View>
        </Card>
      )}

      {active.exerciseIds.length === 0 && (
        <Card>
          <EmptyState
            icon={Plus}
            title={t('app.workout.empty')}
            text={t('app.workout.empty_text')}
          />
        </Card>
      )}

      {active.exerciseIds.map((exId) => (
        <ExerciseBlock
          key={exId}
          exercise={lib.byId.get(exId)}
          exerciseId={exId}
          sets={active.sets.filter((s) => s.exerciseId === exId)}
        />
      ))}

      <Button
        label={t('app.workout.add_exercise')}
        icon={Plus}
        variant="secondary"
        onPress={() => router.push({ pathname: '/exercises', params: { pick: '1' } })}
      />

      <TextInput
        value={active.note}
        onChangeText={(v) => useWorkout.getState().setNote(v)}
        placeholder={t('app.workout.note')}
        placeholderTextColor={color.text.muted}
        style={styles.note}
        multiline
        maxLength={1000}
        accessibilityLabel={t('app.workout.note')}
      />
      <Button
        label={t('app.workout.discard')}
        variant="ghost"
        icon={Trash2}
        onPress={() => setConfirm('discard')}
      />
    </Screen>
  );
}

function ExerciseBlock({
  exercise,
  exerciseId,
  sets,
}: {
  exercise: ExerciseDto | undefined;
  exerciseId: string;
  sets: DraftSet[];
}) {
  const { t } = useTranslation();
  const tracking = exercise?.tracking ?? 'weight_reps';
  const best = Math.max(
    0,
    ...sets.filter((s) => s.done).map((s) => estimate1rm(s.weightKg, s.reps) ?? 0),
  );
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.row}>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/exercises/[id]', params: { id: exerciseId } })}
          accessibilityRole="link"
        >
          <Text style={type.h3}>{exercise?.name ?? '…'}</Text>
          {best > 0 && <Text style={type.bodySm}>{t('app.workout.e1rm', { value: best })}</Text>}
        </Pressable>
        <Pressable
          onPress={() => useWorkout.getState().removeExercise(exerciseId)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('app.workout.remove_exercise')}
          style={styles.iconBtn}
        >
          <X size={20} color={color.text.muted} />
        </Pressable>
      </View>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.head, { width: 28 }]}>#</Text>
        {usesWeight(tracking) && <Text style={[styles.head, { flex: 1 }]}>kg</Text>}
        {usesReps(tracking) && (
          <Text style={[styles.head, { flex: 1 }]}>{t('app.workout.reps')}</Text>
        )}
        {usesTime(tracking) && (
          <Text style={[styles.head, { flex: 1 }]}>{t('app.workout.time')}</Text>
        )}
        {usesDistance(tracking) && <Text style={[styles.head, { flex: 1 }]}>m</Text>}
        <View style={{ width: 44 }} />
      </View>
      {sets.map((s, i) => (
        <SetRow key={s.id} s={s} index={i} tracking={tracking} />
      ))}
      <Pressable
        onPress={() => useWorkout.getState().addSet(exerciseId)}
        style={styles.addSet}
        accessibilityRole="button"
      >
        <Plus size={16} color={color.accent[400]} />
        <Text style={styles.addSetText}>{t('app.workout.add_set')}</Text>
      </Pressable>
    </Card>
  );
}

function SetRow({
  s,
  index,
  tracking,
}: {
  s: DraftSet;
  index: number;
  tracking: ExerciseDto['tracking'];
}) {
  const { t } = useTranslation();
  const update = useWorkout.getState().updateSet;
  return (
    <View style={[styles.row, s.done && styles.doneRow]}>
      <Pressable
        onLongPress={() => useWorkout.getState().removeSet(s.id)}
        accessibilityHint={t('app.workout.remove_set_hint')}
        style={{ width: 28 }}
      >
        <Text style={styles.index}>{index + 1}</Text>
      </Pressable>
      {usesWeight(tracking) && (
        <NumField
          value={s.weightKg != null ? String(s.weightKg) : ''}
          label={t('app.workout.weight_a11y', { n: index + 1 })}
          onChange={(v) => update(s.id, { weightKg: parseDecimal(v) })}
        />
      )}
      {usesReps(tracking) && (
        <NumField
          value={s.reps != null ? String(s.reps) : ''}
          label={t('app.workout.reps_a11y', { n: index + 1 })}
          integer
          onChange={(v) => update(s.id, { reps: v ? Math.round(Number(v)) || 0 : null })}
        />
      )}
      {usesTime(tracking) && (
        <NumField
          value={s.durationS != null ? formatDuration(s.durationS) : ''}
          label={t('app.workout.time_a11y', { n: index + 1 })}
          placeholder="m:ss"
          time
          onChange={(v) => update(s.id, { durationS: parseDuration(v) })}
        />
      )}
      {usesDistance(tracking) && (
        <NumField
          value={s.distanceM != null ? String(s.distanceM) : ''}
          label={t('app.workout.distance_a11y', { n: index + 1 })}
          integer
          onChange={(v) => update(s.id, { distanceM: v ? Math.round(Number(v)) || 0 : null })}
        />
      )}
      <Pressable
        onPress={() => update(s.id, { done: !s.done })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: s.done }}
        accessibilityLabel={t('app.workout.done_a11y', { n: index + 1 })}
        style={[styles.check, s.done && styles.checkOn]}
      >
        <Check size={20} color={s.done ? color.onAccent : color.text.muted} />
      </Pressable>
    </View>
  );
}

/** Keeps the raw text while typing ("82," or "1:3") and reports it upward. */
function NumField({
  value,
  label,
  onChange,
  integer,
  time,
  placeholder,
}: {
  value: string;
  label: string;
  onChange: (v: string) => void;
  integer?: boolean;
  time?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  // While typing, keep the raw text ("1:" is not a valid time yet); otherwise follow the store.
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  return (
    <TextInput
      value={text}
      onChangeText={(v) => {
        const clean = time
          ? v.replace(/[^\d:]/g, '')
          : integer
            ? v.replace(/\D/g, '')
            : v.replace(/[^\d.,]/g, '');
        setText(clean);
        onChange(clean);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      keyboardType={time ? 'numbers-and-punctuation' : integer ? 'number-pad' : 'decimal-pad'}
      placeholder={placeholder ?? '-'}
      placeholderTextColor={color.text.muted}
      style={styles.input}
      accessibilityLabel={label}
      selectTextOnFocus
      maxLength={8}
    />
  );
}

function useElapsed(startedAt: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!startedAt) return '0:00';
  return formatDuration(Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)));
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  timer: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  finish: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: color.accent[500],
    justifyContent: 'center',
  },
  finishText: { fontFamily: fonts.bold, fontSize: 14, color: color.onAccent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headRow: { paddingTop: 4 },
  head: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: color.text.muted,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  doneRow: { opacity: 0.75 },
  index: { fontFamily: fonts.bold, fontSize: 15, color: color.text.secondary, textAlign: 'center' },
  input: {
    flex: 1,
    // Web inputs have an intrinsic width; without these the row overflows narrow phones.
    flexBasis: 0,
    minWidth: 0,
    width: 0,
    minHeight: 44,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    color: color.text.primary,
    fontFamily: fonts.semibold,
    fontSize: 17,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  check: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.status.success, borderColor: color.status.success },
  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
  },
  addSetText: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
  note: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    padding: 12,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
