import type { ClientProgressDto } from '@grit/validation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Lock, Salad, Target, Trophy, ClipboardList } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { AssignTemplate } from '@/components/coach/AssignTemplate';
import { ClientPhotos } from '@/components/coach/ClientPhotos';
import { Button, Card, EmptyState, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, type } from '@/theme';

/**
 * F14-1: a client's progress for their trainer: numbers, latest measurement, goals, records and
 * recent workouts. Only when the client shares their progress with the trainer.
 */
export default function CoachClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['coach', 'client', id, i18n.language],
    queryFn: () =>
      api.get<ClientProgressDto>(`/admin/members/${id}/progress`, { locale: i18n.language }),
    retry: false,
  });
  const d = q.data;
  const [assign, setAssign] = useState(false);
  const blocked = q.error instanceof ApiError && (q.error.status === 403 || q.error.status === 422);
  const m = d?.progress.latestMeasurement;

  return (
    <Screen>
      <BackHeader
        title={d ? `${d.member.firstName} ${d.member.lastName}` : t('app.coach.client')}
      />
      {/* The trainer's tools for this client (available even when progress is not shared). */}
      <Button
        label={t('app.plan_edit.open')}
        icon={Salad}
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: '/coach/plan/[id]',
            params: { id, name: d ? `${d.member.firstName} ${d.member.lastName}` : '' },
          })
        }
      />
      <Button
        label={t('app.coach.give_program')}
        icon={ClipboardList}
        variant="secondary"
        onPress={() => setAssign(true)}
      />
      {assign && (
        <AssignTemplate
          memberId={id}
          name={d ? `${d.member.firstName} ${d.member.lastName}` : ''}
          onClose={() => setAssign(false)}
        />
      )}
      {q.isPending ? (
        <Skeleton height={300} />
      ) : !d ? (
        <Card>
          <EmptyState
            icon={Lock}
            title={t(blocked ? 'app.coach.not_shared' : 'errors.internal')}
            text={blocked ? t('app.coach.not_shared_text') : undefined}
          />
        </Card>
      ) : (
        <>
          <ClientPhotos memberId={id} />
          <View style={styles.stats}>
            <Stat label={t('app.progress.total')} value={String(d.progress.totalWorkouts)} />
            <Stat label={t('app.progress.last30')} value={String(d.progress.last30Days)} />
            <Stat label={t('app.coach.streak')} value={String(d.progress.streakWeeks)} />
          </View>

          {m && (
            <Card style={{ gap: 6 }}>
              <Text style={type.label}>
                {t('app.coach.last_measure', {
                  date: f.date(m.measuredOn, { day: 'numeric', month: 'short' }),
                })}
              </Text>
              <Text style={type.body}>
                {[
                  m.weightKg != null ? `${f.number(m.weightKg)} kg` : null,
                  m.bodyFatPct != null ? `${f.number(m.bodyFatPct)}% ${t('app.coach.fat')}` : null,
                  m.waistCm != null ? `${t('app.coach.waist')} ${f.number(m.waistCm)} cm` : null,
                  m.bmi != null ? `BMI ${f.number(m.bmi)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Card>
          )}

          {d.goals.length > 0 && (
            <>
              <SectionTitle>{t('app.coach.goals')}</SectionTitle>
              <Card style={{ gap: 10 }}>
                {d.goals.map((g) => (
                  <View key={g.id} style={styles.line}>
                    <Target
                      size={16}
                      color={g.status === 'achieved' ? color.status.success : color.accent[400]}
                    />
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>
                      {g.title ??
                        g.exerciseName ??
                        t(`app.progress.goal_kinds.${g.kind}`, { defaultValue: g.kind })}
                    </Text>
                    <Text style={type.bodySm}>
                      {g.currentValue ?? '-'} / {g.targetValue ?? '-'}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          {d.progress.records.length > 0 && (
            <>
              <SectionTitle>{t('app.progress.records')}</SectionTitle>
              <Card style={{ gap: 10 }}>
                {d.progress.records.slice(0, 5).map((r) => (
                  <View key={r.exerciseId} style={styles.line}>
                    <Trophy size={16} color={color.accent[400]} />
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.value}>
                      {r.bestWeightKg != null ? `${f.number(r.bestWeightKg)} kg` : '-'}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          <SectionTitle>{t('app.coach.recent')}</SectionTitle>
          {d.recentWorkouts.length === 0 ? (
            <Text style={type.bodySm}>{t('app.coach.no_workouts')}</Text>
          ) : (
            <Card style={{ gap: 10 }}>
              {d.recentWorkouts.slice(0, 8).map((w) => (
                <View key={w.id} style={{ gap: 2 }}>
                  <Text style={type.body}>{f.dateTime(w.startedAt)}</Text>
                  <Text style={type.bodySm} numberOfLines={1}>
                    {w.exercises.map((e) => e.name).join(', ') || '-'}
                  </Text>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.bodySm} numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, gap: 2, paddingVertical: 12 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 24, color: color.text.primary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { fontFamily: fonts.bold, fontSize: 15, color: color.text.primary },
});
