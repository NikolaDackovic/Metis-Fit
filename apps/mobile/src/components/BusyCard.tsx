import type { BusyLevel, GymBusyDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

const LEVEL_COLOR: Record<BusyLevel, string> = {
  low: color.status.success,
  medium: color.status.warning,
  high: color.status.danger,
};
const CHART_H = 64;

/**
 * F13-1 "How busy is the gym": people inside now and the usual crowd per hour today, so members
 * can pick a quiet time. Hidden when the gym turned it off. Refreshes every minute.
 */
export function BusyCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['busy'],
    queryFn: () => api.get<GymBusyDto>('/public/occupancy'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const d = q.data;
  if (!d?.visible || d.now === null) return null;
  const peak = Math.max(1, ...d.typical.map((x) => x.people));

  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.head}>
        <Users size={18} color={color.accent[400]} />
        <Text style={[type.label, { flex: 1 }]}>{t('app.busy.title')}</Text>
        {d.level && (
          <View style={[styles.pill, { borderColor: LEVEL_COLOR[d.level] }]}>
            <View style={[styles.dot, { backgroundColor: LEVEL_COLOR[d.level] }]} />
            <Text style={[styles.pillText, { color: LEVEL_COLOR[d.level] }]}>
              {t(`app.busy.level.${d.level}`)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.nowRow}>
        <Text style={styles.big}>{f.number(d.now)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={type.body}>{t('app.busy.now_label')}</Text>
          {d.capacity ? (
            <Text style={type.bodySm}>
              {t('app.busy.of_capacity', {
                capacity: f.number(d.capacity),
                percent: f.number(Math.min(100, Math.round((d.now / d.capacity) * 100))),
              })}
            </Text>
          ) : null}
        </View>
      </View>

      {d.typical.length === 0 || peak <= 1 ? (
        <Text style={type.bodySm}>{t('app.busy.no_history')}</Text>
      ) : (
        <View>
          <Text style={[type.bodySm, { marginBottom: 8 }]}>{t('app.busy.typical')}</Text>
          <View style={styles.chart} accessible accessibilityLabel={t('app.busy.chart_label')}>
            {d.typical.map((x) => {
              const isNow = x.hour === d.currentHour;
              return (
                <View key={x.hour} style={styles.col}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(3, (x.people / peak) * CHART_H),
                        backgroundColor: isNow ? color.accent[500] : color.border.strong,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.axis}>
            {d.typical.map((x) => (
              <Text
                key={x.hour}
                style={[styles.tick, x.hour === d.currentHour && styles.tickNow]}
                numberOfLines={1}
              >
                {x.hour % 3 === 0 ? String(x.hour) : ''}
              </Text>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  big: { fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 44, color: color.text.primary },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, gap: 3 },
  col: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  axis: { flexDirection: 'row', gap: 3, marginTop: 4 },
  tick: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 10,
    color: color.text.muted,
    overflow: 'visible',
  },
  tickNow: { color: color.accent[400], fontFamily: fonts.semibold },
});
