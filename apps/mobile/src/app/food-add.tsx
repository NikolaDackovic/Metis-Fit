import type { FoodDayDto, FoodDto, FoodListsDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Flame, PencilLine, ScanBarcode, Search, Trash2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Button, Card, EmptyState, ErrorNote, Field, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { amountOf, foodName, isMeal, localDay, MEALS, mealNow, toNum, type Meal } from '@/lib/food';
import { uuid } from '@/lib/workout-store';
import { color, fonts, radius, type } from '@/theme';

type Tab = 'recent' | 'mine';

/** One food in a list: name, brand, serving and its calories. */
function FoodRow({ f, onPress, divider }: { f: FoodDto; onPress: () => void; divider?: boolean }) {
  const { t, i18n } = useTranslation();
  const serving = amountOf(f, f.servingG);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, divider && styles.divider]}
    >
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={1}>
          {foodName(f, i18n.language)}
        </Text>
        <Text style={type.bodySm} numberOfLines={1}>
          {[
            f.brand,
            f.servingLabel
              ? `${f.servingLabel} (${Math.round(f.servingG)} g)`
              : `${Math.round(f.servingG)} g`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text style={styles.kcal}>{serving.kcal}</Text>
      <Text style={styles.kcalUnit}>{t('app.food_add.kcal')}</Text>
    </Pressable>
  );
}

/**
 * F15-2 "Add food": search the catalog (any word, no diacritics needed), recent and my own foods,
 * scan a barcode, or quick-add calories. Picking a food opens the amount (servings or grams).
 */
