import { useTranslation } from 'react-i18next';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useClub } from '@/lib/queries';
import { color, fonts, radius } from '@/theme';

/** Horizontal photo strip of the club. Photos and captions are managed in the admin. */
export function ClubGallery() {
  const { t, i18n } = useTranslation();
  const club = useClub();
  const photos = club.data?.photos ?? [];
  if (!photos.length) return null;
  const caption = (c: Record<string, string>) =>
    c[i18n.language] || (i18n.language === 'ar' ? c.en : undefined) || c.sr || '';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10 }}
      accessibilityLabel={t('app.home.gallery')}
    >
      {photos.map((p) => (
        <View key={p.id} style={styles.item}>
          <Image
            source={{ uri: p.url }}
            style={styles.image}
            accessibilityLabel={caption(p.captions)}
          />
          {caption(p.captions) ? (
            <Text style={styles.caption} numberOfLines={1}>
              {caption(p.captions)}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { width: 240, gap: 6 },
  image: { width: 240, height: 135, borderRadius: radius.md, backgroundColor: color.bg.surface2 },
  caption: { fontFamily: fonts.medium, fontSize: 13, color: color.text.secondary },
});
