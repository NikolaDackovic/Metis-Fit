import type {
  FoodDayDto,
  MyNutritionDto,
  NutritionPlanDto,
  NutritionWizardBody,
} from '@grit/validation';
type FoodMeal = FoodDayDto['entries'][number]['meal'];
import { ACTIVITY_LEVELS, DIET_RESTRICTIONS, NUTRITION_GOALS } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ArrowLeft,
  CircleCheck,
  Dumbbell,
  Flame,
  Scale,
  Sparkles,
  TrendingDown,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, ErrorNote, Field, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clubToday } from '@/lib/format';
import { parseDecimal } from '@/lib/training';
import { uuid } from '@/lib/workout-store';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

type Draft = {
  goal: NutritionWizardBody['goal'] | null;
  sex: 'male' | 'female' | null;
  age: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  activity: NutritionWizardBody['activity'] | null;
  trainingDays: number;
  mealsPerDay: number;
  restrictions: NutritionWizardBody['restrictions'];
  preferences: string;
  healthConditions: boolean;
};
const EMPTY: Draft = {
  goal: null,
  sex: null,
  age: '',
  heightCm: '',
  weightKg: '',
  targetWeightKg: '',
  activity: null,
  trainingDays: 3,
  mealsPerDay: 4,
  restrictions: [],
  preferences: '',
  healthConditions: false,
};
const STEPS = 4;
const GOAL_ICON = { lose: TrendingDown, maintain: Scale, gain: Dumbbell } as const;

/**
 * Nutrition wizard: goal → body → activity → food. Targets are calculated by the server with
 * safety limits; the AI only suggests meals that fit them. Not medical advice.
 */