export default function FoodAddScreen() {
  const params = useLocalSearchParams<{ meal?: string; day?: string; foodId?: string }>();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const day = params.day ?? localDay(new Date());
  const [meal, setMeal] = useState<Meal>(isMeal(params.meal) ? params.meal : mealNow());
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState<Tab>('recent');
  const [picked, setPicked] = useState<FoodDto | null>(null);
  const [quick, setQuick] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTerm(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  const lists = useQuery({
    queryKey: ['me', 'foods', 'lists'],
    queryFn: () => api.get<FoodListsDto>('/me/foods'),
  });
  const results = useQuery({
    queryKey: ['me', 'foods', 'search', term],
    queryFn: () => api.get<FoodDto[]>('/me/foods', { q: term }),
    enabled: term.length >= 2,
    placeholderData: (prev) => prev,
  });
  // Coming back from the barcode scanner or "new food": open that food right away.
  const preset = useQuery({
    queryKey: ['me', 'foods', 'one', params.foodId],
    queryFn: () => api.get<FoodDto>(`/me/foods/${params.foodId}`),
    enabled: Boolean(params.foodId),
  });
  useEffect(() => {
    if (preset.data) setPicked(preset.data);
  }, [preset.data]);

  const removeFood = useMutation({
    mutationFn: (id: string) => api.del(`/me/foods/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'foods'] }),
  });

  const done = (d: FoodDayDto) => {
    qc.setQueryData(['me', 'food-log', day], d);
    void qc.invalidateQueries({ queryKey: ['me', 'foods', 'lists'] });
    void qc.invalidateQueries({ queryKey: ['me', 'week'] });
    if (router.canGoBack()) router.back();
    else router.replace('/food-log');
  };

  const searching = term.length >= 2;
  const list = searching
    ? (results.data ?? [])
    : tab === 'recent'
      ? (lists.data?.recent ?? [])
      : (lists.data?.mine ?? []);

  return (
    <Screen>
      <BackHeader title={t('app.food_add.title')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 6 }}
      >
        {MEALS.map((m) => (
          <Pressable
            key={m}
            onPress={() => setMeal(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: m === meal }}
            style={[styles.chip, m === meal && styles.chipOn]}
          >
            <Text style={[styles.chipText, m === meal && { color: color.text.primary }]}>
              {t(`app.food.meal.${m}`)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Search size={18} color={color.text.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('app.food_add.search')}
            placeholderTextColor={color.text.muted}
            style={styles.searchInput}
            autoFocus={!params.foodId}
            returnKeyType="search"
            accessibilityLabel={t('app.food_add.search')}
            maxLength={60}
          />
          {text ? (
            <Pressable
              onPress={() => setText('')}
              accessibilityRole="button"
              accessibilityLabel={t('app.food_add.clear')}
              hitSlop={8}
            >
              <X size={18} color={color.text.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/food-scan', params: { meal, day } })}
          accessibilityRole="button"
          accessibilityLabel={t('app.food_add.scan')}
          style={styles.scanBtn}
        >
          <ScanBarcode size={22} color={color.onAccent} />
        </Pressable>
      </View>

      {!searching && (
        <View style={styles.quickRow}>
          <Pressable onPress={() => setQuick(true)} accessibilityRole="button" style={styles.quick}>
            <Flame size={18} color={color.accent[400]} />
            <Text style={styles.quickText}>{t('app.food_add.quick')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/food-new', params: { meal, day } })}
            accessibilityRole="button"
            style={styles.quick}
          >
            <PencilLine size={18} color={color.accent[400]} />
            <Text style={styles.quickText}>{t('app.food_add.new')}</Text>
          </Pressable>
        </View>
      )}

      {!searching && (
        <View style={styles.tabs} accessibilityRole="tablist">
          {(['recent', 'mine'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              style={[styles.tab, tab === k && styles.tabOn]}
            >
              <Text style={[styles.tabText, tab === k && { color: color.text.primary }]}>
                {t(`app.food_add.${k}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {(searching ? results.isPending : lists.isPending) ? (
        <Skeleton height={220} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={searching ? Search : tab === 'recent' ? Flame : PencilLine}
            title={t(searching ? 'app.food_add.no_results' : `app.food_add.empty_${tab}`)}
            text={t(searching ? 'app.food_add.no_results_text' : `app.food_add.empty_${tab}_text`)}
            action={
              searching ? (
                <Button
                  label={t('app.food_add.new')}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/food-new', params: { meal, day, name: text } })
                  }
                />
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {list.map((f, i) => (
            <View key={f.id} style={styles.rowWrap}>
              <View style={{ flex: 1 }}>
                <FoodRow f={f} onPress={() => setPicked(f)} divider={i > 0} />
              </View>
              {!searching && tab === 'mine' && (
                <Pressable
                  onPress={() => removeFood.mutate(f.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('app.food.remove')}: ${foodName(f, i18n.language)}`}
                  hitSlop={8}
                  style={[styles.trash, i > 0 && styles.divider]}
                >
                  <Trash2 size={16} color={color.text.muted} />
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      )}

      {picked && (
        <AmountSheet
          food={picked}
          meal={meal}
          day={day}
          onClose={() => setPicked(null)}
          onDone={done}
        />
      )}
      {quick && <QuickAdd meal={meal} day={day} onClose={() => setQuick(false)} onDone={done} />}
    </Screen>
  );
}

/** How much: servings or grams, with live calories and macros. */
function AmountSheet({
  food,
  meal,
  day,
  onClose,
  onDone,
}: {
  food: FoodDto;
  meal: Meal;
  day: string;
  onClose: () => void;
  onDone: (d: FoodDayDto) => void;
}) {
  const { t, i18n } = useTranslation();
  const [unit, setUnit] = useState<'serving' | 'g'>(
    food.servingG === 100 && !food.servingLabel ? 'g' : 'serving',
  );
  const [qty, setQty] = useState(unit === 'g' ? '100' : '1');
  const n = toNum(qty) ?? 0;
  const grams = unit === 'g' ? n : n * food.servingG;
  const a = amountOf(food, grams);
  const valid = grams > 0 && grams <= 5000;
  const name = foodName(food, i18n.language);
  const add = useMutation({
    mutationFn: () =>
      api.post<FoodDayDto>('/me/food-log', {
        id: uuid(),
        eatenOn: day,
        meal,
        name,
        kcal: a.kcal,
        proteinG: a.proteinG,
        carbsG: a.carbsG,
        fatG: a.fatG,
        foodId: food.id,
        grams: Math.round(grams * 10) / 10,
      }),
    onSuccess: onDone,
  });
  const switchUnit = (u: 'serving' | 'g') => {
    if (u === unit) return;
    setUnit(u);
    setQty(
      u === 'g'
        ? String(Math.round(grams || food.servingG))
        : String(Math.round(((grams || food.servingG) / food.servingG) * 10) / 10),
    );
  };
  const step = (d: number) => {
    const next = Math.max(0, Math.round((n + d) * 10) / 10);
    setQty(String(next));
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.sheetTop}>
            <View style={{ flex: 1 }}>
              <Text style={type.h2} numberOfLines={2}>
                {name}
              </Text>
              {food.brand ? <Text style={type.bodySm}>{food.brand}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
            >
              <X size={22} color={color.text.primary} />
            </Pressable>
          </View>

          <View style={styles.units}>
            <Pressable
              onPress={() => switchUnit('serving')}
              accessibilityRole="button"
              accessibilityState={{ selected: unit === 'serving' }}
              style={[styles.unit, unit === 'serving' && styles.unitOn]}
            >
              <Text
                style={[styles.unitText, unit === 'serving' && { color: color.text.primary }]}
                numberOfLines={1}
              >
                {food.servingLabel ?? t('app.food_add.serving')} ({Math.round(food.servingG)} g)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => switchUnit('g')}
              accessibilityRole="button"
              accessibilityState={{ selected: unit === 'g' }}
              style={[styles.unit, unit === 'g' && styles.unitOn]}
            >
              <Text style={[styles.unitText, unit === 'g' && { color: color.text.primary }]}>
                {t('app.food_add.grams')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.qtyRow}>
            <Pressable
              onPress={() => step(unit === 'g' ? -10 : -0.5)}
              accessibilityRole="button"
              accessibilityLabel="-"
              style={styles.round}
            >
              <Text style={styles.roundText}>−</Text>
            </Pressable>
            <TextInput
              value={qty}
              onChangeText={setQty}
              keyboardType="decimal-pad"
              selectTextOnFocus
              maxLength={6}
              style={styles.qty}
              accessibilityLabel={
                unit === 'g' ? t('app.food_add.grams') : t('app.food_add.servings')
              }
            />
            <Pressable
              onPress={() => step(unit === 'g' ? 10 : 0.5)}
              accessibilityRole="button"
              accessibilityLabel="+"
              style={styles.round}
            >
              <Text style={styles.roundText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.preview}>
            <View style={styles.previewCell}>
              <Text style={styles.previewNum}>{a.kcal}</Text>
              <Text style={styles.previewLabel}>kcal</Text>
            </View>
            {(['proteinG', 'carbsG', 'fatG'] as const).map((k) => (
              <View key={k} style={styles.previewCell}>
                <Text style={styles.previewNum}>{a[k]} g</Text>
                <Text style={styles.previewLabel}>
                  {t(
                    `app.nutrition.macro.${k === 'proteinG' ? 'protein' : k === 'carbsG' ? 'carbs' : 'fat'}`,
                  )}
                </Text>
              </View>
            ))}
          </View>
          {add.error && (
            <ErrorNote
              message={add.error instanceof ApiError ? add.error.message : 'errors.internal'}
            />
          )}
          <Button
            label={t('app.food_add.add_to', { meal: t(`app.food.meal.${meal}`) })}
            disabled={!valid}
            loading={add.isPending}
            onPress={() => add.mutate()}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Calories (and optionally macros) without a food, e.g. a restaurant meal. */
function QuickAdd({
  meal,
  day,
  onClose,
  onDone,
}: {
  meal: Meal;
  day: string;
  onClose: () => void;
  onDone: (d: FoodDayDto) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const k = toNum(kcal);
  const add = useMutation({
    mutationFn: () =>
      api.post<FoodDayDto>('/me/food-log', {
        id: uuid(),
        eatenOn: day,
        meal,
        name: name.trim() || t('app.food_add.quick_name'),
        kcal: Math.round(k ?? 0),
        proteinG: toNum(p),
        carbsG: toNum(c),
        fatG: toNum(f),
      }),
    onSuccess: onDone,
  });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.sheetTop}>
            <Text style={[type.h2, { flex: 1 }]}>{t('app.food_add.quick')}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
            >
              <X size={22} color={color.text.primary} />
            </Pressable>
          </View>
          <Field
            label={t('app.food.name')}
            value={name}
            onChangeText={setName}
            placeholder={t('app.food_add.quick_name')}
            maxLength={120}
          />
          <Field
            label="kcal"
            value={kcal}
            onChangeText={setKcal}
            keyboardType="numeric"
            maxLength={5}
          />
          <View style={styles.inputs}>
            <View style={styles.cell}>
              <Field
                label={t('app.nutrition.macro.protein')}
                value={p}
                onChangeText={setP}
                keyboardType="decimal-pad"
                maxLength={5}
              />
            </View>
            <View style={styles.cell}>
              <Field
                label={t('app.nutrition.macro.carbs')}
                value={c}
                onChangeText={setC}
                keyboardType="decimal-pad"
                maxLength={5}
              />
            </View>
            <View style={styles.cell}>
              <Field
                label={t('app.nutrition.macro.fat')}
                value={f}
                onChangeText={setF}
                keyboardType="decimal-pad"
                maxLength={5}
              />
            </View>
          </View>
          {add.error && (
            <ErrorNote
              message={add.error instanceof ApiError ? add.error.message : 'errors.internal'}
            />
          )}
          <Button
            label={t('app.food_add.add_to', { meal: t(`app.food.meal.${meal}`) })}
            disabled={k == null || k < 0 || k > 5000}
            loading={add.isPending}
            onPress={() => add.mutate()}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  searchInput: {
    outlineWidth: 0,
    flex: 1,
    minHeight: 44,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: { flexDirection: 'row', gap: 10 },
  quick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  quickText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.primary, flexShrink: 1 },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  tab: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm - 2,
  },
  tabOn: { backgroundColor: color.bg.surface2 },
  tabText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
  rowWrap: { flexDirection: 'row', alignItems: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 58, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  trash: { width: 40, alignItems: 'center', justifyContent: 'center' },
  kcal: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  kcalUnit: { fontFamily: fonts.regular, fontSize: 12, color: color.text.secondary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 16,
    padding: 20,
    paddingBottom: 28,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: color.bg.surface,
  },
  sheetTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  units: { flexDirection: 'row', gap: 8 },
  unit: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  unitOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  unitText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { fontFamily: fonts.bold, fontSize: 22, color: color.text.primary },
  qty: {
    width: 120,
    minHeight: 56,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 28,
    color: color.text.primary,
    borderBottomWidth: 2,
    borderBottomColor: color.accent[500],
  },
  preview: { flexDirection: 'row', gap: 8 },
  previewCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
  },
  previewNum: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  previewLabel: { fontFamily: fonts.regular, fontSize: 11, color: color.text.secondary },
  inputs: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, flexBasis: 0, minWidth: 0 },
});
