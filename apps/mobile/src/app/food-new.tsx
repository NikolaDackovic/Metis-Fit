import type { FoodDto } from '@grit/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Button, Card, ErrorNote, Field, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { toNum } from '@/lib/food';
import { type } from '@/theme';

/**
 * F15-2 "New food": my own food with values per 100 g (as on the label) and a serving.
 * Saved privately; then it opens straight in "Add" so it can be logged right away.
 */
export default function FoodNewScreen() {
  const params = useLocalSearchParams<{
    meal?: string;
    day?: string;
    barcode?: string;
    name?: string;
  }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [servingG, setServingG] = useState('100');
  const [servingLabel, setServingLabel] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const nums = {
    servingG: toNum(servingG),
    kcal: toNum(kcal),
    p: toNum(p) ?? 0,
    c: toNum(c) ?? 0,
    f: toNum(f) ?? 0,
  };
  const macrosOk = nums.p + nums.c + nums.f <= 100.5;
  const valid =
    name.trim().length > 0 &&
    nums.servingG != null &&
    nums.servingG > 0 &&
    nums.servingG <= 2000 &&
    nums.kcal != null &&
    nums.kcal >= 0 &&
    nums.kcal <= 900 &&
    macrosOk &&
    (!barcode || /^[0-9]{6,14}$/.test(barcode));
  const save = useMutation({
    mutationFn: () =>
      api.post<FoodDto>('/me/foods', {
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: barcode || null,
        servingG: nums.servingG,
        servingLabel: servingLabel.trim() || null,
        kcal100: nums.kcal,
        protein100: nums.p,
        carbs100: nums.c,
        fat100: nums.f,
      }),
    onSuccess: (food) => {
      void qc.invalidateQueries({ queryKey: ['me', 'foods'] });
      router.replace({
        pathname: '/food-add',
        params: { meal: params.meal, day: params.day, foodId: food.id },
      });
    },
  });

  return (
    <Screen>
      <BackHeader title={t('app.food_new.title')} />
      <Text style={type.bodySm}>{t('app.food_new.hint')}</Text>
      <Card style={{ gap: 12 }}>
        <Field label={t('app.food_new.name')} value={name} onChangeText={setName} maxLength={120} />
        <Field
          label={t('app.food_new.brand')}
          value={brand}
          onChangeText={setBrand}
          maxLength={80}
        />
        <Field
          label={t('app.food_new.barcode')}
          value={barcode}
          onChangeText={(v) => setBarcode(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={14}
        />
      </Card>
      <Card style={{ gap: 12 }}>
        <Text style={type.label}>{t('app.food_new.per100')}</Text>
        <Field
          label="kcal"
          value={kcal}
          onChangeText={setKcal}
          keyboardType="decimal-pad"
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
              error={macrosOk ? null : 'validation.food_macros'}
            />
          </View>
        </View>
      </Card>
      <Card style={{ gap: 12 }}>
        <Text style={type.label}>{t('app.food_new.serving')}</Text>
        <View style={styles.inputs}>
          <View style={styles.cell}>
            <Field
              label={t('app.food_new.serving_g')}
              value={servingG}
              onChangeText={setServingG}
              keyboardType="decimal-pad"
              maxLength={6}
            />
          </View>
          <View style={[styles.cell, { flex: 2 }]}>
            <Field
              label={t('app.food_new.serving_label')}
              value={servingLabel}
              onChangeText={setServingLabel}
              placeholder={t('app.food_new.serving_label_hint')}
              maxLength={40}
            />
          </View>
        </View>
      </Card>
      {save.error && (
        <ErrorNote
          message={save.error instanceof ApiError ? save.error.message : 'errors.internal'}
        />
      )}
      <Button
        label={t('app.food_new.save')}
        disabled={!valid}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputs: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, flexBasis: 0, minWidth: 0 },
});
