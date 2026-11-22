import type { NotificationListDto } from '@grit/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CheckCheck,
  Gift,
  IdCard,
  Megaphone,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NotificationPrefs } from '@/components/NotificationPrefs';
import { Card, EmptyState, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useNotifications, useNotificationText } from '@/lib/notifications';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

const ICON: Record<string, LucideIcon> = {
  membership_expiring: IdCard,
  membership_expired: IdCard,
  class_reminder: CalendarDays,
  waitlist_promoted: CalendarDays,
  class_cancelled: CalendarDays,
  birthday: Gift,
  announcement: Megaphone,
};

/** Inbox: everything the club sent, newest first. Opening the screen marks all as read. */
export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useNotifications();
  const text = useNotificationText();
  const readAll = useMutation({
    mutationFn: () => api.post<NotificationListDto>('/me/notifications/read', {}),
    onSuccess: (d) => qc.setQueryData(['me', 'notifications'], d),
  });
  const unread = q.data?.unread ?? 0;
  // Mark as read shortly after opening, so the unread dots are still visible for a moment.
  useEffect(() => {
    if (!unread) return;
    const id = setTimeout(() => readAll.mutate(), 1500);
    return () => clearTimeout(id);
  }, [unread]);

  return (
    <Screen edges={['top', 'bottom']} refreshing={q.isFetching} onRefresh={() => void q.refetch()}>
      <Pressable
        onPress={() => router.back()}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel={t('app.common.back')}
        hitSlop={8}
      >
        <ArrowLeft style={dirIcon} size={22} color={color.text.primary} />
      </Pressable>
      <View style={styles.titleRow}>
        <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
          {t('app.notifications.title')}
        </Text>
        {unread > 0 && (
          <Pressable
            onPress={() => readAll.mutate()}
            accessibilityRole="button"
            accessibilityLabel={t('app.notifications.mark_all')}
            hitSlop={8}
            style={styles.icon}
          >
            <CheckCheck size={20} color={color.text.secondary} />
          </Pressable>
        )}
      </View>

      {q.isPending ? (
        <Skeleton height={200} />
      ) : !q.data?.items.length ? (
        <Card>
          <EmptyState
            icon={Bell}
            title={t('app.notifications.empty')}
            text={t('app.notifications.empty_text')}
          />
        </Card>
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {q.data.items.map((n, i) => {
            const Icon = ICON[n.kind] ?? Bell;
            const m = text(n);
            return (
              <Pressable
                key={n.id}
                disabled={!n.link}
                onPress={() => n.link && router.push(n.link as never)}
                accessibilityRole={n.link ? 'link' : 'text'}
                style={[styles.item, i > 0 && styles.divider]}
              >
                <View style={styles.iconWrap}>
                  <Icon size={18} color={color.accent[400]} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.row}>
                    <Text style={[type.h3, { flex: 1, fontSize: 15 }]} numberOfLines={2}>
                      {m.title}
                    </Text>
                    {!n.readAt && <View style={styles.dot} accessibilityLabel="•" />}
                  </View>
                  {m.body ? <Text style={type.bodySm}>{m.body}</Text> : null}
                  <Text style={styles.when}>{f.dateTime(n.createdAt)}</Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      <SectionTitle>{t('app.notifications.settings')}</SectionTitle>
      <NotificationPrefs />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 24, lineHeight: 30, flex: 1 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent[500], marginTop: 6 },
  when: { fontFamily: fonts.regular, fontSize: 12, color: color.text.muted },
});
