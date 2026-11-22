import type { PendingRatingDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

/**
 * F13-7 "How was it?": after a group class or a personal session, rate it with a tap (1-5 stars)
 * and an optional comment. One at a time; "Later" hides it until the app is opened again.
 */
export function RateCard() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  const [thanks, setThanks] = useState(false);
  const q = useQuery({
    queryKey: ['me', 'ratings', 'pending', i18n.language],
    queryFn: () => api.get<PendingRatingDto[]>('/me/ratings/pending', { locale: i18n.language }),
    staleTime: 60_000,
  });
  const item = q.data?.find((x) => !hidden.includes(x.id));
  const send = useMutation({
    mutationFn: () =>
      api.post('/me/ratings', {
        kind: item!.kind,
        id: item!.id,
        stars,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      setThanks(true);
      setStars(0);
      setComment('');
      setTimeout(() => {
        setThanks(false);
        void qc.invalidateQueries({ queryKey: ['me', 'ratings'] });
      }, 1800);
    },
  });

  if (thanks)
    return (
      <Card style={styles.thanks}>
        <Text style={type.h3}>{t('app.rate.thanks')}</Text>
      </Card>
    );
  if (!item) return null;
  const title = item.title ?? t('app.rate.personal');

  return (
    <Card style={{ gap: 12 }}>
      <Text style={type.label}>{t('app.rate.title')}</Text>
      <View>
        <Text style={type.h3} numberOfLines={1}>
          {title}
        </Text>
        <Text style={type.bodySm}>
          {[item.trainerName, f.dateTime(item.startsAt)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.stars} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setStars(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: stars === n }}
            accessibilityLabel={t('app.rate.stars', { count: n })}
            hitSlop={6}
          >
            <Star
              size={34}
              color={n <= stars ? color.accent[400] : color.text.muted}
              fill={n <= stars ? color.accent[400] : 'transparent'}
            />
          </Pressable>
        ))}
      </View>
      {stars > 0 && (
        <>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={t('app.rate.comment')}
            placeholderTextColor={color.text.muted}
            maxLength={500}
            multiline
            style={styles.input}
            accessibilityLabel={t('app.rate.comment')}
          />
          {send.error ? (
            <ErrorNote
              message={send.error instanceof ApiError ? send.error.message : 'errors.internal'}
            />
          ) : null}
          <Button
            label={t('app.rate.send')}
            onPress={() => send.mutate()}
            loading={send.isPending}
          />
        </>
      )}
      <Pressable
        onPress={() => setHidden((h) => [...h, item.id])}
        accessibilityRole="button"
        hitSlop={6}
        style={{ alignSelf: 'center' }}
      >
        <Text style={styles.later}>{t('app.rate.later')}</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  input: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    padding: 12,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  later: { color: color.text.secondary, fontFamily: fonts.semibold, fontSize: 14 },
  thanks: { alignItems: 'center', paddingVertical: 20 },
});
