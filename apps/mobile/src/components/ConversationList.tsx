import type { ConversationDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, type } from '@/theme';

export function useConversations(
  path: '/me/conversations' | '/admin/my-conversations',
  enabled = true,
) {
  return useQuery({
    queryKey: ['conversations', path],
    queryFn: () => api.get<ConversationDto[]>(path),
    refetchInterval: 30_000,
    enabled,
  });
}

/** F14-3: list of conversations (my trainers, or my clients), unread ones first in weight. */
export function ConversationList({
  path,
  emptyTitle,
  onOpen,
}: {
  path: '/me/conversations' | '/admin/my-conversations';
  emptyTitle: string;
  onOpen: (c: ConversationDto) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useConversations(path);
  if (q.isPending) return <Skeleton height={160} />;
  if (!q.data?.length)
    return (
      <Card>
        <EmptyState icon={MessageCircle} title={emptyTitle} />
      </Card>
    );
  return (
    <Card style={{ paddingVertical: 4 }}>
      {q.data.map((c, i) => (
        <Pressable
          key={c.id}
          onPress={() => onOpen(c)}
          accessibilityRole="button"
          accessibilityLabel={
            c.unread ? `${c.name}, ${t('app.chat.unread', { count: c.unread })}` : c.name
          }
          style={[styles.row, i > 0 && styles.divider]}
        >
          {c.photoUrl ? (
            <Image source={{ uri: c.photoUrl }} style={styles.photo} />
          ) : (
            <View style={styles.photo}>
              <Text style={styles.initials}>
                {c.name
                  .split(' ')
                  .map((p) => p.charAt(0))
                  .join('')
                  .slice(0, 2)}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.body, c.unread > 0 && { fontFamily: fonts.bold }]} numberOfLines={1}>
              {c.name}
            </Text>
            <Text style={type.bodySm} numberOfLines={1}>
              {c.lastMessage ?? t('app.chat.start')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {c.lastAt && (
              <Text style={styles.when}>
                {f.date(c.lastAt, { day: 'numeric', month: 'short' })}
              </Text>
            )}
            {c.unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{c.unread > 9 ? '9+' : c.unread}</Text>
              </View>
            )}
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  photo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: color.accent[400], fontFamily: fonts.bold, fontSize: 15 },
  when: { fontFamily: fonts.medium, fontSize: 12, color: color.text.muted },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: color.onAccent },
});
