import type { TrainerDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AtSign, UserRound, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BackButton } from '@/components/BackHeader';
import { Button, Card, EmptyState, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { color, displayFont, fonts, type } from '@/theme';

/** Trainers who agreed to a public profile. */
export default function TrainersScreen() {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ['trainers', i18n.language],
    queryFn: () => api.get<TrainerDto[]>('/public/trainers', { locale: i18n.language }),
    staleTime: 10 * 60_000,
  });
  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton />
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.trainers.title')}
      </Text>
      {q.isPending ? (
        <Skeleton height={240} />
      ) : q.isError ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={UserRound}
            title={t('app.trainers.empty')}
            text={t('app.trainers.empty_text')}
          />
        </Card>
      ) : (
        q.data.map((tr) => (
          <Card key={tr.id} style={{ gap: 10 }}>
            <View style={styles.head}>
              {tr.photoUrl ? (
                <Image source={{ uri: tr.photoUrl }} style={styles.photo} accessible={false} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.initials}>
                    {tr.firstName.replace(/\[.*?\]\s*/, '').charAt(0)}
                    {tr.lastName.charAt(0)}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>
                  {tr.firstName} {tr.lastName}
                </Text>
                {tr.title && <Text style={type.bodySm}>{tr.title}</Text>}
                {tr.rating && (
                  <View style={styles.rating}>
                    <Star size={14} color={color.accent[400]} fill={color.accent[400]} />
                    <Text style={styles.ratingText}>
                      {tr.rating.avg.toFixed(1)} · {t('app.rate.count', { count: tr.rating.count })}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            {tr.bio && <Text style={type.body}>{tr.bio}</Text>}
            {tr.instagram && (
              <Pressable
                accessibilityRole="link"
                style={styles.ig}
                onPress={() => void Linking.openURL(`https://www.instagram.com/${tr.instagram}/`)}
              >
                <AtSign size={16} color={color.accent[400]} />
                <Text style={styles.igText}>{tr.instagram}</Text>
              </Pressable>
            )}
            {tr.offersPersonalTraining && (
              <Button
                label={t('app.trainers.book_slot')}
                onPress={() =>
                  router.push({
                    pathname: '/trainer-slots',
                    params: { trainerId: tr.id, name: `${tr.firstName} ${tr.lastName}` },
                  })
                }
              />
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rating: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  ratingText: { color: color.text.secondary, fontFamily: fonts.semibold, fontSize: 13 },
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: 72, height: 72, borderRadius: 36, backgroundColor: color.bg.surface2 },
  initials: { fontFamily: fonts.bold, fontSize: 16, color: color.accent[400] },
  ig: { flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 32 },
  igText: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
});
