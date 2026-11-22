import type { MealPlanContent, MemberNutritionPlanDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Button, Card, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { color, fonts, radius, type } from '@/theme';

type Option = { title: string; ingredients: string; kcal: string; protein: string };
type Meal = { name: string; time: string; options: Option[] };
type Draft = { summary: string; meals: Meal[]; tips: string };

const emptyOption = (): Option => ({ title: '', ingredients: '', kcal: '', protein: '' });

function fromContent(c: MealPlanContent): Draft {
  return {
    summary: c.summary,
    meals: c.meals.map((m) => ({
      name: m.name,
      time: m.time,
      options: m.options.map((o) => ({
        title: o.title,
        ingredients: o.ingredients.join(', '),
        kcal: String(Math.round(o.kcal)),
        protein: String(Math.round(o.proteinG)),
      })),
    })),
    tips: c.tips.join('\n'),
  };
}

function toContent(d: Draft): MealPlanContent {
  return {
    summary: d.summary.trim().slice(0, 600),
    meals: d.meals.map((m) => ({
      name: m.name.trim().slice(0, 60),
      time: m.time.trim().slice(0, 20),
      options: m.options
        .filter((o) => o.title.trim())
        .map((o) => ({
          title: o.title.trim().slice(0, 100),
          ingredients: o.ingredients
            .split(',')
            .map((x) => x.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 12),
          kcal: Number(o.kcal) || 0,
          proteinG: Number(o.protein) || 0,
        })),
    })),
    tips: d.tips
      .split('\n')
      .map((x) => x.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 6),
  };
}

/**
 * F14-2: the trainer writes or changes a client's meal plan from the app. The client sees it in
 * their nutrition screen and follows it day by day.
 */
export default function CoachPlanScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['coach', 'plan', id],
    queryFn: () => api.get<MemberNutritionPlanDto | null>(`/admin/members/${id}/nutrition-plan`),
  });
  const [d, setD] = useState<Draft | null>(null);
  useEffect(() => {
    if (q.isSuccess && !d)
      setD(
        q.data
          ? fromContent(q.data.content)
          : {
              summary: '',
              tips: '',
              meals: [
                { name: t('app.plan_edit.breakfast'), time: '08:00', options: [emptyOption()] },
                { name: t('app.plan_edit.lunch'), time: '13:00', options: [emptyOption()] },
                { name: t('app.plan_edit.snack'), time: '16:30', options: [emptyOption()] },
                { name: t('app.plan_edit.dinner'), time: '19:30', options: [emptyOption()] },
              ],
            },
      );
  }, [q.isSuccess, q.data, d, t]);

  const save = useMutation({
    mutationFn: () => api.put(`/admin/members/${id}/nutrition-plan`, { content: toContent(d!) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coach', 'plan', id] });
      router.back();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/admin/members/${id}/nutrition-plan`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coach', 'plan', id] });
      router.back();
    },
  });

  const setMeal = (i: number, patch: Partial<Meal>) =>
    setD((x) => x && { ...x, meals: x.meals.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setOption = (i: number, k: number, patch: Partial<Option>) =>
    setMeal(i, {
      options: d!.meals[i]!.options.map((o, j) => (j === k ? { ...o, ...patch } : o)),
    });
  const content = d ? toContent(d) : null;
  const valid =
    !!content &&
    content.summary.length > 0 &&
    content.meals.length >= 2 &&
    content.meals.every((m) => m.name && m.options.length >= 1);

  return (
    <Screen>
      <BackHeader title={t('app.plan_edit.title')} />
      {name ? <Text style={type.bodySm}>{name}</Text> : null}
      {!d ? (
        <Skeleton height={300} />
      ) : (
        <>
          <Card style={{ gap: 8 }}>
            <Text style={type.label}>{t('app.plan_edit.summary')}</Text>
            <TextInput
              value={d.summary}
              onChangeText={(v) => setD({ ...d, summary: v })}
              placeholder={t('app.plan_edit.summary_hint')}
              placeholderTextColor={color.text.muted}
              multiline
              maxLength={600}
              style={[styles.input, { minHeight: 70 }]}
            />
          </Card>

          {d.meals.map((m, i) => (
            <Card key={i} style={{ gap: 10 }}>
              <View style={styles.row}>
                <TextInput
                  value={m.name}
                  onChangeText={(v) => setMeal(i, { name: v })}
                  maxLength={60}
                  style={[styles.input, { flex: 1, fontFamily: fonts.semibold }]}
                  accessibilityLabel={t('app.plan_edit.meal_name')}
                />
                <TextInput
                  value={m.time}
                  onChangeText={(v) => setMeal(i, { time: v })}
                  maxLength={20}
                  style={[styles.input, { width: 80, textAlign: 'center' }]}
                  accessibilityLabel={t('app.plan_edit.time')}
                />
                {d.meals.length > 2 && (
                  <Pressable
                    onPress={() => setD({ ...d, meals: d.meals.filter((_, j) => j !== i) })}
                    accessibilityRole="button"
                    accessibilityLabel={t('app.plan_edit.remove_meal')}
                    hitSlop={8}
                  >
                    <Trash2 size={20} color={color.text.muted} />
                  </Pressable>
                )}
              </View>
              {m.options.map((o, k) => (
                <View key={k} style={[styles.option, k > 0 && styles.divider]}>
                  <View style={styles.row}>
                    <Text style={[type.label, { flex: 1 }]}>
                      {t('app.plan_edit.option', { n: k + 1 })}
                    </Text>
                    {m.options.length > 1 && (
                      <Pressable
                        onPress={() => setMeal(i, { options: m.options.filter((_, j) => j !== k) })}
                        accessibilityRole="button"
                        accessibilityLabel={t('app.plan_edit.remove_option')}
                        hitSlop={8}
                      >
                        <Trash2 size={18} color={color.text.muted} />
                      </Pressable>
                    )}
                  </View>
                  <TextInput
                    value={o.title}
                    onChangeText={(v) => setOption(i, k, { title: v })}
                    placeholder={t('app.plan_edit.option_title')}
                    placeholderTextColor={color.text.muted}
                    maxLength={100}
                    style={styles.input}
                  />
                  <TextInput
                    value={o.ingredients}
                    onChangeText={(v) => setOption(i, k, { ingredients: v })}
                    placeholder={t('app.plan_edit.ingredients')}
                    placeholderTextColor={color.text.muted}
                    multiline
                    style={styles.input}
                  />
                  <View style={styles.row}>
                    <TextInput
                      value={o.kcal}
                      onChangeText={(v) => setOption(i, k, { kcal: v.replace(/[^0-9]/g, '') })}
                      placeholder="kcal"
                      placeholderTextColor={color.text.muted}
                      keyboardType="number-pad"
                      style={[styles.input, { flex: 1 }]}
                      accessibilityLabel="kcal"
                    />
                    <TextInput
                      value={o.protein}
                      onChangeText={(v) => setOption(i, k, { protein: v.replace(/[^0-9]/g, '') })}
                      placeholder={t('app.plan_edit.protein')}
                      placeholderTextColor={color.text.muted}
                      keyboardType="number-pad"
                      style={[styles.input, { flex: 1 }]}
                      accessibilityLabel={t('app.plan_edit.protein')}
                    />
                  </View>
                </View>
              ))}
              {m.options.length < 3 && (
                <Pressable
                  onPress={() => setMeal(i, { options: [...m.options, emptyOption()] })}
                  accessibilityRole="button"
                  style={styles.add}
                >
                  <Plus size={16} color={color.accent[400]} />
                  <Text style={styles.addText}>{t('app.plan_edit.add_option')}</Text>
                </Pressable>
              )}
            </Card>
          ))}
          {d.meals.length < 6 && (
            <Button
              label={t('app.plan_edit.add_meal')}
              icon={Plus}
              variant="secondary"
              onPress={() =>
                setD({
                  ...d,
                  meals: [...d.meals, { name: '', time: '', options: [emptyOption()] }],
                })
              }
            />
          )}

          <Card style={{ gap: 8 }}>
            <Text style={type.label}>{t('app.plan_edit.tips')}</Text>
            <TextInput
              value={d.tips}
              onChangeText={(v) => setD({ ...d, tips: v })}
              placeholder={t('app.plan_edit.tips_hint')}
              placeholderTextColor={color.text.muted}
              multiline
              style={[styles.input, { minHeight: 70 }]}
            />
          </Card>

          {save.error || remove.error ? (
            <ErrorNote
              message={
                (save.error ?? remove.error) instanceof ApiError
                  ? (save.error ?? remove.error)!.message
                  : 'errors.internal'
              }
            />
          ) : null}
          {!valid && <Text style={type.bodySm}>{t('app.plan_edit.incomplete')}</Text>}
          <Button
            label={t('app.plan_edit.save')}
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!valid}
          />
          {q.data && (
            <Button
              label={t('app.plan_edit.delete')}
              variant="ghost"
              onPress={() => remove.mutate()}
              loading={remove.isPending}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  option: { gap: 8, paddingTop: 4 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle, paddingTop: 10 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  addText: { color: color.accent[400], fontFamily: fonts.semibold, fontSize: 14 },
});
