import type { CheckinBody, CheckinDayDto, FoodDayDto, FoodEntryDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Droplets,
  Minus,
  Plus,
  Target,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { BackHeader } from '@/components/BackHeader';
import { Card, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { localDay, MEALS, shiftDay, type Meal } from '@/lib/food';
import { useFormat } from '@/lib/format';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, radius, type } from '@/theme';

const MACRO_COLOR = { protein: '#4FC3F7', carbs: '#FFB74D', fat: '#BA68C8' } as const;

/** Remaining-calories ring: goal minus food; red past the goal. */
function Ring({ eaten, goal }: { eaten: number; goal: number }) {
  const { t } = useTranslation();
  const size = 132;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = Math.min(1, eaten / Math.max(goal, 1));
  const left = goal - eaten;
  const over = left < 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color.bg.surface2}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? color.status.danger : color.accent[500]}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * share} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.ringNum, over && { color: color.status.danger }]}>
        {Math.abs(Math.round(left))}
      </Text>
      <Text style={styles.ringLabel}>{over ? t('app.food.over') : t('app.food.left')}</Text>
    </View>
  );
}

function MacroBar({
  k,
  value,
  target,
}: {
  k: keyof typeof MACRO_COLOR;
  value: number;
  target?: number;
}) {
  const { t } = useTranslation();
  const share = target ? Math.min(1, value / target) : 0;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.macroLabel}>{t(`app.nutrition.macro.${k}`)}</Text>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${share * 100}%`, backgroundColor: MACRO_COLOR[k] }]}
        />
      </View>
      <Text style={styles.macroValue}>
        {Math.round(value)}
        {target ? `/${Math.round(target)}` : ''} g
      </Text>
    </View>
  );
}

/**
 * F15-2 food diary (MyFitnessPal-style): goal − food = remaining, macro bars, water, and the day's
 * meals each with their own "Add food". Adding opens search, recent foods, barcode and quick add.
 */
export default function FoodLogScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const today = localDay(new Date());
  const [day, setDay] = useState(today);
  const key = ['me', 'food-log', day];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.get<FoodDayDto>('/me/food-log', { date: day }),
  });
  const yesterday = useQuery({
    queryKey: ['me', 'food-log', shiftDay(day, -1)],
    queryFn: () => api.get<FoodDayDto>('/me/food-log', { date: shiftDay(day, -1) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del<FoodDayDto>(`/me/food-log/${id}`),
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  const copy = useMutation({
    mutationFn: (meal: Meal) =>
      api.post<FoodDayDto>('/me/food-log/copy', { from: shiftDay(day, -1), to: day, meal }),
    onSuccess: (d) => qc.setQueryData(key, d),
  });

  // Water lives with the daily habits (same numbers as the Today screen).
  const wKey = ['me', 'checkin', day];
  const water = useQuery({
    queryKey: wKey,
    queryFn: () => api.get<CheckinDayDto>(`/me/checkins/${day}`),
  });
  const saveWater = useMutation({
    mutationFn: (b: CheckinBody) => api.put<CheckinDayDto>(`/me/checkins/${day}`, b),
    onMutate: (b) => {
      const prev = qc.getQueryData<CheckinDayDto>(wKey);
      if (prev) qc.setQueryData(wKey, { ...prev, checkin: { ...prev.checkin, ...b } });
    },
    onSuccess: (d) => qc.setQueryData(wKey, d),
  });
  const wc = water.data?.checkin;
  const addWater = (ml: number) => {
    if (!wc) return;
    const { day: _d, ...rest } = wc;
    saveWater.mutate({ ...rest, waterMl: Math.min(10000, Math.max(0, (wc.waterMl ?? 0) + ml)) });
  };

  const data = q.data;
  const goal = data?.targets?.kcal ?? null;
  const add = (meal: Meal) => router.push({ pathname: '/food-add', params: { meal, day } });
  const amount = (e: FoodEntryDto) => (e.grams ? `${Math.round(e.grams)} g` : null);
  const error = remove.error ?? copy.error;

  return (
    <Screen>
      <BackHeader title={t('app.food.title')} />

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
          {day === today
            ? t('app.food.today')
            : f.date(day, { weekday: 'long', day: 'numeric', month: 'long' })}
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

      {q.isPending ? (
        <Skeleton height={220} />
      ) : q.error ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : data ? (
        <Card style={{ gap: 16 }}>
          {goal ? (
            <View style={styles.summary}>
              <Ring eaten={data.totals.kcal} goal={goal} />
              <View style={{ flex: 1, gap: 10 }}>
                <View style={styles.eq}>
                  <Text style={styles.eqNum}>{Math.round(goal)}</Text>
                  <Text style={styles.eqLabel}>{t('app.food.goal')}</Text>
                </View>
                <View style={styles.eq}>
                  <Text style={styles.eqNum}>− {Math.round(data.totals.kcal)}</Text>
                  <Text style={styles.eqLabel}>{t('app.food.food')}</Text>
                </View>
                <View style={[styles.eq, styles.eqTotal]}>
                  <Text style={[styles.eqNum, { color: color.accent[400] }]}>
                    = {Math.round(goal - data.totals.kcal)}
                  </Text>
                  <Text style={styles.eqLabel}>{t('app.food.left_kcal')}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={styles.eq}>
                <Text style={styles.big}>{Math.round(data.totals.kcal)}</Text>
                <Text style={type.bodySm}>{t('app.food.kcal')}</Text>
              </View>
              <Pressable
                onPress={() => router.push('/nutrition')}
                accessibilityRole="link"
                style={styles.goalCta}
              >
                <Target size={18} color={color.accent[400]} />
                <Text style={[type.body, { flex: 1 }]}>{t('app.food.no_target')}</Text>
                <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
              </Pressable>
            </View>
          )}
          <View style={styles.macros}>
            <MacroBar k="protein" value={data.totals.proteinG} target={data.targets?.proteinG} />
            <MacroBar k="carbs" value={data.totals.carbsG} target={data.targets?.carbsG} />
            <MacroBar k="fat" value={data.totals.fatG} target={data.targets?.fatG} />
          </View>
        </Card>
      ) : null}

      {data &&
        MEALS.map((m) => {
          const items = data.entries.filter((e) => e.meal === m);
          const total = items.reduce((a, e) => a + e.kcal, 0);
          const canCopy =
            !items.length && (yesterday.data?.entries ?? []).some((e) => e.meal === m);
          return (
            <Card key={m} style={{ gap: 0, paddingVertical: 6 }}>
              <View style={styles.mealHead}>
                <Text style={[type.h3, { flex: 1 }]}>{t(`app.food.meal.${m}`)}</Text>
                <Text style={styles.mealKcal}>{total} kcal</Text>
              </View>
              {items.map((e) => (
                <View key={e.id} style={[styles.entry, styles.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.body} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text style={type.bodySm} numberOfLines={1}>
                      {[
                        amount(e),
                        e.proteinG != null ? t('app.food.protein_short', { g: e.proteinG }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.entryKcal}>{e.kcal}</Text>
                  <Pressable
                    onPress={() => remove.mutate(e.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('app.food.remove')}: ${e.name}`}
                    hitSlop={8}
                    style={styles.icon}
                  >
                    <X size={16} color={color.text.muted} />
                  </Pressable>
                </View>
              ))}
              <View style={[styles.mealActions, styles.divider]}>
                <Pressable
                  onPress={() => add(m)}
                  accessibilityRole="button"
                  style={styles.action}
                  hitSlop={6}
                >
                  <Plus size={16} color={color.accent[400]} />
                  <Text style={styles.actionText}>{t('app.food.add')}</Text>
                </Pressable>
                {canCopy && (
                  <Pressable
                    onPress={() => copy.mutate(m)}
                    disabled={copy.isPending}
                    accessibilityRole="button"
                    style={styles.action}
                    hitSlop={6}
                  >
                    <Copy size={15} color={color.text.secondary} />
                    <Text style={[styles.actionText, { color: color.text.secondary }]}>
                      {t('app.food.copy_yesterday')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Card>
          );
        })}

      {wc && (
        <Card style={styles.water}>
          <Droplets size={22} color="#4FC3F7" />
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>{t('app.today.water')}</Text>
            <Text style={type.bodySm}>
              {+((wc.waterMl ?? 0) / 1000).toFixed(2)} /{' '}
              {(water.data?.goals.waterMl ?? 2000) / 1000} L
            </Text>
          </View>
          <Pressable
            onPress={() => addWater(-250)}
            accessibilityRole="button"
            accessibilityLabel={t('app.today.less')}
            style={styles.round}
          >
            <Minus size={18} color={color.text.primary} />
          </Pressable>
          <Pressable
            onPress={() => addWater(250)}
            accessibilityRole="button"
            accessibilityLabel={t('app.today.glass')}
            style={[styles.round, styles.roundOn]}
          >
            <Plus size={18} color={color.onAccent} />
          </Pressable>
        </Card>
      )}

      {error && (
        <ErrorNote message={error instanceof ApiError ? error.message : 'errors.internal'} />
      )}
      <Text style={styles.disclaimer}>{t('app.food.disclaimer')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface,
  },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringNum: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  ringLabel: { fontFamily: fonts.medium, fontSize: 12, color: color.text.secondary },
  eq: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  eqTotal: { borderTopWidth: 1, borderTopColor: color.border.subtle, paddingTop: 8 },
  eqNum: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  eqLabel: { fontFamily: fonts.regular, fontSize: 13, color: color.text.secondary },
  big: {
    fontFamily: fonts.bold,
    fontSize: 36,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  goalCta: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  macros: { flexDirection: 'row', gap: 12 },
  macroLabel: { fontFamily: fonts.semibold, fontSize: 12, color: color.text.secondary },
  macroValue: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  track: { height: 6, borderRadius: 3, backgroundColor: color.bg.surface2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  mealHead: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  mealKcal: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: color.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingVertical: 6 },
  entryKcal: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  icon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  mealActions: { flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 46 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  actionText: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
  water: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundOn: { backgroundColor: color.accent[500], borderColor: color.accent[500] },
  disclaimer: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: color.text.muted,
    textAlign: 'center',
  },
});
