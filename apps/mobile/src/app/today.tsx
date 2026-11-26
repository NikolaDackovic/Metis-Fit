import type { CheckinBody, CheckinDayDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Footprints,
  Minus,
  Moon,
  Plus,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackButton } from '@/components/BackHeader';
import { Card, ErrorNote, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

function localDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shiftDay(day: string, by: number) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y!, m! - 1, d! + by));
}

/** Daily habits: water, sleep, steps, mood and energy. Each change saves right away. */
export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const today = localDay(new Date());
  const [day, setDay] = useState(today);
  const key = ['me', 'checkin', day];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.get<CheckinDayDto>(`/me/checkins/${day}`),
  });
  const save = useMutation({
    mutationFn: (b: CheckinBody) => api.put<CheckinDayDto>(`/me/checkins/${day}`, b),
    onMutate: (b) => {
      const prev = qc.getQueryData<CheckinDayDto>(key);
      if (prev) qc.setQueryData(key, { ...prev, checkin: { ...prev.checkin, ...b } });
    },
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      void qc.invalidateQueries({ queryKey: ['me', 'week'] });
    },
  });
  const c = q.data?.checkin;
  const g = q.data?.goals;
  const patch = (p: CheckinBody) => c && save.mutate({ ...stripDay(c), ...p });

  const [steps, setSteps] = useState('');
  useEffect(() => setSteps(c?.steps != null ? String(c.steps) : ''), [c?.steps, day]);

  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton />
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.today.title')}
      </Text>

      <View style={styles.dayRow}>
        <Pressable
          onPress={() => setDay(shiftDay(day, -1))}
          accessibilityRole="button"
          accessibilityLabel={t('app.food.prev_day')}
          style={styles.dayBtn}
        >
          <ChevronLeft style={dirIcon} size={20} color={color.text.primary} />
        </Pressable>
        <Text style={[type.h3, { flex: 1, textAlign: 'center' }]}>
          {day === today ? t('app.food.today') : f.date(day)}
        </Text>
        <Pressable
          onPress={() => setDay(shiftDay(day, 1))}
          disabled={day >= today}
          accessibilityRole="button"
          accessibilityLabel={t('app.food.next_day')}
          style={[styles.dayBtn, day >= today && { opacity: 0.3 }]}
        >
          <ChevronRight style={dirIcon} size={20} color={color.text.primary} />
        </Pressable>
      </View>

      {!c || !g ? (
        <Skeleton height={300} />
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <Row
              icon={<Droplets size={20} color={color.accent[400]} />}
              label={t('app.today.water')}
            >
              <Stepper
                value={`${+((c.waterMl ?? 0) / 1000).toFixed(2)} L`}
                onMinus={() => patch({ waterMl: Math.max(0, (c.waterMl ?? 0) - 250) })}
                onPlus={() => patch({ waterMl: Math.min(10000, (c.waterMl ?? 0) + 250) })}
                minusLabel={t('app.today.less')}
                plusLabel={t('app.today.glass')}
              />
            </Row>
            <Progress value={c.waterMl ?? 0} goal={g.waterMl} />
            <Text style={type.bodySm}>{t('app.today.water_goal', { goal: g.waterMl / 1000 })}</Text>
          </Card>

          <Card style={{ gap: 12 }}>
            <Row icon={<Moon size={20} color={color.accent[400]} />} label={t('app.today.sleep')}>
              <Stepper
                value={c.sleepH != null ? `${c.sleepH} h` : '-'}
                onMinus={() => patch({ sleepH: Math.max(0, (c.sleepH ?? g.sleepH) - 0.5) })}
                onPlus={() => patch({ sleepH: Math.min(24, (c.sleepH ?? g.sleepH - 0.5) + 0.5) })}
                minusLabel={t('app.today.less')}
                plusLabel={t('app.today.more')}
              />
            </Row>
            <Progress value={c.sleepH ?? 0} goal={g.sleepH} />
          </Card>

          <Card style={{ gap: 12 }}>
            <Row
              icon={<Footprints size={20} color={color.accent[400]} />}
              label={t('app.today.steps')}
            >
              <TextInput
                value={steps}
                onChangeText={(v) => setSteps(v.replace(/\D/g, '').slice(0, 6))}
                onBlur={() => patch({ steps: steps ? Math.min(100000, Number(steps)) : null })}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={color.text.muted}
                style={styles.stepsInput}
                accessibilityLabel={t('app.today.steps')}
              />
            </Row>
            <Progress value={c.steps ?? 0} goal={g.steps} />
          </Card>

          <SectionTitle>{t('app.today.feel')}</SectionTitle>
          <Card style={{ gap: 14 }}>
            <Scale
              label={t('app.today.mood')}
              value={c.mood}
              onChange={(v) => patch({ mood: v })}
              names={t('app.today.mood_scale').split(',')}
            />
            <Scale
              label={t('app.today.energy')}
              value={c.energy}
              onChange={(v) => patch({ energy: v })}
              names={t('app.today.energy_scale').split(',')}
            />
          </Card>

          {q.data!.recent.length > 1 && (
            <>
              <SectionTitle>{t('app.today.recent')}</SectionTitle>
              <Card style={{ gap: 8 }}>
                <MiniBars
                  label={t('app.today.water')}
                  values={q.data!.recent.map((r) => r.waterMl ?? 0)}
                  goal={g.waterMl}
                />
                <MiniBars
                  label={t('app.today.sleep')}
                  values={q.data!.recent.map((r) => r.sleepH ?? 0)}
                  goal={g.sleepH}
                />
              </Card>
            </>
          )}
          {save.error && (
            <ErrorNote
              message={save.error instanceof ApiError ? save.error.message : 'errors.internal'}
            />
          )}
          <Text style={styles.private}>{t('app.today.private')}</Text>
        </>
      )}
    </Screen>
  );
}