export default function NutritionScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const latest = useQuery({
    queryKey: ['me', 'nutrition', i18n.language],
    queryFn: () => api.get<MyNutritionDto>('/me/nutrition', { locale: i18n.language }),
  });
  const [mode, setMode] = useState<'auto' | 'wizard'>('auto');
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const create = useMutation({
    mutationFn: () =>
      api.post<NutritionPlanDto>(`/me/nutrition-plans?locale=${i18n.language}`, {
        goal: d.goal,
        sex: d.sex,
        age: Number(d.age),
        heightCm: parseDecimal(d.heightCm),
        weightKg: parseDecimal(d.weightKg),
        targetWeightKg: parseDecimal(d.targetWeightKg),
        activity: d.activity,
        trainingDays: d.trainingDays,
        mealsPerDay: d.mealsPerDay,
        restrictions: d.restrictions,
        preferences: d.preferences.trim() || null,
        healthConditions: d.healthConditions,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'nutrition'] });
      setMode('auto');
    },
  });

  // Slide + fade between steps.
  const anim = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(progress, {
      toValue: (step + 1) / STEPS,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [step, anim, progress]);

  const showResult = mode === 'auto' && latest.data?.latest && !create.isPending;
  const valid = [
    d.goal !== null,
    d.sex !== null &&
      Number(d.age) >= 18 &&
      Number(d.age) <= 90 &&
      (parseDecimal(d.heightCm) ?? 0) >= 130 &&
      (parseDecimal(d.weightKg) ?? 0) >= 35,
    d.activity !== null,
    true,
  ][step];

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable
        onPress={() => (mode === 'wizard' && step > 0 ? setStep(step - 1) : router.back())}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel={t('app.common.back')}
        hitSlop={8}
      >
        <ArrowLeft style={dirIcon} size={22} color={color.text.primary} />
      </Pressable>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.nutrition.title')}
      </Text>

      {latest.isPending ? (
        <Skeleton height={300} />
      ) : create.isPending ? (
        <Generating />
      ) : showResult ? (
        <Result data={latest.data!} onNew={() => (setD(EMPTY), setStep(0), setMode('wizard'))} />
      ) : mode === 'auto' && !latest.data?.latest ? (
        <>
          <Intro onStart={() => setMode('wizard')} />
          {latest.data && <Meals data={latest.data} />}
        </>
      ) : (
        <>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: STEPS, now: step + 1 }}
          >
            <Animated.View
              style={[
                styles.fill,
                {
                  width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                },
              ]}
            />
          </View>
          <Text style={type.label}>{t('app.nutrition.step', { n: step + 1, total: STEPS })}</Text>
          <Animated.View
            style={{
              gap: 14,
              opacity: anim,
              transform: [
                { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              ],
            }}
          >
            {step === 0 && (
              <>
                <Text style={type.h2}>{t('app.nutrition.q_goal')}</Text>
                {NUTRITION_GOALS.map((g) => {
                  const Icon = GOAL_ICON[g];
                  return (
                    <Choice key={g} selected={d.goal === g} onPress={() => setD({ ...d, goal: g })}>
                      <Icon
                        size={22}
                        color={d.goal === g ? color.accent[400] : color.text.secondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={type.h3}>{t(`app.nutrition.goals.${g}`)}</Text>
                        <Text style={type.bodySm}>{t(`app.nutrition.goals_text.${g}`)}</Text>
                      </View>
                    </Choice>
                  );
                })}
              </>
            )}
            {step === 1 && (
              <>
                <Text style={type.h2}>{t('app.nutrition.q_body')}</Text>
                <View style={styles.row}>
                  {(['female', 'male'] as const).map((s) => (
                    <View key={s} style={{ flex: 1 }}>
                      <Choice selected={d.sex === s} onPress={() => setD({ ...d, sex: s })} center>
                        <Text style={type.h3}>{t(`app.nutrition.sex.${s}`)}</Text>
                      </Choice>
                    </View>
                  ))}
                </View>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t('app.nutrition.age')}
                      value={d.age}
                      onChangeText={(v) => setD({ ...d, age: v.replace(/\D/g, '') })}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t('app.nutrition.height')}
                      value={d.heightCm}
                      onChangeText={(v) => setD({ ...d, heightCm: v })}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t('app.nutrition.weight')}
                      value={d.weightKg}
                      onChangeText={(v) => setD({ ...d, weightKg: v })}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t('app.nutrition.target_weight')}
                      value={d.targetWeightKg}
                      onChangeText={(v) => setD({ ...d, targetWeightKg: v })}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                  </View>
                </View>
                {d.age !== '' && Number(d.age) < 18 && (
                  <Text style={styles.warn}>{t('app.nutrition.adult_only')}</Text>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <Text style={type.h2}>{t('app.nutrition.q_activity')}</Text>
                {ACTIVITY_LEVELS.map((a) => (
                  <Choice
                    key={a}
                    selected={d.activity === a}
                    onPress={() => setD({ ...d, activity: a })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={type.h3}>{t(`app.nutrition.activity.${a}`)}</Text>
                      <Text style={type.bodySm}>{t(`app.nutrition.activity_text.${a}`)}</Text>
                    </View>
                  </Choice>
                ))}
                <Text style={type.label}>{t('app.nutrition.training_days')}</Text>
                <Chips
                  values={[0, 1, 2, 3, 4, 5, 6, 7]}
                  selected={[d.trainingDays]}
                  label={(n) => String(n)}
                  onToggle={(n) => setD({ ...d, trainingDays: n })}
                />
              </>
            )}
            {step === 3 && (
              <>
                <Text style={type.h2}>{t('app.nutrition.q_food')}</Text>
                <Text style={type.label}>{t('app.nutrition.meals_per_day')}</Text>
                <Chips
                  values={[2, 3, 4, 5, 6]}
                  selected={[d.mealsPerDay]}
                  label={(n) => String(n)}
                  onToggle={(n) => setD({ ...d, mealsPerDay: n })}
                />
                <Text style={type.label}>{t('app.nutrition.restrictions')}</Text>
                <Chips
                  values={[...DIET_RESTRICTIONS]}
                  selected={d.restrictions}
                  label={(r) => t(`app.nutrition.restriction.${r}`)}
                  onToggle={(r) =>
                    setD({
                      ...d,
                      restrictions: d.restrictions.includes(r)
                        ? d.restrictions.filter((x) => x !== r)
                        : [...d.restrictions, r],
                    })
                  }
                />
                <Text style={type.label}>{t('app.nutrition.preferences')}</Text>
                <TextInput
                  value={d.preferences}
                  onChangeText={(v) => setD({ ...d, preferences: v })}
                  placeholder={t('app.nutrition.preferences_placeholder')}
                  placeholderTextColor={color.text.muted}
                  multiline
                  maxLength={500}
                  style={styles.textarea}
                  accessibilityLabel={t('app.nutrition.preferences')}
                />
                <Pressable
                  onPress={() => setD({ ...d, healthConditions: !d.healthConditions })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: d.healthConditions }}
                  style={[
                    styles.health,
                    d.healthConditions && { borderColor: color.status.warning },
                  ]}
                >
                  <View style={[styles.box, d.healthConditions && styles.boxOn]} />
                  <Text style={[type.bodySm, { flex: 1 }]}>{t('app.nutrition.health')}</Text>
                </Pressable>
                {d.healthConditions && (
                  <Text style={styles.warn}>{t('app.nutrition.see_professional')}</Text>
                )}
              </>
            )}
          </Animated.View>
          {create.error && (
            <ErrorNote
              message={create.error instanceof ApiError ? create.error.message : 'errors.internal'}
            />
          )}
          <Button
            label={step < STEPS - 1 ? t('app.nutrition.next') : t('app.nutrition.create')}
            icon={step < STEPS - 1 ? undefined : Sparkles}
            disabled={!valid || (step === STEPS - 1 && d.healthConditions)}
            onPress={() => (step < STEPS - 1 ? setStep(step + 1) : create.mutate())}
          />
          <Text style={styles.disclaimer}>{t('app.nutrition.disclaimer')}</Text>
        </>
      )}
    </Screen>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  const pulse = usePulse();
  return (
    <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 28 }}>
      <Animated.View style={[styles.orb, { transform: [{ scale: pulse }] }]}>
        <Flame size={34} color={color.accent[400]} />
      </Animated.View>
      <Text style={[type.h2, { textAlign: 'center' }]}>{t('app.nutrition.intro_title')}</Text>
      <Text style={[type.bodySm, { textAlign: 'center' }]}>{t('app.nutrition.intro_text')}</Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button label={t('app.nutrition.start')} icon={Sparkles} onPress={onStart} />
      </View>
    </Card>
  );
}

