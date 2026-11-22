import type { MyPausesDto, PauseDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { PauseCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

const STATUS_COLOR: Record<PauseDto['status'], string> = {
  requested: color.status.warning,
  approved: color.status.success,
  rejected: color.status.danger,
  cancelled: color.text.muted,
};

export function useMyPauses() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['me', 'pauses', i18n.language],
    queryFn: () => api.get<MyPausesDto>('/me/pauses', { locale: i18n.language }),
  });
}

/**
 * F13-2 on the membership tab: how much pausing the plan still allows, the member's pauses and
 * the way to ask for a new one. Hidden when the plan does not offer pausing and nothing is open.
 */
export function PauseCard() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useMyPauses();
  const withdraw = useMutation({
    mutationFn: (id: string) => api.post(`/me/pauses/${id}/cancel?locale=${i18n.language}`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'pauses'] }),
  });
  const d = q.data;
  if (!d) return null;
  const recent = d.items.filter((p) => p.status !== 'cancelled').slice(0, 3);
  const a = d.allowance[0];
  if (!a && recent.length === 0) return null;
  const day = (s: string) => f.date(s, { day: 'numeric', month: 'short' });

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.head}>
        <PauseCircle size={20} color={color.accent[400]} />
        <Text style={[type.h3, { flex: 1 }]}>{t('app.pause.title')}</Text>
      </View>
      {a ? (
        <Text style={type.bodySm}>
          {t('app.pause.left', {
            days: Math.max(0, a.maxDays - a.usedDays),
            pauses: Math.max(0, a.maxPauses - a.usedPauses),
          })}
        </Text>
      ) : null}
      {recent.map((p) => (
        <View key={p.id} style={styles.item}>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>
              {day(p.startsOn)} - {day(p.endsOn)}
            </Text>
            <Text style={[styles.status, { color: STATUS_COLOR[p.status] }]}>
              {t(`app.pause.status.${p.status}`)}
            </Text>
          </View>
          {p.status === 'requested' && (
            <Button
              label={t('app.pause.withdraw')}
              variant="ghost"
              onPress={() => withdraw.mutate(p.id)}
              loading={withdraw.isPending && withdraw.variables === p.id}
            />
          )}
        </View>
      ))}
      {a && a.maxDays - a.usedDays > 0 && a.maxPauses - a.usedPauses > 0 ? (
        <Button
          label={t('app.pause.cta')}
          variant="secondary"
          icon={PauseCircle}
          onPress={() => router.push('/pause')}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: color.border.subtle,
    paddingTop: 10,
    borderRadius: radius.sm,
  },
  status: { fontFamily: fonts.semibold, fontSize: 13 },
});
