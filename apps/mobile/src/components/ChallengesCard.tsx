import type { MyChallengeDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Trophy } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

/** The name of a challenge: its own title, else "12 visits this month" in the reader's language. */
export function useChallengeName() {
  const { t } = useTranslation();
  return (c: Pick<MyChallengeDto, 'title' | 'kind' | 'period' | 'target'>) =>
    c.title || t(`app.challenges.name.${c.kind}_${c.period}`, { count: c.target });
}

/**
 * F13-4 on the home screen: this week's and this month's challenges with a progress bar.
 * Points are given by the server when the target is reached (and a notification is sent).
 */
export function ChallengesCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const name = useChallengeName();
  const q = useQuery({
    queryKey: ['me', 'challenges'],
    queryFn: () => api.get<MyChallengeDto[]>('/me/challenges'),
    staleTime: 60_000,
  });
  if (!q.data?.length) return null;

  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.head}>
        <Trophy size={18} color={color.accent[400]} />
        <Text style={[type.label, { flex: 1 }]}>{t('app.challenges.title')}</Text>
      </View>
      {q.data.map((c) => {
        const pct = Math.min(1, c.progress / c.target);
        return (
          <View key={c.id} style={{ gap: 6 }}>
            <View style={styles.row}>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>
                {name(c)}
              </Text>
              {c.completed ? (
                <View style={styles.done}>
                  <CheckCircle2 size={14} color={color.status.success} />
                  <Text style={styles.doneText}>{t('app.challenges.done')}</Text>
                </View>
              ) : c.rewardPoints > 0 ? (
                <Text style={styles.reward}>
                  {t('app.challenges.reward', { points: f.number(c.rewardPoints) })}
                </Text>
              ) : null}
            </View>
            <View
              style={styles.track}
              accessible
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: c.target, now: c.progress }}
            >
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.max(pct * 100, c.progress > 0 ? 4 : 0)}%`,
                    backgroundColor: c.completed ? color.status.success : color.accent[500],
                  },
                ]}
              />
            </View>
            <Text style={type.bodySm}>
              {f.number(c.progress)} / {f.number(c.target)} ·{' '}
              {t('app.challenges.ends', {
                date: f.date(c.periodEnd, { day: 'numeric', month: 'short' }),
              })}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reward: { color: color.accent[400], fontFamily: fonts.semibold, fontSize: 13 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { color: color.status.success, fontFamily: fonts.semibold, fontSize: 13 },
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: color.border.subtle,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: radius.full },
});