const GEN_MESSAGES = ['calc', 'macros', 'meals', 'check'] as const;
function Generating() {
  const { t } = useTranslation();
  const pulse = usePulse();
  const spin = useRef(new Animated.Value(0)).current;
  const [i, setI] = useState(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    const id = setInterval(() => setI((x) => (x + 1) % GEN_MESSAGES.length), 2200);
    return () => {
      loop.stop();
      clearInterval(id);
    };
  }, [spin]);
  return (
    <Card style={{ gap: 18, alignItems: 'center', paddingVertical: 36 }}>
      <View style={styles.genWrap} accessibilityLabel={t('app.nutrition.generating')} accessible>
        <Animated.View
          style={[
            styles.ring,
            {
              transform: [
                {
                  rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[styles.orb, { position: 'absolute', transform: [{ scale: pulse }] }]}
        >
          <Sparkles size={30} color={color.accent[400]} />
        </Animated.View>
      </View>
      <Text style={type.h3}>{t('app.nutrition.generating')}</Text>
      <Text style={type.bodySm} accessibilityLiveRegion="polite">
        {t(`app.nutrition.gen.${GEN_MESSAGES[i]}`)}
      </Text>
    </Card>
  );
}

function Result({ data, onNew }: { data: MyNutritionDto; onNew: () => void }) {
  const { t } = useTranslation();
  const plan: NutritionPlanDto = data.latest!;
  const tg = plan.targets;
  const macros = [
    { key: 'protein', g: tg.proteinG, kcal: tg.proteinG * 4, color: color.accent[500] },
    { key: 'carbs', g: tg.carbsG, kcal: tg.carbsG * 4, color: color.status.info },
    { key: 'fat', g: tg.fatG, kcal: tg.fatG * 9, color: color.status.warning },
  ];
  const total = macros.reduce((s, m) => s + m.kcal, 0) || 1;
  return (
    <>
      <Card style={{ gap: 14 }}>
        <Text style={type.label}>{t(`app.nutrition.goals.${plan.input.goal}`)}</Text>
        <View style={styles.kcalRow}>
          <CountUp value={tg.kcal} style={styles.kcal} />
          <Text style={type.bodySm}>{t('app.nutrition.kcal_day')}</Text>
        </View>
        {macros.map((m, i) => (
          <MacroBar
            key={m.key}
            label={t(`app.nutrition.macro.${m.key}`)}
            grams={m.g}
            share={m.kcal / total}
            color={m.color}
            delay={i * 120}
          />
        ))}
        <Text style={type.bodySm}>
          {t('app.nutrition.weekly', {
            value: (tg.weeklyChangeKg > 0 ? '+' : '') + tg.weeklyChangeKg.toFixed(2),
          })}
        </Text>
        {tg.adjustedBy && <Text style={styles.warn}>{t(`app.${tg.adjustedBy}`)}</Text>}
      </Card>

      <Meals data={data} />
      <Text style={styles.disclaimer}>{t('app.nutrition.disclaimer')}</Text>
      <Button label={t('app.food.open')} onPress={() => router.push('/food-log')} />
      <Button label={t('app.nutrition.new')} variant="secondary" onPress={onNew} />
    </>
  );
}

/** Diary slot of a plan meal: by its time ("07:30"), else by its place in the day. */
function mealOf(index: number, time: string, count: number): FoodMeal {
  const h = Number(/(\d{1,2})[:.h]/.exec(time)?.[1] ?? NaN);
  if (!Number.isNaN(h))
    return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
  if (index === 0) return 'breakfast';
  if (index === count - 1) return 'dinner';
  return index === 1 ? 'lunch' : 'snack';
}

/** The meal plan the member sees: trainer's plan, AI plan, or the club example. */
function Meals({ data }: { data: MyNutritionDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const meals = data.meals;
  // F14-2: follow the plan day by day; "I ate this" writes the option into today's food diary.
  const today = clubToday();
  const day = useQuery({
    queryKey: ['me', 'food-log', today],
    queryFn: () => api.get<FoodDayDto>('/me/food-log', { date: today }),
    enabled: Boolean(meals),
  });
  const eaten = (meal: FoodMeal, name: string) =>
    day.data?.entries.find((e) => e.meal === meal && e.name === name) ?? null;
  const toggle = useMutation({
    mutationFn: async (x: {
      meal: FoodMeal;
      o: { title: string; kcal: number; proteinG: number };
    }) => {
      const had = eaten(x.meal, x.o.title);
      if (had) return api.del(`/me/food-log/${had.id}`);
      return api.post('/me/food-log', {
        id: uuid(),
        eatenOn: today,
        meal: x.meal,
        name: x.o.title.slice(0, 120),
        kcal: Math.round(x.o.kcal),
        proteinG: Math.round(x.o.proteinG),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'food-log'] });
      void qc.invalidateQueries({ queryKey: ['me', 'week'] });
    },
  });
  const done = meals
    ? meals.meals.filter((m, i) =>
        m.options.some((o) => eaten(mealOf(i, m.time, meals.meals.length), o.title)),
      ).length
    : 0;
  return (
    <>
      {meals ? (
        <>
          <SectionTitle>
            {data.source === 'trainer'
              ? t('app.nutrition.from_trainer', { name: data.trainerName ?? '' })
              : data.source === 'ai'
                ? t('app.nutrition.meals_title')
                : t('app.nutrition.example_title')}
          </SectionTitle>
          {data.source === 'template' && (
            <Text style={type.bodySm}>{t('app.nutrition.example_hint')}</Text>
          )}
          <Text style={type.body}>{meals.summary}</Text>
          <Card style={styles.today}>
            <Text style={type.label}>{t('app.plan_day.today')}</Text>
            <Text style={type.h3}>
              {t('app.plan_day.progress', {
                done,
                total: meals.meals.length,
                kcal: Math.round(day.data?.totals.kcal ?? 0),
                target: data.latest?.targets.kcal ?? '-',
              })}
            </Text>
            <Text style={type.bodySm}>{t('app.plan_day.hint')}</Text>
          </Card>
          {meals.meals.map((meal, i) => {
            const slot = mealOf(i, meal.time, meals.meals.length);
            const mealDone = meal.options.some((o) => eaten(slot, o.title));
            return (
              <Card key={`${meal.name}-${i}`} style={[{ gap: 10 }, mealDone && styles.mealDone]}>
                <View style={styles.row}>
                  {mealDone && <CircleCheck size={18} color={color.status.success} />}
                  <Text style={[type.h3, { flex: 1 }]}>{meal.name}</Text>
                  <Text style={type.bodySm}>{meal.time}</Text>
                </View>
                {meal.options.map((o, j) => {
                  const on = Boolean(eaten(slot, o.title));
                  return (
                    <View key={j} style={[styles.option, j > 0 && styles.divider]}>
                      <View style={styles.row}>
                        <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]}>
                          {o.title}
                        </Text>
                        <Text style={styles.optKcal}>
                          {Math.round(o.kcal)} kcal · {Math.round(o.proteinG)} g P
                        </Text>
                      </View>
                      <Text style={type.bodySm}>{o.ingredients.join(', ')}</Text>
                      <Pressable
                        onPress={() => toggle.mutate({ meal: slot, o })}
                        disabled={toggle.isPending}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={[styles.ate, on && styles.ateOn]}
                      >
                        <CircleCheck size={16} color={on ? color.onAccent : color.accent[400]} />
                        <Text style={[styles.ateText, on && { color: color.onAccent }]}>
                          {on ? t('app.plan_day.eaten') : t('app.plan_day.ate')}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            );
          })}
          {meals.tips.length > 0 && (
            <Card style={{ gap: 6 }}>
              {meals.tips.map((tip, i) => (
                <Text key={i} style={type.bodySm}>
                  • {tip}
                </Text>
              ))}
            </Card>
          )}
        </>
      ) : (
        <Card>
          <Text style={type.bodySm}>{t('app.nutrition.targets_only')}</Text>
        </Card>
      )}
    </>
  );
}

function MacroBar({
  label,
  grams,
  share,
  color: c,
  delay,
}: {
  label: string;
  grams: number;
  share: number;
  color: string;
  delay: number;
}) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: share,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [w, share, delay]);
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        <Text style={[type.body, { flex: 1 }]}>{label}</Text>
        <Text style={styles.optKcal}>{grams} g</Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: c,
              width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
    </View>
  );
}

function CountUp({ value, style }: { value: number; style: object }) {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = v.addListener(({ value: x }) => setShown(Math.round(x)));
    Animated.timing(v, {
      toValue: value,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => v.removeListener(id);
  }, [v, value]);
  return (
    <Text style={style} accessibilityLabel={String(value)}>
      {shown}
    </Text>
  );
}

function usePulse() {
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(s, {
          toValue: 1.08,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(s, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [s]);
  return s;
}

function Choice({
  selected,
  onPress,
  children,
  center,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.choice, center && { justifyContent: 'center' }, selected && styles.choiceOn]}
    >
      {children}
    </Pressable>
  );
}

function Chips<T extends string | number>({
  values,
  selected,
  label,
  onToggle,
}: {
  values: T[];
  selected: T[];
  label: (v: T) => string;
  onToggle: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {values.map((v) => {
        const on = selected.includes(v);
        return (
          <Pressable
            key={String(v)}
            onPress={() => onToggle(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.choiceOn]}
          >
            <Text style={[styles.chipText, on && { color: color.text.primary }]}>{label(v)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  today: { gap: 4, borderColor: color.accent[500] },
  mealDone: { borderColor: color.status.success },
  ate: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.accent[500],
  },
  ateOn: { backgroundColor: color.status.success, borderColor: color.status.success },
  ateText: { fontFamily: fonts.semibold, fontSize: 13, color: color.accent[400] },
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { height: 8, borderRadius: 4, backgroundColor: color.bg.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: color.accent[500] },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  choiceOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    minWidth: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 15,
    padding: 12,
  },
  health: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: color.border.strong },
  boxOn: { backgroundColor: color.status.warning, borderColor: color.status.warning },
  warn: { fontFamily: fonts.semibold, fontSize: 14, color: color.status.warning },
  disclaimer: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: color.text.muted,
    textAlign: 'center',
  },
  orb: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: color.border.subtle,
    borderTopColor: color.accent[500],
  },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  kcal: {
    fontFamily: fonts.bold,
    fontSize: 44,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  option: { gap: 4, paddingTop: 4 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle, paddingTop: 10 },
  optKcal: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: color.text.secondary,
    fontVariant: ['tabular-nums'],
  },
});
