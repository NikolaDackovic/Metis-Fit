import type { GoalDto, MeasurementDto, ProgressDto, SharingDto } from '@grit/validation';
import { GOAL_KINDS } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Flame, Lock, Ruler, Target, Trophy } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Toggle } from '@/components/Toggle';
import { BarChart } from '@/components/training/BarChart';
import { MeasurementTrend } from '@/components/training/MeasurementTrend';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Screen,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';
import { useMe } from '@/lib/queries';
import { formatDuration, parseDecimal, useLibrary } from '@/lib/training';
import { uuid } from '@/lib/workout-store';
import { color, fonts, radius, type } from '@/theme';

/** Third segment of the Training tab. Everything here is private unless shared with a trainer. */
export function ProgressView({ header }: { header: ReactNode }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const me = useMe();
  // F12-2: progress belongs to the account, so it works without any gym membership.
  const linked = Boolean(me.data);
  const q = useQuery({
    queryKey: ['me', 'progress', i18n.language],
    queryFn: () => api.get<ProgressDto>('/me/progress', { locale: i18n.language }),
    enabled: linked,
  });
  const p = q.data;

  return (
    <Screen refreshing={q.isFetching} onRefresh={() => void q.refetch()}>
      {header}
      {!linked && me.data ? (
        <Card>
          <EmptyState icon={Trophy} title={t('app.log.link_title')} text={t('app.log.link_text')} />
        </Card>
      ) : q.isPending ? (
        <Skeleton height={320} />
      ) : q.isError || !p ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : (
        <>
          <View style={styles.stats}>
            <Stat label={t('app.progress.total')} value={String(p.totalWorkouts)} />
            <Stat label={t('app.progress.last30')} value={String(p.last30Days)} />
            <Stat
              label={t('app.progress.streak')}
              value={t('app.progress.weeks', { count: p.streakWeeks })}
              icon={p.streakWeeks > 0}
            />
          </View>
          <Card style={{ gap: 8 }}>
            <Text style={type.label}>{t('app.progress.weekly')}</Text>
            <BarChart
              label={t('app.progress.weekly')}
              data={p.weekly.map((w) => ({
                label: f.date(w.weekStart, { day: 'numeric', month: 'numeric' }),
                value: w.workouts,
              }))}
            />
          </Card>

          <SectionTitle>{t('app.progress.records')}</SectionTitle>
          {p.records.length === 0 ? (
            <Text style={type.bodySm}>{t('app.progress.no_records')}</Text>
          ) : (
            <Card style={{ paddingVertical: 4 }}>
              {p.records.slice(0, 8).map((r, i) => (
                <Pressable
                  key={r.exerciseId}
                  style={[styles.row, i > 0 && styles.divider]}
                  accessibilityRole="link"
                  onPress={() =>
                    router.push({ pathname: '/exercises/[id]', params: { id: r.exerciseId } })
                  }
                >
                  <Trophy size={18} color={color.accent[400]} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {r.estimated1rmKg != null && (
                      <Text style={type.bodySm}>
                        {t('app.progress.e1rm', { value: r.estimated1rmKg })}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.value}>
                    {r.bestWeightKg != null
                      ? `${r.bestWeightKg} kg`
                      : r.bestDurationS != null
                        ? formatDuration(r.bestDurationS)
                        : r.bestReps != null
                          ? `× ${r.bestReps}`
                          : '-'}
                  </Text>
                </Pressable>
              ))}
            </Card>
          )}

          <Goals />
          <Measurements latest={p.latestMeasurement} />
          <Sharing />
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={type.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon && <Flame size={16} color={color.accent[400]} />}
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Goals() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const lib = useLibrary();
  const q = useQuery({
    queryKey: ['me', 'goals', i18n.language],
    queryFn: () => api.get<GoalDto[]>('/me/goals', { locale: i18n.language }),
  });
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<GoalDto['kind']>('body_weight');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.post<GoalDto[]>(`/me/goals?locale=${i18n.language}`, {
        kind,
        targetValue: parseDecimal(target),
        title: title.trim() || null,
        exerciseId,
      }),
    onSuccess: (d) => {
      qc.setQueryData(['me', 'goals', i18n.language], d);
      setAdding(false);
      setTarget('');
      setTitle('');
    },
  });
  const done = useMutation({
    mutationFn: (v: { id: string; status: GoalDto['status'] }) =>
      api.patch<GoalDto[]>(`/me/goals/${v.id}?locale=${i18n.language}`, { status: v.status }),
    onSuccess: (d) => qc.setQueryData(['me', 'goals', i18n.language], d),
  });
  const active = (q.data ?? []).filter((g) => g.status === 'active');
  const strength = (lib.data ?? []).filter((e) => e.tracking === 'weight_reps');

  return (
    <>
      <SectionTitle>{t('app.progress.goals')}</SectionTitle>
      {active.map((g) => {
        const pct =
          g.targetValue != null &&
          g.currentValue != null &&
          g.startValue != null &&
          g.targetValue !== g.startValue
            ? Math.max(
                0,
                Math.min(1, (g.currentValue - g.startValue) / (g.targetValue - g.startValue)),
              )
            : g.targetValue && g.currentValue != null && g.kind === 'workouts_per_week'
              ? Math.min(1, g.currentValue / g.targetValue)
              : null;
        return (
          <Card key={g.id} style={{ gap: 8 }}>
            <View style={styles.row}>
              <Target size={18} color={color.accent[400]} />
              <Text style={[type.h3, { flex: 1 }]}>
                {g.kind === 'custom'
                  ? g.title
                  : t(`app.progress.goal_kinds.${g.kind}`, { exercise: g.exerciseName ?? '' })}
              </Text>
              {g.targetValue != null && (
                <Text style={styles.value}>
                  {g.currentValue ?? '-'} / {g.targetValue}
                </Text>
              )}
            </View>
            {pct !== null && (
              <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
              >
                <View style={[styles.fill, { width: `${pct * 100}%` }]} />
              </View>
            )}
            <View style={styles.row}>
              <Pressable
                onPress={() => done.mutate({ id: g.id, status: 'achieved' })}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={styles.link}>{t('app.progress.goal_achieved')}</Text>
              </Pressable>
              <Pressable
                onPress={() => done.mutate({ id: g.id, status: 'abandoned' })}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={[styles.link, { color: color.text.muted }]}>
                  {t('app.progress.goal_abandon')}
                </Text>
              </Pressable>
            </View>
          </Card>
        );
      })}
      {adding ? (
        <Card style={{ gap: 12 }}>
          <View style={styles.chips}>
            {GOAL_KINDS.map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                accessibilityRole="radio"
                accessibilityState={{ selected: kind === k }}
                style={[styles.chip, kind === k && styles.chipActive]}
              >
                <Text style={[styles.chipText, kind === k && { color: color.text.primary }]}>
                  {t(`app.progress.goal_types.${k}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          {kind === 'exercise_weight' && (
            <View style={styles.chips}>
              {strength.slice(0, 12).map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => setExerciseId(e.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: exerciseId === e.id }}
                  style={[styles.chip, exerciseId === e.id && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, exerciseId === e.id && { color: color.text.primary }]}
                  >
                    {e.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {kind === 'custom' ? (
            <Field
              label={t('app.progress.goal_title')}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
            />
          ) : (
            <Field
              label={t(`app.progress.goal_target.${kind}`)}
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
            />
          )}
          {save.error && (
            <ErrorNote
              message={save.error instanceof ApiError ? save.error.message : 'errors.internal'}
            />
          )}
          <Button
            label={t('app.progress.goal_save')}
            loading={save.isPending}
            onPress={() => save.mutate()}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button
          label={t('app.progress.goal_add')}
          variant="secondary"
          icon={Target}
          onPress={() => setAdding(true)}
        />
      )}
    </>
  );
}

function Measurements({ latest }: { latest: MeasurementDto | null }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const EMPTY = {
    weightKg: '',
    heightCm: '',
    bodyFatPct: '',
    muscleMassKg: '',
    bodyWaterPct: '',
    visceralFat: '',
    waistCm: '',
    chestCm: '',
    hipsCm: '',
    armCm: '',
  };
  const [v, setV] = useState(EMPTY);
  const save = useMutation({
    mutationFn: () =>
      api.post('/me/measurements', {
        id: uuid(),
        measuredOn: clubToday(),
        ...Object.fromEntries(
          Object.entries(v).map(([k, x]) => {
            const n = parseDecimal(x);
            return [k, k === 'visceralFat' && n != null ? Math.round(n) : n];
          }),
        ),
      }),
    onSuccess: () => {
      setOpen(false);
      setV(EMPTY);
      void qc.invalidateQueries({ queryKey: ['me', 'progress'] });
      void qc.invalidateQueries({ queryKey: ['me', 'goals'] });
      void qc.invalidateQueries({ queryKey: ['me', 'measurements'] });
    },
  });
  const fields: Array<[keyof typeof v, string]> = [
    ['weightKg', 'kg'],
    ['heightCm', 'cm'],
    ['bodyFatPct', '%'],
    ['muscleMassKg', 'kg'],
    ['bodyWaterPct', '%'],
    ['visceralFat', ''],
    ['waistCm', 'cm'],
    ['chestCm', 'cm'],
    ['hipsCm', 'cm'],
    ['armCm', 'cm'],
  ];
  return (
    <>
      <SectionTitle>{t('app.progress.measurements')}</SectionTitle>
      <Card style={{ gap: 12 }}>
        {latest ? (
          <>
            <Text style={type.bodySm}>
              {t('app.progress.measured_on', { date: f.date(latest.measuredOn) })}
            </Text>
            <View style={styles.grid}>
              {latest.bmi != null && (
                <View style={styles.cell}>
                  <Text style={type.label}>BMI</Text>
                  <Text style={styles.value}>{f.number(latest.bmi)}</Text>
                </View>
              )}
              {fields.map(([k, unit]) =>
                latest[k] != null ? (
                  <View key={k} style={styles.cell}>
                    <Text style={type.label}>{t(`app.progress.m.${k}`)}</Text>
                    <Text style={styles.value}>
                      {f.number(latest[k] as number)} {unit}
                    </Text>
                  </View>
                ) : null,
              )}
            </View>
            <MeasurementTrend />
          </>
        ) : (
          <View style={styles.row}>
            <Ruler size={18} color={color.text.muted} />
            <Text style={[type.bodySm, { flex: 1 }]}>{t('app.progress.no_measurements')}</Text>
          </View>
        )}
        {open ? (
          <>
            <View style={styles.grid}>
              {fields.map(([k, unit]) => (
                <View key={k} style={styles.cell}>
                  <Field
                    label={
                      unit ? `${t(`app.progress.m.${k}`)} (${unit})` : t(`app.progress.m.${k}`)
                    }
                    value={v[k]}
                    onChangeText={(x) => setV({ ...v, [k]: x })}
                    keyboardType="decimal-pad"
                  />
                </View>
              ))}
            </View>
            {save.error && (
              <ErrorNote
                message={save.error instanceof ApiError ? save.error.message : 'errors.internal'}
              />
            )}
            <Button
              label={t('app.progress.save_measurement')}
              loading={save.isPending}
              onPress={() => save.mutate()}
            />
          </>
        ) : (
          <Button
            label={t('app.progress.add_measurement')}
            variant="secondary"
            onPress={() => setOpen(true)}
          />
        )}
      </Card>
    </>
  );
}

function Sharing() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me', 'sharing'],
    queryFn: () => api.get<SharingDto>('/me/sharing'),
  });
  const set = useMutation({
    mutationFn: (share: boolean) => api.put<SharingDto>('/me/sharing', { shareWithTrainer: share }),
    onSuccess: (d) => qc.setQueryData(['me', 'sharing'], d),
  });
  if (!q.data) return null;
  const trainers = q.data.trainers.map((x) => x.name).join(', ');
  return (
    <>
      <SectionTitle>{t('app.progress.privacy')}</SectionTitle>
      <Card style={{ gap: 10 }}>
        <View style={styles.row}>
          <Lock size={18} color={color.text.secondary} />
          <Text style={[type.body, { flex: 1 }]}>{t('app.progress.share_label')}</Text>
          <Toggle
            value={q.data.shareWithTrainer}
            onValueChange={(v) => set.mutate(v)}
            disabled={set.isPending}
            accessibilityLabel={t('app.progress.share_label')}
          />
        </View>
        <Text style={type.bodySm}>
          {trainers
            ? t('app.progress.share_trainers', { names: trainers })
            : t('app.progress.share_no_trainer')}
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  food: { borderColor: color.border.subtle, backgroundColor: color.bg.surface },
  nutrition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.accent[500],
    backgroundColor: color.accent.tint,
  },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    gap: 4,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: color.bg.surface,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  statValue: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  value: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  track: { height: 8, borderRadius: 4, backgroundColor: color.bg.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: color.accent[500] },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipActive: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: color.text.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '47%', gap: 2 },
});