const stripDay = ({ day: _d, ...rest }: CheckinDayDto['checkin']) => rest;

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      {icon}
      <Text style={[type.h3, { flex: 1 }]}>{label}</Text>
      {children}
    </View>
  );
}

function Stepper({
  value,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
}: {
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={onMinus}
        accessibilityRole="button"
        accessibilityLabel={minusLabel}
        style={styles.stepBtn}
        hitSlop={6}
      >
        <Minus size={18} color={color.text.primary} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={onPlus}
        accessibilityRole="button"
        accessibilityLabel={plusLabel}
        style={[styles.stepBtn, styles.stepPlus]}
        hitSlop={6}
      >
        <Plus size={18} color={color.onAccent} />
      </Pressable>
    </View>
  );
}

function Progress({ value, goal }: { value: number; goal: number }) {
  const share = goal ? Math.min(1, value / goal) : 0;
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: goal, now: value }}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${share * 100}%`,
            backgroundColor: share >= 1 ? color.status.success : color.accent[500],
          },
        ]}
      />
    </View>
  );
}

function Scale({
  label,
  value,
  onChange,
  names,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  names: string[];
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={type.label}>{label}</Text>
      <View style={styles.scale}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={`${label}: ${names[n - 1] ?? n}`}
            style={[styles.scaleBtn, value === n && styles.scaleOn]}
          >
            <Text style={[styles.scaleNum, value === n && { color: color.text.primary }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      {value != null && <Text style={type.bodySm}>{names[value - 1]}</Text>}
    </View>
  );
}

function MiniBars({ label, values, goal }: { label: string; values: number[]; goal: number }) {
  const max = Math.max(goal, ...values) || 1;
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.bodySm}>{label}</Text>
      <View style={styles.bars}>
        {values.map((v, i) => (
          <View key={i} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  height: `${Math.max(4, (v / max) * 100)}%`,
                  backgroundColor: v >= goal ? color.status.success : color.accent[500],
                },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.surface2,
  },
  stepPlus: { backgroundColor: color.accent[500] },
  stepValue: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: color.text.primary,
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepsInput: {
    minWidth: 110,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    color: color.text.primary,
    fontFamily: fonts.bold,
    fontSize: 17,
    textAlign: 'center',
  },
  track: { height: 8, borderRadius: 4, backgroundColor: color.bg.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  scale: { flexDirection: 'row', gap: 8 },
  scaleBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  scaleNum: { fontFamily: fonts.bold, fontSize: 16, color: color.text.secondary },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 48 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderRadius: 2, width: '100%' },
  private: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: color.text.muted,
    textAlign: 'center',
  },
});
