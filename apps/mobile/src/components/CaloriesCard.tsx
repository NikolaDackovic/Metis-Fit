import type { FoodDayDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Flame, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { localDay, mealNow } from '@/lib/food';
import { color, fonts, type } from '@/theme';

/** F15-2 on Home: today's calories against the goal, one tap to the diary or to add food. */
export function CaloriesCard() {
  const { t } = useTranslation();
  const day = localDay(new Date());
  const q = useQuery({
    queryKey: ['me', 'food-log', day],
    queryFn: () => api.get<FoodDayDto>('/me/food-log', { date: day }),
  });
  if (!q.data) return null;
  const eaten = Math.round(q.data.totals.kcal);
  const goal = q.data.targets?.kcal ? Math.round(q.data.targets.kcal) : null;
  const share = goal ? Math.min(1, eaten / goal) : 0;
  const over = goal != null && eaten > goal;
  return (
    <Card style={{ gap: 10 }}>
      <Pressable
        onPress={() => router.push('/food-log')}
        accessibilityRole="link"
        style={styles.head}
      >
        <Flame size={18} color={color.accent[400]} />
        <Text style={[type.label, { flex: 1 }]}>{t('app.food.today_card')}</Text>
        <Pressable
          onPress={() => router.push({ pathname: '/food-add', params: { meal: mealNow(), day } })}
          accessibilityRole="button"
          accessibilityLabel={t('app.food.add')}
          hitSlop={8}
          style={styles.add}
        >
          <Plus size={18} color={color.onAccent} />
        </Pressable>
      </Pressable>
      <Pressable
        onPress={() => router.push('/food-log')}
        accessibilityRole="link"
        style={{ gap: 8 }}
      >
        <View style={styles.numbers}>
          <Text style={[styles.big, over && { color: color.status.danger }]}>{eaten}</Text>
          <Text style={type.bodySm}>
            {goal ? t('app.food.of_target', { target: goal }) : t('app.food.kcal')}
          </Text>
          {goal != null && (
            <Text style={[styles.left, over && { color: color.status.danger }]}>
              {over
                ? t('app.food.over_by', { kcal: eaten - goal })
                : t('app.food.left_n', { kcal: goal - eaten })}
            </Text>
          )}
        </View>
        {goal != null && (
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${share * 100}%`,
                  backgroundColor: over ? color.status.danger : color.accent[500],
                },
              ]}
            />
          </View>
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  add: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  numbers: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  big: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  left: { marginStart: 'auto', fontFamily: fonts.semibold, fontSize: 13, color: color.accent[400] },
  track: { height: 8, borderRadius: 4, backgroundColor: color.bg.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
