import type { PtRequestDto, TrainerDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle2, Link2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, ErrorNote, Field, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useMe } from '@/lib/queries';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

const OPEN = new Set(['new', 'contacted']);

/** Ask the club for personal training; staff contacts the member and schedules sessions. */
export default function PtRequestScreen() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ trainerId?: string }>();
  const me = useMe();
  const linked = Boolean(me.data?.member);
  const trainers = useQuery({
    queryKey: ['trainers', i18n.language],
    queryFn: () => api.get<TrainerDto[]>('/public/trainers', { locale: i18n.language }),
  });
  const mine = useQuery({
    queryKey: ['me', 'pt-requests'],
    queryFn: () => api.get<PtRequestDto[]>('/me/pt-requests'),
    enabled: linked,
  });
  const [trainerId, setTrainerId] = useState<string | null>(params.trainerId ?? null);
  const [goal, setGoal] = useState('');
  const [times, setTimes] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api.post('/me/pt-requests', { trainerId, goal: goal.trim(), preferredTimes: times.trim() }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'pt-requests'] }),
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api.post(`/me/pt-requests/${id}/cancel`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'pt-requests'] }),
  });
  const open = mine.data?.find((r) => OPEN.has(r.status));
  const offering = (trainers.data ?? []).filter((x) => x.offersPersonalTraining);

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.back()}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel={t('app.common.back')}
        hitSlop={8}
      >
        <ArrowLeft style={dirIcon} size={22} color={color.text.primary} />
      </Pressable>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.pt.title')}
      </Text>
      <Text style={type.bodySm}>{t('app.pt.intro')}</Text>

      {!linked ? (
        <Pressable
          style={styles.notice}
          onPress={() => router.push('/link')}
          accessibilityRole="link"
        >
          <Link2 size={18} color={color.accent[400]} />
          <Text style={[type.bodySm, { flex: 1, color: color.text.primary }]}>
            {t('app.pt.link_first')}
          </Text>
        </Pressable>
      ) : mine.isPending ? (
        <Skeleton height={200} />
      ) : open ? (
        <Card style={{ gap: 10 }}>
          <View style={styles.row}>
            <CheckCircle2 size={20} color={color.status.success} />
            <Text style={[type.h3, { flex: 1 }]}>{t(`app.pt.status.${open.status}`)}</Text>
          </View>
          <Text style={type.bodySm}>
            {t('app.pt.sent_on', { date: f.dateTime(open.createdAt) })}
            {open.trainerName ? ` · ${open.trainerName}` : ''}
          </Text>
          <Text style={type.body}>{open.goal}</Text>
          <Button
            label={t('app.pt.withdraw')}
            variant="ghost"
            loading={withdraw.isPending}
            onPress={() => withdraw.mutate(open.id)}
          />
        </Card>
      ) : (
        <Card style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Text style={type.label}>{t('app.pt.trainer')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {[
                { id: null, name: t('app.pt.any_trainer') },
                ...offering.map((x) => ({ id: x.id, name: `${x.firstName} ${x.lastName}` })),
              ].map((o) => (
                <Pressable
                  key={o.id ?? 'any'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: trainerId === o.id }}
                  onPress={() => setTrainerId(o.id)}
                  style={[styles.chip, trainerId === o.id && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, trainerId === o.id && { color: color.text.primary }]}
                  >
                    {o.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={type.label}>{t('app.pt.goal')}</Text>
            <TextInput
              value={goal}
              onChangeText={setGoal}
              multiline
              maxLength={1000}
              placeholder={t('app.pt.goal_placeholder')}
              placeholderTextColor={color.text.muted}
              accessibilityLabel={t('app.pt.goal')}
              style={styles.textarea}
            />
          </View>
          <Field
            label={t('app.pt.times')}
            placeholder={t('app.pt.times_placeholder')}
            value={times}
            onChangeText={setTimes}
            maxLength={300}
          />
          {send.error && (
            <ErrorNote
              message={send.error instanceof ApiError ? send.error.message : 'errors.internal'}
            />
          )}
          <Button
            label={t('app.pt.send')}
            loading={send.isPending}
            disabled={goal.trim().length < 3}
            onPress={() => send.mutate()}
          />
        </Card>
      )}

      {(mine.data ?? []).filter((r) => !OPEN.has(r.status)).length > 0 && (
        <>
          <SectionTitle>{t('app.pt.history')}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {mine
              .data!.filter((r) => !OPEN.has(r.status))
              .map((r, i) => (
                <View key={r.id} style={[styles.hist, i > 0 && styles.divider]}>
                  <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                    {r.goal}
                  </Text>
                  <Text style={type.bodySm}>{t(`app.pt.status.${r.status}`)}</Text>
                </View>
              ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    padding: 12,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipActive: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
  textarea: {
    minHeight: 110,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 16,
    padding: 12,
  },
  hist: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 48 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
