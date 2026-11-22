import type { MessageDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SendHorizontal } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

/**
 * F14-3: one conversation (member with trainer, or trainer with client). Checks for new messages
 * every 5 seconds while open; opening it marks the other side's messages as read.
 */
export function Chat({
  title,
  path,
  canWrite = true,
}: {
  title: string;
  /** e.g. /me/conversations/<trainerId>/messages or /admin/my-conversations/<memberId>/messages */
  path: string;
  canWrite?: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const q = useQuery({
    queryKey: ['chat', path],
    queryFn: () => api.get<MessageDto[]>(path),
    refetchInterval: 5000,
  });
  const send = useMutation({
    mutationFn: (body: string) => api.post<MessageDto>(path, { body }),
    onSuccess: (m) => {
      setText('');
      qc.setQueryData<MessageDto[]>(['chat', path], (old) => [...(old ?? []), m]);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  }, [q.data?.length, qc]);

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <BackHeader title={title} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        {q.isPending ? (
          <Skeleton height={240} />
        ) : (
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          >
            {!q.data?.length && <Text style={styles.empty}>{t('app.chat.empty')}</Text>}
            {q.data?.map((m) => (
              <View key={m.id} style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.body, m.mine && { color: color.onAccent }]}>{m.body}</Text>
                <Text style={[styles.time, m.mine && styles.timeMine]}>
                  {f.dateTime(m.createdAt)}
                  {m.mine && m.readAt ? ` · ${t('app.chat.seen')}` : ''}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
        {send.error ? (
          <ErrorNote
            message={send.error instanceof ApiError ? send.error.message : 'errors.internal'}
          />
        ) : null}
        {canWrite ? (
          <View style={styles.compose}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('app.chat.placeholder')}
              placeholderTextColor={color.text.muted}
              multiline
              maxLength={2000}
              style={styles.input}
              accessibilityLabel={t('app.chat.placeholder')}
            />
            <Pressable
              onPress={() => text.trim() && send.mutate(text.trim())}
              disabled={!text.trim() || send.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('app.chat.send')}
              style={[styles.send, (!text.trim() || send.isPending) && { opacity: 0.4 }]}
            >
              <SendHorizontal size={22} color={color.onAccent} />
            </Pressable>
          </View>
        ) : (
          <Text style={styles.closed}>{t('app.chat.closed')}</Text>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingVertical: 12 },
  empty: { ...type.bodySm, textAlign: 'center', paddingVertical: 24 },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 4,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: color.accent[500], borderBottomRightRadius: 4 },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: color.bg.surface2,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: color.text.primary },
  time: { fontFamily: fonts.medium, fontSize: 11, color: color.text.muted },
  timeMine: { color: 'rgba(8,8,8,0.6)', textAlign: 'right' },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingVertical: 8 },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.lg,
    backgroundColor: color.bg.surface2,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  closed: { ...type.bodySm, textAlign: 'center', paddingVertical: 12 },
});
