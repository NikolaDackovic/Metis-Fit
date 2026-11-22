import type { WorkoutPlanDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ClipboardList, Play } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, SectionTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/training';
import { useWorkout } from '@/lib/workout-store';
import { color, fonts, radius, type } from '@/theme';

/** The plan the member's trainer wrote: pick a day, start it as a pre-filled workout. */
export function PlanSection() {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ['me', 'workout-plans', i18n.language],
    queryFn: () => api.get<WorkoutPlanDto[]>('/me/workout-plans', { locale: i18n.language }),
  });
  if (!q.data?.length) return null;
  return (
    <>
      <SectionTitle>{t('app.plan.title')}</SectionTitle>
      {q.data.map((p) => (
        <PlanCard key={p.id} plan={p} />
      ))}
    </>
  );
}

function PlanCard({ plan }: { plan: WorkoutPlanDto }) {
  const { t } = useTranslation();
  const [day, setDay] = useState(0);
  const d = plan.days[day];
  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.row}>
        <ClipboardList size={20} color={color.accent[400]} />
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>{plan.title}</Text>
          {plan.trainerName && (
            <Text style={type.bodySm}>{t('app.plan.by', { name: plan.trainerName })}</Text>
          )}
        </View>
      </View>
      {plan.notes && <Text style={type.bodySm}>{plan.notes}</Text>}
      <View style={styles.days} accessibilityRole="tablist">
        {plan.days.map((x, i) => (
          <Pressable
            key={`${x.title}-${i}`}
            onPress={() => setDay(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === day }}
            style={[styles.day, i === day && styles.dayActive]}
          >
            <Text
              style={[styles.dayText, i === day && { color: color.text.primary }]}
              numberOfLines={1}
            >
              {x.title}
            </Text>
          </Pressable>
        ))}
      </View>
      {d && d.items.length > 0 ? (
        <>
          {d.items.map((it, i) => (
            <View key={`${it.exerciseId}-${i}`} style={styles.item}>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {it.exerciseName}
              </Text>
              <Text style={styles.prescription}>
                {[
                  it.sets && it.reps ? `${it.sets} × ${it.reps}` : (it.sets ?? it.reps),
                  it.weightNote,
                  it.restS ? `⏱ ${formatDuration(it.restS)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          ))}
          <Button
            label={t('app.plan.start_day')}
            icon={Play}
            onPress={() => {
              useWorkout
                .getState()
                .startFromPlan(d.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets })));
              router.push('/workout');
            }}
          />
        </>
      ) : (
        <Text style={type.bodySm}>{t('app.plan.rest_day')}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  dayActive: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  dayText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  prescription: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: color.text.secondary,
    fontVariant: ['tabular-nums'],
  },
});
