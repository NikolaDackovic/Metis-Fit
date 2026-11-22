import type { CalendarFeedDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarPlus, Copy, RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Button, Card, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError, API_URL } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, type } from '@/theme';

/**
 * F14-8: subscribe the phone calendar once; booked classes and sessions with a trainer then show
 * up there and update by themselves. The link is secret, so it is shown only right after it is made.
 */
export default function CalendarScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: ['me', 'calendar-feed'],
    queryFn: () => api.get<CalendarFeedDto>('/me/calendar-feed'),
  });
  const create = useMutation({
    mutationFn: () => api.post<CalendarFeedDto>('/me/calendar-feed'),
    onSuccess: (d) => qc.setQueryData(['me', 'calendar-feed'], d),
  });
  const remove = useMutation({
    mutationFn: () => api.del('/me/calendar-feed'),
    onSuccess: () => {
      create.reset();
      void qc.invalidateQueries({ queryKey: ['me', 'calendar-feed'] });
    },
  });
  const token = create.data?.token ?? null;
  const https = token ? `${API_URL}/public/calendar/${token}/feed.ics` : null;
  const webcal = https?.replace(/^https?:\/\//, 'webcal://') ?? null;
  const error = create.error ?? remove.error ?? q.error;

  const copy = async () => {
    if (!https) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(https);
      setCopied(true);
    } else {
      await Share.share({ message: https });
    }
  };

  return (
    <Screen>
      <BackHeader title={t('app.calendar.title')} />
      <Text style={type.bodySm}>{t('app.calendar.hint')}</Text>
      {q.isPending ? (
        <Skeleton height={180} />
      ) : https && webcal ? (
        <Card style={{ gap: 12 }}>
          <View style={styles.head}>
            <CalendarCheck size={22} color={color.status.success} />
            <Text style={[type.h3, { flex: 1 }]}>{t('app.calendar.ready')}</Text>
          </View>
          <Text style={type.bodySm}>{t('app.calendar.ready_text')}</Text>
          <Button label={t('app.calendar.add')} onPress={() => void Linking.openURL(webcal)} />
          <Button
            label={copied ? t('app.calendar.copied') : t('app.calendar.copy')}
            variant="secondary"
            onPress={() => void copy()}
          />
          <Text style={styles.note}>{t('app.calendar.google')}</Text>
          <Text style={styles.note}>{t('app.calendar.secret')}</Text>
        </Card>
      ) : q.data?.active ? (
        <Card style={{ gap: 12 }}>
          <View style={styles.head}>
            <CalendarCheck size={22} color={color.status.success} />
            <Text style={[type.h3, { flex: 1 }]}>{t('app.calendar.on')}</Text>
          </View>
          <Text style={type.bodySm}>
            {t('app.calendar.on_text', {
              date: q.data.createdAt ? f.date(q.data.createdAt.slice(0, 10)) : '',
            })}
          </Text>
          <Button
            label={t('app.calendar.new_link')}
            variant="secondary"
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
          <Button
            label={t('app.calendar.off')}
            variant="ghost"
            loading={remove.isPending}
            onPress={() => remove.mutate()}
          />
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <View style={styles.head}>
            <CalendarPlus size={22} color={color.accent[400]} />
            <Text style={[type.h3, { flex: 1 }]}>{t('app.calendar.offer')}</Text>
          </View>
          <View style={styles.points}>
            <View style={styles.point}>
              <RefreshCw size={16} color={color.text.secondary} />
              <Text style={[type.bodySm, { flex: 1 }]}>{t('app.calendar.point_auto')}</Text>
            </View>
            <View style={styles.point}>
              <Copy size={16} color={color.text.secondary} />
              <Text style={[type.bodySm, { flex: 1 }]}>{t('app.calendar.point_apps')}</Text>
            </View>
          </View>
          <Button
            label={t('app.calendar.turn_on')}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
        </Card>
      )}
      {error && (
        <ErrorNote message={error instanceof ApiError ? error.message : 'errors.internal'} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  points: { gap: 8 },
  point: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  note: { fontFamily: fonts.regular, fontSize: 13, color: color.text.muted },
});
