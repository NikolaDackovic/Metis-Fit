import type { MyVisitNowDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { DoorOpen, KeyRound, LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';
import { Button, Card } from './ui';

export function useMyVisit() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['me', 'visit', i18n.language],
    queryFn: () => api.get<MyVisitNowDto | null>('/me/visit', { locale: i18n.language }),
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

/** Shown while the member is inside: since when, their locker, and "I'm leaving". */
export function VisitCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const visit = useMyVisit();
  const [confirm, setConfirm] = useState(false);
  const checkout = useMutation({
    mutationFn: () => api.post('/me/visit/checkout'),
    onSuccess: () => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['me', 'visit'] });
    },
  });
  const v = visit.data;
  if (!v) return null;
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={[type.h3, { flex: 1 }]}>
          {t('app.visit.inside', { time: f.time(v.startedAt) })}
        </Text>
      </View>
      {v.locker ? (
        <View style={styles.locker}>
          <KeyRound size={22} color={color.accent[400]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.label} numberOfLines={1}>
              {v.locker.roomName}
            </Text>
            <Text style={styles.number} numberOfLines={1}>
              {t('app.visit.locker_n', { n: v.locker.number })}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/locker')}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.change}
          >
            <Text style={styles.changeText}>{t('app.visit.change')}</Text>
          </Pressable>
        </View>
      ) : (
        <Button
          label={t('app.visit.pick_locker')}
          icon={DoorOpen}
          onPress={() => router.push('/locker')}
        />
      )}
      {confirm ? (
        <View style={{ gap: 8 }}>
          <Text style={type.bodySm}>{t('app.visit.checkout_confirm')}</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => setConfirm(false)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t('app.visit.checkout')}
                loading={checkout.isPending}
                onPress={() => checkout.mutate()}
              />
            </View>
          </View>
        </View>
      ) : (
        <Button
          label={t('app.visit.checkout')}
          variant="secondary"
          icon={LogOut}
          onPress={() => setConfirm(true)}
        />
      )}
      <Text style={styles.hint}>{t('app.visit.auto_close', { time: f.time(v.autoCloseAt) })}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderColor: `${color.status.success}55` },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.status.success },
  locker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
  },
  number: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  changeText: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: color.text.muted, textAlign: 'center' },
});
