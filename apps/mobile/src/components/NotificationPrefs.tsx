import type { NotificationPreferencesDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Toggle } from '@/components/Toggle';
import { Card, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { pushSupported } from '@/lib/push';
import { color, type } from '@/theme';

/** Push and per-category notification switches (also shown in Profile). */
export function NotificationPrefs() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['me', 'notification-preferences'];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.get<NotificationPreferencesDto>('/me/notification-preferences'),
  });
  const save = useMutation({
    mutationFn: (patch: Partial<NotificationPreferencesDto>) =>
      api.put<NotificationPreferencesDto>('/me/notification-preferences', patch),
    onMutate: (patch) => {
      const prev = qc.getQueryData<NotificationPreferencesDto>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  if (!q.data) return <Skeleton height={220} />;
  const rows: Array<{ k: keyof NotificationPreferencesDto; label: string; hint: string }> = [
    ...(pushSupported
      ? [
          {
            k: 'pushEnabled' as const,
            label: t('app.notifications.push'),
            hint: t('app.notifications.push_hint'),
          },
        ]
      : []),
    {
      k: 'membership',
      label: t('app.notifications.membership'),
      hint: t('app.notifications.membership_hint'),
    },
    {
      k: 'classes',
      label: t('app.notifications.classes'),
      hint: t('app.notifications.classes_hint'),
    },
    { k: 'club', label: t('app.notifications.club'), hint: t('app.notifications.club_hint') },
    {
      k: 'coaching',
      label: t('app.notifications.coaching'),
      hint: t('app.notifications.coaching_hint'),
    },
    {
      k: 'marketing',
      label: t('app.notifications.marketing'),
      hint: t('app.notifications.marketing_hint'),
    },
  ];
  return (
    <Card style={{ gap: 0, paddingVertical: 4 }}>
      {rows.map((r, i) => (
        <View key={r.k} style={[styles.pref, i > 0 && styles.divider]}>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{r.label}</Text>
            <Text style={type.bodySm}>{r.hint}</Text>
          </View>
          <Toggle
            value={q.data[r.k]}
            onValueChange={(v) => save.mutate({ [r.k]: v })}
            accessibilityLabel={r.label}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  pref: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
